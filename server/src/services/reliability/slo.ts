/**
 * slo.ts — Service Level Objective definitions + error-budget tracking.
 *
 * An SLO binds a reliability target (e.g. 99.9% over 28d) to a query window. The
 * error budget is the allowed failure fraction; when exhausted, releases are gated.
 */
import { ApiError } from '../../lib/errors.js';

export interface Slo {
  id: string;
  name: string;
  objective: number; // 0..1 e.g. 0.999
  windowDays: number;
  // Provided by the metrics pipeline:
  total: number;
  bad: number;
}

export function errorBudget(slo: Slo): number {
  const remaining = slo.objective - goodRatio(slo);
  return Math.max(0, remaining); // fraction of requests still permitted to fail
}

export function goodRatio(slo: Slo): number {
  if (slo.total === 0) return 1;
  return (slo.total - slo.bad) / slo.total;
}

export function budgetBurnPct(slo: Slo): number {
  const budget = 1 - slo.objective;
  if (budget <= 0) return 0;
  const consumed = slo.bad / slo.total || 0;
  return Math.min(100, (consumed / budget) * 100);
}

export function isBreached(slo: Slo): boolean {
  return goodRatio(slo) < slo.objective;
}

export function registerSlo(
  slo: Omit<Slo, 'total' | 'bad'> & Partial<Pick<Slo, 'total' | 'bad'>>
): Slo {
  return { total: 0, bad: 0, ...slo };
}

export function assertBudgetAvailable(slo: Slo, minBudget = 0): void {
  if (errorBudget(slo) < minBudget) {
    throw new ApiError(
      'SLO_BUDGET_EXHAUSTED',
      `SLO ${slo.id} error budget exhausted; releases gated.`
    );
  }
}
