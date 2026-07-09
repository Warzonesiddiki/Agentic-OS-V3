import { describe, it, expect } from 'vitest';
import {
  twoProportionPValue,
  expectedImprovement,
  nelderMeadStep,
  mahalanobis,
  prophetForecast,
  normalCdf,
} from '../src/services/self-opt/tuners.js';

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
