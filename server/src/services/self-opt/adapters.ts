/**
 * PHASE 18 — Tuner Adapters (safe-exploration seams to owner-owned interfaces).
 *
 * Each adapter is the ONLY writer to its owner's tunable surface. The adapter:
 *   - readState(): read-only snapshot (from env / metrics / a future live setter)
 *   - apply(): commit a validated delta. If the owner does not yet expose a live runtime
 *     setter (e.g. Forge's Phase 11 scheduler policy is still being built), the adapter
 *     runs in ADVISORY mode — it records the optimal delta but applies nothing, so Phase 18
 *     can never destabilize a service it does not own.
 *   - hasLiveSetter(): reports whether the owner currently accepts runtime writes.
 *
 * All adapters read current values from `env` (the source of truth for tunable config in
 * this codebase). Where a live setter is referenced (e.g. gateway.setPromptVariant), the
 * adapter calls it only after guard approval; until the owner implements it, ADVISORY mode
 * applies. Coordination contract is in docs/self-optimization-control-surface.md §7.
 */

import { env } from '../../lib/env.js';
import {
  type OwnerAgent,
  type TunerAdapter,
  type TunerId,
} from './types.js';

type NumMap = Record<string, number>;

/** Build a numeric read-state from env with the given keys. */
function readFromEnv(keys: Record<string, keyof typeof env>): NumMap {
  const out: NumMap = {};
  for (const [k, ek] of Object.entries(keys)) {
    const v = env[ek];
    out[k] = typeof v === 'number' ? v : Number(v ?? 0);
  }
  return out;
}

/**
 * Generic advisory/env-backed adapter. The `apply` step is a no-op when `liveSetter`
 * is false — the delta is instead surfaced via the control-plane dashboard + knowledge bus.
 */
class EnvBackedAdapter implements TunerAdapter {
  constructor(
    public readonly ownerAgent: OwnerAgent,
    public readonly targetInterface: string,
    private readonly envKeys: Record<string, keyof typeof env>,
    private readonly liveSetter: () => boolean = () => false,
    private readonly onApply?: (delta: NumMap) => Promise<void>
  ) {}

  hasLiveSetter(): boolean {
    return this.liveSetter();
  }

  async readState(): Promise<Record<string, number | string | boolean>> {
    return readFromEnv(this.envKeys);
  }

  async apply(delta: Record<string, number | string | boolean>): Promise<Record<string, number | string | boolean>> {
    if (this.hasLiveSetter() && this.onApply) {
      await this.onApply(delta as NumMap);
    }
    // In advisory mode we still echo the intended post-state (no platform mutation).
    return { ...(await this.readState()), ...delta };
  }
}

/* ─── 18.1 Scheduler PID (Forge) ─── */
export const schedulerPidAdapter: TunerAdapter = new EnvBackedAdapter(
  'forge',
  'scheduler.ts:setPidGain',
  {
    kp: 'NEXUS_SCHEDULER_MAX_CONCURRENT',
    ki: 'NEXUS_SCHEDULER_BACKPRESSURE_DEPTH',
    kd: 'NEXUS_GANG_QUANTUM_MS',
  },
  // TODO(Forge): flip to true once scheduler exposes setPidGain; meanwhile advisory.
  () => false
);

/* ─── 18.2 Memory threshold (Mnemosyne) — Nelder-Mead vs NDCG@10 ─── */
export const memoryThresholdAdapter: TunerAdapter = new EnvBackedAdapter(
  'mnemosyne',
  'recall.ts:setThreshold',
  {
    semanticThreshold: 'NEXUS_SEMANTIC_THRESHOLD',
    recencyHalflifeDays: 'NEXUS_RECENCY_HALFLIFE_DAYS',
    maxCorpus: 'NEXUS_MAX_RECALL_CORPUS',
  },
  () => false
);

/* ─── 18.3 Prompt A/B (Atlas) ─── */
export const promptAbAdapter: TunerAdapter = new EnvBackedAdapter(
  'atlas',
  'llm-gateway-v2.ts:setPromptVariant',
  { semanticThreshold: 'NEXUS_SEMANTIC_THRESHOLD' } as Record<string, keyof typeof env>,
  () => false
);

/* ─── 18.4 Latency-aware provider failover (Forge) ─── */
export const latencyFailoverAdapter: TunerAdapter = new EnvBackedAdapter(
  'forge',
  'omniRouteAdapter.ts:setFailoverPolicy',
  { policy: 'NEXUS_SCHEDULER_POLICY' } as Record<string, keyof typeof env>,
  () => false
);

/* ─── 18.5 Agent watchdog (Sentinel) ─── */
export const agentWatchdogAdapter: TunerAdapter = new EnvBackedAdapter(
  'sentinel',
  'kernel.ts:setWatchdogPolicy',
  { workerTimeoutMs: 'NEXUS_WORKER_TIMEOUT_MS', maxConcurrency: 'NEXUS_WORKER_MAX_CONCURRENCY' } as Record<
    string,
    keyof typeof env
  >,
  () => false
);

/* ─── 18.7 Queue auto-scaler (Forge) ─── */
export const queueAutoScalerAdapter: TunerAdapter = new EnvBackedAdapter(
  'forge',
  'scheduler.ts:setQueueCapacity',
  {
    maxConcurrent: 'NEXUS_SCHEDULER_MAX_CONCURRENT',
    backpressureDepth: 'NEXUS_SCHEDULER_BACKPRESSURE_DEPTH',
  },
  () => false
);

/* ─── 18.8 Predictive cache warming (Mnemosyne) ─── */
export const cacheWarmingAdapter: TunerAdapter = new EnvBackedAdapter(
  'mnemosyne',
  'llmCache.ts:prewarmEntries',
  { semanticThreshold: 'NEXUS_SEMANTIC_THRESHOLD' } as Record<string, keyof typeof env>,
  () => false
);

/* ─── 18.9 Behavioral anomaly quarantine (Sentinel) ─── */
export const anomalyQuarantineAdapter: TunerAdapter = new EnvBackedAdapter(
  'sentinel',
  'kernel.ts:quarantineAgent',
  { workerStaleTaskMs: 'NEXUS_WORKER_STALE_TASK_MS' } as Record<string, keyof typeof env>,
  () => false
);

/* ─── 18.12 Semantic LLM batching (Atlas) ─── */
export const semanticBatchingAdapter: TunerAdapter = new EnvBackedAdapter(
  'atlas',
  'llm-gateway-v2.ts:setBatchingPolicy',
  { semanticThreshold: 'NEXUS_SEMANTIC_THRESHOLD' } as Record<string, keyof typeof env>,
  () => false
);

/* ─── 18.13 Automatic index advisor (Mnemosyne) ─── */
export const indexAdvisorAdapter: TunerAdapter = new EnvBackedAdapter(
  'mnemosyne',
  'recall.ts:setIndexToggles',
  { maxCorpus: 'NEXUS_MAX_RECALL_CORPUS' } as Record<string, keyof typeof env>,
  () => false
);

/* ─── 18.14 Demand forecasting (Forge) ─── */
export const demandForecastAdapter: TunerAdapter = new EnvBackedAdapter(
  'forge',
  'queueAutoScaler.ts:setForecast',
  { schedulerTickMs: 'NEXUS_SCHEDULER_TICK_MS' } as Record<string, keyof typeof env>,
  () => false
);

/* ─── 18.15 RRF online optimization (Mnemosyne) ─── */
export const rrfOptimizerAdapter: TunerAdapter = new EnvBackedAdapter(
  'mnemosyne',
  'recall.ts:setRrfWeights',
  {
    weightRrf: 'NEXUS_RECALL_WEIGHT_RRF',
    weightImportance: 'NEXUS_RECALL_WEIGHT_IMPORTANCE',
    weightRecency: 'NEXUS_RECALL_WEIGHT_RECENCY',
    weightFeedback: 'NEXUS_RECALL_WEIGHT_FEEDBACK',
    rrfK: 'NEXUS_RRF_K',
  },
  () => false
);

/* ─── 18.16 Token budget recycling (Atlas) ─── */
export const tokenBudgetAdapter: TunerAdapter = new EnvBackedAdapter(
  'atlas',
  'llm-gateway-v2.ts:setTokenBudget',
  { maxBodyBytes: 'NEXUS_MAX_BODY_BYTES' } as Record<string, keyof typeof env>,
  () => false
);

/* ─── 18.17 Semantic LLM response cache (Mnemosyne) ─── */
export const semanticCacheAdapter: TunerAdapter = new EnvBackedAdapter(
  'mnemosyne',
  'llmCache.ts:setCachePolicy',
  { semanticThreshold: 'NEXUS_SEMANTIC_THRESHOLD' } as Record<string, keyof typeof env>,
  () => false
);

/* ─── 18.18 Guardrail calibration (Sentinel) ─── */
export const guardrailCalibrationAdapter: TunerAdapter = new EnvBackedAdapter(
  'sentinel',
  'guardrails.ts:setGuardrailThreshold',
  { evalMatchThreshold: 'NEXUS_EVAL_MATCH_THRESHOLD' } as Record<string, keyof typeof env>,
  () => false
);

/* ─── 18.19 Skill-compilation advisor (Artisan) — advisory only by design ─── */
export const skillCompilerAdapter: TunerAdapter = new EnvBackedAdapter(
  'artisan',
  'skillCompiler.ts:setSuggestion',
  { compilationThreshold: 'NEXUS_COMPILATION_THRESHOLD' } as Record<string, keyof typeof env>,
  () => false
);

/* ─── 18.20 RL scheduling policy (Forge) ─── */
export const rlSchedulingAdapter: TunerAdapter = new EnvBackedAdapter(
  'forge',
  'scheduler.ts:setRlPolicy',
  { policy: 'NEXUS_SCHEDULER_POLICY', mlfqBoostMs: 'NEXUS_MLFQ_BOOST_MS' } as Record<string, keyof typeof env>,
  () => false
);

/** Lookup by tuner id — used by the registry. */
export const ADAPTERS: Partial<Record<TunerId, TunerAdapter>> = {
  '18.1': schedulerPidAdapter,
  '18.2': memoryThresholdAdapter,
  '18.3': promptAbAdapter,
  '18.4': latencyFailoverAdapter,
  '18.5': agentWatchdogAdapter,
  '18.7': queueAutoScalerAdapter,
  '18.8': cacheWarmingAdapter,
  '18.9': anomalyQuarantineAdapter,
  '18.12': semanticBatchingAdapter,
  '18.13': indexAdvisorAdapter,
  '18.14': demandForecastAdapter,
  '18.15': rrfOptimizerAdapter,
  '18.16': tokenBudgetAdapter,
  '18.17': semanticCacheAdapter,
  '18.18': guardrailCalibrationAdapter,
  '18.19': skillCompilerAdapter,
  '18.20': rlSchedulingAdapter,
};
