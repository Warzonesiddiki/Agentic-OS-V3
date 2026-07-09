import { describe, it, expect, beforeEach } from 'vitest';
import {
  beginPreemption,
  endPreemption,
  leakGuardCheck,
  withPreemptionGuard,
  resetLeakGuard,
  reapStuckPreemptions,
} from '../src/services/preemption-leak-guard.js';

describe('Phase 11.23 — preemption state-leak guard', () => {
  beforeEach(() => resetLeakGuard());

  it('reports no leak when preemptions are balanced', () => {
    beginPreemption('p1', 5, ['r1']);
    expect(leakGuardCheck().ok).toBe(false); // one in flight => leak
    endPreemption('p1');
    expect(leakGuardCheck().ok).toBe(true);
    expect(leakGuardCheck().leaked).toHaveLength(0);
  });

  it('flags a leak when a preemption is never ended', () => {
    beginPreemption('orphan', 1);
    const res = leakGuardCheck();
    expect(res.ok).toBe(false);
    expect(res.leaked).toContain('orphan');
  });

  it('is idempotent when ending an unknown/duplicate preemption (swallow to protect finally)', () => {
    // A double end (e.g. explicit end + finally) must not throw — otherwise the
    // real error in a `finally` block would be masked by a guard error.
    expect(() => endPreemption('nope')).not.toThrow();
    beginPreemption('dup');
    endPreemption('dup');
    expect(() => endPreemption('dup')).not.toThrow();
    expect(leakGuardCheck().ok).toBe(true);
  });

  it('reapStuckPreemptions recovers orphaned/preemption-storm leaks', () => {
    beginPreemption('old1');
    beginPreemption('old2');
    // A freshly begun preemption should NOT be reaped.
    beginPreemption('fresh');
    const reaped = reapStuckPreemptions(0); // stuckMs=0 => all are stale
    expect(reaped.sort()).toEqual(['old1', 'old2']);
    expect(leakGuardCheck().leaked).toEqual(['fresh']);
    // Clean up the survivor.
    reapStuckPreemptions(0);
    expect(leakGuardCheck().ok).toBe(true);
  });

  it('withPreemptionGuard auto-ends on success', async () => {
    const r = await withPreemptionGuard('g1', async () => 42, 0, ['r2']);
    expect(r).toBe(42);
    expect(leakGuardCheck().ok).toBe(true);
  });

  it('withPreemptionGuard auto-ends on throw (no leak)', async () => {
    await expect(
      withPreemptionGuard('g2', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(leakGuardCheck().ok).toBe(true);
  });
});
