import { describe, it, expect } from 'vitest';
import {
  FairnessCorrector,
  fairnessCorrector,
  recommendFairShareCorrection,
  applyFairShareCorrection,
} from '../src/services/fairness-corrector.js';
import { FairnessTracker } from '../src/services/scheduler.js';

describe('Phase 11.25 — fair-share correction', () => {
  it('detects starved teams via FairnessTracker.correct', () => {
    const ft = new FairnessTracker(0.2);
    ft.register({ teamId: 'alpha' }, 50);
    ft.register({ teamId: 'beta' }, 50);
    ft.record({ teamId: 'alpha' }, 95); // alpha took 95% vs 50% entitlement
    ft.record({ teamId: 'beta' }, 5);
    const { adjusted } = ft.correct();
    expect(adjusted).toContain('beta');
  });

  it('FairnessCorrector.correct returns recommendations', () => {
    const ft = new FairnessTracker(0.2);
    ft.register({ teamId: 'a' }, 50);
    ft.register({ teamId: 'b' }, 50);
    ft.record({ teamId: 'a' }, 90);
    ft.record({ teamId: 'b' }, 10);
    const corrector = new FairnessCorrector();
    const { adjusted, recommendations } = corrector.correct(ft);
    expect(adjusted).toContain('b');
    expect(recommendations.find((r) => r.teamId === 'b')?.boost).toBeGreaterThan(0);
  });

  it('recommend + apply boosts starved team priorities', () => {
    const recs = recommendFairShareCorrection([
      { teamId: 'a', entitlement: 0.5, actual: 0.9 },
      { teamId: 'b', entitlement: 0.5, actual: 0.1 },
    ]);
    const b = recs.find((r) => r.teamId === 'b');
    expect(b?.boost).toBeGreaterThan(0);
    const state = applyFairShareCorrection({ priorities: { a: 0, b: 0 } }, recs);
    expect(state.priorities.b).toBeGreaterThan(0);
    expect(fairnessCorrector).toBeInstanceOf(FairnessCorrector);
  });
});
