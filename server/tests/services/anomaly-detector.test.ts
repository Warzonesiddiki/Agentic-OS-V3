/** anomaly-detector.test.ts — time-series anomaly detection (Aegis, pure). */
import { describe, it, expect, beforeEach } from 'vitest';
import { observe, getState, resetSeries, activeSeries } from '../../src/services/anomaly-detector.js';

beforeEach(() => {
  for (const k of activeSeries()) resetSeries(k);
});

describe('observe / getState', () => {
  it('tracks a running mean and variance (EWMA) over the series', () => {
    const key = 'cpu';
    const steady = [10, 11, 9, 10, 12, 10, 9, 11, 10, 10, 10];
    for (const v of steady) observe(key, v);
    const st = getState(key)!;
    expect(st.n).toBe(steady.length);
    expect(st.mean).toBeCloseTo(10, 0);
    expect(st.variance).toBeGreaterThanOrEqual(0);
  });

  it('flags an extreme outlier as an anomaly after warm-up', () => {
    const key = 'lat';
    for (let i = 0; i < 11; i++) observe(key, 100); // stable baseline
    const last = observe(key, 100000); // huge spike -> |z| > 3
    expect(last.anomaly).toBe(true);
    expect(last.z).toBeGreaterThan(3);
  });

  it('does not flag during warm-up (n <= 10)', () => {
    const key = 'warm';
    observe(key, 10);
    const res = observe(key, 999999);
    expect(res.anomaly).toBe(false);
  });

  it('returns undefined for an unknown series', () => {
    expect(getState('nope')).toBeUndefined();
  });
});

describe('resetSeries / activeSeries', () => {
  it('removes a series and stops listing it', () => {
    observe('tmp', 1);
    expect(activeSeries()).toContain('tmp');
    resetSeries('tmp');
    expect(getState('tmp')).toBeUndefined();
    expect(activeSeries()).not.toContain('tmp');
  });

  it('lists multiple active series', () => {
    observe('a', 1);
    observe('b', 2);
    const active = activeSeries();
    expect(active).toContain('a');
    expect(active).toContain('b');
  });
});
