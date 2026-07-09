# memory-backup

## Purpose
Memory backup & restore. Serialises memories (+ attachments) to a JSON snapshot, restores from a snapshot,
and prunes old backups by retention window (`daily | weekly | monthly`). (Lethe area.)

## Public exports
- `type Retention` — `'daily' | 'weekly' | 'monthly'`.
- `interface SerializedMemory` / `interface SerializedAttachment` / `interface MemoryBackupSnapshot`.
- `interface MemoryBackupResult` / `interface RestoreResult`.
- `async function backupMemories(opts?): Promise<MemoryBackupResult>`.
- `async function restoreMemories(snapshotOrPath): Promise<RestoreResult>`.
- `async function pruneBackups(retention: Retention): Promise<number>`.

## Env vars
None directly (backup dir is a constant).

## Test file
No dedicated unit test. Exercised via the `routes/memory-backup.ts` route handler.
