# anomaly-detector

## Purpose
Streaming anomaly detector (Phase 14). Maintains a rolling-window `SeriesState` per key; `observe` updates
the window and flags spikes; `resetSeries`/`getState`/`activeSeries` manage state. Pure window math.
(Sentinel-owned.)

## Public exports
- `interface SeriesState`, `resetSeries(key)`, `observe(key, value, ts?): { anomaly: boolean; z: number }`,
  `getState(key)`, `activeSeries()`.

## Env vars
None directly.

## Test file
- `server/tests/anomaly-detector.test.ts` (observe spike detection, reset, activeSeries).
