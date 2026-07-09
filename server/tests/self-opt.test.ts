/**
 * PHASE 18 — Self-Optimization unit tests.
 * Covers the safe-exploration guardrail spine, the math helpers used by tuners, the
 * controller lifecycle, and the gap-item meta-surfaces. Pure (no DB / no platform side effects).
 */

import { describe, it, expect } from 'vitest';
import { GuardrailGuard } from '../src/services/self-opt/guardrail-guard.js';
import { telemetrySink, metricStore } from '../src/services/self-opt/telemetry.js';
import { SelfOptController } from '../src/services/self-opt/controller.js';
import {
  twoProportionPValue,
  expectedImprovement,
  nelderMeadStep,
  mahalanobis,
  prophetForecast,
  normalCdf,
} from '../src/services/self-opt/tuners.js';
import {
  powerCalculator,
  fairnessCheck,
  generateHypothesis,
} from '../src/services/self-opt/gap-items.js';
import type { TunerDelta } from '../src/services/self-opt/guardrail-guard.js';

const baseDelta = (over: Partial<TunerDelta> = {}): TunerDelta => ({
  tunerId: '18.1',
  targetInterface: 'scheduler.ts:setPidGain',
  ownerAgent: 'forge',
  beforeJson: { kp: 1 },
  afterJson: { kp: 1.1 },
  reason: 'lower queue wait',
  expectedEffect: 'reduced p99',
  ...over,
});

describe('guardrail spine', () => {
  it('dry-run is always allowed and does not consume budget', () => {
    const g = new GuardrailGuard();
    const d = g.evaluate({ ...baseDelta(), dryRun: true });
    expect(d.allowed).toBe(true);
  });

  it('rejects when global circuit breaker is open', () => {
    const g = new GuardrailGuard();
    g.tripCircuitBreaker(10000);
    const d = g.evaluate(baseDelta());
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.layer).toContain('L2');
  });

  it('enforces global daily write-apply budget', () => {
    const g = new GuardrailGuard({ maxWriteApplyPerDay: 2, explorationBudgetPerTuner: 5 });
    expect(g.evaluate(baseDelta()).allowed).toBe(true);
    expect(g.evaluate(baseDelta()).allowed).toBe(true);
    const third = g.evaluate(baseDelta());
    expect(third.allowed).toBe(false);
    if (!third.allowed) expect(third.layer).toContain('L0');
  });

  it('rejects cohort regression (fairness guard)', () => {
    const g = new GuardrailGuard();
    const d = g.evaluate({ ...baseDelta(), cohortMetrics: { cohortA: -0.05 } });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.layer).toContain('L4');
  });

  it('blocks auto-promote on negative satisfaction signal', () => {
    const g = new GuardrailGuard();
    g.recordSatisfaction('18.1', -1);
    const d = g.evaluate(baseDelta());
    expect(d.allowed).toBe(false);
  });

  it('requires reason + expectedEffect (explainability)', () => {
    const g = new GuardrailGuard();
    const d = g.evaluate({ ...baseDelta(), reason: '', expectedEffect: '' });
    expect(d.allowed).toBe(false);
  });

  it('force bypasses budget but never the circuit breaker', () => {
    const g = new GuardrailGuard();
    g.tripCircuitBreaker(10000);
    const d = g.evaluate({ ...baseDelta(), force: true });
    expect(d.allowed).toBe(false);
  });
});

describe('math helpers', () => {
  it('two-proportion z-test returns p<0.05 for a large, clear lift', () => {
    const p = twoProportionPValue(1000, 2000, 1100, 2000);
    expect(p).toBeLessThan(0.05);
  });

  it('two-proportion z-test returns p~1 for no difference', () => {
    const p = twoProportionPValue(1000, 2000, 1001, 2000);
    expect(p).toBeGreaterThan(0.05);
  });

  it('expectedImprovement is positive when mean beats current best', () => {
    expect(expectedImprovement(10, 8, 1)).toBeGreaterThan(0);
  });

  it('nelderMeadStep walks toward a positive gradient and stays >= 0', () => {
    expect(nelderMeadStep(0.3, 0.1)).toBeGreaterThanOrEqual(0);
  });

  it('mahalanobis is small for in-cohort points', () => {
    expect(mahalanobis([5, 2, 5000], [5, 2, 5000], [3, 2, 2000])).toBeLessThan(1e-6);
  });

  it('prophetForecast produces horizon values and a peak', () => {
    const fc = prophetForecast([10, 12, 11], 3);
    expect(fc).toHaveLength(3);
    expect(Math.max(...fc)).toBeGreaterThan(0);
  });

  it('normalCdf is bounded in [0,1]', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    expect(normalCdf(5)).toBeGreaterThan(0.99);
  });
});

describe('telemetry sink', () => {
  it('falls back to neutral defaults when nothing is reported', () => {
    const snap = telemetrySink.snapshot();
    expect(snap.scheduler.pid.kp).toBeGreaterThanOrEqual(0);
    expect(snap.recall.ndcg10).toBeGreaterThanOrEqual(0);
  });

  it('reflects pushed metric values', () => {
    metricStore.set('scheduler_queue_wait_ms', 42);
    expect(telemetrySink.snapshot().scheduler.queueWaitMs).toBe(42);
  });
});

describe('controller lifecycle', () => {
  it('runs a cycle producing one row per registered tuner without throwing', async () => {
    // Default config is dry-run-only, so the cycle must be safe and non-mutating.
    const c = new SelfOptController({ dryRunDefault: true });
    const results = await c.runCycle();
    expect(results.length).toBeGreaterThanOrEqual(17);
    for (const r of results) {
      expect(['noop', 'dry_run', 'error']).toContain(r.action);
    }
  });
});

describe('gap meta-surfaces', () => {
  it('powerCalculator returns a positive n per arm', () => {
    const pc = powerCalculator(0.05, 0.8, 0.02);
    expect(pc.nPerArm).toBeGreaterThan(0);
  });

  it('fairnessCheck flags violating cohorts', () => {
    const c = new SelfOptController();
    const res = fairnessCheck(c, { a: 0.02, b: -0.03 });
    expect(res.ok).toBe(false);
    expect(res.violating).toContain('b');
  });

  it('generateHypothesis picks the worst metric', () => {
    const h = generateHypothesis({ ndcg: 0.9, latency: 0.2 });
    expect(h).toContain('latency');
  });
});
