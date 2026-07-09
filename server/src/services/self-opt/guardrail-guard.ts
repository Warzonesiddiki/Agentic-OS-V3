import type { OwnerAgent, TunerValue } from './types.js';

export type GuardrailLevel =
  | 'L0_BUDGET'
  | 'L1_LATENCY'
  | 'L2_CIRCUIT'
  | 'L3_COST'
  | 'L4_FAIRNESS'
  | 'L5_EXPLAIN'
  | 'L6_SATISFACTION';

export const GUARDRAIL_LEVELS: GuardrailLevel[] = [
  'L0_BUDGET',
  'L1_LATENCY',
  'L2_CIRCUIT',
  'L3_COST',
  'L4_FAIRNESS',
  'L5_EXPLAIN',
  'L6_SATISFACTION',
];

export interface TunerDelta {
  tunerId: string;
  targetInterface: string;
  ownerAgent: OwnerAgent;
  beforeJson: Record<string, TunerValue>;
  afterJson: Record<string, TunerValue>;
  reason: string;
  expectedEffect: string;
  dryRun?: boolean;
  cohortMetrics?: Record<string, number>;
  force?: boolean;
}

export interface EvaluateResult {
  allowed: boolean;
  layer?: GuardrailLevel;
  reason?: string;
  shadowWindowSeconds?: number;
}

export interface GuardrailConfig {
  dryRunDefault?: boolean;
  maxWriteApplyPerDay?: number;
  fairnessMinDelta?: number;
  costKillSwitchUsdPer1k?: number;
  latencyP99Ms?: number;
  satisfactionMinScore?: number;
  explorationBudgetPerTuner?: number;
}

export function getGuardrailBounds(): Record<GuardrailLevel, number> {
  return {
    L0_BUDGET: DEFAULT_BOUNDS.maxWriteApplyPerDay,
    L1_LATENCY: DEFAULT_BOUNDS.latencyP99Ms,
    L2_CIRCUIT: 1,
    L3_COST: DEFAULT_BOUNDS.costKillSwitchUsdPer1k,
    L4_FAIRNESS: DEFAULT_BOUNDS.fairnessMinDelta,
    L5_EXPLAIN: 0,
    L6_SATISFACTION: DEFAULT_BOUNDS.satisfactionMinScore,
  };
}

export function setGuardrailBounds(b: Partial<GuardrailConfig>): void {
  if (b.maxWriteApplyPerDay !== undefined)
    DEFAULT_BOUNDS.maxWriteApplyPerDay = b.maxWriteApplyPerDay;
  if (b.fairnessMinDelta !== undefined) DEFAULT_BOUNDS.fairnessMinDelta = b.fairnessMinDelta;
  if (b.costKillSwitchUsdPer1k !== undefined)
    DEFAULT_BOUNDS.costKillSwitchUsdPer1k = b.costKillSwitchUsdPer1k;
  if (b.latencyP99Ms !== undefined) DEFAULT_BOUNDS.latencyP99Ms = b.latencyP99Ms;
  if (b.satisfactionMinScore !== undefined)
    DEFAULT_BOUNDS.satisfactionMinScore = b.satisfactionMinScore;
}

const DEFAULT_BOUNDS: Required<Omit<GuardrailConfig, 'dryRunDefault'>> = {
  maxWriteApplyPerDay: Number.POSITIVE_INFINITY,
  fairnessMinDelta: -0.02,
  costKillSwitchUsdPer1k: Number.POSITIVE_INFINITY,
  latencyP99Ms: 1500,
  satisfactionMinScore: 0.5,
  explorationBudgetPerTuner: 10,
};
export { DEFAULT_BOUNDS };

export class GuardrailGuard {
  private circuitOpen = false;
  private circuitResetAt = 0;
  private writesApplied = 0;
  private negativeSatisfaction = false;
  readonly dryRunDefault: boolean;
  private cfg: Required<Omit<GuardrailConfig, 'dryRunDefault'>>;

  constructor(config: GuardrailConfig = {}) {
    this.dryRunDefault = config.dryRunDefault ?? false;
    this.cfg = {
      maxWriteApplyPerDay: config.maxWriteApplyPerDay ?? DEFAULT_BOUNDS.maxWriteApplyPerDay,
      fairnessMinDelta: config.fairnessMinDelta ?? DEFAULT_BOUNDS.fairnessMinDelta,
      costKillSwitchUsdPer1k:
        config.costKillSwitchUsdPer1k ?? DEFAULT_BOUNDS.costKillSwitchUsdPer1k,
      latencyP99Ms: config.latencyP99Ms ?? DEFAULT_BOUNDS.latencyP99Ms,
      satisfactionMinScore: config.satisfactionMinScore ?? DEFAULT_BOUNDS.satisfactionMinScore,
      explorationBudgetPerTuner:
        config.explorationBudgetPerTuner ?? DEFAULT_BOUNDS.explorationBudgetPerTuner,
    };
  }

  tripCircuitBreaker(resetMs = 60_000): void {
    this.circuitOpen = true;
    this.circuitResetAt = Date.now() + resetMs;
  }

  resetCircuitBreaker(): void {
    this.circuitOpen = false;
    this.circuitResetAt = 0;
  }

  resetBudget(): void {
    this.writesApplied = 0;
  }

  recordSatisfaction(_tunerId: string, score: number): void {
    if (score < 0) this.negativeSatisfaction = true;
  }

  checkCostKillSwitch(costUsdPer1k: number): boolean {
    return costUsdPer1k >= this.cfg.costKillSwitchUsdPer1k;
  }

  evaluate(delta: TunerDelta): EvaluateResult {
    const dryRun = delta.dryRun ?? this.dryRunDefault;
    const shadowWindowSeconds = dryRun ? 0 : 300;

    // L2 — circuit breaker
    if (this.circuitOpen) {
      if (this.circuitResetAt && Date.now() > this.circuitResetAt) this.resetCircuitBreaker();
      else
        return {
          allowed: false,
          layer: 'L2_CIRCUIT',
          reason: 'circuit breaker open',
          shadowWindowSeconds,
        };
    }

    // L5 — explainability (force bypasses)
    if (!delta.force && (delta.reason.trim() === '' || delta.expectedEffect.trim() === '')) {
      return {
        allowed: false,
        layer: 'L5_EXPLAIN',
        reason: 'missing reason/expectedEffect',
        shadowWindowSeconds,
      };
    }

    // L4 — fairness cohort regression
    if (!delta.force && delta.cohortMetrics) {
      const vals = Object.values(delta.cohortMetrics);
      const min = vals.length ? Math.min(...vals) : 0;
      if (min < this.cfg.fairnessMinDelta) {
        return {
          allowed: false,
          layer: 'L4_FAIRNESS',
          reason: 'cohort regression below fairnessMinDelta',
          shadowWindowSeconds,
        };
      }
    }

    // L6 — satisfaction loop negative signal
    if (!delta.force && this.negativeSatisfaction) {
      return {
        allowed: false,
        layer: 'L6_SATISFACTION',
        reason: 'negative satisfaction signal recorded',
        shadowWindowSeconds,
      };
    }

    // L0 — global write budget.
    // Honor BOTH an explicit constructor cap AND the runtime-mutable global
    // DEFAULT_BOUNDS (setGuardrailBounds) so the singleton guardrailGuard used
    // by the controller respects live budget changes made after construction.
    const maxWrites = Math.min(this.cfg.maxWriteApplyPerDay, DEFAULT_BOUNDS.maxWriteApplyPerDay);
    if (!dryRun && !delta.force) {
      if (this.writesApplied >= maxWrites) {
        return {
          allowed: false,
          layer: 'L0_BUDGET',
          reason: 'daily write budget exhausted',
          shadowWindowSeconds,
        };
      }
      this.writesApplied += 1;
    }

    return { allowed: true, shadowWindowSeconds };
  }
}

export const guardrailGuard = new GuardrailGuard({ dryRunDefault: true });

// Sentinel seam: delegate to guardrails.ts setGuardrailThreshold (interface-only).
export async function setGuardrailThreshold(
  id: string,
  partial: { threshold: number }
): Promise<void> {
  const mod = await import('../guardrails.js').catch(() => ({
    setGuardrailThreshold: undefined as unknown,
  }));
  const fn = (mod as Record<string, unknown>)['setGuardrailThreshold'];
  if (typeof fn === 'function') {
    await (fn as (a: string, b: { threshold: number }) => Promise<unknown>)(id, partial);
  }
}
