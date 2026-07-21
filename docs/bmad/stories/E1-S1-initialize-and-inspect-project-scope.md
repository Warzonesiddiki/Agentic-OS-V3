# Story E1-S1 — Initialize and inspect a project scope

**Epic:** E1 — Project and local-first foundation  
**Priority:** P0  
**Estimate:** 3 points  
**Sprint:** sprint-1  
**Status:** done  
**Dependencies:** E0-S2, E0-S3

## Acceptance criteria

- [x] Initialize a project through the service boundary.
- [x] Retry initialization with the same idempotency key without creating a duplicate.
- [x] Inspect project mode and health status.
- [x] Prevent task access across project scopes.
- [x] Verify against the migrated SQLite/local persistent database.

## Evidence

- `packages/sdk/src/r1-services.ts`
- `packages/sdk/src/r1-services.test.ts`
- `packages/sdk/src/in-memory-repositories.test.ts`
- `server/src/routes/r1.ts`
- `server/tests/r1-routes.test.ts`
- `server/src/db/migrations/0049_r1_contracts.sql`

## Validation

- SDK tests: 69 passing
- R1 server tests: 3 passing
- SQLite migration execution validated with schema, foreign-key isolation, idempotency, and append-only trigger checks.
- PostgreSQL migration execution remains a release-environment check.
