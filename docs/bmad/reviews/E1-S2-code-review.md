# Code Review — E1-S2 Local Persistence Adapter

**Reviewer:** Arena implementation review  
**Date:** 2026-07-21  
**Status:** approved for the SQLite application-client scope; PostgreSQL validation remains an external gate.

## Scope reviewed

- Application-owned, parameterized SQL executor in `server/src/db/client.ts`
- File-path configuration through validated `NEXUS_SQLITE_PATH`
- SQLite R1 schema constraints and append-only triggers
- SQL repository row normalization across SQLite and PostgreSQL result formats
- File-backed restart and isolation behavior

## Findings

- The adapter keeps `$n` SQL parameters in repository code and translates only at the SQLite driver boundary; values are never interpolated into SQL.
- SQLite connections enable foreign keys and use the validated, process-owned database path.
- SQLite `TEXT` JSON and integer booleans are normalized before returning domain objects, while PostgreSQL-native JSON/booleans retain the same contract.
- Duplicate `(project_id, idempotency_key)` task submissions return the persisted original task.
- Cross-project task reads fail with `PROJECT_SCOPE_VIOLATION` rather than leaking a task.
- Evidence and receipts are rejected by database triggers when direct update/delete SQL bypasses repositories.
- Reopening the real application database client reads committed project and task data from the same file.

## Validation evidence

```text
npm --prefix packages/sdk run typecheck
PASS

cd packages/sdk && npx vitest run src/sql-repositories.test.ts src/r1-services.test.ts
PASS — 2 files, 9 tests

cd server && npm run typecheck
PASS

cd server && npm_config_nodedir=/usr/local npm rebuild better-sqlite3 --foreground-scripts \
  && npx vitest run tests/r1-application-sqlite-contract.test.ts tests/r1-sqlite-restart.test.ts
PASS — 2 files, 3 tests
```

The native package's prebuilt download could not pass the environment TLS certificate check. The test environment has matching local Node headers, so setting `npm_config_nodedir=/usr/local` builds `better-sqlite3` locally; no insecure TLS bypass was used.

## Remaining gate

`DATABASE_URL` is not configured in this checkout, so the PostgreSQL migration and adapter path have **not** been run. The story must remain `in_progress` until that environment is available and the same repository contract suite has been executed against PostgreSQL.
