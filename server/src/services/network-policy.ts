/**
 * network-policy — Sentinel-owned network egress/ingress policy engine.
 *
 * Contract (consumed by phase14-security.test.ts):
 *   setPolicy({ agentId, allowEgress, denyEgress, allowIngress })
 *   checkEgress(agentId, host)  // throws on deny / not-in-allow-list
 *
 * Also exposes an advanced, pure, fully-testable policy engine
 * (NetworkPolicyEngine) supporting CIDR/port/scheme scopes and SIEM escalation.
 */

import { forward } from './siem-forwarder.js';
import { log } from '../lib/logging.js';

type MySev = 'low' | 'medium' | 'high' | 'critical';
function toSiem(s: MySev): 'info' | 'warn' | 'error' | 'critical' {
  return s === 'critical' ? 'critical' : s === 'high' ? 'error' : s === 'medium' ? 'warn' : 'info';
}

interface SimplePolicy {
  agentId: string;
  allowEgress?: string[];
  denyEgress?: string[];
  allowIngress?: string[];
}

const policies = new Map<string, SimplePolicy>();

export function setPolicy(p: SimplePolicy): void {
  policies.set(p.agentId, p);
  log.info('network-policy set', { agentId: p.agentId });
}

export function getPolicy(agentId: string): SimplePolicy | undefined {
  return policies.get(agentId);
}

export function checkEgress(agentId: string, host: string): true {
  const p = policies.get(agentId);
  if (!p) throw new Error(`egress not in allow-list: ${host} (no policy for ${agentId})`);
  if (p.denyEgress?.includes(host)) {
    void escalate(agentId, host, 'deny-list');
    throw new Error(`egress denied: ${host}`);
  }
  if (!p.allowEgress || p.allowEgress.length === 0) {
    throw new Error(`egress not in allow-list: ${host}`);
  }
  if (!p.allowEgress.includes(host)) {
    void escalate(agentId, host, 'not-allowed');
    throw new Error(`egress not in allow-list: ${host}`);
  }
  return true;
}

function escalate(agentId: string, host: string, reason: string): void {
  void forward({
    ts: Date.now(),
    kind: 'network.policy_violation',
    severity: 'error',
    attrs: { agentId, host, reason },
  }).catch((e) => log.warn('network-policy escalation failed', { error: String(e) }));
}

/* ------------------------------------------------------------------ */
/* Advanced, pure policy engine (CIDR / port / scheme / principal).    */
/* ------------------------------------------------------------------ */

export type Direction = 'egress' | 'ingress';
export type PolicyEffect = 'allow' | 'deny';

export interface NetworkEndpoint {
  host: string;
  port?: number;
  scheme?: string;
  principal?: string;
  agentId?: string;
}

export interface NetworkRule {
  id: string;
  direction: Direction;
  effect: PolicyEffect;
  host?: string;
  cidr?: string;
  schemes?: string[];
  ports?: string[];
  principals?: string[];
  agents?: string[];
  denySeverity?: MySev;
  description?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  rule?: NetworkRule;
  reason: string;
}

function ipToLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function inCidr(host: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  if (!base || Number.isNaN(bits)) return false;
  const hostIp = ipToLong(host);
  const baseIp = ipToLong(base);
  if (hostIp === null || baseIp === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (hostIp & mask) === (baseIp & mask);
}

function hostMatches(pattern: string, host: string): boolean {
  if (pattern === '*' || pattern === host) return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) || host === pattern.slice(2);
  }
  return false;
}

function portInRanges(port: number | undefined, ranges: string[] | undefined): boolean {
  if (!ranges || ranges.length === 0) return true;
  if (port === undefined) return false;
  for (const r of ranges) {
    if (r.includes('-')) {
      const parts = r.split('-').map((x) => Number(x) || 0);
      const a = parts[0] ?? 0;
      const b = parts[1] ?? 0;
      if (port >= a && port <= b) return true;
    } else if (Number(r) === port) {
      return true;
    }
  }
  return false;
}

function scopeMatches(rule: NetworkRule, ep: NetworkEndpoint): boolean {
  if (rule.principals?.length && ep.principal && !rule.principals.includes(ep.principal))
    return false;
  if (rule.agents?.length && ep.agentId && !rule.agents.includes(ep.agentId)) return false;
  return true;
}

export class NetworkPolicyEngine {
  private rules: NetworkRule[] = [];
  private version = 0;

  setRules(rules: NetworkRule[]): void {
    this.rules = [...rules].sort(
      (a, b) => (a.effect === 'deny' ? -1 : 1) - (b.effect === 'deny' ? -1 : 1)
    );
    this.version++;
  }

  getRules(): NetworkRule[] {
    return [...this.rules];
  }

  getVersion(): number {
    return this.version;
  }

  evaluate(ep: NetworkEndpoint, direction: Direction = 'egress'): PolicyDecision {
    for (const rule of this.rules) {
      if (rule.direction !== direction) continue;
      if (!scopeMatches(rule, ep)) continue;
      const hostOk = rule.host ? hostMatches(rule.host, ep.host) : true;
      const cidrOk = rule.cidr ? inCidr(ep.host, rule.cidr) : true;
      const schemeOk = rule.schemes?.length
        ? ep.scheme
          ? rule.schemes.includes(ep.scheme)
          : false
        : true;
      const portOk = portInRanges(ep.port, rule.ports);
      if (!(hostOk && cidrOk && schemeOk && portOk)) continue;
      if (rule.effect === 'deny') {
        if (rule.denySeverity) {
          void forward({
            ts: Date.now(),
            kind: 'network.policy_violation',
            severity: toSiem(rule.denySeverity),
            attrs: { ruleId: rule.id, host: ep.host, agentId: ep.agentId },
          }).catch(() => undefined);
        }
        return { allowed: false, rule, reason: `Denied by ${rule.id}` };
      }
      return { allowed: true, rule, reason: `Allowed by ${rule.id}` };
    }
    return { allowed: false, reason: 'Default-deny: no matching allow rule' };
  }
}

export const networkPolicy = new NetworkPolicyEngine();
