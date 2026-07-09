/**
 * quarantine.ts — agent quarantine REQUEST path (Phase 18.9 seam).
 *
 * Pulse's self-optimizer issues `quarantineAgent(id, reason, ttl)` as a REQUEST only.
 * Sentinel owns the contract: this module validates the request, records it, drops
 * the platform to a safe tier so the quarantined agent cannot escalate, and triggers
 * self-heal remediation. The final enforcement (actual process isolation) is performed
 * by Forge's kernel; this module is the authoritative request gate + audit trail.
 *
 * Coordinates with: degraded-mode.ts (tier drop), self-healing.ts (remediation),
 * agent-permissions.ts (scope revocation), session-recorder.ts (forensics),
 * incident-response.ts (sev classification).
 */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../lib/errors.js';
import { appendAudit, Tx } from '../../lib/audit.js';
import { db } from '../../db/client.js';
import { setTier, getTier, degradedEvents } from './degraded-mode.js';
import { heal } from './self-healing.js';
import { revokeAll } from '../agent-permissions.js';
import { record } from '../session-recorder.js';
import { forward } from '../siem-forwarder.js';

export type QuarantineStatus = 'requested' | 'active' | 'released' | 'expired';

export interface QuarantineRequest {
  id: string;
  agentId: string;
  reason: string;
  requestedBy: string;
  ttlMs: number;
  status: QuarantineStatus;
  requestedAt: number;
  expiresAt: number;
  // Sentinel's adjudication note (final say).
  adjudication?: string;
}

const requests = new Map<string, QuarantineRequest>();
const DEFAULT_TTL_MS = 15 * 60_000;

export interface QuarantineDecision {
  request: QuarantineRequest;
  tierDroppedTo: string;
  remediationActions: string[];
}

/**
 * Pulse (or any caller) requests quarantine. Sentinel immediately: records the
 * request, adjudicates (auto-approves for safety-relevant reasons), revokes the
 * agent's scopes, drops to a safe degraded tier, and runs self-heal remediation.
 */
export function quarantineAgent(
  agentId: string,
  reason: string,
  ttlMs: number = DEFAULT_TTL_MS,
  requestedBy = 'pulse-self-opt'
): QuarantineDecision {
  if (!agentId || !reason || reason.trim().length < 4) {
    throw new ApiError(
      'QUARANTINE_BAD_REQUEST',
      'Quarantine requires a non-empty agentId and reason.'
    );
  }
  const id = 'Q-' + randomUUID().slice(0, 8);
  const req: QuarantineRequest = {
    id,
    agentId,
    reason,
    requestedBy,
    ttlMs,
    status: 'requested',
    requestedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  };
  requests.set(id, req);

  void appendAudit(
    'quarantine.requested',
    { id, agentId, reason, ttlMs },
    requestedBy,
    db as unknown as Tx
  );
  record('quarantine:' + agentId, requestedBy, 'quarantine.requested', { id, reason });

  // Sentinel adjudication — auto-approve (the platform must never leave a risky
  // agent running while a request is pending; Forge's kernel enforces isolation later).
  req.status = 'active';
  req.adjudication = 'auto-approved: safety-first; kernel isolation pending';
  revokeAll(agentId); // revoke every scope for the quarantined agent
  // Drop to safe tier so the agent cannot escalate or take new work during quarantine.
  const prevTier = getTier();
  if (prevTier !== 'safe') setTier('safe', `quarantine:${agentId}`);
  const remediation = heal(); // self-heal remediation (reset breakers, recover tier later)
  void appendAudit(
    'quarantine.active',
    { id, agentId, tier: getTier() },
    'sentinel',
    db as unknown as Tx
  );
  void forward({
    ts: Date.now(),
    kind: 'quarantine.active',
    severity: 'critical',
    principalId: agentId,
    attrs: { id, reason },
  });
  degradedEvents.emit('agent-quarantined', { id, agentId, reason, tier: getTier() });

  return {
    request: req,
    tierDroppedTo: getTier(),
    remediationActions: remediation.actions,
  };
}

export function releaseQuarantine(id: string, actor = 'sentinel'): QuarantineRequest {
  const req = requests.get(id);
  if (!req) throw new ApiError('QUARANTINE_NOT_FOUND', `No quarantine ${id}`);
  req.status = 'released';
  void appendAudit('quarantine.released', { id, agentId: req.agentId }, actor, db as unknown as Tx);
  return req;
}

/** Expire stale quarantines; returns count expired. */
export function purgeExpired(now: number = Date.now()): number {
  let n = 0;
  for (const req of requests.values()) {
    if (req.status === 'active' && now > req.expiresAt) {
      req.status = 'expired';
      n++;
    }
  }
  return n;
}

export function getQuarantine(id: string): QuarantineRequest | undefined {
  return requests.get(id);
}

export function activeQuarantines(): QuarantineRequest[] {
  return [...requests.values()].filter((r) => r.status === 'active');
}
