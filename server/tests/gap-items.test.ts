/**
 * Pulse — Phase 18 gap-items unit tests.
 *
 * Covers the ML-003 gap-item meta-loop helpers in server/src/services/self-opt/
 * gap-items.ts (power analysis, fairness check, hypothesis generation, budget
 * status, cost kill-switch, coordinate-ascent metaOptimize, simulation,
 * satisfaction logging, self-heal verdict routing, and the experiment/knowledge
 * store). All in-namespace; no FROZEN/shared files touched.
 */
import { describe, it, expect } from 'vitest';
import {
  powerCalculator,
  fairnessCheck,
  generateHypothesis,
  explorationBudgetStatus,
  costKillSwitch,
  metaOptimize,
  simulateCycle,
  recordSatisfaction,
  selfHealFromVerdict,
  createExperiment,
  finishExperiment,
  publishKnowledge,
  bestKnowledge,
  explainabilityReport,
  type SimulateCandidate,
  type SimulateGuard,
} from '../src/services/self-opt/gap-items.js';

describe('gap-items: powerCalculator', () => {
  it('returns a positive integer samples-per-arm for a typical effect', () => {
    const r = powerCalculator(0.3, 0.8, 0.05);
    expect(r.nPerArm).toBeGreaterThan(0);
    expect(Number.isInteger(r.nPerArm)).toBe(true);
    expect(r.alpha).toBeCloseTo(0.05);
    expect(r.power).toBeCloseTo(0.8);
  });

  it('requires MORE samples for a SMALLER effect size', () => {
    const small = powerCalculator(0.1, 0.8, 0.05).nPerArm;
    const large = powerCalculator(0.5, 0.8, 0.05).nPerArm;
    expect(small).toBeGreaterThan(large);
  });

  it('clamps to a minimum of 1 sample', () => {
    const r = powerCalculator(0.01, 0.999, 0.001);
    expect(r.nPerArm).toBeGreaterThanOrEqual(1);
  });
});

describe('gap-items: fairnessCheck', () => {
  it('passes when all cohort metrics are non-negative', () => {
    const r = fairnessCheck(null, { armA: 0.2, armB: 0.3 });
    expect(r.ok).toBe(true);
    expect(r.violating).toHaveLength(0);
  });

  it('flags negative (regressed) cohorts', () => {
    const r = fairnessCheck(null, { armA: 0.2, armB: -0.05 });
    expect(r.ok).toBe(false);
    expect(r.violating).toContain('armB');
  });
});

describe('gap-items: generateHypothesis', () => {
  it('detects no degradation on a clean snapshot', () => {
    expect(generateHypothesis({ latency: 0.01, error_rate: 0.0, cost: 0.0 })).toMatch(
      /no degradation/i
    );
  });

  it('names the worst-breaching metric', () => {
    const h = generateHypothesis({ latency: 0.9, error_rate: 0.2, cost: 0.05 });
    expect(h).toMatch(/latency/);
    expect(h).toMatch(/current=0.9/);
  });
});

describe('gap-items: explorationBudgetStatus + costKillSwitch', () => {
  it('reports a non-negative global cap and zero used initially', () => {
    const s = explorationBudgetStatus(null);
    expect(s.globalCap).toBeGreaterThan(0);
    expect(s.globalUsed).toBe(0);
  });

  it('trips the cost kill-switch above threshold and clears below', () => {
    expect(costKillSwitch(null, 0.5)).toBe(true);
    expect(costKillSwitch(null, 0.0001)).toBe(false);
  });
});

describe('gap-items: metaOptimize (ML-003 coordinate ascent)', () => {
  it('converges to the target within the iteration budget', async () => {
    const r = await metaOptimize(null, {
      iterations: 50,
      target: { recall: 0.9, satisfaction: 0.8, perf: 0.7 },
    });
    expect(r.converged).toBe(true);
    expect(r.iterations).toBeLessThanOrEqual(50);
    expect(r.score).toBeGreaterThan(-1e-3);
    expect(Math.abs((r.best.recall ?? 0) - 0.9)).toBeLessThan(0.06);
    expect(Math.abs((r.best.satisfaction ?? 0) - 0.8)).toBeLessThan(0.06);
    expect(Math.abs((r.best.perf ?? 0) - 0.7)).toBeLessThan(0.06);
  });

  it('does not diverge on a single-axis target', async () => {
    const r = await metaOptimize(null, { iterations: 30, target: { x: 1 }, lr: 0.1 });
    expect(r.converged).toBe(true);
    expect(Math.abs((r.best.x ?? 0) - 1)).toBeLessThan(0.06);
  });
});

describe('gap-items: simulateCycle', () => {
  function makeGuard(allowed: boolean, reason = '') {
    const guard: SimulateGuard = { evaluate: () => ({ allowed, reason }) };
    return guard;
  }
  const candidate: SimulateCandidate = {
    id: '18.1',
    name: 'scheduler-pid',
    before: { kp: 0.5 },
    after: { kp: 0.7 },
    expectedEffect: 'lower variance',
    ownerAgent: 'forge',
    targetInterface: 'applySchedulerPidGain',
  };

  it('reports a trip when the guard blocks', () => {
    const res = simulateCycle(candidate, makeGuard(false, 'budget exhausted'));
    expect(res.willTrip).toBe(true);
    expect(res.reason).toBe('budget exhausted');
  });

  it('reports no trip when the guard allows', () => {
    const res = simulateCycle(candidate, makeGuard(true));
    expect(res.willTrip).toBe(false);
    expect(res.estimatedEffect).toEqual({ kp: 0.7 });
  });
});

describe('gap-items: satisfaction + self-heal', () => {
  it('records a satisfaction score', () => {
    const r = recordSatisfaction('18.4', 0.92);
    expect(r.ok).toBe(true);
    expect(r.score).toBeCloseTo(0.92);
  });

  it('rolls back on a reject verdict and no-ops on accept', () => {
    expect(selfHealFromVerdict({ tunerId: '18.1', verdict: 'reject', reason: 'regression' }).action).toBe(
      'rollback'
    );
    expect(selfHealFromVerdict({ tunerId: '18.1', verdict: 'accept', reason: 'ok' }).action).toBe(
      'noop'
    );
  });
});

describe('gap-items: experiment + knowledge store', () => {
  it('creates and closes an experiment', () => {
    const exp = createExperiment('raise recall budget');
    expect(exp.status).toBe('open');
    const closed = finishExperiment(exp.id);
    expect(closed?.status).toBe('closed');
    expect(finishExperiment('nope')).toBeNull();
  });

  it('publishes knowledge and returns the best payload for a tuner', () => {
    publishKnowledge('18.4', { weight: 0.6 }, 0.7);
    publishKnowledge('18.4', { weight: 0.9 }, 0.95);
    const best = bestKnowledge('18.4');
    expect(best).toEqual({ weight: 0.9 });
    const report = explainabilityReport('18.4');
    expect(report.samples).toBe(2);
    expect(report.meanScore).toBeCloseTo(0.825);
  });

  it('returns null best knowledge for an unknown tuner', () => {
    expect(bestKnowledge('__unknown__')).toBeNull();
  });
});
