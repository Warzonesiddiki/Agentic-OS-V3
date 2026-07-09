# memory-anomaly

## Purpose
Detects anomalous memories: outliers by embedding distance from neighbours, sudden content/volume spikes,
and duplication storms. Pure `detectMemoryAnomalies` over an in-memory set plus an async store-level scan.

## Public exports
- `interface AnomalyMemory`.
- `interface MemoryAnomaly` — `{ id, kind, severity, detail }`.
- `interface AnomalyOptions`.
- `function detectMemoryAnomalies(memories: AnomalyMemory[], options?): MemoryAnomaly[]` — pure detector.

## Env vars
None directly.

## Test file
No dedicated unit test. Referenced by `server/tests/memory-analysis.test.ts` (anomaly helper checks).
