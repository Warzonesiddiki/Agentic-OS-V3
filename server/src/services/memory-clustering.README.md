# memory-clustering

## Purpose
Clusters memories into semantic groups for organisation, dedupe-support, and active-learning candidate
selection. Provides embedding-based clustering, cluster summaries, and an active-learning sampler that
surfaces the most informative memories to label next.

## Public exports
- `interface ClusterOptions` — clustering parameters (projectId, algorithm hints, limits).
- `interface ClusterResult` — a single cluster with member ids + centroid.
- `interface ClusterSummary` — lightweight per-cluster summary for listing.
- `interface ActiveLearningCandidate` — a memory flagged for labelling.
- `function activeLearningSample(...): ActiveLearningCandidate[]` — selects candidates.
- `async function clusterMemories(options?): Promise<ClusterResult[]>`.
- `async function getClusters(projectId?): Promise<ClusterSummary[]>`.

## Env vars
None directly (uses `NEXUS_EMBEDDING_DIM` indirectly via `embeddings`).

## Test file
No dedicated unit test. Referenced by `server/tests/memory-analysis.test.ts` (clustering helper usage).
