# memory-batch

## Purpose
Bulk memory operations: plan and apply a batch of create/update/delete ops atomically, plus a
standalone `bulkDelete` helper. Validates the op plan before applying.

## Public exports
- `type BatchOp` — discriminated union of batch operations.
- `interface BatchResult` — per-op outcome summary.
- `function planBatch(ops: BatchOp[]): { index: number; message: string }[]` — dry-run validation.
- `async function applyBatch(...): Promise<BatchResult>` — executes a validated batch.
- `async function bulkDelete(ids: string[]): Promise<number>` — count of deleted memories.

## Env vars
None directly.

## Test file
No dedicated unit test. Exercised via the `routes/memory-batch.ts` route handler.
