import { describe, it, expect } from 'vitest';
import {
  MLFQPolicy,
  EDFPolicy,
  FairSharePolicy,
  FairnessTracker,
  pickByPolicy,
  schedulerDryRun,
  getSchedulerLatency,
  MLFQ_LEVELS,
} from '../src/services/scheduler.js';
import type { QueuedTask } from '../src/services/scheduler.js';

/**
 * Phase 11 — Task 11.34: Property-Based Scheduler Tests.
 *
 * `fast-check` is intentionally NOT a runtime dependency (air-gapped build); this
 * file ships a tiny deterministic property-based-test (PBT) runner with a seeded
 * RNG so the suite is reproducible and requires no network install. Each property
 * is checked across many randomly generated inputs.
 */

// ── Tiny deterministic PBT harness ───────────────────────────────────────────
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

interface PropertyResult {
  ok: boolean;
  counterexample?: unknown;
  runs: number;
}

function forAll(
  generator: (rng: () => number) => QueuedTask[],
  predicate: (tasks: QueuedTask[]) => boolean,
  runs = 200,
  seed = 12345
): PropertyResult {
  const rng = makeRng(seed);
  for (let i = 0; i < runs; i++) {
    const tasks = generator(rng);
    if (!predicate(tasks)) {
      return { ok: false, counterexample: tasks, runs: i + 1 };
    }
  }
  return { ok: true, runs };
}

function genTask(rng: () => number, id: string): QueuedTask {
  const queues = MLFQ_LEVELS;
  const q = queues[Math.floor(rng() * queues.length)] ?? MLFQ_LEVELS[0]!;
  const useDeadline = rng() > 0.5;
  return {
    id,
    queue: q,
    priority: Math.floor(rng() * 100),
    deadline: useDeadline ? new Date(Date.now() + Math.floor(rng() * 100000)) : null,
    createdAt: new Date(Date.now() - Math.floor(rng() * 5000)),
  };
}

describe('Phase 11.34 — property-based scheduler', () => {
  it('MLFQ + EDF always return a member of the input set (never fabricate)', () => {
    const res = forAll(
      (rng) => {
        const n = 1 + Math.floor(rng() * 12);
        return Array.from({ length: n }, (_, i) => genTask(rng, `t${i}`));
      },
      (tasks) => {
        const chosen = pickByPolicy(tasks);
        if (!chosen) return tasks.length === 0; // null only when empty
        return tasks.some((t) => t.id === chosen.id);
      }
    );
    expect(res.ok, res.counterexample ? JSON.stringify(res.counterexample) : undefined).toBe(true);
  });

  it('EDF picks the task with the earliest finite deadline', () => {
    const res = forAll(
      (rng) => {
        const n = 2 + Math.floor(rng() * 8);
        return Array.from({ length: n }, (_, i) => genTask(rng, `t${i}`));
      },
      (tasks) => {
        const chosen = new EDFPolicy().pick(tasks);
        if (!chosen) return tasks.every((t) => t.deadline === null);
        const minFinite = tasks
          .filter((t) => t.deadline !== null)
          .map((t) => t.deadline!.getTime())
          .reduce((a, b) => Math.min(a, b), Infinity);
        // Chosen must have a deadline no later than the earliest finite deadline.
        return chosen.deadline !== null && chosen.deadline.getTime() <= minFinite;
      }
    );
    expect(res.ok, res.counterexample ? JSON.stringify(res.counterexample) : undefined).toBe(true);
  });

  it('MLFQ prefers a higher queue rank (lower Q index) when present', () => {
    const res = forAll(
      (rng) => {
        const n = 2 + Math.floor(rng() * 8);
        return Array.from({ length: n }, (_, i) => genTask(rng, `t${i}`));
      },
      (tasks) => {
        const chosen = new MLFQPolicy().pick(tasks);
        if (!chosen) return tasks.length === 0;
        // No task in a strictly higher rank (lower index) may exist.
        const chosenRank = MLFQ_LEVELS.indexOf(chosen.queue as (typeof MLFQ_LEVELS)[number]);
        return tasks.every((t) => {
          const r = MLFQ_LEVELS.indexOf(t.queue as (typeof MLFQ_LEVELS)[number]);
          return r >= chosenRank;
        });
      }
    );
    expect(res.ok, res.counterexample ? JSON.stringify(res.counterexample) : undefined).toBe(true);
  });

  it('FairnessTracker entitlement shares sum to ~1 across random weights', () => {
    const res = forAll(
      () => [], // weight generation handled inside predicate via tracker
      () => true
    );
    expect(res.ok).toBe(true);

    const rng = makeRng(99);
    for (let trial = 0; trial < 100; trial++) {
      const n = 1 + Math.floor(rng() * 6);
      const tracker = new FairnessTracker(0.2);
      const weights: number[] = [];
      for (let i = 0; i < n; i++) {
        const w = 1 + Math.floor(rng() * 10);
        weights.push(w);
        tracker.register({ teamId: `team${i}` }, w);
        tracker.record({ teamId: `team${i}` }, rng());
      }
      const m = tracker.measure();
      const sum = m.reduce((a, b) => a + b.entitlementShare, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
    }
  });

  it('schedulerDryRun returns a permutation of the input ids and mode=simulation', () => {
    const res = forAll(
      (rng) => {
        const n = 1 + Math.floor(rng() * 10);
        return Array.from({ length: n }, (_, i) => ({
          id: `d${i}`,
          priority: Math.floor(rng() * 10),
          queue: MLFQ_LEVELS[Math.floor(rng() * MLFQ_LEVELS.length)] ?? MLFQ_LEVELS[0]!,
          deadline: rng() > 0.5 ? new Date(Date.now() + Math.floor(rng() * 1000)) : null,
          weight: 1 + Math.floor(rng() * 5),
          createdAt: new Date(),
        }));
      },
      (pool) => {
        const result = schedulerDryRun(pool);
        if (result.mode !== 'simulation') return false;
        if (result.order.length !== pool.length) return false;
        const set = new Set(result.order);
        if (set.size !== pool.length) return false; // unique
        return pool.every((p) => set.has(p.id)); // same ids
      },
      300
    );
    expect(res.ok, res.counterexample ? JSON.stringify(res.counterexample) : undefined).toBe(true);
  });

  it('getSchedulerLatency returns a stable shape', () => {
    const lat = getSchedulerLatency();
    expect(typeof lat).toBe('object');
    for (const q of MLFQ_LEVELS) {
      if (lat[q]) {
        expect(typeof lat[q]!.samples).toBe('number');
        expect(typeof lat[q]!.p50).toBe('number');
        expect(typeof lat[q]!.p99).toBe('number');
      }
    }
  });

  it('FairSharePolicy/MLFQ/EDF all implement SchedulingPolicy.pick', () => {
    const policies = [new MLFQPolicy(), new EDFPolicy(), new FairSharePolicy()];
    for (const p of policies) {
      expect(typeof p.pick).toBe('function');
      expect(p.pick([])).toBeNull();
    }
  });
});
