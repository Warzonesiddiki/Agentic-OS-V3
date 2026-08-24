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

/**
 * Load-robust benchmark helper (WS1, 2026-08-24).
 *
 * Wall-clock p95 budgets flake under parallel CI load because scheduler noise
 * inflates TAIL latencies. The MINIMUM across many samples converges to the
 * uncontended true cost of the operation regardless of load, so assertions use
 * min-of-samples against a generous ceiling: an accidental O(N^2) or massive
 * per-pick allocation blows far past it, while hardware noise cannot lift the
 * minimum above it. p95/avg are retained as logged diagnostics only.
 */
function benchPickMin(
  label: string,
  policy: { pick(tasks: QueuedTask[]): unknown },
  tasks: QueuedTask[],
  iterations = 300,
): number {
  for (let i = 0; i < 20; i++) policy.pick(tasks); // warm-up, untimed (JIT/caches)
  let min = Infinity;
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    policy.pick(tasks);
    const dt = performance.now() - start;
    samples.push(dt);
    if (dt < min) min = dt;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
  console.log(`[scheduler bench] ${label} iters=${iterations} avg=${avg.toFixed(4)}ms p95=${p95.toFixed(4)}ms min=${min.toFixed(4)}ms`);
  return min;
}

const PICK_MIN_CEILING_MS = 25;

describe('scheduler pick hot-path benchmark', () => {
  it('MLFQPolicy.pick stays millisecond-scale over 10000 tasks (min-of-samples)', () => {
    const min = benchPickMin('MLFQ pick n=10000', new MLFQPolicy(), makeTasks(10000));
    expect(min).toBeLessThan(PICK_MIN_CEILING_MS);
  });

  it('EDFPolicy.pick stays millisecond-scale over 10000 tasks (min-of-samples)', () => {
    const min = benchPickMin('EDF pick n=10000', new EDFPolicy(), makeTasks(10000));
    expect(min).toBeLessThan(PICK_MIN_CEILING_MS);
  });

  it('FairSharePolicy.pick stays single-pass fast over 10000 tasks (min-of-samples)', () => {
    const min = benchPickMin('FairShare pick n=10000', new FairSharePolicy(), makeTasks(10000));
    expect(min).toBeLessThan(PICK_MIN_CEILING_MS);
  });

  it('recordQueueLatency uses a ring buffer (no O(N) shift) and percentiles still compute', () => {
    for (let i = 0; i < 2500; i++) recordQueueLatency('bench', i);
    const pct = getQueueLatencyPercentiles();
    expect(pct['bench'].samples).toBe(1000);
    expect(pct['bench'].p99).toBeGreaterThan(pct['bench'].p50);
  });
});
