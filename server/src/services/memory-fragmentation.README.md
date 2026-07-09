# memory-fragmentation

## Purpose
Measures memory-store fragmentation: orphaned clusters, duplicate density, and a normalised
fragmentation score used to decide when to run consolidation/dedup.

## Public exports
- `interface ClusterDescriptor`.
- `interface FragmentationReport` — `{ score, orphanClusters, duplicateDensity, ... }`.
- `function computeFragmentationMetrics(input): FragmentationReport` — pure scorer.
- `async function getFragmentationScore(options?): Promise<FragmentationReport>`.

## Env vars
None directly.

## Test file
- `server/tests/memory-fragmentation.test.ts` (`computeFragmentationMetrics` + store-level score).
