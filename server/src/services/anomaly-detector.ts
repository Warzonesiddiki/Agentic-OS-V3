/**
 * anomaly-detector.ts — statistical anomaly detection over a streaming metric.
 *
 * Uses an exponentially-weighted moving average + standard-deviation band. A new
 * sample more than `sigma` standard deviations from the mean is flagged as an
 * anomaly. Stateful per-series so it can watch, e.g., tokens-per-minute, error
 * rate, or auth-failure rate in real time.
 */
import { ApiError } from '../lib/errors.js';

export interface SeriesState {
  mean: number;
  variance: number;
  n: number;
}

const states = new Map<string, SeriesState>();

export function resetSeries(key: string): void {
  states.delete(key);
}

export function observe(
  key: string,
  value: number,
  alpha = 0.1
): { state: SeriesState; anomaly: boolean; z: number } {
  if (!Number.isFinite(value))
    throw new ApiError('ANOMALY_BAD_VALUE', 'Observation must be finite.');
  let s = states.get(key);
  if (!s) {
    s = { mean: value, variance: 0, n: 1 };
    states.set(key, s);
    return { state: s, anomaly: false, z: 0 };
  }
  const delta = value - s.mean;
  s.mean += alpha * delta;
  s.variance = (1 - alpha) * (s.variance + alpha * delta * delta);
  s.n++;
  const std = Math.sqrt(s.variance) || 1e-9;
  const z = delta / std;
  // Only flag after a warm-up of 10 samples so the estimator stabilizes.
  const anomaly = s.n > 10 && Math.abs(z) > 3;
  return { state: s, anomaly, z };
}

export function getState(key: string): SeriesState | undefined {
  return states.get(key);
}

export function activeSeries(): string[] {
  return [...states.keys()];
}
