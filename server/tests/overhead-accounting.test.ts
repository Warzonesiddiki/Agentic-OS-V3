import { describe, it, expect, beforeEach } from 'vitest';
import {
  OverheadAccountant,
  overheadAccountant,
  accountOverhead,
  getOverhead,
  resetOverhead,
} from '../src/services/overhead-accounting.js';

describe('Phase 11.31 — overhead accounting', () => {
  beforeEach(() => resetOverhead());

  it('accumulates overhead per category', () => {
    accountOverhead('scheduling', 100);
    accountOverhead('scheduling', 200);
    accountOverhead('preemption', 50);
    const totals = getOverhead();
    expect(totals.totalNs).toBe(350);
    expect(totals.byCategory.scheduling).toBe(300);
    expect(totals.byCategory.preemption).toBe(50);
    expect(totals.samples).toBe(3);
  });

  it('computes category share', () => {
    const a = new OverheadAccountant();
    a.account('scheduling', 300);
    a.account('policyEval', 100);
    expect(a.share('scheduling')).toBeCloseTo(0.75, 5);
    expect(a.share('policyEval')).toBeCloseTo(0.25, 5);
  });

  it('rejects negative overhead', () => {
    expect(() => accountOverhead('io', -1)).toThrow();
  });

  it('resets state', () => {
    accountOverhead('gc', 10);
    resetOverhead();
    expect(getOverhead().totalNs).toBe(0);
  });

  it('exposes a shared singleton', () => {
    expect(overheadAccountant).toBeInstanceOf(OverheadAccountant);
  });
});
