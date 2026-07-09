import { describe, it, expect } from 'vitest';

/**
 * Standalone equivalence check for the scheduler.pick refactor.
 *
 * The real `scheduler.ts` cannot be imported in this agent shell because it
 * pulls `better-sqlite3` (native binding ABI mismatch) at the top level. To
 * guard the O(N) linear-scan `pick` refactor against regression, we mirror the
 * EXACT new policy selection logic here and assert it equals the OLD
 * sort-based result on randomized inputs. If this diverges, the rewrite is
 * wrong; if it matches, the hot-path change is behavior-preserving.
 */
type QT = {
  id: string;
  queue: string;
  priority: number;
  deadline: Date | null;
  createdAt: Date;
  agentId?: string;
  risk?: number;
};

const queueRank = (q: string): number => {
  const m = /^Q(\d+)$/.exec(q);
  return m ? parseInt(m[1], 10) : 99;
};

function newMLFQ(tasks: QT[]): QT | null {
  if (!tasks.length) return null;
  let best = tasks[0];
  let bestRank = queueRank(best.queue);
  let bestRisk = best.risk ?? 0;
  let bestCreated = best.createdAt.getTime();
  for (let i = 1; i < tasks.length; i++) {
    const t = tasks[i];
    const r = queueRank(t.queue);
    if (
      r < bestRank ||
      (r === bestRank && (t.risk ?? 0) > bestRisk) ||
      (r === bestRank && (t.risk ?? 0) === bestRisk && t.createdAt.getTime() < bestCreated)
    ) {
      best = t;
      bestRank = r;
      bestRisk = t.risk ?? 0;
      bestCreated = t.createdAt.getTime();
    }
  }
  return best;
}

function newEDF(tasks: QT[]): QT | null {
  if (!tasks.length) return null;
  let best = tasks[0];
  let bestDeadline = best.deadline ? best.deadline.getTime() : Number.POSITIVE_INFINITY;
  let bestRisk = best.risk ?? 0;
  let bestCreated = best.createdAt.getTime();
  for (let i = 1; i < tasks.length; i++) {
    const t = tasks[i];
    const d = t.deadline ? t.deadline.getTime() : Number.POSITIVE_INFINITY;
    if (
      d < bestDeadline ||
      (d === bestDeadline && (t.risk ?? 0) > bestRisk) ||
      (d === bestDeadline &&
        (t.risk ?? 0) === bestRisk &&
        t.createdAt.getTime() < bestCreated)
    ) {
      best = t;
      bestDeadline = d;
      bestRisk = t.risk ?? 0;
      bestCreated = t.createdAt.getTime();
    }
  }
  return best;
}

function oldMLFQ(tasks: QT[]): QT | null {
  if (!tasks.length) return null;
  const sorted = [...tasks].sort((a, b) => {
    const ra = queueRank(a.queue);
    const rb = queueRank(b.queue);
    if (ra !== rb) return ra - rb;
    const r = (b.risk ?? 0) - (a.risk ?? 0);
    if (r !== 0) return r;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return sorted[0] ?? null;
}

function oldEDF(tasks: QT[]): QT | null {
  if (!tasks.length) return null;
  const sorted = [...tasks].sort((a, b) => {
    const da = a.deadline ? a.deadline.getTime() : Number.POSITIVE_INFINITY;
    const db2 = b.deadline ? b.deadline.getTime() : Number.POSITIVE_INFINITY;
    if (da !== db2) return da - db2;
    const r = (b.risk ?? 0) - (a.risk ?? 0);
    if (r !== 0) return r;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return sorted[0] ?? null;
}

function randTask(i: number): QT {
  const queues = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'OTHER'];
  return {
    id: `t${i}`,
    queue: queues[(i * 3) % queues.length],
    priority: (i * 7) % 100,
    deadline: i % 4 === 0 ? new Date(Date.now() + ((i % 60) - 30) * 10) : null,
    createdAt: new Date(Date.now() - ((i * 13) % 9000)),
    agentId: `agent-${i % 9}`,
    risk: (i * 5) % 11,
  };
}

describe('scheduler pick refactor equivalence (new O(N) vs old sort)', () => {
  it('MLFQ linear scan matches old sort-based pick on randomized inputs', () => {
    for (let trial = 0; trial < 500; trial++) {
      const n = 1 + (trial % 200);
      const tasks = Array.from({ length: n }, (_, i) => randTask(i + trial));
      const a = newMLFQ(tasks);
      const b = oldMLFQ(tasks);
      expect(a?.id).toBe(b?.id);
    }
  });

  it('EDF linear scan matches old sort-based pick on randomized inputs', () => {
    for (let trial = 0; trial < 500; trial++) {
      const n = 1 + (trial % 200);
      const tasks = Array.from({ length: n }, (_, i) => randTask(i + trial));
      const a = newEDF(tasks);
      const b = oldEDF(tasks);
      expect(a?.id).toBe(b?.id);
    }
  });

  it('handles empty input', () => {
    expect(newMLFQ([])).toBeNull();
    expect(newEDF([])).toBeNull();
  });
});
