/**
 * agent-permissions.ts — fine-grained per-agent permission grants (Phase 13).
 *
 * Model: every agent has an ALLOW set and a DENY set.
 *   - DENY takes absolute precedence over ALLOW (explicit bar wins).
 *   - Wildcard scope `prefix:*` grants/denies every scope under that prefix.
 *   - Role templates provide bulk seeding (e.g. an "orchestrator" role).
 *   - Every DENY decision is audit-trailed (so Sentinel's compliance chain sees
 *     blocked actions) — the previous flat model threw without an audit line.
 *
 * Backward-compatible with the original surface: grant/revoke/revokeAll/
 * hasPermission/assertPermission/listPermissions keep their signatures.
 */
import { ApiError } from '../lib/errors.js';
import { appendAudit } from '../lib/audit.js';

interface AgentAcl {
  allow: Set<string>;
  deny: Set<string>;
}

const acls = new Map<string, AgentAcl>();

/** Role template -> set of scopes to seed into the allow set. */
const roleTemplates = new Map<string, Set<string>>();

function aclOf(agentId: string): AgentAcl {
  let a = acls.get(agentId);
  if (!a) {
    a = { allow: new Set(), deny: new Set() };
    acls.set(agentId, a);
  }
  return a;
}

/** Apply a role template's scopes to an agent's allow set. */
export function applyRole(agentId: string, role: string): void {
  const tpl = roleTemplates.get(role);
  if (!tpl) return;
  const a = aclOf(agentId);
  for (const s of tpl) a.allow.add(s);
  void appendAudit('agent.permissions.role', { agentId, role }, agentId);
}

/** Register a reusable role template. */
export function defineRole(role: string, scopes: string[]): void {
  roleTemplates.set(role, new Set(scopes));
}

/** True if `scope` is covered by the `prefix:*` wildcard entries in `set`. */
function wildcardCovers(set: Set<string>, scope: string): boolean {
  const idx = scope.lastIndexOf(':');
  if (idx === -1) return false;
  const prefix = scope.slice(0, idx);
  return set.has(`${prefix}:*`);
}

export function grant(agentId: string, scope: string): void {
  aclOf(agentId).allow.add(scope);
}

export function deny(agentId: string, scope: string): void {
  aclOf(agentId).deny.add(scope);
}

export function revoke(agentId: string, scope: string): void {
  acls.get(agentId)?.allow.delete(scope);
}

/** Revoke every scope granted to an agent (used on quarantine). */
export function revokeAll(agentId: string): void {
  acls.set(agentId, { allow: new Set(), deny: new Set() });
}

export function hasPermission(agentId: string, scope: string): boolean {
  const a = acls.get(agentId);
  if (!a) return false;
  // Explicit deny (or wildcard deny) always wins.
  if (a.deny.has(scope) || wildcardCovers(a.deny, scope)) return false;
  return a.allow.has(scope) || wildcardCovers(a.allow, scope);
}

export function assertPermission(agentId: string, scope: string): void {
  if (!hasPermission(agentId, scope)) {
    // Audit the denial so the compliance chain captures blocked actions.
    void appendAudit('agent.permissions.denied', { agentId, scope }, agentId);
    throw new ApiError('AGENT_PERMISSION_DENIED', `Agent ${agentId} lacks scope ${scope}.`);
  }
  void appendAudit('agent.permissions.allowed', { agentId, scope }, agentId);
}

export function listPermissions(agentId: string): string[] {
  const a = acls.get(agentId);
  if (!a) return [];
  return [...a.allow, ...[...a.deny].map((d) => `!${d}`)];
}
