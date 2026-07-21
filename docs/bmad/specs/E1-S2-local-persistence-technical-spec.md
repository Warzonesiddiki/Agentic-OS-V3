# E1-S2 Local Persistence Adapter — Technical Specification

**Release:** R1 governed agent workbench  
**Epic:** E1 — Project and local-first foundation  
**Story:** E1-S2 — Implement local persistence adapter  
**Status:** Implementation in progress  
**Specification date:** 2026-07-21

## 1. Objective

Provide a persistence-neutral, SQL-backed repository adapter for the R1 domain. The adapter must support local SQLite and shared PostgreSQL drivers through an injected executor while preserving identical domain behavior:

- project isolation;
- durable projects, tasks, steps, approvals, memories, capabilities, evidence, and receipts;
- per-project task idempotency;
- append-only evidence and receipt history;
- typed errors at the repository boundary; and
- restart-safe local persistence.

The adapter must not expose a database client or driver-specific types to domain services.

## 2. Scope

### Included

- `R1Repositories` implementation in `packages/sdk/src/sql-repositories.ts`.
- SQLite and PostgreSQL migration compatibility for R1 tables.
- Parameterized SQL queries.
- Project-scoped access checks.
- Atomic task idempotency.
- Repository contract tests and file-backed restart verification.

### Excluded

- HTTP authentication and authorization middleware.
- Cross-project synchronization.
- Export/import workflows covered by E1-S3.
- Recall ranking and embedding generation covered by E2 stories.
- Driver connection pooling and transaction orchestration owned by application bootstrap.

## 3. Boundary Contracts

### 3.1 Executor

```ts
interface SqlExecutor {
  query<T extends object>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<readonly T[]>;
}
```

The executor owns connection lifecycle, transaction scope, driver adaptation, and retry policy. Repository code only submits parameterized statements and consumes returned rows.

### 3.2 Repository errors

- `NOT_FOUND`: requested resource does not exist or an update affected no row.
- `ALREADY_EXISTS`: creation failed without a returned row because of a persistence conflict.
- `PROJECT_SCOPE_VIOLATION`: resource exists but belongs to another project.

Unexpected driver errors must not be converted into misleading domain errors.

## 4. Persistence Invariants

1. Every project-scoped table contains `project_id` and foreign-keys to `projects`.
2. `r1_tasks(project_id, idempotency_key)` is unique.
3. Task creation uses an atomic conflict-safe upsert and returns the already persisted task for a duplicate key.
4. Evidence and receipts have no update or delete repository operation.
5. Database triggers reject updates and deletes against append-only evidence and receipt tables.
6. Foreign keys are enabled for every SQLite connection.
7. State columns use database checks matching the shared R1 state unions.
8. Repository methods never return `undefined`; absent rows are `null`, and mutation failures are typed errors.
9. All timestamps are supplied as ISO-8601 values and persisted without implicit local-time conversion.
10. JSON values are serialized explicitly on write and normalized by the driver adapter on read.

## 5. Repository Behavior

### Projects

- `get` returns a project or `null`.
- `list` returns deterministic creation order.
- `create` persists all project fields.
- `update` updates mutable fields only and fails with `NOT_FOUND` when absent.

### Tasks

- `get` verifies project ownership.
- `list` filters by project.
- `create` atomically enforces per-project idempotency.
- `update` requires both task ID and project ID.
- `listSteps` first verifies task ownership.
- `saveStep` performs an idempotent step upsert by step ID.

### Memories

- `get` verifies project ownership.
- `list` filters by project.
- `save` upserts mutable memory content and metadata.
- `archive` requires project ownership before deletion.

### Approvals

- Reads and updates are project-scoped.
- Pending queries return only `pending` approvals.
- State transitions are validated by the service layer and constrained by the schema.

### Capabilities

- Capabilities are globally addressable by ID.
- Save updates mutable policy metadata while retaining identity/source semantics.

### Evidence and receipts

- Append operations return the persisted row.
- List operations are project-scoped and deterministic.
- Historical records cannot be updated or deleted through the repository or database.

## 6. Security Requirements

- No user-controlled value may be concatenated into SQL.
- Project ownership must be checked before returning resource data.
- Raw SQL/driver messages must not be returned by HTTP handlers.
- Payload size limits belong at request validation boundaries.
- JSON metadata must be treated as data, never executable content.
- Migration triggers and foreign-key enforcement must be enabled in local deployments.

## 7. Failure and Recovery Requirements

- A duplicate task submission returns the original task, including its original state and correlation ID.
- A failed mutation does not produce a success response without a returned row.
- A process restart preserves committed project and task state.
- An interrupted transaction is rolled back by the owning executor.
- Missing resources remain distinguishable from cross-project resources.

## 8. Test Plan

### Unit tests

- Repository factory exposes every required repository.
- Queries are parameterized.
- Missing rows return `null`.
- Duplicate idempotency returns the original task.
- Cross-project task and memory access raises `PROJECT_SCOPE_VIOLATION`.
- Updates against missing rows raise `NOT_FOUND`.
- Append operations return persisted rows.

### Integration tests

- Apply the SQLite migration to a file-backed database.
- Create a project and task.
- Close the connection.
- Reopen the database and verify both records.
- Verify foreign-key isolation and append-only triggers.
- Verify duplicate task submissions do not create a second row.

### Acceptance gate

The story is not complete until the adapter contract suite passes, the restart test passes, the true TypeScript gate is clean, and adversarial review evidence is recorded.

## 9. Operational Notes

- The application integration layer must execute migrations before constructing repositories.
- The executor should be transaction-aware for multi-repository workflows.
- Local SQLite must use a file path for durable mode; in-memory mode is test-only.
- Database paths and connection strings must come from validated configuration, never request input.

## 10. Completion Evidence

Required evidence before marking E1-S2 `done`:

- implementation diff;
- adapter unit-test output;
- SQLite restart-test output;
- migration/trigger verification output;
- fresh TypeScript validation output;
- adversarial review record;
- updated story acceptance checklist and sprint status.
