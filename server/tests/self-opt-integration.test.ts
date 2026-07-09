import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the owner modules that the self-opt adapters dynamically import so we can
// assert the live setters are actually invoked at runtime (interface-only seam).
const configureWorker = vi.fn();
const setSchedulingPolicy = vi.fn();
const setGuardrailThreshold = vi.fn();

vi.mock('../../src/services/task-worker.js', () => ({
  configureWorker: (...args: unknown[]) => configureWorker(...args),
}));
vi.mock('../../src/services/scheduler.js', () => ({
  setSchedulingPolicy: (...args: unknown[]) => setSchedulingPolicy(...args),
  applySchedulerBoost: vi.fn(),
  applySchedulerPidGain: vi.fn(),
}));
vi.mock('../../src/services/guardrails.js', () => ({
  setGuardrailThreshold: (...args: unknown[]) => setGuardrailThreshold(...args),
}));

import { queueAutoScalerAdapter, rlSchedulingAdapter } from '../src/services/self-opt/adapters.js';
import { guardrailThresholdAdapter } from '../src/services/self-opt/tuners.js';
import { getGuardrailBounds, setGuardrailBounds, guardrailGuard } from '../src/services/self-opt/guardrail-guard.js';
import { SelfOptController } from '../src/services/self-opt/controller.js';
import { metricStore } from '../src/services/self-opt/telemetry.js';
import { ALL_TUNERS } from '../src/services/self-opt/tuners.js';
import {
  trainRanker,
  rankWithLearnedWeights,
  resetRankerWeights,
  getRankerWeights,
  type RankCandidate,
} from '../src/services/ranking-trainer.js';

beforeEach(() => {
  configureWorker.mockClear();
  setSchedulingPolicy.mockClear();
  setGuardrailThreshold.mockClear();
  resetRankerWeights();
  metricStore.clear();
});

describe('self-opt live setters — integration (runtime mutation)', () => {
  it('queueAutoScalerAdapter.apply mutates task-worker via configureWorker', async () => {
    const before = configureWorker.mock.calls.length;
    await queueAutoScalerAdapter.apply({ maxConcurrency: 24 });
    expect(configureWorker.mock.calls.length).toBe(before + 1);
    expect(configureWorker).toHaveBeenCalledWith({ maxConcurrency: 24 });
  });

  it('rlSchedulingAdapter.apply mutates scheduler via setSchedulingPolicy', async () => {
    await rlSchedulingAdapter.apply({ policy: 'edf' });
    expect(setSchedulingPolicy).toHaveBeenCalledWith('edf');
  });

  it('rlSchedulingAdapter ignores invalid policy (no live write)', async () => {
    setSchedulingPolicy.mockClear();
    await rlSchedulingAdapter.apply({ policy: 'bogus' });
    expect(setSchedulingPolicy).not.toHaveBeenCalled();
  });

  it('guardrailThresholdAdapter.apply mutates guardrails via setGuardrailThreshold', async () => {
    await guardrailThresholdAdapter.apply({ violationRate: 0.012, falsePositive: 0.004 });
    expect(setGuardrailThreshold).toHaveBeenCalledTimes(2);
    expect(setGuardrailThreshold).toHaveBeenCalledWith('self_opt_violation_rate', { threshold: 0.012 });
    expect(setGuardrailThreshold).toHaveBeenCalledWith('self_opt_false_positive', { threshold: 0.004 });
  });

  it('setGuardrailBounds mutates the live guardrail configuration', () => {
    const before = getGuardrailBounds();
    setGuardrailBounds({ maxWriteApplyPerDay: 5 });
    const after = getGuardrailBounds();
    expect(after.L0_BUDGET).toBe(5);
    expect(before.L0_BUDGET).not.toBe(5);
    // restore
    setGuardrailBounds({ maxWriteApplyPerDay: Number.POSITIVE_INFINITY });
  });

  it('guardrailGuard.evaluate blocks when circuit is tripped', () => {
    guardrailGuard.tripCircuitBreaker(1000);
    const verdict = guardrailGuard.evaluate({
      tunerId: '18.1',
      targetInterface: 'scheduler.ts:setPidGain',
      ownerAgent: 'forge',
      beforeJson: { kp: 1 },
      afterJson: { kp: 1.1 },
      reason: 'tune',
      expectedEffect: 'lower wait',
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.layer).toBe('L2_CIRCUIT');
    guardrailGuard.resetCircuitBreaker();
  });
});

describe('self-opt controller — end-to-end cycle applies live setters', () => {
  it('runCycle in live mode proposes AND applies tuners (mutating runtime)', async () => {
    // Elevated queue depth should trigger the queue auto-scaler (18.2) + RL policy (18.19).
    metricStore.set('scheduler_queue_depth', 30);
    const controller = new SelfOptController({ dryRunDefault: false });
    const results = await controller.runCycle();
    const proposed = results.filter((r) => r.proposed);
    expect(proposed.length).toBeGreaterThan(0);
    // At least the two queue-aware tuners should have applied their live setters.
    expect(configureWorker).toHaveBeenCalled();
    expect(setSchedulingPolicy).toHaveBeenCalled();
  });

  it('runCycle in dry-run mode proposes but does NOT apply live setters', async () => {
    metricStore.set('scheduler_queue_depth', 30);
    const controller = new SelfOptController({ dryRunDefault: true });
    await controller.runCycle();
    expect(configureWorker).not.toHaveBeenCalled();
    expect(setSchedulingPolicy).not.toHaveBeenCalled();
  });

  it('ALL_TUNERS contains the 17 Phase-18 tuners', () => {
    expect(ALL_TUNERS.length).toBe(17);
  });
});

describe('ranking-trainer — convergence', () => {
  const candidates: RankCandidate[] = [
    { id: 'a', rrf: 0.9, importance: 0.2, recency: 0.1, feedback: 0.1 },
    { id: 'b', rrf: 0.1, importance: 0.9, recency: 0.2, feedback: 0.1 },
    { id: 'c', rrf: 0.3, importance: 0.3, recency: 0.9, feedback: 0.1 },
  ];

  it('training on helpful feedback shifts weights toward the dominant feature', () => {
    resetRankerWeights();
    // Item 'a' is always helpful → its strongest feature (rrf) should gain weight.
    const triples = Array.from({ length: 8 }, () => ({
      features: { rrf: 0.9, importance: 0.2, recency: 0.1, feedback: 0.1 },
      helpful: true,
    }));
    const w = trainRanker(triples, { epochs: 300, learningRate: 0.5 });
    expect(w.rrf).toBeGreaterThan(w.importance);
    expect(w.rrf).toBeGreaterThan(w.recency);
  });

  it('ranking converges: learned weights rank the helpful-dominant item first', () => {
    resetRankerWeights();
    const triples = Array.from({ length: 12 }, () => ({
      features: { rrf: 0.9, importance: 0.2, recency: 0.1, feedback: 0.1 },
      helpful: true,
    }));
    trainRanker(triples, { epochs: 400, learningRate: 0.6 });
    const ranked = rankWithLearnedWeights(candidates);
    expect(ranked[0]!.id).toBe('a');
  });

  it('repeated training is stable (idempotent convergence)', () => {
    resetRankerWeights();
    const triples = Array.from({ length: 10 }, () => ({
      features: { rrf: 0.9, importance: 0.2, recency: 0.1, feedback: 0.1 },
      helpful: true,
    }));
    const w1 = trainRanker(triples, { epochs: 300 });
    const w2 = trainRanker(triples, { epochs: 300 });
    expect(w2).toEqual(w1);
    expect(getRankerWeights()).toEqual(w1);
  });

  it('empty training resets to defaults', () => {
    resetRankerWeights();
    const w = trainRanker([], {});
    expect(w).toEqual({ rrf: 0.5, importance: 0.3, recency: 0.1, feedback: 0.1 });
  });
});
