/** slo-dashboard.ts — aggregates SLOs, burn rates, health into a dashboard payload. */
import { Slo, errorBudget, budgetBurnPct, isBreached, goodRatio } from './slo.js';
import { evaluateBurnRates } from './burn-rate.js';
import { board, unhealthy } from './dependency-health.js';
import { snapshot as breakerSnapshot } from './circuit-breaker-registry.js';
import { getTier } from './degraded-mode.js';

export interface Dashboard {
  generatedAt: number;
  tier: string;
  slos: {
    id: string;
    goodRatio: number;
    errorBudget: number;
    burnPct: number;
    breached: boolean;
    burnAlerts: number;
  }[];
  dependencies: { name: string; health: string }[];
  breakers: { name: string; state: string }[];
  unhealthyCount: number;
}

export function buildDashboard(slos: Slo[]): Dashboard {
  return {
    generatedAt: Date.now(),
    tier: getTier(),
    slos: slos.map((s) => {
      const alerts = evaluateBurnRates(s).filter((a) => a.alert);
      return {
        id: s.id,
        goodRatio: goodRatio(s),
        errorBudget: errorBudget(s),
        burnPct: budgetBurnPct(s),
        breached: isBreached(s),
        burnAlerts: alerts.length,
      };
    }),
    dependencies: board(),
    breakers: breakerSnapshot(),
    unhealthyCount: unhealthy().length,
  };
}
