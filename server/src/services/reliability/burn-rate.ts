/** burn-rate.ts — multi-window burn-rate alerting per Google SRE workbook. */
import { registerSlo, Slo } from './slo.js';

export interface BurnRateAlert {
  sloId: string;
  window: string;
  burnRate: number;
  threshold: number;
  alert: boolean;
}

// (window hours, burn-rate threshold) pairs.
const POLICY: [string, number][] = [
  ['1h', 14.4],
  ['6h', 6],
  ['24h', 3],
  ['72h', 1],
];

export function burnRate(slo: Slo, windowHours: number, _now: number = Date.now()): number {
  // For a synthetic SLO with aggregate total/bad, derive instantaneous burn from budget.
  const budget = 1 - slo.objective;
  if (budget <= 0) return 0;
  const windowMs = windowHours * 3600_000;
  const rate = slo.bad / Math.max(1, slo.total) / (windowMs / (slo.windowDays * 86_400_000));
  return rate / budget;
}

export function evaluateBurnRates(slo: Slo, now: number = Date.now()): BurnRateAlert[] {
  return POLICY.map(([window, threshold]) => {
    const br = burnRate(slo, parseFloat(window.replace('h', '')), now);
    return { sloId: slo.id, window, burnRate: br, threshold, alert: br >= threshold };
  });
}

export function anyAlert(slo: Slo): boolean {
  return evaluateBurnRates(registerSlo(slo as Slo)).some((a) => a.alert);
}
