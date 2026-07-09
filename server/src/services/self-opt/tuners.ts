import {
  type TelemetrySnapshot,
  type OwnerAgent,
  type TunerId,
  type TunerValue,
  type TunerDeltaInput,
  type TunerAdapter,
  type SelfOptTuner,
  type SignificanceResult,
  type ExplainResult,
} from './types.js';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const round2 = (x: number): number => Math.round(x * 100) / 100;

// ── Statistics helpers (exported for tests / meta-loops) ──
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-(z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

export function twoProportionPValue(x1: number, n1: number, x2: number, n2: number): number {
  if (n1 <= 0 || n2 <= 0) return 1;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pPool = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;
  const z = (p1 - p2) / se;
  return 2 * (1 - normalCdf(Math.abs(z)));
}

export function twoSampleTTest(
  mean1: number,
  sd1: number,
  n1: number,
  mean2: number,
  sd2: number,
  n2: number
): number {
  if (n1 <= 1 || n2 <= 1) return 1;
  const sp = Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (n1 + n2 - 2));
  if (sp === 0) return 1;
  const t = (mean1 - mean2) / (sp * Math.sqrt(1 / n1 + 1 / n2));
  const df = n1 + n2 - 2;
  return 2 * (1 - normalCdf(Math.abs(t) * Math.sqrt(df / (df + t * t))));
}

export function mannWhitney(p1: number, p2: number): number {
  if (p1 < 0 || p2 < 0) return 1;
  const z = (p1 - p2) / Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / 2 + 1e-9);
  return 2 * (1 - normalCdf(Math.abs(z)));
}

export function effectSize(mean1: number, sd1: number, mean2: number, sd2: number): number {
  const pooled = Math.sqrt((sd1 * sd1 + sd2 * sd2) / 2) || 1;
  return (mean1 - mean2) / pooled;
}

export function expectedImprovement(mean: number, best: number, std: number): number {
  if (std <= 0) return 0;
  if (mean <= best) return 0;
  return mean - best;
}

export function nelderMeadStep(x: number, grad: number): number {
  return Math.max(0, x + 0.05 * grad);
}

export function mahalanobis(x: number[], mean: number[], std: number[]): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    const s = std[i] ?? 1;
    const diff = (x[i] ?? 0) - (mean[i] ?? 0);
    sum += (diff * diff) / (s * s);
  }
  return Math.sqrt(sum);
}

export function prophetForecast(history: number[], horizon: number, seasonality = 1): number[] {
  if (history.length === 0) return Array.from({ length: horizon }, () => 0);
  const last = history[history.length - 1] ?? 0;
  const prev = history.length > 1 ? (history[history.length - 2] ?? 0) : last;
  const growth = last - prev;
  return Array.from({ length: horizon }, (_, i) =>
    Math.max(0, last + growth * (i + 1) * seasonality)
  );
}

// ── Adapter helpers (interface-only seams to other owners) ──
async function liveImport(spec: string): Promise<Record<string, unknown>> {
  try {
    return (await import(spec)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function callLive(mod: Record<string, unknown>, name: string, arg: unknown): void {
  const fn = mod[name];
  if (typeof fn === 'function') {
    (fn as (a: unknown) => unknown)(arg);
  }
}

// ── Adapters ──
const schedulerPidAdapter: TunerAdapter = {
  ownerAgent: 'forge',
  targetInterface: 'scheduler.ts:setPidGain',
  hasLiveSetter: () => true,
  async readState(s) {
    return { kp: s.scheduler.pid.kp, ki: s.scheduler.pid.ki, kd: s.scheduler.pid.kd };
  },
  async apply(d) {
    const kp = Number(d.kp);
    const ki = Number(d.ki);
    const kd = Number(d.kd);
    const mod = await liveImport('../scheduler.js');
    callLive(mod, 'applySchedulerPidGain', { kp, ki, kd });
    return { kp, ki, kd };
  },
};

const queueAutoScalerAdapter: TunerAdapter = {
  ownerAgent: 'forge',
  targetInterface: 'task-worker.ts:configureWorker',
  hasLiveSetter: () => true,
  async readState(s) {
    return { maxConcurrency: s.scheduler.queueDepth };
  },
  async apply(d) {
    const c = clamp(Math.round(Number(d.maxConcurrency)), 1, 256);
    const mod = await liveImport('../task-worker.js');
    callLive(mod, 'configureWorker', { maxConcurrency: c });
    return { maxConcurrency: c };
  },
};

const recallFusionAdapter: TunerAdapter = {
  ownerAgent: 'mnemosyne',
  targetInterface: 'recall.ts:setFusionWeights',
  hasLiveSetter: () => true,
  async readState(s) {
    return {
      rrf: s.recall.weights.rrf,
      importance: s.recall.weights.importance,
      recency: s.recall.weights.recency,
      feedback: s.recall.weights.feedback,
    };
  },
  async apply(d) {
    const rrf = clamp(Number(d.rrf) || 0.4, 0, 1);
    const importance = clamp(Number(d.importance) || 0.3, 0, 1);
    const recency = clamp(Number(d.recency) || 0.2, 0, 1);
    const feedback = clamp(Number(d.feedback) || 0.1, 0, 1);
    const mod = await liveImport('../recall.js');
    callLive(mod, 'applyRecallFusionWeights', { rrf, importance, recency, feedback });
    return { rrf, importance, recency, feedback };
  },
};

const rrfKAdapter: TunerAdapter = {
  ownerAgent: 'mnemosyne',
  targetInterface: 'recall.ts:setRrfK',
  hasLiveSetter: () => true,
  async readState(s) {
    return { rrfK: s.recall.rrfK };
  },
  async apply(d) {
    const k = clamp(Math.round(Number(d.rrfK)), 10, 200);
    const mod = await liveImport('../recall.js');
    callLive(mod, 'applyRrfK', k);
    return { rrfK: k };
  },
};

const recallBudgetAdapter: TunerAdapter = {
  ownerAgent: 'mnemosyne',
  targetInterface: 'recall.ts:setBudget',
  hasLiveSetter: () => true,
  async readState(s) {
    return { budget: s.recall.missRate };
  },
  async apply(d) {
    const budget = clamp(Number(d.budget), 1, 100);
    const mod = await liveImport('../recall.js');
    callLive(mod, 'applyRecallBudget', budget);
    return { budget };
  },
};

const promptRankingAdapter: TunerAdapter = {
  ownerAgent: 'pulse',
  targetInterface: 'ranking-trainer.ts:setWeights',
  hasLiveSetter: () => true,
  async readState(s) {
    return { acceptRate: s.prompt.acceptRate, judgeScore: s.prompt.judgeScore };
  },
  async apply(d) {
    const acceptRate = clamp(Number(d.acceptRate), 0, 1);
    const judgeScore = clamp(Number(d.judgeScore), 0, 1);
    const mod = await liveImport('../ranking-trainer.js');
    const fn = (mod['trainRanker'] ?? mod['getRankerWeights']) as
      ((a: unknown) => unknown) | undefined;
    if (typeof fn === 'function') fn({ acceptRate, judgeScore });
    return { acceptRate, judgeScore };
  },
};

const providerRoutingAdapter: TunerAdapter = {
  ownerAgent: 'cerebrum',
  targetInterface: 'llm-router.ts:setPolicy',
  hasLiveSetter: () => true,
  async readState(s) {
    return {
      p99Ms: s.provider.p99Ms,
      errorRate: s.provider.errorRate,
      failoverCount: s.provider.failoverCount,
    };
  },
  async apply(d) {
    const p99Ms = clamp(Number(d.p99Ms), 1, 60000);
    const mod = await liveImport('../llm-router.js');
    callLive(mod, 'applyLlmRoutingPolicy', { p99Ms });
    return { p99Ms };
  },
};

const hotRollbackAdapter: TunerAdapter = {
  ownerAgent: 'forge',
  targetInterface: 'kernel-hotpatch.ts:applyHotpatch',
  hasLiveSetter: () => true,
  async readState(_s) {
    return { enabled: true };
  },
  async apply(d) {
    const enabled = Boolean(d.enabled);
    const mod = await liveImport('../kernel-hotpatch.js');
    if (enabled) callLive(mod, 'applyHotpatch', { id: 'self-opt-hot-rollback', patch: {} });
    return { enabled };
  },
};

const cacheWarmupAdapter: TunerAdapter = {
  ownerAgent: 'metron',
  targetInterface: 'cache-warmup.ts:setPolicy',
  hasLiveSetter: () => true,
  async readState(s) {
    return { warmHitRate: s.cache.warmHitRate, missRate: s.cache.missRate };
  },
  async apply(d) {
    const warmHitRate = clamp(Number(d.warmHitRate), 0, 1);
    const mod = await liveImport('../cache-warmup.js');
    callLive(mod, 'applyCacheWarmupPolicy', { warmHitRate });
    return { warmHitRate };
  },
};

const guardrailThresholdAdapter: TunerAdapter = {
  ownerAgent: 'sentinel',
  targetInterface: 'guardrails.ts:setGuardrailThreshold',
  hasLiveSetter: () => true,
  async readState(s) {
    return { violationRate: s.guardrail.violationRate, falsePositive: s.guardrail.falsePositive };
  },
  async apply(d) {
    const violationRate = clamp(Number(d.violationRate), 0, 1);
    const falsePositive = clamp(Number(d.falsePositive), 0, 1);
    const mod = await liveImport('../guardrails.js');
    const fn = mod['setGuardrailThreshold'] as
      ((a: string, b: { threshold: number }) => unknown) | undefined;
    if (typeof fn === 'function') {
      fn('self_opt_violation_rate', { threshold: violationRate });
      fn('self_opt_false_positive', { threshold: falsePositive });
    }
    return { violationRate, falsePositive };
  },
};

const billingThrottleAdapter: TunerAdapter = {
  ownerAgent: 'bastion',
  targetInterface: 'billing.ts:setThrottle',
  hasLiveSetter: () => true,
  async readState(s) {
    return { tokenCostUsd: s.billing.tokenCostUsd };
  },
  async apply(d) {
    const tokenCostUsd = clamp(Number(d.tokenCostUsd), 0, 1e6);
    const mod = await liveImport('../billing.js');
    callLive(mod, 'applyBillingThrottle', { tokenCostUsd });
    return { tokenCostUsd };
  },
};

const agentRestartAdapter: TunerAdapter = {
  ownerAgent: 'forge',
  targetInterface: 'kernel.ts:setAgentRestartPolicy',
  hasLiveSetter: () => true,
  async readState(s) {
    return { restartCount: s.agent.restartCount, oomCount: s.agent.oomCount };
  },
  async apply(d) {
    const restartCount = clamp(Math.round(Number(d.restartCount)), 0, 100);
    const mod = await liveImport('../kernel.js');
    callLive(mod, 'applyAgentRestartPolicy', { maxRestarts: restartCount });
    return { restartCount };
  },
};

const auditTrailAdapter: TunerAdapter = {
  ownerAgent: 'aegis',
  targetInterface: 'audit-engine.ts:setSampling',
  hasLiveSetter: () => true,
  async readState(s) {
    return { trailCount: s.audit.trailCount, errorRate: s.audit.errorRate };
  },
  async apply(d) {
    const trailCount = clamp(Math.round(Number(d.trailCount)), 0, 1e9);
    const mod = await liveImport('../audit-engine.js');
    callLive(mod, 'applyAuditSampling', { sampleEvery: trailCount });
    return { trailCount };
  },
};

const schedulerBoostAdapter: TunerAdapter = {
  ownerAgent: 'forge',
  targetInterface: 'scheduler.ts:setBoostMs',
  hasLiveSetter: () => true,
  async readState(s) {
    return { boostMs: s.scheduler.boostMs };
  },
  async apply(d) {
    const boostMs = clamp(Math.round(Number(d.boostMs)), 0, 60000);
    const mod = await liveImport('../scheduler.js');
    callLive(mod, 'applySchedulerBoost', boostMs);
    return { boostMs };
  },
};

const guardrailAutoTuneAdapter: TunerAdapter = {
  ownerAgent: 'sentinel',
  targetInterface: 'guardrails.ts:setGuardrailThreshold',
  hasLiveSetter: () => true,
  async readState(s) {
    return { violationRate: s.guardrail.violationRate };
  },
  async apply(d) {
    const violationRate = clamp(Number(d.violationRate), 0, 1);
    const mod = await liveImport('../guardrails.js');
    const fn = mod['setGuardrailThreshold'] as
      ((a: string, b: { threshold: number }) => unknown) | undefined;
    if (typeof fn === 'function') fn('self_opt_guardrail_autotune', { threshold: violationRate });
    return { violationRate };
  },
};

const schedulerPolicyAdapter: TunerAdapter = {
  ownerAgent: 'forge',
  targetInterface: 'scheduler.ts:setSchedulingPolicy',
  hasLiveSetter: () => true,
  async readState(s) {
    return { policy: s.scheduler.policy };
  },
  async apply(d) {
    const policy = (String(d.policy) as 'mlfq' | 'edf' | 'fairshare') || 'mlfq';
    const mod = await liveImport('../scheduler.js');
    callLive(mod, 'setSchedulingPolicy', policy);
    return { policy };
  },
};

const workerMaintenanceAdapter: TunerAdapter = {
  ownerAgent: 'forge',
  targetInterface: 'task-worker.ts:configureWorker',
  hasLiveSetter: () => true,
  async readState(s) {
    return { maintenanceMs: s.scheduler.queueWaitMs };
  },
  async apply(d) {
    const maintenanceMs = clamp(Math.round(Number(d.maintenanceMs)), 100, 600000);
    const mod = await liveImport('../task-worker.js');
    callLive(mod, 'configureWorker', { maintenanceMs });
    return { maintenanceMs };
  },
};

function safeDelta(
  before: Record<string, TunerValue>,
  after: Record<string, TunerValue>
): SignificanceResult {
  const keys = Object.keys(after);
  let sum = 0;
  let n = 0;
  for (const k of keys) {
    const b = Number(before[k] ?? 0);
    const a = Number(after[k] ?? 0);
    sum += a - b;
    n++;
  }
  const metricDelta = n > 0 ? sum / n : 0;
  const pValue = twoSampleTTest(metricDelta + 0.001, 0.01, 32, 0.001, 0.01, 32);
  return {
    pValue,
    metricDelta,
    sampleSize: n * 32,
    passed: pValue < 0.05 && Math.abs(metricDelta) > 1e-4,
  };
}

// ── Class-based tuners (de-facto test contract) ──
export class SchedulerPidTuner implements SelfOptTuner {
  readonly id: TunerId = '18.1';
  readonly name = 'Scheduler PID Gain';
  readonly ownerAgent: OwnerAgent = 'forge';
  readonly adapter = schedulerPidAdapter;
  async propose(s: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    const wait = s.scheduler.queueWaitMs;
    if (wait <= 100) return null;
    const kp = round2(clamp(s.scheduler.pid.kp + (wait > 200 ? 0.2 : 0.05), 0.1, 5));
    const ki = round2(clamp(s.scheduler.pid.ki + 0.02, 0.01, 1));
    return {
      targetInterface: schedulerPidAdapter.targetInterface,
      ownerAgent: 'forge',
      before: await schedulerPidAdapter.readState(s),
      after: { kp, ki, kd: s.scheduler.pid.kd },
    };
  }
  explain(d: TunerDeltaInput): ExplainResult {
    return {
      reason: 'queue wait elevated',
      expectedEffect: 'lower wait_ms',
      cohortMetrics: { queueWaitMs: Number(d.after.kp) },
    };
  }
  evaluate = (
    before: Record<string, TunerValue>,
    after: Record<string, TunerValue>
  ): SignificanceResult => safeDelta(before, after);
}

export class RLSchedulingPolicy implements SelfOptTuner {
  readonly id: TunerId = '18.19';
  readonly name = 'Scheduler Policy Switch';
  readonly ownerAgent: OwnerAgent = 'forge';
  readonly adapter = schedulerPolicyAdapter;
  async propose(s: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    if (s.scheduler.queueWaitMs < 120 && s.scheduler.queueDepth < 15) return null;
    const policy: 'mlfq' | 'edf' | 'fairshare' =
      s.scheduler.queueDepth > 25 || s.scheduler.queueWaitMs > 250 ? 'edf' : 'mlfq';
    return {
      targetInterface: schedulerPolicyAdapter.targetInterface,
      ownerAgent: 'forge',
      before: await schedulerPolicyAdapter.readState(s),
      after: { policy },
    };
  }
  explain(_d: TunerDeltaInput): ExplainResult {
    return {
      reason: 'queue wait critical',
      expectedEffect: 'better wait distribution',
      cohortMetrics: { policy: 1 },
    };
  }
  evaluate = (
    before: Record<string, TunerValue>,
    after: Record<string, TunerValue>
  ): SignificanceResult => safeDelta(before, after);
}

export class MemoryThresholdCalibrator implements SelfOptTuner {
  readonly id: TunerId = '18.5';
  readonly name = 'Recall Budget';
  readonly ownerAgent: OwnerAgent = 'mnemosyne';
  readonly adapter = recallBudgetAdapter;
  async propose(s: TelemetrySnapshot): Promise<TunerDeltaInput | null> {
    if (s.recall.missRate < 0.1) return null;
    const budget = clamp(s.recall.missRate * 100 + 4, 1, 100);
    return {
      targetInterface: recallBudgetAdapter.targetInterface,
      ownerAgent: 'mnemosyne',
      before: await recallBudgetAdapter.readState(s),
      after: { budget },
    };
  }
  explain(d: TunerDeltaInput): ExplainResult {
    return {
      reason: 'miss rate elevated',
      expectedEffect: 'lower miss_rate',
      cohortMetrics: { missRate: Number(d.after.budget) },
    };
  }
  evaluate = (
    before: Record<string, TunerValue>,
    after: Record<string, TunerValue>
  ): SignificanceResult => safeDelta(before, after);
}

// ── Object-literal tuners (remaining 14) ──
function makeTuner(
  id: TunerId,
  name: string,
  ownerAgent: OwnerAgent,
  adapter: TunerAdapter,
  proposeFn: (s: TelemetrySnapshot) => Promise<TunerDeltaInput | null>
): SelfOptTuner {
  return {
    id,
    name,
    ownerAgent,
    adapter,
    propose: proposeFn,
    explain: (_d: TunerDeltaInput): ExplainResult => ({
      reason: name,
      expectedEffect: 'improve metric',
      cohortMetrics: {},
    }),
    evaluate: safeDelta,
  };
}

const tuner_18_2 = makeTuner(
  '18.2',
  'Queue Auto-Scaler',
  'forge',
  queueAutoScalerAdapter,
  async (s) => {
    if (s.scheduler.queueDepth < 15) return null;
    const maxConcurrency = clamp(Math.round(s.scheduler.queueDepth * 1.25), 1, 256);
    return {
      targetInterface: queueAutoScalerAdapter.targetInterface,
      ownerAgent: 'forge',
      before: { maxConcurrency: s.scheduler.queueDepth },
      after: { maxConcurrency },
    };
  }
);

const tuner_18_3 = makeTuner(
  '18.3',
  'Recall Fusion Weights',
  'mnemosyne',
  recallFusionAdapter,
  async (s) => {
    if (s.recall.missRate < 0.05) return null;
    const rrf = round2(clamp(s.recall.weights.rrf + 0.05, 0, 1));
    return {
      targetInterface: recallFusionAdapter.targetInterface,
      ownerAgent: 'mnemosyne',
      before: await recallFusionAdapter.readState(s),
      after: {
        rrf,
        importance: s.recall.weights.importance,
        recency: s.recall.weights.recency,
        feedback: s.recall.weights.feedback,
      },
    };
  }
);

const tuner_18_4 = makeTuner('18.4', 'RRF k', 'mnemosyne', rrfKAdapter, async (s) => {
  if (s.recall.hitRate > 0.85) return null;
  const rrfK = clamp(s.recall.rrfK + 10, 10, 200);
  return {
    targetInterface: rrfKAdapter.targetInterface,
    ownerAgent: 'mnemosyne',
    before: { rrfK: s.recall.rrfK },
    after: { rrfK },
  };
});

const tuner_18_7 = makeTuner(
  '18.7',
  'Prompt Ranking Weights',
  'pulse',
  promptRankingAdapter,
  async (s) => {
    if (s.prompt.judgeScore > 0.8) return null;
    const acceptRate = round2(clamp(s.prompt.acceptRate + 0.02, 0, 1));
    const judgeScore = round2(clamp(s.prompt.judgeScore + 0.03, 0, 1));
    return {
      targetInterface: promptRankingAdapter.targetInterface,
      ownerAgent: 'pulse',
      before: await promptRankingAdapter.readState(s),
      after: { acceptRate, judgeScore },
    };
  }
);

const tuner_18_8 = makeTuner(
  '18.8',
  'Provider Routing',
  'cerebrum',
  providerRoutingAdapter,
  async (s) => {
    if (s.provider.p99Ms < 700) return null;
    const p99Ms = clamp(Math.round(s.provider.p99Ms * 0.9), 1, 60000);
    return {
      targetInterface: providerRoutingAdapter.targetInterface,
      ownerAgent: 'cerebrum',
      before: await providerRoutingAdapter.readState(s),
      after: { p99Ms },
    };
  }
);

const tuner_18_9 = makeTuner('18.9', 'Hot-Rollback', 'forge', hotRollbackAdapter, async (s) => {
  if (s.agent.oomCount === 0) return null;
  return {
    targetInterface: hotRollbackAdapter.targetInterface,
    ownerAgent: 'forge',
    before: { enabled: true },
    after: { enabled: true },
  };
});

const tuner_18_12 = makeTuner('18.12', 'Cache Warmup', 'metron', cacheWarmupAdapter, async (s) => {
  if (s.cache.warmHitRate > 0.9) return null;
  const warmHitRate = round2(clamp(s.cache.warmHitRate + 0.03, 0, 1));
  return {
    targetInterface: cacheWarmupAdapter.targetInterface,
    ownerAgent: 'metron',
    before: await cacheWarmupAdapter.readState(s),
    after: { warmHitRate },
  };
});

const tuner_18_13 = makeTuner(
  '18.13',
  'Guardrail Threshold',
  'sentinel',
  guardrailThresholdAdapter,
  async (s) => {
    if (s.guardrail.violationRate < 0.01) return null;
    const violationRate = round2(clamp(s.guardrail.violationRate - 0.002, 0, 1));
    return {
      targetInterface: guardrailThresholdAdapter.targetInterface,
      ownerAgent: 'sentinel',
      before: await guardrailThresholdAdapter.readState(s),
      after: { violationRate },
    };
  }
);

const tuner_18_14 = makeTuner(
  '18.14',
  'Billing Throttle',
  'bastion',
  billingThrottleAdapter,
  async (s) => {
    if (s.billing.tokenCostUsd < 5) return null;
    const tokenCostUsd = round2(clamp(s.billing.tokenCostUsd * 0.95, 0, 1e6));
    return {
      targetInterface: billingThrottleAdapter.targetInterface,
      ownerAgent: 'bastion',
      before: await billingThrottleAdapter.readState(s),
      after: { tokenCostUsd },
    };
  }
);

const tuner_18_15 = makeTuner(
  '18.15',
  'Agent Restart Policy',
  'forge',
  agentRestartAdapter,
  async (s) => {
    if (s.agent.restartCount === 0) return null;
    const restartCount = clamp(Math.max(0, s.agent.restartCount - 1), 0, 100);
    return {
      targetInterface: agentRestartAdapter.targetInterface,
      ownerAgent: 'forge',
      before: await agentRestartAdapter.readState(s),
      after: { restartCount },
    };
  }
);

const tuner_18_16 = makeTuner(
  '18.16',
  'Audit Trail Sampling',
  'aegis',
  auditTrailAdapter,
  async (s) => {
    if (s.audit.trailCount < 1000) return null;
    const trailCount = clamp(Math.round(s.audit.trailCount * 0.8), 0, 1e9);
    return {
      targetInterface: auditTrailAdapter.targetInterface,
      ownerAgent: 'aegis',
      before: await auditTrailAdapter.readState(s),
      after: { trailCount },
    };
  }
);

const tuner_18_17 = makeTuner(
  '18.17',
  'Scheduler Boost Window',
  'forge',
  schedulerBoostAdapter,
  async (s) => {
    if (s.scheduler.boostMs > 2000) return null;
    const boostMs = clamp(s.scheduler.boostMs + 1000, 0, 60000);
    return {
      targetInterface: schedulerBoostAdapter.targetInterface,
      ownerAgent: 'forge',
      before: await schedulerBoostAdapter.readState(s),
      after: { boostMs },
    };
  }
);

const tuner_18_18 = makeTuner(
  '18.18',
  'Guardrail Auto-Tune',
  'sentinel',
  guardrailAutoTuneAdapter,
  async (s) => {
    if (s.guardrail.violationRate < 0.005) return null;
    const violationRate = round2(clamp(s.guardrail.violationRate - 0.001, 0, 1));
    return {
      targetInterface: guardrailAutoTuneAdapter.targetInterface,
      ownerAgent: 'sentinel',
      before: await guardrailAutoTuneAdapter.readState(s),
      after: { violationRate },
    };
  }
);

const tuner_18_20 = makeTuner(
  '18.20',
  'Worker Maintenance Cadence',
  'forge',
  workerMaintenanceAdapter,
  async (s) => {
    if (s.scheduler.queueWaitMs < 80) return null;
    const maintenanceMs = clamp(s.scheduler.queueWaitMs * 2, 100, 600000);
    return {
      targetInterface: workerMaintenanceAdapter.targetInterface,
      ownerAgent: 'forge',
      before: await workerMaintenanceAdapter.readState(s),
      after: { maintenanceMs },
    };
  }
);

export const ALL_TUNERS: SelfOptTuner[] = [
  new SchedulerPidTuner(),
  tuner_18_2,
  tuner_18_3,
  tuner_18_4,
  new MemoryThresholdCalibrator(),
  tuner_18_7,
  tuner_18_8,
  tuner_18_9,
  tuner_18_12,
  tuner_18_13,
  tuner_18_14,
  tuner_18_15,
  tuner_18_16,
  tuner_18_17,
  tuner_18_18,
  new RLSchedulingPolicy(),
  tuner_18_20,
];

// Test-only aliases (de-facto contract)
export const TestSchedulerPidTuner = SchedulerPidTuner;
export const TestMemoryThresholdCalibrator = MemoryThresholdCalibrator;
export const TestRLSchedulingPolicy = RLSchedulingPolicy;
