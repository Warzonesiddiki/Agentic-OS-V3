/**
 * Phase 11 — Task 11.25: Fair-Share Correction.
 *
 * The scheduler tracks how much CPU/quota each team actually consumed versus
 * their entitlement. When a team is systematically starved (actual share well
 * below entitlement) the kernel applies a corrective bias: its next enqueue gets
 * a temporary priority boost. This module computes the correction, recommends
 * it, and applies it to a scheduling-state object.
 */

import { FairnessTracker } from './scheduler.js';

export interface FairShareRecommendation {
  teamId: string;
  entitlement: number;
  actual: number;
  deviation: number;
  boost: number;
}

export interface SchedulingState {
  priorities: Record<string, number>;
}

export class FairnessCorrector {
  /**
   * Compute a fair-share correction for a fairness tracker. Returns the list of
   * teams that should receive a positive priority boost, and the magnitude.
   */
  correct(tracker: FairnessTracker): {
    adjusted: string[];
    recommendations: FairShareRecommendation[];
  } {
    const measurements = tracker.measure();
    const recommendations: FairShareRecommendation[] = [];
    const adjusted: string[] = [];
    for (const m of measurements) {
      const deviation = m.deviation;
      if (deviation < -0.1 && m.entitlementShare > 0) {
        const boost = Math.min(3, Math.ceil(Math.abs(deviation) * 10));
        adjusted.push(m.key);
        recommendations.push({
          teamId: m.key,
          entitlement: m.entitlementShare,
          actual: m.actualShare,
          deviation,
          boost,
        });
      }
    }
    return { adjusted, recommendations };
  }

  recommend(
    metrics: { teamId: string; entitlement: number; actual: number }[]
  ): FairShareRecommendation[] {
    return metrics.map((m) => {
      const entitlement = m.entitlement || 1e-9;
      const actual = m.actual || 0;
      const deviation = (actual - entitlement) / entitlement;
      const boost = deviation < -0.1 ? Math.min(3, Math.ceil(Math.abs(deviation) * 10)) : 0;
      return { teamId: m.teamId, entitlement: m.entitlement, actual: m.actual, deviation, boost };
    });
  }

  apply(state: SchedulingState, recs: FairShareRecommendation[]): SchedulingState {
    const next: SchedulingState = { priorities: { ...state.priorities } };
    for (const r of recs) {
      if (r.boost > 0) {
        const base = next.priorities[r.teamId] ?? 0;
        next.priorities[r.teamId] = base + r.boost;
      }
    }
    return next;
  }
}

export const fairnessCorrector = new FairnessCorrector();

export function fairShareCorrection(tracker: FairnessTracker): {
  adjusted: string[];
  recommendations: FairShareRecommendation[];
} {
  return fairnessCorrector.correct(tracker);
}

export function recommendFairShareCorrection(
  metrics: { teamId: string; entitlement: number; actual: number }[]
): FairShareRecommendation[] {
  return fairnessCorrector.recommend(metrics);
}

export function applyFairShareCorrection(
  state: SchedulingState,
  recs: FairShareRecommendation[]
): SchedulingState {
  return fairnessCorrector.apply(state, recs);
}
