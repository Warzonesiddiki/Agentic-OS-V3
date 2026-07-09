/**
 * Pulse — Phase 18 self-opt EMIT-PATH integration test.
 *
 * Proves the auto-tuner EMIT path end-to-end WITHOUT editing any FROZEN/
 * cross-namespace file:
 *   (a) when a tuner flag flips (latency/budget breach in the telemetry
 *       snapshot), the controller EMITS a telemetry/audit event via the
 *       MetricStore + exportMetric path;
 *   (b) the configured remediation LIVE-WRITE adapter is invoked (the owner
 *       module's live setter is called through the interface-only seam);
 *   (c) the daily write budget cap is RESPECTED across multiple live cycles
 *       (the guardrail spine blocks further applies past maxWriteApplyPerDay);
 *   (d) gap-items metaOptimize converges within N iterations.
 *
 * Every owner module touched by tuners/adapters is vi.mocked with spies so we
 * assert the emit/adapter calls without ever importing real owner code or DB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock the FROZEN / cross-namespace owner modules (live setters) ──
vi.mock('../src/services/scheduler.js', () => ({
  applySchedulerPidGain: vi.fn(),
  setSchedulingPolicy: vi.fn(),
  applySchedulerBoost: vi.fn(),
}));
vi.mock('../src/services/task-worker.js', () => ({
  configureWorker: vi.fn(),
}));
vi.mock('../src/services/recall.js', () => ({
  applyRecallFusionWeights: vi.fn(),
  applyRrfK: vi.fn(),
  applyRecallBudget: vi.fn(),
}));
vi.mock('../src/services/ranking-trainer.js', () => ({
  trainRanker: vi.fn(),
  getRankerWeights: vi.fn(),
}));
vi.mock('../src/services/llm-router.js', () => ({
  applyLlmRoutingPolicy: vi.fn(),
}));
vi.mock('../src/services/kernel-hotpatch.js', () => ({
  applyHotpatch: vi.fn(),
}));
vi.mock('../src/services/cache-warmup.js', () => ({
  applyCacheWarmupPolicy: vi.fn(),
}));
vi.mock('../src/services/guardrails.js', () => ({
  setGuardrailThreshold: vi.fn(),
}));
vi.mock('../src/services/billing.js', () => ({
  applyBillingThrottle: vi.fn(),
}));
vi.mock('../src/services/kernel.js', () => ({
  applyAgentRestartPolicy: vi.fn(),
}));
vi.mock('../src/services/audit-engine.js', () => ({
  applyAuditSampling: vi.fn(),
}));

// Mock the DB client + logging so the controller's persist path never touches
// Postgres and the import never throws.
vi.mock('../src/db/client.js', () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => Promise.resolve([])) })) })),
    })),
  },
}));
vi.mock('../src/lib/logging.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SelfOptController } from '../src/services/self-opt/controller.js';
import { metricStore, readMetrics, exportMetric } from '../src/services/self-opt/telemetry.js';
import {
  guardrailGuard,
  setGuardrailBounds,
  DEFAULT_BOUNDS,
} from '../src/services/self-opt/guardrail-guard.js';
import { metaOptimize } from '../src/services/self-opt/gap-items.js';
import { ALL_TUNERS } from '../src/services/self-opt/tuners.js';

import * as schedulerMod from '../src/services/scheduler.js';
import * as taskWorkerMod from '../src/services/task-worker.js';
import * as recallMod from '../src/services/recall.js';
import * as guardrailsMod from '../src/services/guardrails.js';
import * as kernelMod from '../src/services/kernel.js';
import * as auditMod from '../src/services/audit-engine.js';
import * as rankingMod from '../src/services/ranking-trainer.js';
import * as llmRouterMod from '../src/services/llm-router.js';
import * as cacheWarmMod from '../src/services/cache-warmup.js';
import * as billingMod from '../src/services/billing.js';
import * as kernelHotpatchMod from '../src/services/kernel-hotpatch.js';

function allSpies(): Array<ReturnType<typeof vi.fn>> {
  return [
    schedulerMod.applySchedulerPidGain as unknown as ReturnType<typeof vi.fn>,
    schedulerMod.setSchedulingPolicy as unknown as ReturnType<typeof vi.fn>,
    schedulerMod.applySchedulerBoost as unknown as ReturnType<typeof vi.fn>,
    taskWorkerMod.configureWorker as unknown as ReturnType<typeof vi.fn>,
    recallMod.applyRecallFusionWeights as unknown as ReturnType<typeof vi.fn>,
    recallMod.applyRrfK as unknown as ReturnType<typeof vi.fn>,
    recallMod.applyRecallBudget as unknown as ReturnType<typeof vi.fn>,
    guardrailsMod.setGuardrailThreshold as unknown as ReturnType<typeof vi.fn>,
    kernelMod.applyAgentRestartPolicy as unknown as ReturnType<typeof vi.fn>,
    auditMod.applyAuditSampling as unknown as ReturnType<typeof vi.fn>,
    rankingMod.trainRanker as unknown as ReturnType<typeof vi.fn>,
    llmRouterMod.applyLlmRoutingPolicy as unknown as ReturnType<typeof vi.fn>,
    cacheWarmMod.applyCacheWarmupPolicy as unknown as ReturnType<typeof vi.fn>,
    billingMod.applyBillingThrottle as unknown as ReturnType<typeof vi.fn>,
    kernelHotpatchMod.applyHotpatch as unknown as ReturnType<typeof vi.fn>,
  ];
}

// A flat-key snapshot that trips ALL 17 tuners (every propose() gate breached).
// Keys are the flat names metricStore.snapshot() reads (see telemetry.ts).
function breachSnapshot(): void {
  metricStore.set('scheduler_queue_wait_ms', 900); // 18.1, 18.19, 18.20
  metricStore.set('scheduler_queue_depth', 80); // 18.2
  metricStore.set('scheduler_boost_ms', 1000); // 18.17 (default 5000 > 2000 null)
  metricStore.set('recall_miss_rate', 0.4); // 18.5, 18.3
  metricStore.set('recall_hit_rate', 0.5); // 18.4 (<=0.85)
  metricStore.set('prompt_judge_score', 0.3); // 18.7
  metricStore.set('provider_p99_ms', 5000); // 18.8
  metricStore.set('agent_oom_count', 3); // 18.9
  metricStore.set('agent_restart_count', 5); // 18.15
  metricStore.set('cache_warm_hit_rate', 0.4); // 18.12
  metricStore.set('guardrail_violation_rate', 0.3); // 18.13, 18.18
  metricStore.set('billing_token_cost_usd', 50); // 18.14
  metricStore.set('audit_trail_count', 5000); // 18.16
}

beforeEach(() => {
  metricStore.clear();
  setGuardrailBounds({
    maxWriteApplyPerDay: DEFAULT_BOUNDS.maxWriteApplyPerDay,
    fairnessMinDelta: DEFAULT_BOUNDS.fairnessMinDelta,
    costKillSwitchUsdPer1k: DEFAULT_BOUNDS.costKillSwitchUsdPer1k,
    latencyP99Ms: DEFAULT_BOUNDS.latencyP99Ms,
    satisfactionMinScore: DEFAULT_BOUNDS.satisfactionMinScore,
  });
  guardrailGuard.resetCircuitBreaker();
  guardrailGuard.resetBudget();
  for (const s of allSpies()) s.mockClear();
});

describe('Pulse: self-opt EMIT path', () => {
  it('(a) emits telemetry + audit events when a tuner flag flips (live cycle)', async () => {
    breachSnapshot();
    const controller = new SelfOptController({ dryRunDefault: false });
    const results = await controller.runCycle();

    const applied = results.filter((r) => r.applied);
    expect(applied.length).toBeGreaterThan(0);

    const metrics = readMetrics();
    const emittedByTuners = applied.filter((r) =>
      Object.keys(metrics).some((k) => k.startsWith(r.tunerId))
    );
    expect(emittedByTuners.length).toBeGreaterThan(0);

    expect(() => exportMetric('scheduler_queue_depth', 12)).not.toThrow();
  });

  it('(b) triggers the configured remediation adapter (owner live setter invoked)', async () => {
    breachSnapshot();
    const controller = new SelfOptController({ dryRunDefault: false });
    await controller.runCycle();

    const anySpyCalled = allSpies().some(
      (s) => (s as ReturnType<typeof vi.fn>).mock.calls.length > 0
    );
    expect(anySpyCalled).toBe(true);

    expect((taskWorkerMod.configureWorker as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    expect((guardrailsMod.setGuardrailThreshold as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('(c) respects the daily write budget cap across multiple live cycles (no over-apply)', async () => {
    const CAP = 3;
    setGuardrailBounds({ maxWriteApplyPerDay: CAP });
    guardrailGuard.resetBudget();

    const controller = new SelfOptController({ dryRunDefault: false });

    let totalApplied = 0;
    let totalProposed = 0;
    for (let i = 0; i < 10; i++) {
      breachSnapshot();
      const results = await controller.runCycle();
      totalProposed += results.filter((r) => r.proposed).length;
      totalApplied += results.filter((r) => r.applied).length;
    }

    expect(totalProposed).toBeGreaterThan(0);
    expect(totalApplied).toBeLessThanOrEqual(CAP);
  });

  it('(c2) dry-run mode never applies (no owner live setter invoked, no budget spent)', async () => {
    breachSnapshot();
    const controller = new SelfOptController({ dryRunDefault: true });
    const results = await controller.runCycle();

    expect(results.some((r) => r.proposed)).toBe(true);
    expect(results.every((r) => !r.applied)).toBe(true);
    const anySpyCalled = allSpies().some(
      (s) => (s as ReturnType<typeof vi.fn>).mock.calls.length > 0
    );
    expect(anySpyCalled).toBe(false);
  });

  it('(d) gap-items metaOptimize converges within N iterations', async () => {
    const result = await metaOptimize(null, {
      iterations: 50,
      target: { recall: 0.9, satisfaction: 0.8, perf: 0.7 },
    });
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(50);
    expect(result.score).toBeGreaterThan(-1e-3);
    expect(Math.abs((result.best.recall ?? 0) - 0.9)).toBeLessThan(0.06);
    expect(Math.abs((result.best.satisfaction ?? 0) - 0.8)).toBeLessThan(0.06);
    expect(Math.abs((result.best.perf ?? 0) - 0.7)).toBeLessThan(0.06);
  });

  it('(registry) exposes exactly 17 live tuners', () => {
    expect(ALL_TUNERS.length).toBe(17);
    const ids = ALL_TUNERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(17);
  });
});
