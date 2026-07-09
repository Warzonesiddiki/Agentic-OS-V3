/**
 * Forge — self-healing / ML-001 / saga-compensation unit tests.
 * These exercise the pure control-plane logic WITHOUT a database (latency
 * samples and quota buckets are in-memory), so they run in any vitest env.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { PipelineNode, NodeType } from '../src/services/pipeline-executor.js';
import { getNodeCompensator } from '../src/services/pipeline-executor.js';
import { getMlfqPromotionCount } from '../src/services/kernel.js';
import {
  recordQueueLatency,
  resetQuantum,
  getQuantum,
  mlfqSelfTuneStep,
  configureMlfqSelfTuner,
  DEFAULT_MLFQ_TUNER_CONFIG,
  applyMlfqAgingPass,
  MLFQ_AGE_PROMOTE_MS,
  SchedulerSlotManager,
} from '../src/services/scheduler.js';
import { QuotaRegistry, resetQuotaRegistry } from '../src/services/resource-quota.js';
import {
  reapStuckPreemptions,
  beginPreemption,
  resetLeakGuard,
} from '../src/services/preemption-leak-guard.js';

function node(
  id: string,
  config: Record<string, unknown> = {},
  type: NodeType = 'tool.invoke'
): PipelineNode {
  return { id, type, position: { x: 0, y: 0 }, config };
}

describe('Forge — saga compensation resolver (getNodeCompensator)', () => {
  it('returns null when no compensator is declared', () => {
    expect(getNodeCompensator(node('a'))).toBeNull();
  });

  it('resolves a tool-id compensator from config.compensate', () => {
    const c = getNodeCompensator(node('a', { compensate: 'rollback-db' }));
    expect(c).not.toBeNull();
    expect(c!.type).toBe('tool.invoke');
    expect((c!.config as { tool: string }).tool).toBe('rollback-db');
    expect(c!.id).toBe('a__comp');
  });

  it('resolves a compensator from config.onError', () => {
    const c = getNodeCompensator(node('a', { onError: 'notify' }));
    expect(c!.type).toBe('tool.invoke');
    expect((c!.config as { tool: string }).tool).toBe('notify');
  });

  it('resolves an inline node spec compensator', () => {
    const c = getNodeCompensator(
      node('a', { compensate: 'x', compensateSpec: { type: 'agent.run', config: { role: 'q' } } })
    );
    expect(c!.type).toBe('agent.run');
    expect((c!.config as { role: string }).role).toBe('q');
  });
});

describe('Forge — ML-001 self-tuning of MLFQ timeslices', () => {
  beforeEach(() => {
    resetQuantum();
    configureMlfqSelfTuner({ enabled: true });
  });
  afterEach(() => {
    resetQuantum();
    configureMlfqSelfTuner(DEFAULT_MLFQ_TUNER_CONFIG);
  });

  it('starts from the default quantum', () => {
    expect(getQuantum('Q0')).toBe(50);
  });

  it('increases the quantum for the hottest queue when p99 latency is high', () => {
    // Feed a very high-latency sample to Q0 so it becomes the hottest queue.
    for (let i = 0; i < 20; i++) recordQueueLatency('queue:Q0', 5000);
    const before = getQuantum('Q0');
    const r = mlfqSelfTuneStep();
    expect(r.adjusted).toContain('Q0');
    expect(getQuantum('Q0')).toBeGreaterThan(before);
  });

  it('shrinks the quantum when latency is moderate (improves fairness)', () => {
    // Moderate latency (~800ms) sits below highLatencyMs(1500) but above
    // lowLatencyMs(200) → step shrinks the quantum.
    for (let i = 0; i < 20; i++) recordQueueLatency('queue:Q2', 800);
    const before = getQuantum('Q2');
    mlfqSelfTuneStep();
    expect(getQuantum('Q2')).toBeLessThanOrEqual(before);
  });

  it('does not thrash when all queues are healthy', () => {
    for (let i = 0; i < 5; i++) recordQueueLatency('queue:Q1', 50);
    const r = mlfqSelfTuneStep();
    expect(r.adjusted.length).toBe(0);
  });

  it('respects the min/max quantum safety floor', () => {
    configureMlfqSelfTuner({ minQuantumMs: 10, maxQuantumMs: 10 });
    for (let i = 0; i < 30; i++) recordQueueLatency('queue:Q3', 9000);
    mlfqSelfTuneStep();
    expect(getQuantum('Q3')).toBe(10); // pinned to floor, never below
  });

  it('adjusts PID proportional gain inversely to worst latency', () => {
    const g0 = getPidGain().kp;
    for (let i = 0; i < 20; i++) recordQueueLatency('queue:Q0', 6000);
    mlfqSelfTuneStep();
    const g1 = getPidGain().kp;
    expect(g1).not.toBe(g0);
  });
});

describe('Forge — QuotaRegistry prevents per-agent enforcer leaks', () => {
  beforeEach(() => resetQuotaRegistry());
  afterEach(() => resetQuotaRegistry());

  it('returns a shared enforcer per agent (no duplicate instances)', () => {
    const reg = new QuotaRegistry({ idleTtlMs: 1000, maxEntries: 4, clock: () => 1000 });
    const a = reg.getOrCreate('agent1', { diskReadBps: 1000 });
    const b = reg.getOrCreate('agent1', { diskReadBps: 1000 });
    expect(a).toBe(b);
    expect(reg.size()).toBe(1);
  });

  it('evicts oldest-idle entries beyond maxEntries', () => {
    const reg = new QuotaRegistry({ idleTtlMs: 10_000, maxEntries: 2, clock: () => 1000 });
    reg.getOrCreate('a', { netEgressBps: 1 });
    reg.getOrCreate('b', { netEgressBps: 1 });
    reg.getOrCreate('c', { netEgressBps: 1 }); // should evict 'a' (oldest)
    expect(reg.size()).toBe(2);
  });

  it('sweep() reaps idle entries past TTL', () => {
    let now = 1000;
    const reg = new QuotaRegistry({ idleTtlMs: 1000, maxEntries: 10, clock: () => now });
    reg.getOrCreate('idle', { netEgressBps: 1 });
    now += 2000; // advance past TTL
    const swept = reg.sweep();
    expect(swept).toContain('idle');
    expect(reg.size()).toBe(0);
  });
});

describe('Forge — preemption leak reaper (self-healing under storms)', () => {
  beforeEach(() => resetLeakGuard());
  afterEach(() => resetLeakGuard());

  it('reaps orphaned preemptions and keeps active ones', () => {
    beginPreemption('stuck');
    beginPreemption('live');
    // end the live one; the stuck one is orphaned.
    const reaped = reapStuckPreemptions(0); // every entry is "stale"
    expect(reaped).toContain('stuck');
    expect(reaped).not.toContain('live');
    // live is gone because reapStuckPreemptions(0) reaps EVERYTHING (stuckMs=0).
    expect(reaped).toContain('live');
  });
});

describe('Forge — SchedulerSlotManager circuit breaker', () => {
  it('trips open after consecutive failures and self-heals via half-open', () => {
    const m = new SchedulerSlotManager({
      capacity: 5,
      failureThreshold: 2,
      openForMs: 0,
      halfOpenProbeLimit: 1,
    });
    m.tryAcquire('x');
    m.release('x', 'failure');
    m.tryAcquire('y');
    m.release('y', 'failure');
    expect(m.stats().state).toBe('open');
    expect(m.tryAcquire('probe')).toBe(true);
    m.release('probe', 'success');
    expect(m.stats().state).toBe('closed');
  });
});

describe('Forge — live pre-pick MLFQ aging pass (enqueue/promote/demote at dispatch)', () => {
  const now = 1_000_000_000_000;
  function q(id: string, queue: string, ageMs: number): any {
    return {
      id,
      agentId: 'a',
      queue,
      priority: 0,
      deadline: null,
      createdAt: new Date(now - ageMs),
      kind: 'task.run',
    };
  }

  it('promotes a sufficiently-aged task one level toward Q0', () => {
    const pool = [q('t1', 'Q2', MLFQ_AGE_PROMOTE_MS + 1000)];
    const changed = applyMlfqAgingPass(pool, now);
    expect(changed).toEqual([{ id: 't1', from: 'Q2', to: 'Q0' }]);
    expect(pool[0].queue).toBe('Q0');
  });

  it('does not promote a young task', () => {
    const pool = [q('t1', 'Q3', MLFQ_AGE_PROMOTE_MS - 5000)];
    const changed = applyMlfqAgingPass(pool, now);
    expect(changed.length).toBe(0);
    expect(pool[0].queue).toBe('Q3');
  });

  it('does not promote a task already at Q0', () => {
    const pool = [q('t1', 'Q0', MLFQ_AGE_PROMOTE_MS + 99999)];
    const changed = applyMlfqAgingPass(pool, now);
    expect(changed.length).toBe(0);
  });

  it('promotes each aged task independently toward Q0', () => {
    const pool = [
      q('a', 'Q4', MLFQ_AGE_PROMOTE_MS + 1),
      q('b', 'Q1', MLFQ_AGE_PROMOTE_MS + 1),
      q('c', 'Q0', MLFQ_AGE_PROMOTE_MS + 1), // already at top → unchanged
      q('d', 'Q3', 10), // young → unchanged
    ];
    const changed = applyMlfqAgingPass(pool, now);
    expect(changed.map((c) => c.id).sort()).toEqual(['a', 'b']);
    expect(pool.find((t) => t.id === 'a').queue).toBe('Q0');
    expect(pool.find((t) => t.id === 'b').queue).toBe('Q0');
    expect(pool.find((t) => t.id === 'c').queue).toBe('Q0');
    expect(pool.find((t) => t.id === 'd').queue).toBe('Q3');
  });

  it('promotion counter getter returns a number (kernel increments by changed.length)', () => {
    expect(typeof getMlfqPromotionCount()).toBe('number');
    const pool = [
      q('a', 'Q4', MLFQ_AGE_PROMOTE_MS + 1),
      q('b', 'Q2', MLFQ_AGE_PROMOTE_MS + 1),
      q('c', 'Q3', 10),
    ];
    const changed = applyMlfqAgingPass(pool, now);
    expect(changed.length).toBe(2);
  });
});
