# Migration Down-Scripts (rollback path)

**Purpose:** Gate-0 blocker B3 requires a forward/rollback/restore matrix for migrations
0049–0054. The runtime migrator (`drizzle-kit migrate` via `server/src/setup.ts`) is
forward-only and never reads this directory — these scripts are **operational rollback
artifacts** applied manually during the WS3 drill (blocker B3) or an emergency rollback.

## Convention

- One pair per forward step: `NNNN_name.down.sql` (PostgreSQL) and
  `NNNN_name.down.sqlite.sql` (SQLite), reversing `../NNNN_name(.sqlite).sql` exactly.
- Child objects first; idempotent (`IF EXISTS`) throughout.
- **Data is not preserved**: rolling back an additive R1 slice discards R1-only rows.
  Always take a backup first (`pg_dump` / file copy of the SQLite database).

## Drill procedure (per engine: PostgreSQL 15+/pgvector, SQLite/PGlite)

1. Backup: capture pre-state (dump or file copy) and record its hash in the ledger.
2. Forward: apply 0049→0054 in order via psql/better-sqlite3 `exec`.
3. Rollback: apply `down/0054…down` → `down/0049…down` in reverse order.
4. Restore: re-apply the backup, verify integrity checks pass.
5. Retain per-step command + exit-code transcripts under `docs/bmad/releases/evidence/`.

## Status

| Step | PostgreSQL down | SQLite down |
|---|---|---|
| 0052 r1_extended | ✅ authored | ✅ authored |
| 0053 r1_sync | ✅ authored | ✅ authored |
| 0054 r1_effect_claims | ✅ authored | ✅ authored |
| 0049, 0050, 0051 | ⏳ queued (WS3) | ⏳ queued (WS3) |
