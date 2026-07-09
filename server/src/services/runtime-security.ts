/**
 * runtime-security — Sentinel-owned runtime guard for untrusted execution.
 *
 * Gatekeeps code, module specifiers, shell strings, and URL targets that an
 * agent might attempt to execute, blocking known-dangerous patterns before
 * they reach the kernel admission gate. Pure evaluation (dependency-free)
 * makes it fully unit-testable and safe to run on adversarial input.
 *
 * The guard is layered:
 *   1. Explicit blocklist (high-signal dangerous tokens / modules).
 *   2. Heuristic risk scoring (obfuscation, eval chains, fs mutation).
 *   3. Allowlist for trusted module roots (opt-in).
 */

import { forward } from './siem-forwarder.js';
import { log } from '../lib/logging.js';

export type RiskLevel = 'safe' | 'suspicious' | 'dangerous';

export interface GuardVerdict {
  allowed: boolean;
  level: RiskLevel;
  score: number; // 0..100 risk
  reasons: string[];
  matched?: string[];
}

export interface GuardPolicy {
  /** Trusted module specifier prefixes always permitted (e.g. "node:"). */
  moduleAllowList?: string[];
  /** Module specifiers that are always blocked. */
  moduleBlockList?: string[];
  /** Whether child_process / eval / Function are permitted at all. */
  allowShell?: boolean;
  allowDynamicEval?: boolean;
  /** Reject network egress from code by default. */
  allowNetwork?: boolean;
  /** Maximum tolerated risk score (0..100). Default 0 => block anything suspicious. */
  maxRiskScore?: number;
}

const DEFAULT_BLOCKED_MODULES = [
  'child_process',
  'cluster',
  'worker_threads',
  'repl',
  'v8',
  'inspector',
  'module',
  'process',
  'os',
  'pty',
];

// Patterns that materially raise risk of hostile behavior.
const HEURISTICS: { id: string; weight: number; pattern: RegExp }[] = [
  { id: 'eval', weight: 30, pattern: /\b(eval|new\s+Function|setTimeout|setInterval)\s*\(/g },
  {
    id: 'obfuscation',
    weight: 25,
    pattern: /\\x[0-9a-f]{2}|\\u00[0-9a-f]{2}|String\.fromCharCode/gi,
  },
  {
    id: 'fs-mutation',
    weight: 20,
    pattern: /\b(fs|require\(\s*['"]fs['"]\))\.?(write|append|unlink|rm|mkdir|rename|chmod|chown)/g,
  },
  {
    id: 'shell-injection',
    weight: 35,
    pattern: /(;|\||&&|\$\()\s*(rm\b|curl\b|wget\b|nc\b|bash\b|sh\b|powershell\b)/g,
  },
  { id: 'env-exfil', weight: 25, pattern: /\b(process\.env|Deno\.env)\b/g },
  {
    id: 'dynamic-import',
    weight: 15,
    pattern: /\b(import\(|require\()\s*(?!['"](node:|@agentic-os))/g,
  },
  {
    id: 'network-egress',
    weight: 20,
    pattern: /\b(fetch|http|https|net|dgram|WebSocket|axios|got)\b/g,
  },
  { id: 'base64-payload', weight: 15, pattern: /(?:atob|btoa|Buffer\.from)\s*\([^)]*base64/gi },
  {
    id: 'self-modify',
    weight: 30,
    pattern: /\b(__dirname|__filename)\b.*\b(write|unlink|append)\b/g,
  },
];

export function scoreCode(code: string): GuardVerdict {
  if (!code || typeof code !== 'string')
    return { allowed: true, level: 'safe', score: 0, reasons: [] };
  const reasons: string[] = [];
  const matched: string[] = [];
  let score = 0;
  for (const h of HEURISTICS) {
    if (h.pattern.test(code)) {
      score += h.weight;
      reasons.push(`heuristic:${h.id}`);
      matched.push(h.id);
    }
  }
  score = Math.min(100, score);
  const level: RiskLevel = score >= 60 ? 'dangerous' : score > 0 ? 'suspicious' : 'safe';
  return { allowed: score < 60, level, score, reasons, matched };
}

export class RuntimeSecurityGuard {
  private policy: {
    moduleAllowList: string[];
    moduleBlockList: string[];
    allowShell: boolean;
    allowDynamicEval: boolean;
    allowNetwork: boolean;
    maxRiskScore: number;
  };

  constructor(policy: GuardPolicy = {}) {
    this.policy = {
      moduleAllowList: policy.moduleAllowList ?? ['node:', '@agentic-os/', './', '../'],
      moduleBlockList: policy.moduleBlockList ?? DEFAULT_BLOCKED_MODULES,
      allowShell: policy.allowShell ?? false,
      allowDynamicEval: policy.allowDynamicEval ?? false,
      allowNetwork: policy.allowNetwork ?? false,
      maxRiskScore: policy.maxRiskScore ?? 0,
    };
  }

  setPolicy(patch: GuardPolicy): void {
    this.policy = { ...this.policy, ...patch };
  }

  getPolicy(): GuardPolicy {
    return { ...this.policy };
  }

  /** Validate a module specifier (e.g. for dynamic import / require). */
  checkModule(spec: string): GuardVerdict {
    const reasons: string[] = [];
    if (this.policy.moduleBlockList.includes(spec)) {
      reasons.push(`blocked-module:${spec}`);
      return this.deny('dangerous', 100, reasons, [spec]);
    }
    const allowed = this.policy.moduleAllowList.some((p) => spec.startsWith(p));
    if (!allowed) {
      reasons.push(`untrusted-module:${spec}`);
      return this.deny('suspicious', 40, reasons, [spec]);
    }
    return { allowed: true, level: 'safe', score: 0, reasons: [] };
  }

  /** Validate a snippet of code prior to execution. */
  checkCode(code: string): GuardVerdict {
    const base = scoreCode(code);
    const reasons = [...base.reasons];
    const matched = [...(base.matched ?? [])];
    let score = base.score;

    if (!this.policy.allowDynamicEval && /\b(eval|new\s+Function)\s*\(/.test(code)) {
      score += 40;
      reasons.push('policy:no-dynamic-eval');
      matched.push('dynamic-eval');
    }
    if (!this.policy.allowShell && /\b(child_process|execSync|execFile|spawn)\b/.test(code)) {
      score += 40;
      reasons.push('policy:no-shell');
      matched.push('shell');
    }
    if (!this.policy.allowNetwork && /\b(fetch|http|https|net\.|dgram|WebSocket)\b/.test(code)) {
      score += 15;
      reasons.push('policy:no-network');
      matched.push('network');
    }
    score = Math.min(100, score);
    if (score >= 60) return this.deny('dangerous', score, reasons, matched);
    if (score > this.policy.maxRiskScore) return this.deny('suspicious', score, reasons, matched);
    return { allowed: true, level: score > 0 ? 'suspicious' : 'safe', score, reasons, matched };
  }

  private deny(
    level: RiskLevel,
    score: number,
    reasons: string[],
    matched: string[]
  ): GuardVerdict {
    void forward({
      ts: Date.now(),
      kind: 'runtime.security_block',
      severity: level === 'dangerous' ? 'error' : 'warn',
      attrs: { score, reasons, matched },
    }).catch((e) => log.warn('runtime-security forward failed', { error: String(e) }));
    return { allowed: false, level, score, reasons, matched };
  }
}

export const runtimeGuard = new RuntimeSecurityGuard();
