/**
 * jit-elevation.ts — Just-in-Time scope elevation.
 *
 * A caller may request a temporary elevation to a normally-denied scope. The
 * elevation is granted for a short TTL (default 30s), auto-expires, and every
 * grant is logged to the audit trail. Used so Ring-3 agents can perform a one-off
 * safety:write without holding the scope permanently.
 */
import { randomBytes } from 'node:crypto';
import { ApiError } from './errors.js';
import { appendAudit, Tx } from './audit.js';
import { db } from '../db/client.js';

export interface JitGrant {
  grantId: string;
  principalId: string;
  scope: string;
  grantedAt: number;
  expiresAt: number;
  justification: string;
  consumed: boolean;
}

const TTL_MS = 30_000;

// In-process grant table (would be DB-backed in a multi-node deployment).
const grants = new Map<string, JitGrant>();

export function requestElevation(
  principalId: string,
  scope: string,
  justification: string,
  ttlMs: number = TTL_MS,
  actor: string = principalId
): JitGrant {
  if (!justification || justification.trim().length < 4) {
    throw new ApiError(
      'JIT_NO_JUSTIFICATION',
      'JIT elevation requires a justification recorded to audit.'
    );
  }
  const grant: JitGrant = {
    grantId: randomBytes(12).toString('hex'),
    principalId,
    scope,
    grantedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    justification,
    consumed: false,
  };
  grants.set(grant.grantId, grant);
  void appendAudit(
    'security.jit.elevated',
    { scope, justification, grantId: grant.grantId },
    actor,
    db as unknown as Tx
  );
  return grant;
}

export function isElevationValid(grantId: string, scope: string, principalId: string): boolean {
  const g = grants.get(grantId);
  if (!g) return false;
  if (g.principalId !== principalId || g.scope !== scope) return false;
  if (g.consumed) return false;
  if (Date.now() > g.expiresAt) {
    grants.delete(grantId);
    return false;
  }
  return true;
}

export function consumeElevation(grantId: string): void {
  const g = grants.get(grantId);
  if (g) g.consumed = true;
}

export function activeGrantsFor(principalId: string): JitGrant[] {
  return [...grants.values()].filter(
    (g) => g.principalId === principalId && !g.consumed && Date.now() <= g.expiresAt
  );
}

export function purgeExpired(): number {
  const now = Date.now();
  let n = 0;
  for (const [id, g] of grants) {
    if (now > g.expiresAt) {
      grants.delete(id);
      n++;
    }
  }
  return n;
}
