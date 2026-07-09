# memory-cluster

## Purpose
Embedding-based memory clustering producing lightweight summaries, centroids, and member lists, plus a
label synthesizer for human-readable cluster names. (Distinct from `memory-clustering.ts`, which adds
active-learning sampling.)

## Public exports
- `interface ClusterSummary` / `interface ClusterOptions`.
- `async function clusterMemories(opts): Promise<ClusterSummary[]>`.
- `async function getClusterCentroid(clusterId)`, `getClusterMembers(clusterId)`.
- `function synthesizeClusterLabel(members): string` — pure label builder.

## Env vars
None directly (uses `NEXUS_EMBEDDING_DIM` via `embeddings`).

## Test file
No dedicated unit test. Referenced by `server/tests/memory-analysis.test.ts`.
