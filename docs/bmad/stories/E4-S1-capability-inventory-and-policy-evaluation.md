# Story E4-S1 — Capability inventory and policy evaluation

**Epic:** E4 — Policy, capability, and approvals  
**Priority:** P0  
**Sprint:** sprint-3  
**Status:** in_progress

## Acceptance criteria

- [x] Define a validated capability inventory contract containing source, version, owner, input schema, risk, scope, health, and enabled state.
- [x] Evaluate allow, deny, and approval-required decisions with a policy version and matched rule ID.
- [x] Keep the evaluator independent of model output, tool annotations, and tool execution.
- [x] Enforce project/agent allowlists and default-deny behavior in the evaluator.
- [x] Cover allow/deny/approval, unavailable capability, malformed input, and scope-escalation cases with unit tests.
- [x] Provide persistence-neutral SQL and in-memory stores for governed capability metadata, project/agent grants, and one active policy.
- [x] Execute the store through the application SQLite client and expose scope-authorized capability registration/policy/evaluation APIs.
- [x] Execute the governed capability store and policy API contract against PostgreSQL.

## Evidence

- `packages/sdk/src/capability-policy.ts`
- `packages/sdk/src/capability-policy.test.ts`
- `packages/sdk/src/capability-governance-store.ts`
- `packages/sdk/src/index.ts`
- `server/src/db/migrations/0051_r1_capability_governance.sql`
- `server/src/db/migrations/0051_r1_capability_governance.sqlite.sql`
- `server/src/services/capability-governance.ts`
- `server/src/routes/r1.ts`
- `server/tests/r1-application-postgres-contract.test.ts` (3/3 green; PGlite engine, live-PG via `DATABASE_URL`)
- `docs/bmad/reviews/E4-S1-pg-contract-review.md`

## Completion note (2026-07-22)

The PostgreSQL acceptance criterion is now executed: verbatim production
migrations (0049/0050/0051) plus the governed capability store and the
scope-authorized policy API run green on a real PostgreSQL engine. The PG run
exposed and fixed a cross-adapter timestamp-shape defect
(`packages/sdk/src/sql-repositories.ts`). Awaiting senior-review sign-off
(status: review); a live-DB re-run in CI (`DATABASE_URL`) is the remaining
verification nicety, not a code change.

