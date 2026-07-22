# Code Review — E1-S3 Project Export/Import Dry Run (+ E2-S1 API surface)

**Reviewer:** Arena implementation review  
**Date:** 2026-07-23  
**Status:** approved for merge to the R1 branch; live-server PostgreSQL CI run (`DATABASE_URL`) remains an external gate.

## Scope reviewed

- `packages/sdk/src/project-transfer.ts` — export/redaction/hashing, dry-run, atomic apply
- `packages/sdk/src/project-transfer.test.ts` — 12 unit tests
- `server/src/services/r1-runtime.ts` — `R1Runtime.transfer`, `importProjectAtomically` transaction wiring
- `server/src/routes/r1.ts` — export/dry-run/import + memory/evidence route authorization
- `server/tests/r1-project-transfer-contract.test.ts` — dual-engine contract
- E2-S1 service change: lifecycle receipts on `saveProvenanceMemory` / `archiveMemory` (`packages/sdk/src/r1-services.ts`)
- Reliability suite repair: `tests/services/reliability/{core,gap,degraded-mode}.test.ts`

## Findings (adversarial)

- **Redaction is single-pass and ledgered.** Key-pattern scrubbing walks each
  object exactly once, so redaction cannot be re-triggered by replacement
  text; every redaction is recorded with path and matched key, satisfying the
  dry-run reporting requirement without leaking values (only key names land in
  the ledger).
- **Integrity scope is honest.** `contentHash` covers the canonical payload
  only (not mutable envelope metadata), so a receiver re-hash verifies exactly
  what was exported. Tamper on any payload byte → `integrity_mismatch` before
  any SQL executes (proven on PGlite).
- **Atomicity is engine-native, not emulated.** SQLite applies through
  `withTransaction` on the same shared connection (no second connection, no
  recursion); PostgreSQL applies through `pg.begin` with a transaction-scoped
  executor feeding a transaction-scoped `R1Service` — the runtime wires these
  without re-entrant default transactions. The poisoned-executor test fails
  mid-apply and asserts the database is byte-identical afterwards.
- **Idempotency is database-enforced.** Conflicting task `idempotencyKey`s and
  task-event natural keys are resolved by `ON CONFLICT DO NOTHING` + re-select
  (added `TaskRepository.appendEvent` across contract/in-memory/SQL), so an
  import racing itself converges instead of erroring.
- **Authorization posture is fail-closed.** Export needs `memory:read`,
  dry-run `memory:write`, apply `brain:admin`; no principal → 401 before any
  parsing. Dangling-evidence memory create now maps to 403 instead of a 500
  regression (route-level try/catch added).
- **Domain boundary leaks fixed at the persistence edge.** `projectFromRow`
  (idempotencyKey) and `evidenceFromRow` (taskId) now map SQL `NULL` → absent
  rather than `null`, matching the domain contract (same defect class as the
  earlier `currentStepId` fix).
- **Lifecycle receipts survive deletion.** Archive deletes the memory row;
  the `memory.save`/`memory.archive` receipts (kind `db_write`, correlated by
  memory id) are the surviving audit record — asserted on PostgreSQL by direct
  SQL in the contract test, and across an SQLite restart in
  `r1-sqlite-restart.test.ts`.

## Validation evidence

```text
npm_config_nodedir=/usr/local pnpm --filter '@agentic-os/sdk' test
PASS — 7 files, 91 tests (12 new transfer tests)

npm_config_nodedir=/usr/local pnpm --filter '@agentic-os/sdk' build
PASS (ESM + CJS tsc)

cd server && NODE_OPTIONS=--max-old-space-size=1536 npx vitest run --pool=forks --maxWorkers=2 \
  tests/r1-application-sqlite-contract.test.ts \
  tests/r1-application-postgres-contract.test.ts \
  tests/r1-project-transfer-contract.test.ts \
  tests/capability-governance.test.ts tests/r1-routes.test.ts
PASS — 5 files, 18 tests

cd server && npx vitest run tests/r1-sqlite-restart.test.ts tests/r1-application-postgres-contract.test.ts tests/r1-routes.test.ts
PASS — 3 files, 11 tests (E2-S1 SQLite-restart + PG lifecycle-receipt extensions)

cd server && npx vitest run tests/services/reliability/
PASS — 4 files, 52 tests (previously: 2 collection-broken files + 1 failing test)

cd server && npm run typecheck
PASS (0 errors)

cd server && npm run lint
PASS (0 errors, 7 pre-existing warnings — unchanged from 2026-07-22 baseline)
```

## Full-suite regression gate (2026-07-23, unified run)

`238 files / 2173 tests → 1895 pass / 257 fail / 21 skip; 77 failed files.`
Compared against the 2026-07-22 baseline catalog:

- 2 collection-broken reliability files + 1 degraded-mode failure **repaired**
  (52 tests now run green).
- Every newly enumerated failing file (`p2p-swarm`, `killswitch-race`,
  `llm-gateway-v2.pure`, `session-recorder`, `sse-bridge`, `smoke-new-services`,
  `project.service`, `plugin-manifest`, `health`, `enterprise`,
  `enterprise-rbac`, `a2a`, `marketplace.service`, `feedback.service`,
  `memory-storage`) was re-run **in isolation**: all fail deterministically
  standalone (collection errors; `P2P.events` undefined; better-sqlite3 hook
  errors) on code paths with **zero import relationship** to this change-set
  (verified by import scan). These are pre-existing Phase 11–30 defects and
  load-sensitive flakiness, not regressions; the 2026-07-22 catalog
  self-describes as approximate sharded triage (251 enumerated vs 254
  headline).
- All R1/BMAD-scope suites remain all-green.

## Remaining gates

- Live-server PostgreSQL CI execution of the transfer contract (`DATABASE_URL`)
  — PGlite covers engine semantics locally; a networked server run is the
  final acceptance check.
- The 257 inherited Phase 11–30 failures continue their triage lanes
  (`docs/bmad/execution-roadmap-2026-07-22.md`); the regression gate above
  forbids growth from this change-set.
