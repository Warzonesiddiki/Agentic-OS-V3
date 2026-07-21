# Code Review — E0-S3 Repository/service boundaries

**Reviewer:** Senior Developer / adversarial review  
**Date:** 2026-07-21  
**Verdict:** Approved

## Scope

- Shared repository interfaces and service layer
- In-memory local adapter
- SQL/PostgreSQL adapter and R1 migration
- Server runtime composition and R1 routes
- SDK and server contract tests

## Review results

- Routes validate payloads and delegate mutations through `R1Service`.
- Repository interfaces are persistence-neutral and cover all R1 domains.
- Local and SQL adapters implement the same `R1Repositories` aggregate.
- Task idempotency and project isolation are enforced in both service/adapter paths.
- Evidence and receipts are append-only at both service and database-trigger layers.
- SQL uses positional parameters; no user input is interpolated into statements.
- Unknown service failures are mapped to safe stable API errors.
- The server runtime requires an injected adapter and has no implicit production memory fallback.

## Validation

```text
SDK typecheck                         PASS
SDK contract tests                    PASS — 69 tests
SDK build                             PASS — ESM and CJS
Server R1 runtime/route tests         PASS — 3 tests
SQL migration lint/diff validation    PASS
```

The repository-wide server gate continues to contain pre-existing failures documented in the baseline; those are outside this story's R1 boundary and remain tracked separately.

## Decision

E0-S3 meets its story acceptance criteria and is approved for `done`. Applying migration `0049_r1_contracts.sql` remains a deployment prerequisite and must be verified in the production readiness gate.
