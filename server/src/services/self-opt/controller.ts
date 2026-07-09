import { db } from '../../db/client.js';
import { selfOptParamVersions, selfOptEvents } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { ALL_TUNERS } from './tuners.js';
import { type SelfOptTuner } from './types.js';
import { guardrailGuard, type TunerDelta } from './guardrail-guard.js';
import { metricStore, exportMetric } from './telemetry.js';
import { isSqlite } from '../../db/client.js';
import { log } from '../../lib/logging.js';

export const ALL_TUNERS_LIST = ALL_TUNERS;

export interface TunerCycleResult {
  tunerId: string;
  name: string;
  ownerAgent: string;
  targetInterface: string;
  proposed: boolean;
  applied: boolean;
  dryRun: boolean;
  allowed: boolean;
  action: 'noop' | 'dry_run' | 'error';
  layer?: string;
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  pValue?: number;
  metricDelta?: number;
  passed?: boolean;
}

export interface ControllerConfig {
  dryRunDefault?: boolean;
}

export class SelfOptController {
  private dryRunDefault: boolean;
  readonly tuners: SelfOptTuner[];

  constructor(config: ControllerConfig = {}) {
    this.dryRunDefault = config.dryRunDefault ?? true;
    this.tuners = ALL_TUNERS;
  }

  listTuners(): Array<{
    id: string;
    name: string;
    ownerAgent: string;
    targetInterface: string;
    hasLiveSetter: boolean;
    adapterName: string;
  }> {
    return this.tuners.map((t) => ({
      id: t.id,
      name: t.name,
      ownerAgent: t.ownerAgent,
      targetInterface: t.adapter.targetInterface,
      hasLiveSetter: t.adapter.hasLiveSetter(),
      adapterName: t.adapter.targetInterface,
    }));
  }

  async runCycle(): Promise<TunerCycleResult[]> {
    const snapshot = metricStore.snapshot();
    const results: TunerCycleResult[] = [];

    for (const tuner of this.tuners) {
      let proposed = false;
      let applied = false;
      let allowed = false;
      let action: 'noop' | 'dry_run' | 'error' = 'noop';
      let layer: string | undefined;
      let reason: string | undefined;
      let before: Record<string, unknown> | undefined;
      let after: Record<string, unknown> | undefined;
      let pValue: number | undefined;
      let metricDelta: number | undefined;
      let passed: boolean | undefined;

      const deltaInput = await tuner.propose(snapshot);
      if (deltaInput) {
        proposed = true;
        const delta: TunerDelta = {
          tunerId: tuner.id,
          targetInterface: deltaInput.targetInterface,
          ownerAgent: deltaInput.ownerAgent,
          beforeJson: deltaInput.before,
          afterJson: deltaInput.after,
          reason: tuner.explain(deltaInput).reason,
          expectedEffect: tuner.explain(deltaInput).expectedEffect,
          dryRun: this.dryRunDefault,
        };
        const verdict = guardrailGuard.evaluate(delta);
        allowed = verdict.allowed;
        layer = verdict.layer;
        reason = verdict.reason;
        before = deltaInput.before;
        after = deltaInput.after;
        action = this.dryRunDefault ? 'dry_run' : 'error';

        if (verdict.allowed && !this.dryRunDefault) {
          await tuner.adapter.apply(deltaInput.after);
          applied = true;
          action = 'error';
          // ML-003: feed observed metrics back into tuners
          for (const [k, v] of Object.entries(deltaInput.after)) {
            metricStore.set(`${tuner.id}_${k}`, Number(v) || 0);
            exportMetric(tuner.id, Number(v) || 0);
          }
          if (tuner.evaluate) {
            const sig = tuner.evaluate(deltaInput.before, deltaInput.after);
            pValue = sig.pValue;
            metricDelta = sig.metricDelta;
            passed = sig.passed;
          }
          await this.persistResult(tuner, delta, applied, pValue, metricDelta);
        }
      }

      results.push({
        tunerId: tuner.id,
        name: tuner.name,
        ownerAgent: tuner.ownerAgent,
        targetInterface: tuner.adapter.targetInterface,
        proposed,
        applied,
        dryRun: this.dryRunDefault,
        allowed,
        action,
        layer,
        reason,
        before,
        after,
        pValue,
        metricDelta,
        passed,
      });
    }
    return results;
  }

  private async persistResult(
    tuner: SelfOptTuner,
    delta: TunerDelta,
    applied: boolean,
    pValueArg: number | undefined,
    metricDeltaArg: number | undefined
  ): Promise<void> {
    try {
      await db.insert(selfOptParamVersions).values({
        id: `v_${tuner.id}_${Date.now()}`,
        tunerId: tuner.id,
        ownerAgent: tuner.ownerAgent,
        targetInterface: delta.targetInterface,
        beforeJson: delta.beforeJson,
        afterJson: delta.afterJson,
        status: applied ? 'promoted' : 'shadow',
        pValue: pValueArg ?? null,
        metricDelta: metricDeltaArg ?? null,
        createdAt: new Date(),
      });
    } catch (err) {
      log.warn('self_opt_persist_failed', { tunerId: tuner.id, err: String(err) });
    }
  }
}

export const selfOptController = new SelfOptController();
