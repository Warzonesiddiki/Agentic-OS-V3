# Adversarial Code Review — E4-S1 PostgreSQL closure + baseline fixes (2026-07-22)

**Scope:** `packages/sdk/src/sql-repositories.ts` (+ test),
`server/src/services/dlp-scanner.ts`,
`server/tests/r1-application-postgres-contract.test.ts`,
`server/package.json` (`@electric-sql/pglite` devDependency).

## Verdict: APPROVE — findings resolved in-line; no open blockers.

## Review questions posed & answers

1. **Is PGlite a legitimate PostgreSQL for this acceptance criterion?**
   Yes. PGlite is the PostgreSQL 17 source compiled to WASM — real planner,
   JSONB, CHECK and PL/pgSQL trigger semantics; it is not an emulation layer
   (unlike pg-mem). The contract additionally auto-targets a live server via
   `DATABASE_URL`, so CI/production verification uses the identical test file.
2. **Could the timestamp normalization change SQLite behavior?**
   No — `isoTimestamp()` passes strings through unchanged and only converts
   `Date` instances (PG driver shape). All pre-existing SQLite contract tests
   re-run green. Malformed non-string/non-Date values fail loudly via
   `SqlRepositoryError` instead of leaking `undefined`.
3. **Could the DLP rewrite hide findings or drop redactions?**
   Redaction now builds from original-text spans; overlapping spans are
   resolved deterministically (earliest start, longest span wins). The SecA
   battery (17 tests — false-negative battery, benign-input battery, redact
   fail-closed) passes in 9 ms; previously the file never finished.
4. **Does the PG contract test touch production/shared state?**
   No. PGlite runs in a tmp data dir (removed after each test); the server
   path only uses rows with per-run random UUIDs/text keys; no fixture relies
   on pre-existing data. The SQLite sidecar created by importing the auth
   context is pointed at a scratch path.
5. **Migrations under test are the verbatim production files?**
   Yes — read from `server/src/db/migrations/0049|0050|0051*.sql` (PG
   variants) and applied unmodified, preceded only by the base `projects`
   DDL mirrored from the production Drizzle schema (required because 0049
   ALTERs `projects`, exactly as in a real deployment).
6. **Any credential/log leakage in the new test?**
   None — synthetic UUIDs and inert fixture values only; receipt payload
   'opaque-data' is asserted only for presence, never logged.
7. **Zod/runtime contract risks?**
   Governance rows re-parse through `GovernedCapabilitySchema` /
   `CapabilityPolicySchema` on read (store behavior, unchanged); API contract
   asserts 201/200/401 status codes and deterministic decisions
   (allow→require_approval path, default-deny, scope-escalation deny).

## Residual risks (accepted, tracked)

- Live-PG run is pending CI provisioning of `DATABASE_URL` (roadmap Phase R1);
  PGlite run is the interim gate.
- Rust workspace remains unverifiable here (no cargo).
