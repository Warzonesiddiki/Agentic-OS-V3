/** reliability-scorecard.ts — composite reliability score (0..100). */
import { Slo, goodRatio } from './slo.js';
import { unhealthy } from './dependency-health.js';
import { snapshot as breakers } from './circuit-breaker-registry.js';
import { getTier } from './degraded-mode.js';
import { forward } from '../siem-forwarder.js';

const TIER_SCORE: Record<string, number> = { full: 100, reduced: 80, minimal: 55, safe: 30 };

export interface Scorecard {
  score: number;
  tier: string;
  sloAvg: number;
  unhealthyDeps: number;
  openBreakers: number;
  ts: number;
}

export function computeScorecard(slos: Slo[]): Scorecard {
  const sloAvg = slos.length ? slos.reduce((a, s) => a + goodRatio(s), 0) / slos.length : 1;
  const unhealth = unhealthy().length;
  const open = breakers().filter((b) => b.state === 'open').length;
  const tierScore = TIER_SCORE[getTier()] ?? 100;
  // Weighted: SLO 50%, tier 35%, deps 10%, breakers 5%.
  const score = Math.max(
    0,
    Math.round(sloAvg * 50 + tierScore * 0.35 + (unhealth === 0 ? 10 : 0) + (open === 0 ? 5 : 0))
  );
  const card: Scorecard = {
    score,
    tier: getTier(),
    sloAvg,
    unhealthyDeps: unhealth,
    openBreakers: open,
    ts: Date.now(),
  };
  void forward({
    ts: Date.now(),
    kind: 'reliability.scorecard',
    severity: score < 50 ? 'critical' : 'info',
    attrs: { score },
  });
  return card;
}
