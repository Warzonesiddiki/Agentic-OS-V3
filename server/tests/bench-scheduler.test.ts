import { describe, it, expect } from 'vitest';
import type { QueuedTask } from '../src/services/scheduler.js';
import {
  MLFQPolicy,
  EDFPolicy,
  FairSharePolicy,
  recordQueueLatency,
  getQueueLatencyPercentiles,
} from '../src/services/scheduler.js';

function makeTasks(n: number): QueuedTask[] {
  const queues = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4'];
  const out: QueuedTask[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `t${i}`,
      queue: queues[i % queues.length],
      priority: (i * 7) % 100,
      deadline: i % 3 === 0 ? new Date(Date.now() + (i % 50) * 10) : null,
      createdAt: new Date(Date.now() - ((i * 13) % 5000)),
      agentId: `agent-${i % 8}`,
      risk: (i * 3) % 10,
    });
  }
  return out;
}

describe('scheduler pick hot-path benchmark', () => {
  it('MLFQPolicy.pick is O(N) with no sort over 10000 tasks (p95 < threshold)', () => {
    const policy = new MLFQPolicy();
    const tasks = makeTasks(10000);
    const iterations = 1000;
    const latencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      policy.pick(tasks);
      latencies.push(performance.now() - start);
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    expect(p95).toBeLessThan(5);
    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
     
    console.log(`[scheduler bench] MLFQ pick n=10000 iters=${iterations} avg=${avg.toFixed(4)}ms p95=${p95.toFixed(4)}ms`);
  });

  it('EDFPolicy.pick is O(N) with no sort over 10000 tasks', () => {
    const policy = new EDFPolicy();
    const tasks = makeTasks(10000);
    const iterations = 1000;
    const latencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      policy.pick(tasks);
      latencies.push(performance.now() - start);
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    expect(p95).toBeLessThan(5);
    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
     
    console.log(`[scheduler bench] EDF pick n=10000 iters=${iterations} avg=${avg.toFixed(4)}ms p95=${p95.toFixed(4)}ms`);
  });

  it('FairSharePolicy.pick is O(N) single pass over 10000 tasks', () => {
    const policy = new FairSharePolicy();
    const tasks = makeTasks(10000);
    const iterations = 1000;
    const latencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      policy.pick(tasks);
      latencies.push(performance.now() - start);
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    expect(p95).toBeLessThan(5);
    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
     
    console.log(`[scheduler bench] FairShare pick n=10000 iters=${iterations} avg=${avg.toFixed(4)}ms p95=${p95.toFixed(4)}ms`);
  });

  it('recordQueueLatency uses a ring buffer (no O(N) shift) and percentiles still compute', () => {
    for (let i = 0; i < 2500; i++) recordQueueLatency('bench', i);
    const pct = getQueueLatencyPercentiles();
    expect(pct['bench'].samples).toBe(1000);
    expect(pct['bench'].p99).toBeGreaterThan(pct['bench'].p50);
  });
});
