/**
 * Sentinel reliability namespace — slo + load-shedder unit tests.
 * Pure logic; no FROZEN files touched.
 */
import { describe, it, expect } from 'vitest';

import {
  goodRatio,
  errorBudget,
  budgetBurnPct,
  isBreached,
  assertBudgetAvailable,
  Slo,
} from '../../../src/services/reliability/slo.js';
import {
  shouldShed,
  reactToLoad,
  assertNotShed,
  ShedPolicy,
} from '../../../src/services/reliability/load-shedder.js';

describe('slo math', () => {
  const slo: Slo = { id: 's', name: 'S', objective: 0.99, windowDays: 30, total: 1000, bad: 10 };

  it('computes good ratio', () => {
    expect(goodRatio(slo)).toBeCloseTo(0.99, 5);
  });

  it('computes remaining error budget', () => {
    expect(errorBudget(slo)).toBeCloseTo(0, 5); // objective == goodRatio
  });

  it('computes burn percentage', () => {
    expect(typeof budgetBurnPct(slo, 30)).toBe('number');
  });

  it('flags breach when bad exceeds objective', () => {
    const breached: Slo = { ...slo, bad: 50 }; // good 95% < 99%
    expect(isBreached(breached)).toBe(true);
    expect(isBreached(slo)).toBe(false);
  });

  it('assertBudgetAvailable throws when breached', () => {
    const breached: Slo = { ...slo, bad: 50 };
    expect(() => assertBudgetAvailable(breached)).toThrow();
    expect(() => assertBudgetAvailable(slo)).not.toThrow();
  });
});

describe('load-shedder', () => {
  it('never sheds critical priority', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 500 };
    expect(shouldShed(policy, 'critical')).toBe(false);
  });

  it('sheds low priority when over capacity', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 500 };
    expect(shouldShed(policy, 'low')).toBe(true);
  });

  it('does not shed when within capacity', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 50 };
    expect(shouldShed(policy, 'low')).toBe(false);
  });

  it('maps load ratio to a tier', () => {
    expect(reactToLoad(150, 100)).toBe('full');
    expect(reactToLoad(120, 100)).toBe('reduced');
    expect(reactToLoad(105, 100)).toBe('minimal');
    expect(reactToLoad(50, 100)).toBe('safe');
  });

  it('assertNotShed throws when a call would be shed', () => {
    const policy: ShedPolicy = { capacityRps: 100, currentLoadRps: 500 };
    expect(() => assertNotShed(policy, 'low')).toThrow();
    expect(() => assertNotShed(policy, 'critical')).not.toThrow();
  });
});
