# Story E5-S1 — Append-only audit and action receipts

**Epic:** E5 — Evidence and observability  
**Priority:** P0  
**Sprint:** sprint-2  
**Status:** in_progress

## Acceptance criteria

- [x] Define a typed action-receipt contract with project, correlation, actor, decision, kind, payload, and timestamp.
- [x] Persist receipts in PostgreSQL and SQLite migrations with project indexes and state checks.
- [x] Reject receipt updates and deletes at the database boundary.
- [x] Expose append and project-scoped task-list operations through the repository contract.
- [x] Route receipt writes through the R1 service boundary with project-scope enforcement.
- [x] Prevent raw persistence errors from becoming public service errors.
- [ ] Execute PostgreSQL and SQLite adapter tests in the native dependency environment (SQLite passed; PostgreSQL requires a configured `DATABASE_URL`).

## Threat controls

- SQL parameters are used for every receipt value.
- Project IDs are checked before service writes.
- Append-only triggers protect against direct database mutation.
- Receipt payloads remain opaque data and are never interpreted as executable content.
- Database-generated constraint failures remain internal to the persistence boundary.

## Evidence

- `packages/sdk/src/r1-types.ts`
- `packages/sdk/src/repositories.ts`
- `packages/sdk/src/sql-repositories.ts`
- `packages/sdk/src/r1-services.ts`
- `packages/sdk/src/r1-services.test.ts`
- `server/src/db/migrations/0049_r1_contracts.sql`
- `server/src/db/migrations/0049_r1_contracts.sqlite.sql`
- `docs/bmad/specs/E1-S2-local-persistence-technical-spec.md`

## Remaining validation

Run the SDK and server test suites after installing workspace dependencies and rebuilding native SQLite modules. Do not mark this story done before those runs and adversarial review are recorded.
