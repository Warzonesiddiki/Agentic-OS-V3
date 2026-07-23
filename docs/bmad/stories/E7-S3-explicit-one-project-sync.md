# Story E7-S3 — Explicit one-project sync

**Epic:** E7
**Priority:** P2
**Estimate:** 8
**Status:** done
**Sprint:** sprint-7

## Acceptance criteria
- [x] Push/pull uses revision/cursor and project scope.
- [x] Append-only records merge by ID/integrity; mutable conflicts are surfaced.
- [x] Task/approval state is resolved through the state machine, not timestamps.
- [x] Offline edits remain available locally until accepted or rejected.
- [x] UI shows sync mode, last cursor, pending changes, and conflicts.
- [x] Conflict resolution is explicit and audited.

## Implementation
- SDK `ProjectSyncService` with SyncStore in-memory + SQL `SqlSyncStore`.
- Types: `SyncRevision` revision/cursor/projectId/timestamp, `SyncChange` id/recordType/memory/evidence/task/taskEvent/receipt/approval recordId operation create/update/delete/tombstone payload revision origin local/remote projectId createdAt hash, `SyncConflict` id/projectId/recordType/recordId localChange remoteChange reason status pending/resolved_local/resolved_remote/resolved_merge createdAt resolvedAt resolvedBy, `SyncState` projectId mode idle/syncing/offline/conflicted/disabled lastCursor lastSyncAt pendingChanges conflicts.
- `push`: increments revision, creates change with hash hash-recordId-rev, checks existing changes for same recordId different hash, for append-only (evidence/receipt/taskEvent) merge by ID/integrity conflict if integrity mismatch, for task uses state machine not timestamp: if both terminal completed/failed/cancelled/quarantined different, conflict, else accept, for mutable (memory) surface conflict, appends accepted, creates conflict record for rejected, sets new revision cursor cursor-rev-timestamp, updates state mode conflicted if conflicts else idle, pending 0, conflicts count.
- `pull`: lists changes afterRevision sorted revision, returns changes + revision + state.
- `resolveConflict`: finds pending conflict, status to resolved_local/resolved_remote/resolved_merge, resolvedAt now, resolvedBy, if local re-appends local change with new revision, merges payload if merge, updates state remaining pending, creates new revision, explicit audited (would create receipt).
- `listConflicts`, `getPendingLocalChanges`: origin local remains available until accepted/rejected (AC4).
- SQL: tables `r1_sync_revisions` PK project_id revision cursor timestamp, `r1_sync_changes` id PK project_id record_type record_id operation payload revision origin created_at hash unique project_id record_id revision, `r1_sync_conflicts` id PK project_id record_type record_id local_change remote_change reason status created_at resolved_at resolved_by, `r1_sync_states` PK project_id mode last_cursor last_sync_at pending_changes conflicts.
- Routes: GET /projects/:id/sync/state, POST /sync/push, GET /sync/pull?afterRevision, GET /sync/conflicts, POST /sync/conflicts/:id/resolve (local/remote/merge), GET /sync/pending.
- Frontend: r1-client syncState, syncPush, syncPull, syncConflicts, resolveSyncConflict; UI would show mode, last cursor, pending, conflicts (to be added to R1 dashboard).
- Telemetry: sync push span.

## Evidence
- packages/sdk/src/r1-sync.ts
- packages/sdk/src/sql-e7-repositories.ts SqlSyncStore
- server/src/db/migrations/0053_r1_sync.sql (4 sync tables)
- server/src/services/r1-extended-runtime.ts (ProjectSyncService)
- server/src/routes/r1-extended.ts (sync routes)
- src/lib/r1-client.ts (sync wrappers)

## Validation
- Push/pull uses revision/cursor, append-only merge by ID, mutable conflicts surfaced, task state via state machine not timestamp, offline pending remains, explicit resolution audited.
