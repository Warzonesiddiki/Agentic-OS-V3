import { describe, it, expect, beforeEach } from 'vitest';
import type { QueuedTask } from '../src/services/scheduler.js';
import {
  riskLevelForTask,
  compareRisk,
  SchedulerSlotManager,
  getSlotManager,
  resetSlotManager,
  MLFQPolicy,
  EDFPolicy,
  FairSharePolicy,
} from '../src/services/scheduler.js';

describe('Phase 11.21 — Deterministic risk model', () => {
  it('scores high-risk kinds near the top of the band', () => {
    expect(riskLevelForTask('kill')).toBeGreaterThanOrEqual(90);
    expect(riskLevelForTask('delete')).toBeGreaterThanOrEqual(90);
    expect(riskLevelForTask('deploy')).toBeGreaterThanOrEqual(90);
  });

  it('scores medium-risk kinds in the mid band', () => {
    const r = riskLevelForTask('spawn');
    expect(r).toBeGreaterThan(40);
    expect(r).toBeLessThan(70);
  });

  it('elevates ring-0 / ring-1 queues regardless of kind', () => {
    expect(riskLevelForTask('noop', 'ring0')).toBeGreaterThanOrEqual(70);
    expect(riskLevelForTask('noop', 'ring-1')).toBeGreaterThanOrEqual(70);
    expect(riskLevelForTask('noop', 'ring3')).toBeLessThan(70);
  });

  it('returns a low default for benign work', () => {
    expect(riskLevelForTask('probe')).toBe(10);
    expect(riskLevelForTask(undefined, undefined)).toBe(10);
  });

  it('compareRisk prefers higher risk', () => {
    const a: QueuedTask = {
      id: 'a',
      queue: 'Q0',
      priority: 0,
      deadline: null,
      createdAt: new Date(0),
      risk: 10,
    };
    const b: QueuedTask = {
      id: 'b',
      queue: 'Q0',
      priority: 0,
      deadline: null,
      createdAt: new Date(0),
      risk: 90,
    };
    expect(compareRisk(a, b)).toBeLessThan(0);
  });

  it('MLFQ applies the risk tiebreaker within the same queue (high-risk wins ties)', async () => {
    const policy = new MLFQPolicy();
    const low: QueuedTask = {
      id: 'low',
      queue: 'Q2',
      priority: 0,
      deadline: null,
      createdAt: new Date(100),
      risk: 10,
    };
    const high: QueuedTask = {
      id: 'high',
      queue: 'Q2',
      priority: 0,
      deadline: null,
      createdAt: new Date(100),
      risk: 90,
    };
    // Equal createdAt → risk decides
    const picked = policy.pick([low, { ...high, createdAt: new Date(100) }]);
    expect(picked?.id).toBe('high');
  });

  it('EDF applies the risk tiebreaker when deadlines tie', async () => {
    const policy = new EDFPolicy();
    const base = Date.now() + 5000;
    const low: QueuedTask = {
      id: 'low',
      queue: 'Q1',
      priority: 0,
      deadline: new Date(base),
      createdAt: new Date(0),
      risk: 10,
    };
    const high: QueuedTask = {
      id: 'high',
      queue: 'Q1',
      priority: 0,
      deadline: new Date(base),
      createdAt: new Date(0),
      risk: 90,
    };
    expect(policy.pick([low, high])?.id).toBe('high');
  });

  it('FairShare applies the risk tiebreaker when priority ties', async () => {
    const policy = new FairSharePolicy();
    const low: QueuedTask = {
      id: 'low',
      agentId: 'agentA',
      queue: 'Q1',
      priority: 5,
      deadline: null,
      createdAt: new Date(0),
      risk: 10,
    };
    const high: QueuedTask = {
      id: 'high',
      agentId: 'agentA',
      queue: 'Q1',
      priority: 5,
      deadline: null,
      createdAt: new Date(0),
      risk: 90,
    };
    expect(policy.pick([low, high])?.id).toBe('high');
  });
});

describe('Forge — Self-healing SchedulerSlotManager (circuit breaker + admission)', () => {
  beforeEach(() => resetSlotManager());

  it('admits up to capacity and then rejects', () => {
    const m = new SchedulerSlotManager({ capacity: 2, failureThreshold: 3 });
    expect(m.tryAcquire('t1')).toBe(true);
    expect(m.tryAcquire('t2')).toBe(true);
    expect(m.tryAcquire('t3')).toBe(false);
    expect(m.stats().active).toBe(2);
    expect(m.stats().available).toBe(0);
  });

  it('does not double-count the same task id', () => {
    const m = new SchedulerSlotManager({ capacity: 2 });
    expect(m.tryAcquire('t1')).toBe(true);
    expect(m.tryAcquire('t1')).toBe(true);
    expect(m.stats().active).toBe(1);
  });

  it('trips OPEN after consecutive failures and blocks admission', () => {
    const m = new SchedulerSlotManager({ capacity: 10, failureThreshold: 3, openForMs: 100_000 });
    m.tryAcquire('a');
    m.release('a', 'failure', 'boom');
    m.tryAcquire('b');
    m.release('b', 'failure', 'boom');
    m.tryAcquire('c');
    m.release('c', 'failure', 'boom');
    expect(m.stats().state).toBe('open');
    expect(m.tryAcquire('d')).toBe(false);
  });

  it('self-heals: half-open probe success re-closes the breaker', () => {
    const m = new SchedulerSlotManager({
      capacity: 10,
      failureThreshold: 2,
      openForMs: 0,
      halfOpenProbeLimit: 1,
    });
    m.tryAcquire('a');
    m.release('a', 'failure');
    m.tryAcquire('b');
    m.release('b', 'failure');
    expect(m.stats().state).toBe('open');
    // cooldown is 0 → transitions to half-open on next acquire
    expect(m.tryAcquire('probe')).toBe(true);
    m.release('probe', 'success');
    expect(m.stats().state).toBe('closed');
    expect(m.stats().consecutiveFailures).toBe(0);
  });

  it('trip() forces open (e.g. kernel panic / kill-switch) and reset() clears it', () => {
    const m = getSlotManager();
    m.trip('kernel_panic');
    expect(m.stats().state).toBe('open');
    m.reset();
    expect(m.stats().state).toBe('closed');
  });

  it('records failure reasons for observability', () => {
    const m = new SchedulerSlotManager({ capacity: 10, failureThreshold: 1 });
    m.tryAcquire('x');
    m.release('x', 'failure', 'db_unreachable');
    expect(m.stats().lastTrippedReason).toBe('db_unreachable');
    expect(m.stats().failures).toBe(1);
  });
});
