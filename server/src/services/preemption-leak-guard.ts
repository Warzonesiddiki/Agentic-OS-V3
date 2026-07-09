/**
 * Phase 11 — Task 11.23: Preemption State-Leak Guard.
 *
 * When the kernel preempts an agent it must save the agent's execution context
 * (priority, borrowed resources, open locks) and restore it exactly on resume.
 * A "leak" occurs when a preemption is begun but never ended, or when state is
 * not restored. This guard tracks in-flight preemptions and reports leaks so the
 * scheduler can fail loudly instead of corrupting kernel state.
 */

import { log } from '../lib/logging.js';

export interface PreemptionContext {
  id: string;
  savedPriority: number;
  savedResources: string[];
  startedAt: number;
}

export interface LeakGuardResult {
  ok: boolean;
  leaked: string[];
}

const active = new Map<string, PreemptionContext>();

/** Maximum acceptable preemption duration (ms) before it is treated as a leak. */
const DEFAULT_STUCK_MS = 30_000;

export function beginPreemption(
  id: string,
  savedPriority = 0,
  savedResources: string[] = []
): PreemptionContext {
  if (!id) throw new Error('beginPreemption: id is required');
  const ctx: PreemptionContext = { id, savedPriority, savedResources, startedAt: Date.now() };
  active.set(id, ctx);
  return ctx;
}

export function endPreemption(id: string): void {
  if (!active.has(id)) {
    // Idempotent: a double-end is benign (e.g. finally + explicit end). Swallow it
    // rather than throwing, so it cannot mask the real error in a `finally`.
    return;
  }
  active.delete(id);
}

/** Wrap an async critical section in a preemption guard; auto-ends on resolve/reject. */
export async function withPreemptionGuard<T>(
  id: string,
  fn: () => Promise<T> | T,
  savedPriority = 0,
  savedResources: string[] = []
): Promise<T> {
  const ctx = beginPreemption(id, savedPriority, savedResources);
  try {
    return await fn();
  } finally {
    active.delete(ctx.id);
  }
}

/** Report whether any preemptions are still in flight (a leak). */
export function leakGuardCheck(): LeakGuardResult {
  const leaked = [...active.keys()];
  return { ok: leaked.length === 0, leaked };
}

/**
 * (Forge) Self-healing reaper: any preemption that has been open longer than
 * `stuckMs` is a stuck/orphaned leak (worker crashed, rejection swallowed, etc.).
 * We force-reap it and return the reaped ids so the caller can emit an audit
 * event / trip an admission breaker. Called periodically by the runtime loop.
 */
export function reapStuckPreemptions(stuckMs: number = DEFAULT_STUCK_MS): string[] {
  const now = Date.now();
  const reaped: string[] = [];
  for (const [id, ctx] of active) {
    if (now - ctx.startedAt >= stuckMs) {
      active.delete(id);
      reaped.push(id);
    }
  }
  if (reaped.length) {
    log.warn('preemption_leak_reaped', { count: reaped.length, ids: reaped });
  }
  return reaped;
}

export function resetLeakGuard(): void {
  active.clear();
}

export function activePreemptions(): PreemptionContext[] {
  return [...active.values()];
}
