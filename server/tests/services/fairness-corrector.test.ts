/**
 * fairness-corrector.test.ts — AI fairness correction (Aegis namespace).
 * `correct(tracker)` consumes a FairnessTracker; we supply a minimal fake that
 * returns measurements of {key, entitlementShare, actualShare, deviation}.
 */
import { describe, it, expect } from 'vitest';
import {
  FairnessCorrector,
  fairnessCorrector,
  fairShareCorrection,
  recommendFairShareCorrection,
  applyFairShareCorrection,
} from '../../src/services/fairness-corrector.js';

// Minimal fake tracker satisfying the FairnessTracker contract for .measure().
function fakeTracker(measurements: Array<{ key: string; entitlementShare: number; actualShare: number; deviation: number }>): any {
  return { measure: () => measurements };
}

describe('FairnessCorrector.correct', () => {
  it('recommends a boost for under-served teams (deviation < -0.1)', () => {
    const c = new FairnessCorrector();
    const res = c.correct(
      fakeTracker([
        { key: 'team-a', entitlementShare: 0.5, actualShare: 0.2, deviation: -0.6 },
        { key: 'team-b', entitlementShare: 0.5, actualShare: 0.8, deviation: 0.6 },
      ])
    );
    expect(res.adjusted).toEqual(['team-a']);
    expect(res.recommendations).toHaveLength(1);
    expect(res.recommendations[0].boost).toBeGreaterThan(0);
  });

  it('caps the boost at 3', () => {
    const c = new FairnessCorrector();
    const res = c.correct(fakeTracker([{ key: 't', entitlementShare: 1, actualShare: 0, deviation: -1 }]));
    expect(res.recommendations[0].boost).toBe(3);
  });

  it('ignores near-balanced teams', () => {
    const c = new FairnessCorrector();
    const res = c.correct(fakeTracker([{ key: 't', entitlementShare: 0.5, actualShare: 0.48, deviation: -0.04 }]));
    expect(res.adjusted).toHaveLength(0);
  });
});

describe('standalone fairShareCorrection (singleton)', () => {
  it('delegates to the singleton corrector', () => {
    const res = fairShareCorrection(fakeTracker([{ key: 'x', entitlementShare: 0.9, actualShare: 0.1, deviation: -0.89 }]));
    expect(res.adjusted).toEqual(['x']);
  });

  it('singleton is a FairnessCorrector instance', () => {
    expect(fairnessCorrector).toBeInstanceOf(FairnessCorrector);
  });
});

describe('recommend / apply', () => {
  it('recommend maps metrics to recommendations with capped boost', () => {
    const recs = recommendFairShareCorrection([
      { teamId: 'a', entitlement: 0.5, actual: 0.1 },
      { teamId: 'b', entitlement: 0.5, actual: 0.5 },
    ]);
    expect(recs[0].boost).toBeGreaterThan(0);
    expect(recs[1].boost).toBe(0);
  });

  it('apply adds boosts to the scheduling priorities immutably', () => {
    const recs = recommendFairShareCorrection([{ teamId: 'a', entitlement: 0.5, actual: 0.1 }]);
    const state = { priorities: { a: 1, b: 2 } };
    const next = applyFairShareCorrection(state, recs);
    expect(next.priorities.a).toBeGreaterThan(1);
    expect(state.priorities.a).toBe(1); // original untouched
    expect(next.priorities.b).toBe(2);
  });
});
