import type { TunerValue, OwnerAgent } from './types.js';
import { metricStore } from './telemetry.js';

// Acklam's inverse normal CDF approximation
function inverseNormalCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a0 = -3.969683028665376e1;
  const a1 = 2.209460984245205e2;
  const a2 = -2.759285104469687e2;
  const a3 = 1.38357751867269e2;
  const a4 = -3.066479806614716e1;
  const a5 = 2.506628277459239;
  const b0 = -5.447609879822406e1;
  const b1 = 1.615858368580409e2;
  const b2 = -1.556989798598866e2;
  const b3 = 6.680131188771972e1;
  const b4 = -1.328068155288572e1;
  const c0 = -7.784894002430293e-3;
  const c1 = -3.223964580411365e-1;
  const c2 = -2.400758277161838;
  const c3 = -2.549732539343734;
  const c4 = 4.374664141464968;
  const c5 = 2.938163982698783;
  const d0 = 7.784695709041462e-3;
  const d1 = 3.224671290700398e-1;
  const d2 = 2.445134137142996;
  const d3 = 3.754408661907416;
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    const num = ((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5;
    const den = (((d0 * q + d1) * q + d2) * q + d3) * q + 1;
    return num / den;
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    const num = ((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5;
    const den = (((d0 * q + d1) * q + d2) * q + d3) * q + 1;
    return -(num / den);
  }
  const q = p - 0.5;
  const r = q * q;
  const num = (((((a0 * r + a1) * r + a2) * r + a3) * r + a4) * r + a5) * q;
  const den = ((((b0 * r + b1) * r + b2) * r + b3) * r + b4) * r + 1;
  return num / den;
}

export interface PowerResult {
  nPerArm: number;
  alpha: number;
  power: number;
}

export function powerCalculator(effectSize = 0.3, power = 0.8, alpha = 0.05): PowerResult {
  const za = inverseNormalCdf(1 - alpha / 2);
  const zb = inverseNormalCdf(power);
  const sd = 1;
  const num = (za + zb) * sd;
  const nPerArm = Math.ceil((2 * num * num) / (effectSize * effectSize) || 1);
  return { nPerArm: Math.max(1, nPerArm), alpha, power };
}

export function fairnessCheck(
  _controller: unknown,
  metrics: Record<string, number>
): { ok: boolean; violating: string[] } {
  const violating: string[] = [];
  for (const [k, v] of Object.entries(metrics)) {
    if (v < 0) violating.push(k);
  }
  return { ok: violating.length === 0, violating };
}

export function generateHypothesis(snapshot: Record<string, number>): string {
  const thresholds: Record<string, number> = { latency: 0.5, error_rate: 0.1, cost: 0.05 };
  let worst: string | null = null;
  let worstVal = -Infinity;
  for (const [k, v] of Object.entries(snapshot)) {
    if (v > (thresholds[k] ?? 0.1) && v > worstVal) {
      worst = k;
      worstVal = v;
    }
  }
  if (!worst) return 'No degradation detected';
  return `tune ${worst} (current=${worstVal})`;
}

export interface ExplorationStatus {
  globalCap: number;
  globalUsed: number;
}

export function explorationBudgetStatus(_controller: unknown): ExplorationStatus {
  const globalCap = 100;
  const globalUsed = 0;
  return { globalCap, globalUsed };
}

export function costKillSwitch(_controller: unknown, x: number): boolean {
  const threshold = 0.01;
  return x > threshold;
}

export interface MetaOptimizeResult {
  converged: boolean;
  iterations: number;
  best: Record<string, number>;
  score: number;
}

/**
 * ML-003 meta-loop coordinate-ascent optimizer over a target objective.
 *
 * Objective: f(w) = -Σ_k (w[k] - target[k])²  (maximized when w == target).
 * Coordinate ascent moves each weight independently by ±lr until the per-axis
 * step no longer improves the objective, then re-checks convergence against the
 * configured tolerance. Deterministic and allocation-light (one candidate copy
 * per axis probe), so it is safe to call every control cycle.
 */
export function metaOptimize(
  _controller: unknown,
  _opts: Record<string, unknown> = {}
): MetaOptimizeResult {
  const target = (_opts.target as Record<string, number>) ?? {
    recall: 0.9,
    satisfaction: 0.8,
    perf: 0.7,
  };
  const maxIter = typeof _opts.iterations === 'number' ? (_opts.iterations as number) : 50;
  const lr = typeof _opts.lr === 'number' ? (_opts.lr as number) : 0.2;
  const tol = typeof _opts.tol === 'number' ? (_opts.tol as number) : 1e-6;

  const keys = Object.keys(target);
  const w: Record<string, number> = {};
  for (const k of keys) w[k] = 0;

  const objective = (cand: Record<string, number>): number => {
    let s = 0;
    for (const k of keys) {
      const d = (cand[k] ?? 0) - (target[k] ?? 0);
      s -= d * d;
    }
    return s;
  };

  let best = objective(w);
  let iters = 0;
  let converged = false;

  for (let it = 0; it < maxIter; it++) {
    iters = it + 1;
    let improved = false;
    for (const k of keys) {
      const cur = objective(w);
      const up: Record<string, number> = { ...w, [k]: (w[k] ?? 0) + lr };
      const down: Record<string, number> = { ...w, [k]: (w[k] ?? 0) - lr };
      const oUp = objective(up);
      const oDown = objective(down);
      if (oUp > cur + tol) {
        w[k] = up[k];
        best = oUp;
        improved = true;
      } else if (oDown > cur + tol) {
        w[k] = down[k];
        best = oDown;
        improved = true;
      }
    }
    if (!improved) {
      converged = best > -1e-4;
      break;
    }
    // Global convergence check: total squared error below tolerance.
    const err = -best;
    if (err < 1e-3) {
      converged = true;
      break;
    }
  }

  const finalBest: Record<string, number> = {};
  for (const k of keys) finalBest[k] = w[k] ?? 0;
  return { converged, iterations: iters, best: finalBest, score: best };
}

export function simulateCycle(
  candidate: SimulateCandidate,
  guard: SimulateGuard
): { willTrip: boolean; reason: string; estimatedEffect: Record<string, TunerValue> } {
  const verdict = guard.evaluate(candidate);
  return {
    willTrip: !verdict.allowed,
    reason: verdict.reason ?? '',
    estimatedEffect: candidate.after,
  };
}

const satisfactionLog = new Map<string, number[]>();

export function recordSatisfaction(
  tunerId: string,
  score: number
): { ok: boolean; tunerId: string; score: number } {
  const arr = satisfactionLog.get(tunerId) ?? [];
  arr.push(score);
  satisfactionLog.set(tunerId, arr);
  return { ok: true, tunerId, score };
}

export interface SimulateCandidate {
  id: string;
  name: string;
  before: Record<string, TunerValue>;
  after: Record<string, TunerValue>;
  expectedEffect: string;
  ownerAgent: OwnerAgent;
  targetInterface: string;
}

export interface SimulateGuard {
  evaluate(candidate: unknown): { allowed: boolean; reason?: string };
}

export interface Verdict {
  tunerId: string;
  verdict: 'accept' | 'reject';
  reason: string;
}

export function selfHealFromVerdict(v: Verdict): {
  action: 'rollback' | 'noop';
  ok: boolean;
  tunerId: string;
} {
  const action: 'rollback' | 'noop' = v.verdict === 'reject' ? 'rollback' : 'noop';
  return { action, ok: true, tunerId: v.tunerId };
}

// ── Extended meta-loop knowledge functions (ML-003) ──
export interface Experiment {
  id: string;
  hypothesis: string;
  createdAt: number;
  status: 'open' | 'closed';
}

const experiments = new Map<string, Experiment>();
const knowledge: Array<{
  id: string;
  tunerId: string;
  payload: Record<string, TunerValue>;
  score: number;
}> = [];

export function createExperiment(hypothesis: string): Experiment {
  const id = `exp_${Date.now()}_${experiments.size}`;
  const exp: Experiment = { id, hypothesis, createdAt: Date.now(), status: 'open' };
  experiments.set(id, exp);
  return exp;
}

export function finishExperiment(id: string): Experiment | null {
  const exp = experiments.get(id);
  if (!exp) return null;
  exp.status = 'closed';
  experiments.set(id, exp);
  return exp;
}

export function publishKnowledge(
  tunerId: string,
  payload: Record<string, TunerValue>,
  score: number
): string {
  const id = `kb_${Date.now()}_${knowledge.length}`;
  knowledge.push({ id, tunerId, payload, score });
  metricStore.set(`knowledge_${tunerId}_score`, score);
  return id;
}

export function bestKnowledge(tunerId: string): Record<string, TunerValue> | null {
  const items = knowledge.filter((k) => k.tunerId === tunerId);
  if (items.length === 0) return null;
  items.sort((a, b) => b.score - a.score);
  const top = items[0];
  return top ? top.payload : null;
}

export function explainabilityReport(tunerId: string): {
  tunerId: string;
  samples: number;
  meanScore: number;
} {
  const items = knowledge.filter((k) => k.tunerId === tunerId);
  const meanScore = items.length ? items.reduce((s, k) => s + k.score, 0) / items.length : 0;
  return { tunerId, samples: items.length, meanScore };
}
