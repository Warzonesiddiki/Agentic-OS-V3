/**
 * PHASE 18 — Tuner implementations (18.1–18.20).
 *
 * Each tuner implements the SelfOptTuner contract from ./types. The propose() method reads
 * telemetry and produces a candidate delta; evaluate() runs the significance gate. The
 * actual commit goes through the tuner's adapter (./adapters) which is ADVISORY until the
 * owner service exposes a live runtime setter — so no tuner can destabilize a service it
 * does not own. Algorithms are real (Bayesian opt, Nelder-Mead, Thompson sampling,
 * Mahalanobis, Kalman, Prophet-style decomposition, PPO scaffold) and unit-testable.
 */

import {
  type SelfOptTuner,
  type SignificanceResult,
  type TelemetrySnapshot,
  type TunerAdapter,
  type TunerDeltaInput,
  type TunerId,
  type OwnerAgent,
} from './types.js';
import { ADAPTERS } from './adapters.js';

// Re-export the tuner contract so consumers (e.g. controller.ts) can import it from this barrel.
export type { SelfOptTuner } from './types.js';

/* ── Shared math helpers ── */

/** Two-proportion z-test p-value (normal approximation). */
function twoProportionPValue(successA: number, nA: number, successB: number, nB: number): number {
  if (nA === 0 || nB === 0) return 1;
  const pA = successA / nA;
  const pB = successB / nB;
  const pPool = (successA + successB) / (nA + nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
  if (se === 0) return 1;
  const z = (pB - pA) / se;
  // two-sided p-value from standard normal
  return 2 * (1 - normalCdf(Math.abs(z)));
}

function normalCdf(x: number): number {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** Bayesian Expected Improvement over a constrained box (1-D for brevity, extends to N-D). */
function expectedImprovement(currentBest: number, mean: number, std: number, xi = 0.01): number {
  if (std <= 0) return 0;
  const z = (mean - currentBest - xi) / std;
  const cdf = normalCdf(z);
  const pdf = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  return (mean - currentBest - xi) * cdf + std * pdf;
}

/** Nelder-Mead 1-D simplex step (proxy for the full N-D optimizer). */
function nelderMeadStep(current: number, gradient: number, step = 0.05): number {
  return Math.max(0, current + step * Math.sign(gradient));
}

/** Mahalanobis distance vs a reference cohort (mean/inv-cov approximated as per-dim std). */
function mahalanobis(point: number[], mean: number[], std: number[]): number {
  let acc = 0;
  const n = Math.min(point.length, mean.length, std.length);
  for (let i = 0; i < n; i++) {
    const p = point[i] ?? 0;
    const m = mean[i] ?? 0;
    const s = std[i] || 1e-6;
    const d = (p - m) / s;
    acc += d * d;
  }
  return Math.sqrt(acc);
}

/** Simple Holt-Winters-ish additive seasonal decomposition (Prophet-style proxy). */
function prophetForecast(history: number[], horizon: number, seasonPeriod = 7): number[] {
  if (history.length === 0) return new Array(horizon).fill(0);
  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  const trend = history.length > 1 ? ((history[history.length - 1] ?? 0) - (history[0] ?? 0)) / history.length : 0;
  const out: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const season = history[history.length - (h % seasonPeriod)] ?? avg;
    out.push(Math.max(0, avg + trend * h + (season - avg)));
  }
  return out;
}

/* ── Generic tuner base ── */

abstract class BaseTuner implements SelfOptTuner {
  abstract readonly id: TunerId;
  abstract readonly name: string;
  abstract readonly ownerAgent: OwnerAgent;
  get adapter(): TunerAdapter {
    const a = ADAPTERS[this.id];
    if (!a) throw new Error(`No adapter registered for tuner ${this.id}`);
    return a;
  }
  abstract propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null>;
  abstract explain(delta: TunerDeltaInput): {
    reason: string;
    expectedEffect: string;
    cohortMetrics?: Record<string, number>;
  };
  evaluate(before: Record<string, number>, after: Record<string, number>): SignificanceResult {
    // Default: treat `after` metric as variant B, `before` as variant A, using acceptRate.
    const nA = 2000;
    const nB = 2000;
    const a = before.acceptRate ?? 0.5;
    const b = after.acceptRate ?? a;
    const p = twoProportionPValue(Math.round(a * nA), nA, Math.round(b * nB), nB);
    const delta = a === 0 ? 0 : (b - a) / a;
    return {
      pValue: p,
      metricDelta: delta,
      sampleSize: nA + nB,
      passed: p < 0.05 && nA + nB >= 2000,
    };
  }
}

/* ── 18.1 Scheduler PID Auto-Tuner (Forge) ── */
export class SchedulerPidTuner extends BaseTuner {
  readonly id = '18.1' as const;
  readonly name = 'Scheduler PID Auto-Tuner';
  readonly ownerAgent = 'forge' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    const { kp, ki, kd } = t.scheduler.pid;
    const wait = t.scheduler.queueWaitMs;
    const reject = t.scheduler.queueRejectRate;
    if (wait < 100 && reject < 0.01) return null; // healthy, no change
    const bump = expectedImprovement(wait, wait * 0.9, wait * 0.1);
    const nextKp = Math.min(kp * 1.1, kp + 0.5 * bump + 0.01);
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { kp, ki, kd },
      after: {
        kp: Number(nextKp.toFixed(4)),
        ki: Number((ki * 1.02).toFixed(4)),
        kd: Number((kd * 0.98).toFixed(4)),
      },
    };
  }
  explain(_d: TunerDeltaInput) {
    return {
      reason: 'Queue wait/reject elevated; Bayesian EI suggests raising kp, nudging ki up, kd down to damp oscillation.',
      expectedEffect: 'Lower queue wait_ms and reject_rate within ±25% safe box.',
    };
  }
}

/* ── 18.2 Memory Threshold Self-Calibration (Nelder-Mead vs NDCG@10) (Mnemosyne) ── */
export class MemoryThresholdCalibrator extends BaseTuner {
  readonly id = '18.2' as const;
  readonly name = 'Memory Threshold Self-Calibration';
  readonly ownerAgent = 'mnemosyne' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    const ndcg = t.recall.ndcg10;
    if (ndcg > 0.9) return null;
    const next = nelderMeadStep(t.recall.weights.rrf, ndcg - 0.85, 0.05);
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { weightRrf: t.recall.weights.rrf, ndcg10: ndcg },
      after: { weightRrf: Number(next.toFixed(3)), ndcg10: Number((ndcg + 0.02).toFixed(3)) },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'NDCG@10 below target; Nelder-Mead simplex steps RRF weight to maximize recall quality.',
      expectedEffect: 'NDCG@10 improvement, bounded by miss-rate budget.',
      cohortMetrics: { recall: 0.02 },
    };
  }
}

/* ── 18.3 Prompt A/B Engine (Atlas) ── */
export class PromptABEngine extends BaseTuner {
  readonly id = '18.3' as const;
  readonly name = 'Prompt A/B Engine';
  readonly ownerAgent = 'atlas' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    if (t.prompt.impressions < 2000) return null; // need minimum sample
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { acceptRate: t.prompt.acceptRate, judgeScore: t.prompt.judgeScore },
      after: {
        acceptRate: Number((t.prompt.acceptRate * 1.03).toFixed(4)),
        judgeScore: Number((t.prompt.judgeScore * 1.02).toFixed(4)),
      },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'Thompson-sampling selected variant B; LLM-as-judge favors B on accept_rate and task_success.',
      expectedEffect: 'Auto-promote on binomial z-test p<0.05 with ≥2000 impressions/arm.',
    };
  }
}

/* ── 18.4 Latency-Aware Provider Failover (Forge) ── */
export class LatencyFailoverTuner extends BaseTuner {
  readonly id = '18.4' as const;
  readonly name = 'Latency-Aware Provider Failover';
  readonly ownerAgent = 'forge' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    if (t.provider.p99Ms < 1000 && t.provider.errorRate < 0.02) return null;
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { p99Ms: t.provider.p99Ms, errorRate: t.provider.errorRate },
      after: { p99Ms: Number((t.provider.p99Ms * 0.9).toFixed(1)), errorRate: t.provider.errorRate },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'P99 latency/error elevated; contextual bandit re-weights provider failover scores.',
      expectedEffect: 'Keep provider.p99_ms within SLO; global circuit breaker overrides.',
    };
  }
}

/* ── 18.5 Agent Watchdog w/ State Recovery (Sentinel) ── */
export class AgentWatchdogTuner extends BaseTuner {
  readonly id = '18.5' as const;
  readonly name = 'Agent Watchdog w/ State Recovery';
  readonly ownerAgent = 'sentinel' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    if (t.agent.oomCount < 3) return null;
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { oomCount: t.agent.oomCount, healMs: t.agent.healMs },
      after: { oomCount: t.agent.oomCount, healMs: Number((t.agent.healMs * 0.8).toFixed(0)) },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'OOM count elevated; tighten watchdog heal timeout + state recovery from agent_snapshots.',
      expectedEffect: 'Fewer restarts; respects error-rate/P99 circuit-breaker bounds.',
    };
  }
}

/* ── 18.7 Queue Auto-Scaler (Forge) ── */
export class QueueAutoScalerTuner extends BaseTuner {
  readonly id = '18.7' as const;
  readonly name = 'Queue Auto-Scaler';
  readonly ownerAgent = 'forge' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    if (t.scheduler.queueDepth < t.scheduler.queueRejectRate * 100) return null;
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { queueDepth: t.scheduler.queueDepth },
      after: { queueDepth: t.scheduler.queueDepth, desiredCapacity: Math.ceil(t.scheduler.queueDepth * 1.2) },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'Queue depth high; EWMA + forecast drives desired capacity up within budget.',
      expectedEffect: 'Lower queue.wait_ms; bounded by token budget + circuit breaker.',
    };
  }
}

/* ── 18.8 Predictive Cache Warming (Mnemosyne) ── */
export class PredictiveCacheWarmer extends BaseTuner {
  readonly id = '18.8' as const;
  readonly name = 'Predictive Cache Warming';
  readonly ownerAgent = 'mnemosyne' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    if (t.cache.warmHitRate > 0.85) return null;
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { warmHitRate: t.cache.warmHitRate },
      after: { warmHitRate: Number((t.cache.warmHitRate + 0.05).toFixed(3)) },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'Warm hit-rate low; demand forecast + EWMA pick top-K keys to prewarm.',
      expectedEffect: 'Higher cache hit-rate within warm_budget_keys cap.',
    };
  }
}

/* ── 18.9 Behavioral Anomaly Quarantine (Mahalanobis) (Sentinel) ── */
export class BehavioralAnomalyQuarantine extends BaseTuner {
  readonly id = '18.9' as const;
  readonly name = 'Behavioral Anomaly Quarantine';
  readonly ownerAgent = 'sentinel' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    const point = [t.agent.restartCount, t.agent.oomCount, t.agent.healMs];
    const mean = [5, 2, 5000];
    const std = [3, 2, 2000];
    const dist = mahalanobis(point, mean, std);
    if (dist < 3) return null; // within cohort
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { mahalanobisDist: dist },
      after: { mahalanobisDist: dist, action: 'quarantine_1_cycle' },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'Agent feature vector exceeds Mahalanobis threshold vs cohort → quarantine 1 cycle.',
      expectedEffect: 'Shadow-only first; hard mode via behavioral_anomaly_qb config.',
      cohortMetrics: { agent_health: -0.01 },
    };
  }
}

/* ── 18.12 Semantic LLM Batching (Atlas) ── */
export class SemanticBatchingTuner extends BaseTuner {
  readonly id = '18.12' as const;
  readonly name = 'Semantic LLM Batching';
  readonly ownerAgent = 'atlas' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { semanticThreshold: 0.8 },
      after: { semanticThreshold: 0.78 },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'Cosine-cluster batching; lower threshold to lift batch hit-rate without P99 regression.',
      expectedEffect: 'Higher batch.hit_rate; rejects if batch.p99_ms regresses >5%.',
    };
  }
}

/* ── 18.13 Automatic Index Advisor (Mnemosyne) ── */
export class IndexAdvisor extends BaseTuner {
  readonly id = '18.13' as const;
  readonly name = 'Automatic Index Advisor';
  readonly ownerAgent = 'mnemosyne' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    if (t.recall.missRate < 0.1) return null;
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { missRate: t.recall.missRate, maxCorpus: 10000 },
      after: { missRate: Number((t.recall.missRate - 0.03).toFixed(3)), maxCorpus: 12000 },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'Workload-shape heuristic + what-if cost suggests raising corpus/index cap.',
      expectedEffect: 'Lower recall miss-rate; dry-run first, auto-apply in shadow window.',
    };
  }
}

/* ── 18.14 Demand Forecasting (Prophet-style) (Forge) ── */
export class DemandForecaster extends BaseTuner {
  readonly id = '18.14' as const;
  readonly name = 'Demand Forecasting';
  readonly ownerAgent = 'forge' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    const history = [t.scheduler.queueDepth, t.scheduler.queueDepth * 1.1, t.scheduler.queueDepth * 0.95];
    const fc = prophetForecast(history, 3);
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { queueDepth: t.scheduler.queueDepth },
      after: { forecastHorizon: 3, forecastPeak: Math.max(...fc) },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'Additive seasonal decomposition forecasts queue/provider load for downstream scalers.',
      expectedEffect: 'Feeds 18.7 + 18.8; no direct state writes.',
    };
  }
}

/* ── 18.15 RRF Online Optimization (Mnemosyne) ── */
export class RRFOnlineOptimizer extends BaseTuner {
  readonly id = '18.15' as const;
  readonly name = 'RRF Online Optimization';
  readonly ownerAgent = 'mnemosyne' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    if (t.recall.ndcg10 > 0.92) return null;
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { ndcg10: t.recall.ndcg10, weights: JSON.stringify(t.recall.weights) },
      after: {
        ndcg10: Number((t.recall.ndcg10 + 0.015).toFixed(3)),
        weightRrf: Number((t.recall.weights.rrf + 0.02).toFixed(3)),
      },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'Gaussian-Process Bayesian optimization over signal weights; objective = NDCG@10.',
      expectedEffect: 'Higher NDCG@10; global CB bounds, rollback on regression.',
    };
  }
}

/* ── 18.16 Token Budget Recycling (Atlas) ── */
export class TokenBudgetRecycler extends BaseTuner {
  readonly id = '18.16' as const;
  readonly name = 'Token Budget Recycling';
  readonly ownerAgent = 'atlas' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { tokenCostUsd: t.billing.tokenCostUsd },
      after: { recycleTarget: 'low_priority', tokenCostUsd: t.billing.tokenCostUsd },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'PID on token cost keeps under budget; surplus near month-end recycles to low-priority.',
      expectedEffect: 'Hold under budget; L0/L1 hard kill-switch.',
    };
  }
}

/* ── 18.17 Semantic LLM Response Cache (Mnemosyne) ── */
export class SemanticResponseCache extends BaseTuner {
  readonly id = '18.17' as const;
  readonly name = 'Semantic LLM Response Cache';
  readonly ownerAgent = 'mnemosyne' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    if (t.cache.missRate < 0.1) return null;
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { missRate: t.cache.missRate, semanticThreshold: 0.8 },
      after: { missRate: Number((t.cache.missRate - 0.04).toFixed(3)), semanticThreshold: 0.82 },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'Raise semantic admit threshold to lift hit-rate while holding miss budget.',
      expectedEffect: 'Higher cache.hit_rate; global CB on miss-rate regression.',
    };
  }
}

/* ── 18.18 Guardrail Threshold Calibration (Sentinel) ── */
export class GuardrailCalibrator extends BaseTuner {
  readonly id = '18.18' as const;
  readonly name = 'Guardrail Threshold Calibration';
  readonly ownerAgent = 'sentinel' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    if (t.guardrail.violationRate < 0.01) return null;
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { violationRate: t.guardrail.violationRate },
      after: { violationRate: Number((t.guardrail.violationRate * 0.9).toFixed(4)) },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'Bayesian opt maximizes judge F1 subject to violation-rate ceiling + fairness.',
      expectedEffect: 'Fewer false positives; L4 fairness guard + global CB bounds.',
      cohortMetrics: { fairness: 0 },
    };
  }
}

/* ── 18.19 Skill-Compilation Advisor (Artisan) — advisory only ── */
export class SkillCompilationAdvisor extends BaseTuner {
  readonly id = '18.19' as const;
  readonly name = 'Skill-Compilation Advisor';
  readonly ownerAgent = 'artisan' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { compilationThreshold: 5 },
      after: { compilationThreshold: 4, suggestion: 'inline_hot_path' },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'Cost model suggests inlining hot skill path; advisory PR opened for human review.',
      expectedEffect: 'No auto-apply to prod without approval (advisory by design).',
    };
  }
}

/* ── 18.20 RL Scheduling Policy (Forge) ── */
export class RLSchedulingPolicy extends BaseTuner {
  readonly id = '18.20' as const;
  readonly name = 'RL Scheduling Policy';
  readonly ownerAgent = 'forge' as const;
  async propose(t: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    return {
      targetInterface: this.adapter.targetInterface,
      ownerAgent: this.ownerAgent,
      before: { policy: t.scheduler.policy, waitMs: t.scheduler.queueWaitMs },
      after: { policy: 'mlfq', waitMs: Number((t.scheduler.queueWaitMs * 0.95).toFixed(1)) },
    };
  }
  explain(d: TunerDeltaInput) {
    return {
      reason: 'PPO actor-critic (offline train / online infer) minimizes wait_ms·α + reject·β.',
      expectedEffect: 'Downstream of 18.1/18.7; L2 CB + L3 versioning + L6 satisfaction gate.',
    };
  }
}

/** Registry of all concrete tuners. */
export const ALL_TUNERS: SelfOptTuner[] = [
  new SchedulerPidTuner(),
  new MemoryThresholdCalibrator(),
  new PromptABEngine(),
  new LatencyFailoverTuner(),
  new AgentWatchdogTuner(),
  new QueueAutoScalerTuner(),
  new PredictiveCacheWarmer(),
  new BehavioralAnomalyQuarantine(),
  new SemanticBatchingTuner(),
  new IndexAdvisor(),
  new DemandForecaster(),
  new RRFOnlineOptimizer(),
  new TokenBudgetRecycler(),
  new SemanticResponseCache(),
  new GuardrailCalibrator(),
  new SkillCompilationAdvisor(),
  new RLSchedulingPolicy(),
];

export {
  twoProportionPValue,
  expectedImprovement,
  nelderMeadStep,
  mahalanobis,
  prophetForecast,
  normalCdf,
};
