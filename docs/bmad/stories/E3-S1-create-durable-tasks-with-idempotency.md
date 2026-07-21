# Story E3-S1 — Create durable tasks with idempotency

**Epic:** E3 — Durable task execution  
**Priority:** P0  
**Estimate:** 5 points  
**Sprint:** sprint-1  
**Status:** in_progress  
**Dependencies:** E0-S2, E0-S3, E1-S1

## Acceptance criteria

- [x] Store the project, principal, agent, goal, capabilities, policy version, input reference, and idempotency key for every task.
- [x] Return the originally persisted task for repeated project/idempotency-key submissions.
- [x] Start tasks in `queued` and record a committed creation event.
- [x] Provide scoped task list/detail APIs with state, current step, timestamps, and correlation IDs.
- [x] Reject unauthenticated, cross-project, and principal-impersonating task requests before exposing or mutating task state.

## Implementation plan

1. Extend the shared task contract and SQL/local schema with durable execution metadata.
2. Add a follow-up R1 migration for already-created project databases.
3. Record task creation in an append-only task-event table at the database boundary.
4. Expose project-scoped task listing and task event reads through the repository, service, and governed routes.
5. Add contract coverage for idempotency, isolation, creation events, and restart behavior.

## Completion gate

SQLite application-client contract tests pass, including idempotency, a database-triggered committed creation event, restart persistence, and scoped HTTP route controls. PostgreSQL migration/adapter execution remains a release-environment gate and requires `DATABASE_URL`.
