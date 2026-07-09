/**
 * tests/services/scheduler-property.test.ts — Phase 11.34
 *
 * Property-based invariant tests for the scheduler's pure scheduling policies
 * (MLFQ, EDF) and the gang / starvation semantics layered on top of them.
 *
 * fast-check is NOT a dependency of this package, so we use a small
 * deterministic PRNG (mulberry32) to generate reproducible randomized task
 * sequences. Every generator is seeded and every loop is bounded (~200 iters)
 * so the suite is non-flaky and reproducible across runs.
 */
import { describe, it, expect } from 'vitest';
import {
  MLFQPolicy,
  EDFPolicy,
  MLFQ_LEVELS,
  FairSharePolicy,
  recordQueueLatency,
  getQueueLatencyPercentiles,
  percentile,
} from '../../src/services/scheduler.js';
import type { QueuedTask, SchedulingPolicy } from '../../src/services/scheduler.js';

// ── Deterministic PRNG ────────────────────────────────────────
// mulberry32: tiny, fast, seedable. Returns floats in [0, 1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rand: () => number, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rand() * (maxInclusive - minInclusive + 1));
}

// Mirror of the private queueRank() in scheduler.ts (pure, depends only on
// MLFQ_LEVELS). Used on the test side to compute expected picks.
function queueRank(queue: string): number {
  const idx = MLFQ_LEVELS.indexOf(queue as (typeof MLFQ_LEVELS)[number]);
  return idx >= 0 ? idx : MLFQ_LEVELS.length;
}

// Drain a policy by repeatedly picking and removing the chosen task.
// Bounded by tasks.length since the pool shrinks each step -> non-flaky.
function drain(policy: SchedulingPolicy, tasks: QueuedTask[]): string[] {
  const remaining = [...tasks];
  const order: string[] = [];
  while (remaining.length) {
    const chosen = policy.pick(remaining);
    if (!chosen) break;
    order.push(chosen.id);
    const idx = remaining.findIndex((t) => t.id === chosen.id);
    remaining.splice(idx, 1);
  }
  return order;
}

// ── Generators ────────────────────────────────────────────────

function makeEdfPool(rand: () => number, count: number): QueuedTask[] {
  const tasks: QueuedTask[] = [];
  for (let i = 0; i < count; i++) {
    const hasDeadline = rand() < 0.7;
    const deadline = hasDeadline ? new Date(1_000_000 + Math.floor(rand() * 100_000)) : null;
    tasks.push({
      id: `t${i}`,
      queue: 'Q1',
      priority: 0,
      deadline,
      createdAt: new Date(10_000_000 + i),
      agentId: 'a',
      gangId: null,
    });
  }
  return tasks;
}

function makeMlfqPool(rand: () => number, count: number): QueuedTask[] {
  const tasks: QueuedTask[] = [];
  for (let i = 0; i < count; i++) {
    const level = MLFQ_LEVELS[randInt(rand, 0, MLFQ_LEVELS.length - 1)]!;
    tasks.push({
      id: `t${i}`,
      queue: level,
      priority: 0,
      deadline: null,
      createdAt: new Date(10_000_000 + i),
      agentId: 'a',
      gangId: null,
    });
  }
  return tasks;
}

// Build tasks across a few gangs with known total sizes. Only a random subset
// (possibly the full set) of each gang's members is present in the pool.
function makeGangPool(rand: () => number): { tasks: QueuedTask[]; gangSizes: Map<string, number> } {
  const tasks: QueuedTask[] = [];
  const gangSizes = new Map<string, number>();
  let gid = 0;
  let tid = 0;
  let created = 0;
  const numGangs = randInt(rand, 1, 3);
  for (let g = 0; g < numGangs; g++) {
    const id = `G${gid++}`;
    const size = randInt(rand, 2, 4);
    gangSizes.set(id, size);
    const include = randInt(rand, 1, size);
    for (let m = 0; m < include; m++) {
      tasks.push({
        id: `t${tid++}`,
        queue: 'Q1',
        priority: 0,
        deadline: null,
        createdAt: new Date(created++),
        agentId: 'a',
        gangId: id,
      });
    }
  }
  const singles = randInt(rand, 0, 3);
  for (let s = 0; s < singles; s++) {
    tasks.push({
      id: `t${tid++}`,
      queue: 'Q1',
      priority: 0,
      deadline: null,
      createdAt: new Date(created++),
      agentId: 'a',
      gangId: null,
    });
  }
  return { tasks, gangSizes };
}

// A unique lowest-priority (Q4) task mixed with random higher-rank tasks.
function makeStarvationPool(rand: () => number): QueuedTask[] {
  const tasks: QueuedTask[] = [];
  let created = 0;
  let tid = 0;
  const k = randInt(rand, 1, 15);
  for (let i = 0; i < k; i++) {
    const level = MLFQ_LEVELS[randInt(rand, 0, 3)]!; // Q0..Q3 only
    tasks.push({
      id: `h${tid++}`,
      queue: level,
      priority: 0,
      deadline: null,
      createdAt: new Date(created++),
      agentId: 'a',
      gangId: null,
    });
  }
  tasks.push({
    id: 'low',
    queue: 'Q4',
    priority: 0,
    deadline: null,
    createdAt: new Date(created++),
    agentId: 'a',
    gangId: null,
  });
  return tasks;
}

// ── Gang all-or-nothing model ─────────────────────────────────
// A gang member is schedulable only if ALL members of its gang are present.
function eligibleTasks(tasks: QueuedTask[], gangSizes: Map<string, number>): QueuedTask[] {
  const present = new Map<string, number>();
  for (const t of tasks) {
    if (t.gangId) present.set(t.gangId, (present.get(t.gangId) ?? 0) + 1);
  }
  return tasks.filter((t) => {
    if (!t.gangId) return true;
    const total = gangSizes.get(t.gangId);
    if (total === undefined) return true;
    return (present.get(t.gangId) ?? 0) === total;
  });
}

// ── Suites ────────────────────────────────────────────────────

describe('Scheduler property-based invariants (Phase 11.34)', () => {
  const SEED = 0x5eed1234;
  const ITERS = 200;

  describe('EDF ordering', () => {
    it('picked task has the earliest deadline across randomized pools', () => {
      const rand = mulberry32(SEED);
      const policy = new EDFPolicy();
      for (let iter = 0; iter < ITERS; iter++) {
        const count = randInt(rand, 1, 20);
        const tasks = makeEdfPool(rand, count);
        const picked = policy.pick(tasks);
        expect(picked).not.toBeNull();

        const expected = [...tasks].sort((a, b) => {
          const da = a.deadline ? a.deadline.getTime() : Number.POSITIVE_INFINITY;
          const db = b.deadline ? b.deadline.getTime() : Number.POSITIVE_INFINITY;
          if (da !== db) return da - db;
          return a.createdAt.getTime() - b.createdAt.getTime();
        })[0]!;
        expect(picked?.id).toBe(expected.id);
      }
    });

    it('no task with an earlier deadline is left behind (deadline <= all others)', () => {
      const rand = mulberry32(SEED ^ 0x1111);
      const policy = new EDFPolicy();
      for (let iter = 0; iter < ITERS; iter++) {
        const tasks = makeEdfPool(rand, randInt(rand, 1, 20));
        const picked = policy.pick(tasks);
        expect(picked).not.toBeNull();
        const pickedTime = picked!.deadline ? picked!.deadline.getTime() : Number.POSITIVE_INFINITY;
        for (const t of tasks) {
          const tt = t.deadline ? t.deadline.getTime() : Number.POSITIVE_INFINITY;
          expect(pickedTime).toBeLessThanOrEqual(tt);
        }
      }
    });
  });

  describe('MLFQ fairness', () => {
    it('picked task has the lowest queue rank across randomized pools', () => {
      const rand = mulberry32(SEED ^ 0x2222);
      const policy = new MLFQPolicy();
      for (let iter = 0; iter < ITERS; iter++) {
        const tasks = makeMlfqPool(rand, randInt(rand, 1, 20));
        const picked = policy.pick(tasks);
        expect(picked).not.toBeNull();

        const expected = [...tasks].sort((a, b) => {
          const ra = queueRank(a.queue);
          const rb = queueRank(b.queue);
          if (ra !== rb) return ra - rb;
          return a.createdAt.getTime() - b.createdAt.getTime();
        })[0]!;
        expect(picked?.id).toBe(expected.id);
      }
    });

    it('no task with a strictly lower queue rank is bypassed', () => {
      const rand = mulberry32(SEED ^ 0x3333);
      const policy = new MLFQPolicy();
      for (let iter = 0; iter < ITERS; iter++) {
        const tasks = makeMlfqPool(rand, randInt(rand, 1, 20));
        const picked = policy.pick(tasks);
        expect(picked).not.toBeNull();
        const pickedRank = queueRank(picked!.queue);
        for (const t of tasks) {
          expect(pickedRank).toBeLessThanOrEqual(queueRank(t.queue));
        }
      }
    });

    it('FIFO within a queue - earliest createdAt wins among equal ranks', () => {
      const rand = mulberry32(SEED ^ 0x4444);
      const policy = new MLFQPolicy();
      for (let iter = 0; iter < ITERS; iter++) {
        const tasks = makeMlfqPool(rand, randInt(rand, 2, 20));
        const picked = policy.pick(tasks);
        const pickedRank = queueRank(picked!.queue);
        const sameRank = tasks.filter((t) => queueRank(t.queue) === pickedRank);
        const minCreated = Math.min(...sameRank.map((t) => t.createdAt.getTime()));
        expect(picked!.createdAt.getTime()).toBe(minCreated);
      }
    });
  });

  describe('Gang all-or-nothing', () => {
    it('a gang member is never scheduled unless its entire gang is present', () => {
      const rand = mulberry32(SEED ^ 0x5555);
      const policy = new EDFPolicy();
      for (let iter = 0; iter < ITERS; iter++) {
        const { tasks, gangSizes } = makeGangPool(rand);
        const present = new Map<string, number>();
        for (const t of tasks) {
          if (t.gangId) present.set(t.gangId, (present.get(t.gangId) ?? 0) + 1);
        }
        const eligibles = eligibleTasks(tasks, gangSizes);
        const order = drain(policy, eligibles);
        for (const id of order) {
          const t = tasks.find((x) => x.id === id);
          expect(t).toBeDefined();
          if (t!.gangId) {
            const total = gangSizes.get(t!.gangId);
            expect(total === undefined || (present.get(t!.gangId) ?? 0) === total).toBe(true);
          }
        }
      }
    });

    it('members of an incomplete gang never appear in the full drain order', () => {
      const rand = mulberry32(SEED ^ 0x6666);
      const policy = new EDFPolicy();
      for (let iter = 0; iter < ITERS; iter++) {
        const { tasks, gangSizes } = makeGangPool(rand);
        const present = new Map<string, number>();
        for (const t of tasks) {
          if (t.gangId) present.set(t.gangId, (present.get(t.gangId) ?? 0) + 1);
        }
        const incomplete = new Set<string>();
        for (const [gid, total] of gangSizes) {
          if ((present.get(gid) ?? 0) !== total) incomplete.add(gid);
        }
        const order = drain(policy, eligibleTasks(tasks, gangSizes));
        for (const id of order) {
          const t = tasks.find((x) => x.id === id);
          if (t!.gangId) expect(incomplete.has(t!.gangId)).toBe(false);
        }
      }
    });
  });

  describe('Starvation bound', () => {
    it('a unique lowest-priority (Q4) task is eventually scheduled within pool.length steps', () => {
      const rand = mulberry32(SEED ^ 0x7777);
      const policy = new MLFQPolicy();
      for (let iter = 0; iter < ITERS; iter++) {
        const tasks = makeStarvationPool(rand);
        const lowerRankCount = tasks.filter((t) => queueRank(t.queue) < queueRank('Q4')).length;
        const order = drain(policy, tasks);
        expect(order.length).toBe(tasks.length);
        expect(order[order.length - 1]).toBe('low');
        expect(order.indexOf('low')).toBe(lowerRankCount);
      }
    });

    it('repeated randomized starvation pools never starve the lowest-priority task', () => {
      const rand = mulberry32(SEED ^ 0x8888);
      const policy = new MLFQPolicy();
      for (let iter = 0; iter < ITERS; iter++) {
        const tasks = makeStarvationPool(rand);
        const order = drain(policy, tasks);
        expect(order).toContain('low');
      }
    });
  });
});

describe('Scheduler property-based invariants — fairness & wait-time (Phase 11.34, extended)', () => {
  const SEED = 0xc0ffee;
  const ITERS = 150;

  function makeFairSharePool(
    rand: () => number,
    numAgents: number,
    maxPer: number
  ): { tasks: QueuedTask[]; counts: Map<string, number> } {
    const tasks: QueuedTask[] = [];
    const counts = new Map<string, number>();
    let tid = 0;
    let created = 0;
    for (let a = 0; a < numAgents; a++) {
      const agentId = `agent_${SEED}_${a}_${Math.floor(rand() * 1e9)}`;
      const n = randInt(rand, 1, maxPer);
      counts.set(agentId, n);
      for (let i = 0; i < n; i++) {
        tasks.push({
          id: `t${tid++}`,
          agentId,
          queue: 'Q1',
          priority: randInt(rand, 1, 10),
          deadline: null,
          createdAt: new Date(created++),
          gangId: null,
        });
      }
    }
    return { tasks, counts };
  }

  describe('Fairness bounds (FairSharePolicy)', () => {
    it('every agent is fully served — no agent starves (fairness bound)', () => {
      const rand = mulberry32(SEED);
      const policy = new FairSharePolicy();
      for (let iter = 0; iter < ITERS; iter++) {
        const { tasks, counts } = makeFairSharePool(rand, randInt(rand, 2, 5), 4);
        const order = drain(policy, tasks);
        expect(order.length).toBe(tasks.length);
        const served = new Map<string, number>();
        for (const id of order) {
          const t = tasks.find((x) => x.id === id)!;
          served.set(t.agentId!, (served.get(t.agentId!) ?? 0) + 1);
        }
        for (const [agentId, expected] of counts) {
          expect(served.get(agentId)).toBe(expected);
        }
      }
    });

    it('priority does not starve another agent — equal task counts yield equal service', () => {
      const rand = mulberry32(SEED ^ 0xaaaa);
      const policy = new FairSharePolicy();
      for (let iter = 0; iter < ITERS; iter++) {
        const aHi = `hi_${Math.floor(rand() * 1e9)}`;
        const aLo = `lo_${Math.floor(rand() * 1e9)}`;
        const n = randInt(rand, 1, 5);
        const tasks: QueuedTask[] = [];
        for (let i = 0; i < n; i++) {
          tasks.push({
            id: `h${i}`,
            agentId: aHi,
            queue: 'Q1',
            priority: 10,
            deadline: null,
            createdAt: new Date(i),
            gangId: null,
          });
          tasks.push({
            id: `l${i}`,
            agentId: aLo,
            queue: 'Q1',
            priority: 1,
            deadline: null,
            createdAt: new Date(i + 1000),
            gangId: null,
          });
        }
        const order = drain(policy, tasks);
        const servedHi = order.filter((id) => id.startsWith('h')).length;
        const servedLo = order.filter((id) => id.startsWith('l')).length;
        expect(servedHi).toBe(n);
        expect(servedLo).toBe(n);
      }
    });

    it('within an agent, tasks are served highest-priority first', () => {
      const rand = mulberry32(SEED ^ 0xbbbb);
      const policy = new FairSharePolicy();
      for (let iter = 0; iter < ITERS; iter++) {
        const { tasks } = makeFairSharePool(rand, randInt(rand, 2, 4), 4);
        const order = drain(policy, tasks);
        const byAgent = new Map<string, number[]>();
        for (const id of order) {
          const t = tasks.find((x) => x.id === id)!;
          const arr = byAgent.get(t.agentId!) ?? [];
          arr.push(t.priority);
          byAgent.set(t.agentId!, arr);
        }
        for (const prios of byAgent.values()) {
          for (let i = 1; i < prios.length; i++) {
            expect(prios[i]!).toBeLessThanOrEqual(prios[i - 1]!);
          }
        }
      }
    });
  });

  describe('Monotonic wait-time growth bound', () => {
    it('percentile is monotonic non-decreasing in p and bounded by the sample range', () => {
      const rand = mulberry32(SEED ^ 0xcccc);
      for (let iter = 0; iter < ITERS; iter++) {
        const count = randInt(rand, 1, 50);
        const arr: number[] = [];
        for (let i = 0; i < count; i++) arr.push(randInt(rand, 0, 1000));
        const sorted = [...arr].sort((a, b) => a - b);
        const p0 = percentile(sorted, 0);
        const p25 = percentile(sorted, 25);
        const p50 = percentile(sorted, 50);
        const p90 = percentile(sorted, 90);
        const p100 = percentile(sorted, 100);
        expect(p0).toBeLessThanOrEqual(p25);
        expect(p25).toBeLessThanOrEqual(p50);
        expect(p50).toBeLessThanOrEqual(p90);
        expect(p90).toBeLessThanOrEqual(p100);
        expect(p0).toBeGreaterThanOrEqual(sorted[0]!);
        expect(p100).toBeLessThanOrEqual(sorted[sorted.length - 1]!);
      }
    });

    it('percentile of an empty array is 0 (bounded floor)', () => {
      expect(percentile([], 50)).toBe(0);
      expect(percentile([], 99)).toBe(0);
    });

    it('recorded queue latencies yield monotonic, non-negative percentiles bounded by max', () => {
      const rand = mulberry32(SEED ^ 0xdddd);
      for (let iter = 0; iter < ITERS; iter++) {
        const queue = `qlat_${SEED}_${iter}_${Math.floor(rand() * 1e9)}`;
        const samples = randInt(rand, 5, 40);
        for (let i = 0; i < samples; i++) {
          recordQueueLatency(queue, randInt(rand, 0, 5000));
        }
        const out = getQueueLatencyPercentiles();
        const stat = out[queue];
        expect(stat).toBeDefined();
        expect(stat!.p50).toBeGreaterThanOrEqual(0);
        expect(stat!.p50).toBeLessThanOrEqual(stat!.p90);
        expect(stat!.p90).toBeLessThanOrEqual(stat!.p99);
        expect(stat!.p99).toBeLessThanOrEqual(stat!.p999);
        expect(stat!.p999).toBeLessThanOrEqual(5000);
        expect(stat!.samples).toBe(samples);
      }
    });

    it('wait-time percentile is monotonic non-decreasing as more non-negative samples arrive (growth bound)', () => {
      const rand = mulberry32(SEED ^ 0xeeee);
      const queue = `qlat_growth_${Math.floor(rand() * 1e9)}`;
      let prevP999 = 0;
      for (let round = 0; round < 20; round++) {
        for (let i = 0; i < 5; i++) recordQueueLatency(queue, randInt(rand, 0, 3000));
        const stat = getQueueLatencyPercentiles()[queue]!;
        expect(stat.p999).toBeGreaterThanOrEqual(prevP999);
        prevP999 = stat.p999;
      }
    });
  });
});
