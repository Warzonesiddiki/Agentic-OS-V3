# memory-cold-storage

## Purpose
Tiers cold (rarely accessed) memories out of the hot store into cold storage and transparently recalls them
on demand. A scheduler migration job runs periodically. (Lethe area.)

## Public exports
- `interface ColdStorageReport` / `interface MemorySummary` / `interface RecallResult`.
- `async function runColdStorageMigration(opts?): Promise<ColdStorageReport>` — one migration pass.
- `async function recallWithColdStorage(...)` — recall that promotes cold items back.
- `async function scheduleColdStorageMigration(actor): Promise<void>` — enqueue a scheduled run.
- `function initColdStorageScheduler(): void` — registers the periodic migration.

## Env vars
None directly.

## Test file
No dedicated unit test. Exercised via the `routes/memory-cold-storage.ts` route handler.
