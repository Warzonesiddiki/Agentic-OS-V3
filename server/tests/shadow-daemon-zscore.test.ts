/**
 * shadow-daemon-zscore.test.ts — Tests for statistical anomaly detection.
 * Phase 2, Task P2-03: z-score based anomaly detection.
 */
import { describe, it, expect } from 'vitest';

/**
 * zScore — compute mean, standard deviation, and per-value z-scores.
 * Replicated here for unit testing without DB dependency.
 */
function zScore(values: number[]): { mean: number; stddev: number; zScores: number[] } {
  const n = values.length;
  if (n === 0) return { mean: 0, stddev: 0, zScores: [] };
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return { mean, stddev: 0, zScores: values.map(() => 0) };
  const zScores = values.map((v) => (v - mean) / stddev);
  return { mean, stddev, zScores };
}

describe('zScore statistical analysis', () => {
  it('returns zeros for empty input', () => {
    const result = zScore([]);
    expect(result.mean).toBe(0);
    expect(result.stddev).toBe(0);
    expect(result.zScores).toHaveLength(0);
  });

  it('returns zero z-scores for constant values', () => {
    const result = zScore([5, 5, 5, 5, 5]);
    expect(result.mean).toBe(5);
    expect(result.stddev).toBe(0);
    expect(result.zScores).toEqual([0, 0, 0, 0, 0]);
  });

  it('computes correct mean', () => {
    const result = zScore([1, 2, 3, 4, 5]);
    expect(result.mean).toBe(3);
  });

  it('computes correct standard deviation', () => {
    const result = zScore([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result.mean).toBe(5);
    expect(result.stddev).toBe(2);
  });

  it('identifies outliers via z-score threshold', () => {
    // 10 normal values around 0.5, plus 1 outlier at 10
    const values = [0.4, 0.5, 0.6, 0.45, 0.55, 0.5, 0.48, 0.52, 0.51, 0.49, 10.0];
    const result = zScore(values);

    // The outlier (10.0) should have a very high z-score
    const outlierIndex = result.zScores.length - 1;
    expect(result.zScores[outlierIndex]).toBeGreaterThan(2.5);

    // The normal values should have low z-scores
    for (let i = 0; i < 10; i++) {
      expect(Math.abs(result.zScores[i]!)).toBeLessThan(1);
    }
  });

  it('handles single value', () => {
    const result = zScore([42]);
    expect(result.mean).toBe(42);
    expect(result.stddev).toBe(0);
    expect(result.zScores).toEqual([0]);
  });

  it('negative values work correctly', () => {
    const result = zScore([-5, -3, -1, 1, 3, 5]);
    expect(result.mean).toBe(0);
    // Symmetric distribution
    expect(result.zScores[0]).toBeCloseTo(-result.zScores[5]!, 5);
  });

  it('large values work correctly', () => {
    const result = zScore([1000000, 1000001, 1000002, 1000003, 1000004]);
    expect(result.mean).toBe(1000002);
    expect(result.stddev).toBeCloseTo(Math.sqrt(2), 5);
  });

  it('z-scores sum to approximately zero for symmetric distributions', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = zScore(values);
    const sum = result.zScores.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum)).toBeLessThan(0.0001);
  });
});

describe('Anomaly detection logic', () => {
  it('identifies memory creation spike', () => {
    // Simulate 10 days of bucket counts: normal ~5/day with a big spike on day 10
    const buckets = [5, 4, 6, 5, 4, 5, 5, 4, 6, 80];
    const { mean, stddev, zScores } = zScore(buckets);

    const recentZScore = zScores[zScores.length - 1]!;
    expect(recentZScore).toBeGreaterThan(2.5);
    // Mean should be dominated by the normal values (around 12.4)
    expect(mean).toBeCloseTo(12.4, 0);
  });

  it('does not flag normal variation as anomaly', () => {
    // Normal day-to-day variation
    const buckets = [10, 12, 11, 9, 10, 11, 10];
    const { zScores } = zScore(buckets);

    const maxZ = Math.max(...zScores.map(Math.abs));
    expect(maxZ).toBeLessThan(2.5);
  });

  it('identifies recall frequency outliers', () => {
    // Most memories recalled 0-2 times, but one recalled 100 times
    const recallCounts = [0, 1, 0, 2, 1, 0, 1, 2, 0, 1, 100];
    const { zScores } = zScore(recallCounts);

    const hotIndex = zScores.length - 1;
    expect(zScores[hotIndex]).toBeGreaterThan(3.0);

    // Normal memories should have low z-scores
    for (let i = 0; i < 10; i++) {
      expect(Math.abs(zScores[i]!)).toBeLessThan(1.5);
    }
  });
});
