# memory-trainer

## Purpose
Lightweight ranker trainer for recall re-ranking. Implements a small convex optimizer that learns
per-item-type weights from stored relevance feedback, plus helpers to apply those weights at query time.

## Public exports
- `interface RankWeights` — weights keyed by item type (`memory`, `skill`, `note`, ...).
- `interface TrainingSample` — single `{ features, label }` training row.
- `function trainRanker(samples: TrainingSample[]): RankWeights` — fits weights.
- `function applyWeights(base: number, itemType: string, weights: RankWeights): number` — re-ranks a raw score.
- `async function recordFeedback(...)` — persists a relevance judgement.
- `async function trainFromStore(projectId: string): Promise<RankWeights>` — trains from stored feedback.

## Env vars
None directly.

## Test file
No dedicated unit test yet. Covered indirectly by `server/tests/memory-perfection.test.ts` (recall weighting).
