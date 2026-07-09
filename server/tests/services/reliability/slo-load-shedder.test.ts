/**
 * Dedicated unit tests for Sentinel's reliability namespace — SLO budget + load-shedder.
 * Pure functions; no FROZEN files touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/siem-forwarder.js', () => ({
  forward: vi.fn(() => Promise.resolve({ ok: true })),
}));

import { ApiError } from '../../../src/lib/errors.js';
import {
  Slo,
  errorBudget,
  goodRatio,
  budgetBurnPct,
  isBreached,
  assertBudgetAvailable,
} from '../../../src/services/reliability/slo.js';
import {
  ShedPolicy,
  shouldShed,
  reactToLoad,
  assertNotShed,
} from '../../../src/services/reliability/load-shedder.js';
import { setTier } from '../../../src/services/reliability/degraded-mode.js';

beforeEach(() => {
  setTier('full', 'test-reset');
});

describe('slo: error budget', () => {
  const slo: Slo = { id: 'api', name: 'API', objective: 0.99, windowDays: 28, total: 1000, bad: 10 };

  it('computes good ratio', () => {
    expect(goodRatio(slo)).toBeCloseTo(0.99, 5);
  });

  it('computes error budget (allowed failures)', () => {
    // objective 0.99, goodRatio 0.99 -> budget 0
    expect(errorBudget(slo)).toBeCloseTo(0, 5);
  });

  it('computes a positive budget when good ratio is below objective', () => {
    const room: Slo = { id: 'r', name: 'R', objective: 0.99, windowDays: 28, total: 1000, bad: 20 };
    // goodRatio 0.98, budget = 0.99 - 0.98 = 0.01
    expect(errorBudget(room)).toBeCloseTo(0.01, 5);
  });

  it('clamps budget at zero when objective is met or exceeded', () => {
    const exact: Slo = { id: 'e', name: 'E', objective: 0.99, windowDays: 28, total: 1000, bad: 10 };
    expect(errorBudget(exact)).toBe(0);
  });

  it('computes budget burn percentage', () => {
    // budget = 0.01; consumed = 10/1000 = 0.01 -> 100%
    expect(budgetBurnPct(slo)).toBeCloseTo(100, 5);
  });

  it('detects breach when objective not met', () => {
    const bad: Slo = { ...slo, objective: 0.999, bad: 50 };
    expect(isBreached(bad)).toBe(true);
  });

  it('does not flag breach when within objective', () => {
    expect(isBreached(slo)).toBe(false);
  });
});

describe('slo: assertBudgetAvailable', () => {
  it('passes when budget present', () => {
    const slo: Slo = { id: 'a', name: 'A', objective: 0.99, windowDays: 28, total: 1000, bad: 50 };
    // goodRatio 0.95, budget 0.04 >= 0.01
    expect(() => assertBudgetAvailable(slo, 0.01)).not.toThrow();
  });

  it('throws ApiError when budget exhausted', () => {
    const slo: Slo = { id: 'a', name: 'A', objective: 0.99, windowDays: 28, total: 1000, bad: 10 };
    // errorBudget = 0; requesting >= 0.01 min budget -> throw
    expect(() => assertBudgetAvailable(slo, 0.01)).toThrow(ApiError);
  });
});

describe('load-shedder', () => {
  it('does not shed under 80% utilization', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 70 };
    expect(shouldShed(policy, 0)).toBe(false);
  });

  it('sheds only priority 0 between 80% and 100%', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 90 };
    expect(shouldShed(policy, 0)).toBe(true);
    expect(shouldShed(policy, 1)).toBe(false);
  });

  it('sheds priority < 2 at or above 100% utilization', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 120 };
    expect(shouldShed(policy, 0)).toBe(true);
    expect(shouldShed(policy, 1)).toBe(true);
    expect(shouldShed(policy, 2)).toBe(false);
  });

  it('reactToLoad stays full at low load', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 30 };
    expect(reactToLoad(policy)).toBe('full');
  });

  it('reactToLoad drops to reduced around 85%', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 88 };
    expect(reactToLoad(policy)).toBe('reduced');
  });

  it('reactToLoad drops to minimal at 100%', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 100 };
    expect(reactToLoad(policy)).toBe('minimal');
  });

  it('reactToLoad drops to safe at 120%', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 120 };
    expect(reactToLoad(policy)).toBe('safe');
  });

  it('assertNotShed throws when priority would be shed', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 120 };
    expect(() => assertNotShed(policy, 1)).toThrow(ApiError);
  });

  it('assertNotShed passes when priority is protected', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 120 };
    expect(() => assertNotShed(policy, 3)).not.toThrow();
  });
});
