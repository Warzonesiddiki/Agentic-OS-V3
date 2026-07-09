# 0002 – Database Choice: PostgreSQL + SQLite Dual Support

**Status:** Final
**Author:** Atlas
**Date:** 2026-07-01

## Context

The NEXUS agentic OS needs persistent storage for brain memories, skills,
notes, audit logs, agent state, pipeline runs, and telemetry. The system
targets two deployment profiles:

- **Development / single-user desktop (Tauri wrapper):** zero-config, no
  external services, embedded database.
- **Production / multi-user server:** connection pooling, concurrent writers,
  pgvector for embeddings, and operational tooling.

A single backend that works poorly in either profile is unacceptable. The
codebase already had a `better-sqlite3` dependency (from the browser build's
previous iteration) and a partial `postgres` driver import.

## Decision

### Dual-backend architecture

The application auto-detects the backend at module load time by inspecting
`DATABASE_URL`. If it begins with `postgres://` or `postgresql://`, the
PostgreSQL client initializes; otherwise, SQLite is used.

```typescript
const rawUrl = (getEnv().DATABASE_URL || '').trim();
export const isSqlite = !(rawUrl.startsWith('postgres://') || rawUrl.startsWith('postgresql://'));
```

Both backends are served from a single module (`server/src/db/client.ts`)
that exports a unified `db` handle and a `withTransaction()` helper. The
correct schema tables are re-exported automatically to keep application code
backend-agnostic.

### PostgreSQL (`client-postgres.ts`)

- Driver: `postgres` (pglite) with `drizzle-orm/postgres-js`.
- Pool: up to 20 connections, 20s idle timeout, 10s connect timeout.
- Statement-level timeout via `statement_timeout` (configurable,
  default 30s).
- Prepared statements disabled by default (PgBouncer transaction-mode
  compatibility).
- Lazy singleton via Proxy — first query creates the pool; imports that
  never hit the DB (CLI help, tests) do not crash.

### SQLite (`client-sqlite.ts`)

- Driver: `better-sqlite3` with `drizzle-orm/better-sqlite3`.
- Database file: `./agentic-os.db` in the project root.
- WAL journal mode for concurrent read performance.
- Foreign key enforcement enabled at the pragma level.
- FTS5 virtual tables for full-text search on memories, skills, and notes,
  with triggers keeping indexes synchronized.
- Lazy singleton via Proxy (same pattern as PostgreSQL client).
- Write serialization via `async-mutex` to prevent "cannot start a
  transaction within a transaction" errors from the event loop
  interleaving `BEGIN`/`COMMIT` across async callbacks.

### Unified transaction helper

`withTransaction()` abstracts the backend differences:

| Concern               | SQLite                                 | PostgreSQL                |
| --------------------- | -------------------------------------- | ------------------------- |
| Serialization         | `async-mutex` (per-process)            | Native MVCC               |
| Transaction lifecycle | Manual `BEGIN` / `COMMIT` / `ROLLBACK` | `db.transaction()`        |
| Timeout               | 30s timer via `Promise.race()`         | 30s + `statement_timeout` |
| `SQLITE_BUSY` retry   | Exponential backoff, 5 attempts        | Not applicable            |

### Schema divergence

PostgreSQL and SQLite use separate schema files (`schema.ts` vs.
`schema-sqlite.ts`) due to:

- Different vector extension support (`pgvector` vs. no SQLite vector).
- Different default expression syntax.
- Different enum representations (native PG enums vs. text check
  constraints in SQLite).

Migrations are written as raw SQL and managed by Drizzle Kit against
the PostgreSQL schema. The SQLite schema is code-genned to match.

## Consequences

Positive:

- Development requires zero external services — `npm start` and the DB
  is ready.
- Production deployments get full PostgreSQL concurrency, pgvector
  embeddings, and operational monitoring.
- Application code rarely needs `if (isSqlite)` branches — the
  abstraction holds for >95% of queries.
- Unit tests use SQLite (fast, no daemon), integration tests target
  PostgreSQL.

Negative:

- Dual schema files must be kept in sync — every column change touches
  two files.
- Some PostgreSQL features (partial indexes, `RETURNING *` with certain
  joins) have no SQLite equivalent and force schema-level workarounds.
- FTS5 is compiled into better-sqlite3 by default but not guaranteed on
  all platforms — the code degrades gracefully but silently loses search
  quality.
- The `async-mutex` serialization limits SQLite write throughput to one
  concurrent writer regardless of WAL-mode readers.
