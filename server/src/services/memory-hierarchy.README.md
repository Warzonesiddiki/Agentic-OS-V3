# memory-hierarchy

## Purpose
Memory hierarchy / tiered memory (STM → MTM → LTM). Provides compression passes that promote short-term
memories into medium/long-term stores, derives child memories, and pure helpers for vectors, cosine
similarity, and tag extraction.

## Public exports
- `type MemoryTier` — `'STM' | 'MTM' | 'LTM'`.
- `type Memory` — re-export of the `memories` select model.
- `function toVector(embedding: unknown): number[] | null` — pure normaliser.
- `function cosineSimilarity(a, b): number` — pure.
- `function tagsOf(m: Memory): string[]` — pure.
- `interface DerivedMemoryInput` / `interface MemoryHierarchyResult`.
- `async function createDerivedMemory(input): Promise<string>`.
- `async function compressStmToMtm(): Promise<MemoryHierarchyResult>`.
- `async function compressMtmToLtm(): Promise<MemoryHierarchyResult>`.
- `async function runMemoryHierarchyCycle(): Promise<MemoryHierarchyResult>`.

## Env vars
None directly (uses `embeddings` + `NEXUS_EMBEDDING_DIM`).

## Test file
No dedicated unit test. Exercised via the `routes/memory-hierarchy.ts` route handler.
