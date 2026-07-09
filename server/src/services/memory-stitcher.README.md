# memory-stitcher

## Purpose
Session-memory stitching: merges related session memories into a coherent narrative using embedding
similarity and shared-entity overlap (thresholds exported as constants).

## Public exports
- `const STITCH_SIMILARITY_THRESHOLD = 0.85`.
- `const STITCH_MIN_SHARED_ENTITIES = 2`.
- `interface StitchResult`.
- `async function stitchSessionMemories(sessionId): Promise<StitchResult>`.

## Env vars
None directly (uses `embeddings`).

## Test file
No dedicated unit test. Referenced by `server/tests/memory-analysis.test.ts` (stitcher threshold checks).
