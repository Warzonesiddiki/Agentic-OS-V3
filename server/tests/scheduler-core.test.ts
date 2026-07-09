import { describe, it, expect } from 'vitest';
import type { QueuedTask } from '../src/services/scheduler.js';
import {
  MLFQPolicy,
  EDFPolicy,
  pickByPolicy,
  schedulerDryRun,
  getSchedulerLatency,
  recordQueueLatency,
  FairnessTracker,
  STARVATION_PROMOTE_THRESHOLD,
} from '../src/services/scheduler.js';

const mk = (id: string, queue: string, ageMs: number): QueuedTask => ({
  id,
  queue,
  priority: 0,
  deadline: null,
  createdAt: new Date(Date.now() - ageMs),
  agentId: 'a',
});

const mkD = (id: string, deadline: Date, ageMs = 0): QueuedTask => ({
  id,
  queue: 'Q2',
  priority: 0,
  deadline,
  createdAt: new Date(Date.now() - ageMs),
  agentId: 'a',
});

describe('Phase 11 Scheduler core', () => {
  it('MLFQ ordering — Q0 is picked before lower queues regardless of age', () => {
    const policy = new MLFQPolicy();
    const picked = policy.pick([mk('q4', 'Q4', 1000), mk('q2', 'Q2', 500), mk('q0', 'Q0', 10)]);
    expect(picked?.id).toBe('q0');
  });

  it('MLFQ FIFO within a queue — older createdAt wins', () => {
    const policy = new MLFQPolicy();
    const picked = policy.pick([mk('young', 'Q1', 10), mk('old', 'Q1', 1000)]);
    expect(picked?.id).toBe('old');
  });

  it('EDF ordering — earliest deadline wins', () => {
    const policy = new EDFPolicy();
    const soon = new Date(Date.now() + 1000);
    const later = new Date(Date.now() + 5000);
    const picked = policy.pick([mkD('b', later), mkD('a', soon)]);
    expect(picked?.id).toBe('a');
  });

  it('EDF ordering — tasks without a deadline sort after those with one', () => {
    const policy = new EDFPolicy();
    const later = new Date(Date.now() + 5000);
    const picked = policy.pick([mkD('b', later), mk('a', 'Q2', 0)]);
    expect(picked?.id).toBe('b');
  });

  it('Starvation (11.21) — a repeatedly skipped low-queue task is promoted to Q0', () => {
    const a = mk('a', 'Q0', 1000);
    const b = mk('b', 'Q4', 10);
    const pool: QueuedTask[] = [a, b];
    for (let i = 0; i < STARVATION_PROMOTE_THRESHOLD + 3; i++) {
      pickByPolicy(pool);
    }
    expect(b.queue).toBe('Q0');
    expect(b.starvationScore ?? 0).toBeLessThan(STARVATION_PROMOTE_THRESHOLD);
  });

  it('Fair-share (11.25) — measures actual vs entitlement and corrects large deviation', () => {
    const ft = new FairnessTracker(0.2);
    ft.register({ teamId: 'alpha' }, 50);
    ft.register({ teamId: 'beta' }, 50);
    ft.record({ teamId: 'alpha' }, 90);
    ft.record({ teamId: 'beta' }, 10);

    const before = ft.measure();
    const alphaBefore = before.find((s) => s.key.includes('alpha'));
    expect(alphaBefore).toBeDefined();
    expect(alphaBefore!.actualShare).toBeGreaterThan(alphaBefore!.entitlementShare);

    const { adjusted } = ft.correct();
    expect(adjusted.some((k) => k.includes('alpha'))).toBe(true);

    const after = ft.measure();
    const alphaAfter = after.find((s) => s.key.includes('alpha'));
    expect(alphaAfter).toBeDefined();
    expect(Math.abs(alphaAfter!.deviation)).toBeLessThanOrEqual(
      Math.abs(alphaBefore!.deviation) + 1e-9
    );
  });

  it('Dry-run replay (11.5) — schedulerDryRun returns a full order and trace without mutating input', () => {
    const pool: QueuedTask[] = [mk('c', 'Q2', 5), mk('a', 'Q0', 100), mk('b', 'Q0', 50)];
    const snapshot = pool.map((t) => ({ id: t.id, queue: t.queue }));
    const { order, trace, mode } = schedulerDryRun(pool);
    // order is an array of task ids (string[]): a permutation of the input ids.
    expect(order).toHaveLength(3);
    expect(new Set(order)).toEqual(new Set(['a', 'b', 'c']));
    expect(trace).toHaveLength(3);
    expect(mode).toBe('simulation');
    expect(pool.map((t) => ({ id: t.id, queue: t.queue }))).toEqual(snapshot);
  });

  it('Latency percentiles (11.4) — getSchedulerLatency reports recorded samples', () => {
    recordQueueLatency('Q1', 120);
    recordQueueLatency('Q1', 60);
    recordQueueLatency('Q1', 200);
    const pct = getSchedulerLatency();
    expect(pct.Q1).toBeDefined();
    expect(pct.Q1!.samples).toBe(3);
    expect(pct.Q1!.p50).toBeGreaterThan(0);
  });
});
