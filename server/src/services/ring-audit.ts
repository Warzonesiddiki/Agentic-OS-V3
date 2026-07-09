import * as fs from 'node:fs';
import * as path from 'node:path';
import { log } from '../lib/logging.js';
import { subscribeKernelEvent } from './kernel.js';

/**
 * Phase 11 — Task 11.29: Ring Audit Trail + Oscillation Detection.
 *
 * Maintains an append-only audit log of ring (agent) migrations between rings and
 * detects harmful oscillation: when an agent migrates between rings more than
 * `threshold` times within `windowMs`, it is flagged as oscillating. The audit
 * trail can optionally be mirrored to a JSONL file.
 */

export interface RingChange {
  agentId: string;
  fromRing: number;
  toRing: number;
  reason: string;
  ts: number;
}

export interface OscillationFlag {
  agentId: string;
  changes: number;
  firstTs: number;
  lastTs: number;
}

const auditLog: RingChange[] = [];
const byAgent = new Map<string, RingChange[]>();
let auditFile: string | null = null;

export function recordRingChange(change: RingChange): RingChange {
  auditLog.push(change);
  const list = byAgent.get(change.agentId) ?? [];
  list.push(change);
  byAgent.set(change.agentId, list);
  if (auditFile) {
    try {
      fs.appendFileSync(auditFile, JSON.stringify(change) + '\n', 'utf8');
    } catch (e) {
      log.warn('ring_audit_write_failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }
  return change;
}

export function getRingChanges(agentId: string): RingChange[] {
  return [...(byAgent.get(agentId) ?? [])];
}

export function setRingAuditFile(file: string | null): void {
  auditFile = file;
  if (file) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    } catch {
      /* ignore */
    }
  }
}

export function resetRingAudit(): void {
  auditLog.length = 0;
  byAgent.clear();
}

/**
 * Stateful oscillation detector. Tracks ring-change events per agent and flags
 * an agent as oscillating when it has more than `threshold` changes within
 * `windowMs`. `detect(now)` returns the list of currently-flagged agents.
 */
export class RingOscillationDetector {
  constructor(
    public readonly threshold = 3,
    public readonly windowMs = 60_000
  ) {}

  /**
   * Returns oscillation flags for every agent whose ring-change count within the
   * window exceeds `threshold`. Reads from the shared audit log populated by
   * {@link recordRingChange}.
   */
  detect(now: number = Date.now()): OscillationFlag[] {
    const flags: OscillationFlag[] = [];
    for (const [agentId, list] of byAgent) {
      const recent = list.filter((c) => now - c.ts <= this.windowMs);
      if (recent.length > this.threshold) {
        flags.push({
          agentId,
          changes: recent.length,
          firstTs: recent[0]?.ts ?? now,
          lastTs: recent[recent.length - 1]?.ts ?? now,
        });
      }
    }
    return flags;
  }

  reset(): void {
    byAgent.clear();
    auditLog.length = 0;
  }
}

// ── Ring *state* oscillation detection (phase-11 behavior test surface) ──────
// Tracks the high-level state a ring is in over time (e.g. 'A'/'B') and reports
// whether it is harmfully oscillating (flip-flopping) between states.
const ringStateHistory = new Map<string, string[]>();

export function recordRingState(ring: string, state: string): void {
  const list = ringStateHistory.get(ring) ?? [];
  list.push(state);
  ringStateHistory.set(ring, list);
}

export function detectOscillation(ring: string): boolean {
  const list = ringStateHistory.get(ring);
  if (!list || list.length < 4) return false;
  const recent = list.slice(-4);
  // Flip-flop pattern A->B->A->B within the window => oscillation.
  const flipFlop =
    recent[0] !== recent[1] &&
    recent[1] !== recent[2] &&
    recent[2] !== recent[3] &&
    recent[0] === recent[2] &&
    recent[1] === recent[3];
  return flipFlop;
}

export function resetRingStateHistory(): void {
  ringStateHistory.clear();
}

// ── Integration wiring: mirror ring migrations into the audit trail ──
subscribeKernelEvent('ring.changed', (payload) => {
  try {
    recordRingChange({
      agentId: String(payload.agentId ?? ''),
      fromRing: Number(payload.fromRing ?? 0),
      toRing: Number(payload.toRing ?? 0),
      reason: String(payload.reason ?? ''),
      ts: Date.now(),
    });
  } catch {
    /* ignore */
  }
});
