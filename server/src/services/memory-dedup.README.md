# memory-dedup

## Purpose
Duplicate detection and merge previewing for memories. Pure helpers for similarity comparison, token
overlap, and similarity clustering, plus an async `deduplicateMemories` maintenance job.

## Public exports
- `type Memory` (re-exported from `./memory-hierarchy.js`).
- `const DEDUP_SIMILARITY_THRESHOLD = 0.92`.
- `interface MemoryLike` / `interface MergePreview` / `interface DedupResult`.
- `function previewMerge(a, b): MergePreview` — pure merge preview.
- `function findDuplicatePairs(...)`.
- `async function deduplicateMemories(...): Promise<DedupResult>`.
- `function tokenOverlap(a, b): number` — pure.
- `function clusterBySimilarity(...)`.

## Env vars
None directly.

## Test file
No dedicated unit test. Referenced by `server/tests/memory-analysis.test.ts` (dedup helpers).
