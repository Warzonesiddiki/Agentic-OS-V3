# memory-diff-sync

## Purpose
Differential sync for memories across replicas/peers. Hashes memories, computes a forward-only export diff
since a timestamp, records deletions, and applies a received diff to the local store.

## Public exports
- `interface MemoryDiffRecord` / `interface MemoryDiff` / `interface MemoryDiffApplyResult`.
- `interface MemoryDiffSourceRow` / `interface MemoryDiffStoreEntry`.
- `function hashMemory(input)` — pure content hash.
- `function computeExport(...)` — pure export computation.
- `function applyDiffToStore(...)`.
- `async function exportDiff(since): Promise<MemoryDiff>`.
- `async function recordDeletion(memoryId)`, `applyDiff(diff): Promise<MemoryDiffApplyResult>`.

## Env vars
None directly.

## Test file
No dedicated unit test. Exercised via the `routes/memory-diff-sync.ts` route handler.
