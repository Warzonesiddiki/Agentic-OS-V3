import { describe, it, expect } from 'vitest';
import type { QueuedTask } from '../src/services/scheduler.js';

describe('Phase 11 Scheduling Policies', () => {
  const mk = (id: string, queue: string, ageMs: number): QueuedTask => ({
    id,
    queue,
    priority: 0,
    deadline: null,
    createdAt: new Date(Date.now() - ageMs),
    agentId: 'a',
  });

  const md = (id: string, deadlineMs: number): QueuedTask => ({
    id,
    queue: 'Q1',
    priority: 0,
    deadline: new Date(Date.now() + deadlineMs),
    createdAt: new Date(0),
    agentId: 'a',
  });

  it('MLFQ ordering — highest queue (Q0) is picked first regardless of age', async () => {
    const { MLFQPolicy } = await import('../src/services/scheduler.js');
    const policy = new MLFQPolicy();
    const picked = policy.pick([
      mk('q2', 'Q2', 100),
      mk('q0', 'Q0', 50),
      mk('q4', 'Q4', 200),
      mk('q1', 'Q1', 10),
    ]);
    expect(picked?.id).toBe('q0');
  });

  it('MLFQ FIFO within a queue — older createdAt wins', async () => {
    const { MLFQPolicy } = await import('../src/services/scheduler.js');
    const policy = new MLFQPolicy();
    const picked = policy.pick([mk('old', 'Q0', 100), mk('new', 'Q0', 10)]);
    expect(picked?.id).toBe('old');
  });

  it('MLFQ boost outcome — after boost promotes to Q0, FIFO by createdAt', async () => {
    const { MLFQPolicy } = await import('../src/services/scheduler.js');
    const policy = new MLFQPolicy();
    const pool: QueuedTask[] = [mk('c', 'Q0', 5), mk('a', 'Q0', 100), mk('b', 'Q0', 50)];
    const order: string[] = [];
    let remaining = [...pool];
    while (remaining.length) {
      const chosen = policy.pick(remaining);
      if (!chosen) break;
      order.push(chosen.id);
      remaining = remaining.filter((t) => t.id !== chosen.id);
    }
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('EDF ordering — earliest deadline wins', async () => {
    const { EDFPolicy } = await import('../src/services/scheduler.js');
    const policy = new EDFPolicy();
    const picked = policy.pick([md('late', 5000), md('soon', 1000), md('mid', 3000)]);
    expect(picked?.id).toBe('soon');
  });

  it('EDF — tasks without deadline ordered after those with one', async () => {
    const { EDFPolicy } = await import('../src/services/scheduler.js');
    const policy = new EDFPolicy();
    const noDeadline: QueuedTask = {
      id: 'none',
      queue: 'Q1',
      priority: 0,
      deadline: null,
      createdAt: new Date(0),
      agentId: 'a',
    };
    const picked = policy.pick([noDeadline, md('has', 1000)]);
    expect(picked?.id).toBe('has');
  });

  it('checkDeadlineAdmission — accepts comfortable slack, rejects too-tight, accepts no deadline', async () => {
    const { checkDeadlineAdmission } = await import('../src/services/scheduler.js');
    expect(checkDeadlineAdmission(new Date(Date.now() + 10000), 1000).ok).toBe(true);
    expect(checkDeadlineAdmission(new Date(Date.now() + 1000), 5000).ok).toBe(false);
    expect(checkDeadlineAdmission(null, 1000).ok).toBe(true);
  });

  it('Latency percentiles — records and reports samples', async () => {
    const { recordQueueLatency, getQueueLatencyPercentiles } = await import('../src/services/scheduler.js');
    recordQueueLatency('Q1', 100);
    recordQueueLatency('Q1', 200);
    recordQueueLatency('Q1', 300);
    const p = getQueueLatencyPercentiles();
    expect(p.Q1.samples).toBe(3);
    expect(p.Q1.p50).toBeGreaterThan(0);
  });

  it('pickByPolicy default policy — Q0 picked first', async () => {
    const { pickByPolicy } = await import('../src/services/scheduler.js');
    const picked = pickByPolicy([mk('q2', 'Q2', 100), mk('q0', 'Q0', 10)]);
    expect(picked?.id).toBe('q0');
  });
});
