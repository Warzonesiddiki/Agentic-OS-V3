# Story E1-S2 — Implement local persistence adapter

**Epic:** E1 — Project and local-first foundation  
**Priority:** P0  
**Estimate:** 5 points  
**Sprint:** sprint-2  
**Status:** in_progress  
**Dependencies:** E0-S2, E1-S1

## Acceptance criteria

- [x] Define a local persistence schema for R1 projects, tasks, steps, approvals, memories, evidence, capabilities, and receipts.
- [x] Provide a repository adapter with project-scoped queries and task idempotency.
- [x] Enforce append-only evidence and receipt behavior at the database layer.
- [x] Run adapter contract tests against a file-backed SQLite database through the application database client.
- [x] Verify restart/reopen persistence through the actual application SQLite client.

## Evidence

- `server/src/db/migrations/0049_r1_contracts.sqlite.sql`
- `packages/sdk/src/sql-repositories.ts`
- `packages/sdk/src/in-memory-repositories.ts`
- `packages/sdk/src/sql-repositories.test.ts`

## Validation

- SQLite migration executed against Python SQLite 3.40.1 in-memory database.
- Schema, foreign-key isolation, idempotency, and append-only trigger checks passed.
- File-backed application-client contract and restart checks pass with `better-sqlite3` built locally from the installed Node headers (`npm_config_nodedir=/usr/local`).
- PostgreSQL adapter execution remains pending because this checkout has no `DATABASE_URL`; see `docs/bmad/reviews/E1-S2-code-review.md`.
