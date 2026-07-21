# Code Review — E3-S1 Durable Tasks with Idempotency

**Reviewer:** Arena implementation review  
**Date:** 2026-07-21  
**Status:** SQLite/local implementation approved; PostgreSQL execution pending.

## Controls reviewed

- Task creation persists the submitting principal, explicit agent, goal, requested capabilities, policy version, opaque input reference, idempotency key, correlation ID, and optional current-step reference.
- `(project_id, idempotency_key)` is the database uniqueness boundary. The conflict-safe insert returns the original record rather than replacing it.
- SQLite and PostgreSQL migration `0050` creates an immutable task-event table and a database trigger that records the committed `created` event only after an insert succeeds.
- R1 routes are mounted in the production API tree at `/api/v1/r1` using the application SQL executor.
- Reads require `memory:read`; mutations require `memory:write`. Submission `principalId` must equal the authenticated principal, preventing caller-selected identity impersonation.
- Missing authentication now produces an explicit HTTP 401 and missing scope a 403 rather than an accidental internal-error response.

## Validation

```text
npm --prefix packages/sdk run typecheck
PASS

cd server && npm run typecheck
PASS

cd server && npm_config_nodedir=/usr/local npm rebuild better-sqlite3 --foreground-scripts \
  && npx vitest run tests/r1-routes.test.ts tests/r1-application-sqlite-contract.test.ts tests/r1-sqlite-restart.test.ts
PASS — 3 files, 8 tests
```

## Remaining gate

`DATABASE_URL` is absent in this checkout. PostgreSQL migration execution, trigger verification, and application-client contract testing are not claimed and remain required before final release closure.
