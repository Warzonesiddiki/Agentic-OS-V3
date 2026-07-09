import { describe, it, expect } from 'vitest';
import {
  twoProportionPValue,
  expectedImprovement,
  nelderMeadStep,
  mahalanobis,
  prophetForecast,
  normalCdf,
  SchedulerPidTuner,
  RLSchedulingPolicy,
  MemoryThresholdCalibrator,
} from '../src/services/self-opt/tuners.js';
import type { TelemetrySnapshot } from '../src/services/self-opt/types.js';

function deepMerge<T>(base: T, over: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const k of Object.keys(over as any)) {
    const v = (over as any)[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = deepMerge(out[k] ?? {}, v);
    else out[k] = v;
  }
  return out;
}

function baseSnapshot(over: Partial<TelemetrySnapshot> = {}): TelemetrySnapshot {
  const snap: TelemetrySnapshot = {
    scheduler: {
      pid: { kp: 1, ki: 0.1, kd: 0.01 },
      queueDepth: 10,
      queueWaitMs: 50,
      queueRejectRate: 0.005,
      boostMs: 5000,
      policy: 'mlfq',
    },
    recall: {
      ndcg10: 0.9,
      missRate: 0.05,
      weights: { rrf: 0.4, importance: 0.3, recency: 0.2, feedback: 0.1 },
      rrfK: 60,
      hitRate: 0.8,
    },
    prompt: { impressions: 100, acceptRate: 0.5, judgeScore: 0.7 },
    provider: { p99Ms: 500, errorRate: 0.01, failoverCount: 0, usdPer1k: 0.005 },
    agent: { restartCount: 0, oomCount: 0, healMs: 1000 },
    cache: { warmHitRate: 0.9, missRate: 0.05 },
    guardrail: { violationRate: 0.005, falsePositive: 0.01 },
    billing: { tokenCostUsd: 1.0 },
    audit: { trailCount: 100, errorRate: 0.0 },
  };
  return deepMerge(snap, over);
}

describe('self-opt tuners — math helpers', () => {
  it('normalCdf is within [0,1] and symmetric about 0', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    expect(normalCdf(1)).toBeCloseTo(1 - normalCdf(-1), 5);
  });

  it('twoProportionPValue returns 1 when a sample size is zero', () => {
    expect(twoProportionPValue(1, 0, 1, 10)).toBe(1);
    expect(twoProportionPValue(1, 10, 1, 0)).toBe(1);
  });

  it('twoProportionPValue is significant when proportions differ strongly', () => {
    const p = twoProportionPValue(900, 1000, 500, 1000);
    expect(p).toBeLessThan(0.05);
  });

  it('twoProportionPValue is ~1 when proportions are equal', () => {
    const p = twoProportionPValue(500, 1000, 500, 1000);
    expect(p).toBeGreaterThan(0.9);
  });

  it('expectedImprovement is 0 for non-positive std', () => {
    expect(expectedImprovement(1, 1, 0)).toBe(0);
    expect(expectedImprovement(1, 1, -1)).toBe(0);
  });

  it('expectedImprovement is positive when mean beats current best', () => {
    expect(expectedImprovement(0.5, 0.8, 0.1)).toBeGreaterThan(0);
  });

  it('nelderMeadStep clamps results to >= 0', () => {
    expect(nelderMeadStep(-5, -1)).toBe(0);
    expect(nelderMeadStep(0.5, 1)).toBeGreaterThan(0);
  });

  it('mahalanobis distance is non-negative', () => {
    expect(mahalanobis([1, 2, 3], [0, 0, 0], [1, 1, 1])).toBeGreaterThanOrEqual(0);
  });

  it('mahalanobis equals Euclidean when std=1', () => {
    const d = mahalanobis([3, 4], [0, 0], [1, 1]);
    expect(d).toBeCloseTo(5, 5);
  });

  it('prophetForecast returns exactly `horizon` values', () => {
    const out = prophetForecast([1, 2, 3, 4], 3);
    expect(out).toHaveLength(3);
    out.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
  });

  it('prophetForecast handles empty history', () => {
    expect(prophetForecast([], 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('tuners — math helpers (extended)', () => {
  it('normalCdf is symmetric and bounded', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
    expect(normalCdf(5)).toBeCloseTo(1, 4);
    expect(normalCdf(-5)).toBeCloseTo(0, 4);
  });

  it('twoProportionPValue ~1 when proportions equal, <0.05 when far apart', () => {
    const equal = twoProportionPValue(500, 1000, 500, 1000);
    expect(equal).toBeCloseTo(1, 2);
    const far = twoProportionPValue(900, 1000, 500, 1000);
    expect(far).toBeLessThan(0.05);
  });

  it('expectedImprovement is positive when mean exceeds best', () => {
    expect(expectedImprovement(100, 120, 10)).toBeGreaterThan(0);
    expect(expectedImprovement(120, 100, 10)).toBe(0);
  });

  it('nelderMeadStep clamps negatives and steps by gradient sign', () => {
    expect(nelderMeadStep(0.2, 1)).toBeCloseTo(0.25, 5);
    expect(nelderMeadStep(0.2, -1)).toBeCloseTo(0.15, 5);
    expect(nelderMeadStep(0.01, -1)).toBe(0);
  });

  it('mahalanobis is zero at the mean', () => {
    expect(mahalanobis([1, 2, 3], [1, 2, 3], [1, 1, 1])).toBeCloseTo(0, 6);
    expect(mahalanobis([4, 2, 3], [1, 2, 3], [1, 1, 1])).toBeCloseTo(3, 6);
  });

  it('prophetForecast returns horizon-length non-negative series', () => {
    const out = prophetForecast([10, 12, 11, 13], 3, 4);
    expect(out).toHaveLength(3);
    for (const v of out) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe('tuners — propose/evaluate', () => {
  it('SchedulerPidTuner returns null when healthy', async () => {
    const t = new SchedulerPidTuner();
    expect(await t.propose(baseSnapshot())).toBeNull();
  });

  it('SchedulerPidTuner proposes when queue wait elevated', async () => {
    const t = new SchedulerPidTuner();
    const snap = baseSnapshot({
      scheduler: {
        pid: { kp: 1, ki: 0.1, kd: 0.01 },
        queueDepth: 10,
        queueWaitMs: 500,
        queueRejectRate: 0.05,
        boostMs: 5000,
        policy: 'mlfq',
      },
    });
    const d = await t.propose(snap);
    expect(d).not.toBeNull();
    expect((d!.after as any).kp).toBeGreaterThan((d!.before as any).kp);
  });

  it('RLSchedulingPolicy proposes mlfq with reduced wait', async () => {
    const t = new RLSchedulingPolicy();
    const snap = baseSnapshot({
      scheduler: {
        pid: { kp: 1, ki: 0.1, kd: 0.01 },
        queueDepth: 10,
        queueWaitMs: 400,
        queueRejectRate: 0.02,
        boostMs: 5000,
        policy: 'mlfq',
      },
    });
    const d = await t.propose(snap);
    expect(d).not.toBeNull();
    expect((d!.after as any).policy).toBe('mlfq');
  });

  it('MemoryThresholdCalibrator returns null when ndcg healthy', async () => {
    const t = new MemoryThresholdCalibrator();
    expect(await t.propose(baseSnapshot())).toBeNull();
  });

  it('explain always returns reason + expectedEffect', async () => {
    const t = new RLSchedulingPolicy();
    const snap = baseSnapshot({
      scheduler: {
        pid: { kp: 1, ki: 0.1, kd: 0.01 },
        queueDepth: 10,
        queueWaitMs: 400,
        queueRejectRate: 0.02,
        boostMs: 5000,
        policy: 'mlfq',
      },
    });
    const d = (await t.propose(snap))!;
    const ex = t.explain(d);
    expect(ex.reason.length).toBeGreaterThan(0);
    expect(ex.expectedEffect.length).toBeGreaterThan(0);
  });

  it('evaluate passes on a large, significant lift', () => {
    const t = new RLSchedulingPolicy();
    const r = t.evaluate({ acceptRate: 0.5 }, { acceptRate: 0.7 });
    expect(r.passed).toBe(true);
    expect(r.pValue).toBeLessThan(0.05);
  });

  it('evaluate does not pass on a negligible, non-significant change', () => {
    const t = new RLSchedulingPolicy();
    const r = t.evaluate({ acceptRate: 0.5 }, { acceptRate: 0.501 });
    expect(r.passed).toBe(false);
  });
});
