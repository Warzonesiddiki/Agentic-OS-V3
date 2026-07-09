/** latency-budget.ts — per-request latency budgets decomposed by subsystem. */
import { ApiError } from '../../lib/errors.js';

export interface LatencyBudget {
  totalMs: number;
  breakdown: Record<string, number>; // subsystem -> allocated ms
}

export function validateBudget(b: LatencyBudget): void {
  const sum = Object.values(b.breakdown).reduce((a, c) => a + c, 0);
  if (sum > b.totalMs)
    throw new ApiError(
      'LATENCY_BUDGET_EXCEEDED',
      `Breakdown ${sum}ms exceeds total ${b.totalMs}ms.`
    );
}

export function remaining(
  b: LatencyBudget,
  observed: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, alloc] of Object.entries(b.breakdown)) {
    out[k] = alloc - (observed[k] ?? 0);
  }
  return out;
}

export function isOver(observed: Record<string, number>, budget: LatencyBudget): string[] {
  return Object.entries(observed)
    .filter(([k, v]) => budget.breakdown[k] != null && v > budget.breakdown[k])
    .map(([k]) => k);
}
