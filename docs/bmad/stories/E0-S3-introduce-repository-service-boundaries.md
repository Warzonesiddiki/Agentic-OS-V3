# Story E0-S3 — Introduce repository/service boundaries

**Epic:** E0 — Baseline and domain contracts  
**Priority:** P0  
**Estimate:** 5 points  
**Sprint:** sprint-1  
**Status:** done  
**Dependencies:** E0-S2 (done)

## User story

As a maintainer, I want routes and UI adapters to depend on domain services/repositories rather than raw database details so that local and shared implementations can conform to the same behavior.

## Acceptance criteria

- [ ] Define repository interfaces for projects, memories, tasks, approvals, and evidence.
- [ ] Move at least the R1 command/query paths behind service functions.
- [ ] Route modules contain no inline domain mutation or direct database queries.
- [ ] Local and PostgreSQL adapters can be substituted in contract tests.
- [ ] Errors map to stable domain/API codes with safe messages.

## Work completed this pass

- Added persistence-neutral SDK contracts in `packages/sdk/src/repositories.ts` for projects, memories, tasks/steps, approvals, evidence, capabilities, and receipts.
- Added stable `RepositoryError` codes for missing resources, duplicates, and cross-project scope violations.
- Added deterministic `InMemoryR1Repositories` adapter for offline development and contract tests.
- Enforced per-project task idempotency and project-scoped task reads in the local adapter.
- Exported the contracts and local adapter from `packages/sdk/src/index.ts`.
- Added adapter tests for idempotency, project isolation, and stable errors.
- Added `R1Service` command/query functions for project initialization, task creation/transition, approval decisions, and evidence/receipt queries.
- Added stable service errors and service-level project-scope enforcement.
- Added safe API error mapping that prevents internal error leakage.
- Added service tests for task transitions, missing resources, cross-project evidence rejection, error mapping, idempotent project initialization, and project inspection.
- Added server composition root `server/src/services/r1-runtime.ts` so routes can receive the governed service with an injected adapter.
- Added `server/src/routes/r1.ts` with project/task handlers that validate at the boundary and delegate to the service.
- Added PostgreSQL migration `server/src/db/migrations/0049_r1_contracts.sql` for durable R1 tasks, steps, approvals, evidence, and append-only receipts.
- Added complete injected SQL-backed repository adapter in `packages/sdk/src/sql-repositories.ts` for projects, memories, tasks/steps, approvals, evidence, capabilities, and append-only receipts.
- The adapter uses parameterized SQL and cannot silently fall back to memory.
- Added server runtime and route coverage in `server/tests/r1-runtime.test.ts` and `server/tests/r1-routes.test.ts`.
- Verified SDK typecheck and contract tests.

## Remaining work

- Add service functions and adapters without coupling route handlers to database clients.
- Add repository contract tests and stable error mapping.
- Run server validation after the service boundary is wired.

## Validation evidence

- `corepack pnpm --filter @agentic-os/sdk typecheck` — PASS
- `corepack pnpm --filter @agentic-os/sdk test` — PASS (67 tests)
- `corepack pnpm --filter @agentic-os/sdk build` — PASS (ESM and CJS)
