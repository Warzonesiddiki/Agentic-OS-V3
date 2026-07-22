# Execution Roadmap — 2026-07-22 (BMAD Phase 4, R1-governed-agent-workbench)

Analyzed end-to-end on 2026-07-22. This roadmap is grounded in the fresh
verified baseline (`baseline-2026-07-22.md`), the BMAD sprint status, and a
full code review pass. Completed items are checked box `[x]` with evidence.

## A. What is actually wrong (findings, ranked by severity)

1. **FIXED — Production hang in DLP scanner (critical).** Any payload
   matching a DLP pattern put `scan()` into an infinite loop and leaked ~2 GB
   (non-global regex + `exec()` lastIndex semantics). This also made the unit
   suite unrunnable (worker OOM). → Fixed in
   `server/src/services/dlp-scanner.ts` (+/g flags, single-pass redaction).
2. **FIXED — Cross-adapter type-shape bug (E4-S1/E3-S1 latent PG defect).**
   PostgreSQL drivers return `TIMESTAMPTZ` as `Date`; SQLite returns ISO text.
   The SQL repository adapter returned raw driver values, so the PG path
   violated the R1 domain/API contract. → Normalized at the persistence
   boundary in `packages/sdk/src/sql-repositories.ts`; regression-pinned.
3. **FIXED — E0-S1 environment blocker.** pnpm absent + `better-sqlite3`
   header-download failure. → Reproducible install via
   `npm_config_nodedir=/usr/local` (local Node headers); documented in the
   baseline §2. Typecheck and lint are green on Linux; the 2026-07-21 error
   catalogs (96 typecheck / 536 lint) were host-specific and do not reproduce.
4. **FIXED — PostgreSQL verification gap (E1-S2, E3-S1, E4-S1, E5-S1).**
   All four stories carried "PG validation pending: DATABASE_URL not
   configured". → `server/tests/r1-application-postgres-contract.test.ts`
   executes verbatim production migrations + full repository/governance/
   policy-API/restart contracts on a real PostgreSQL engine (PGlite; live DB
   when `DATABASE_URL` is present). 3/3 green.
5. **Inherited red tail (Phases 11–30 backfill areas).** 258 failing tests /
   80 files (catalog in baseline §3.3.2), incl. two suites that fail at import
   (`services/reliability/core`, `services/reliability/gap`). None are on the
   R1 golden path; all R1-scope suites are green.
6. **Rust toolchain absent** — `cargo check --workspace` unverifiable here.
7. **Architecture weaknesses observed:** (a) several Phase-20+ suites rely on
   mocked DB modules with drifted export lists (e.g. `kernel.test` missing
   `ringPolicies` mock) — mocks must be contract-tested against real exports;
   (b) two reliability suites fail at module resolution — dead/broken imports;
   (c) no CI gate exists that would have caught finding #1 (suite crash) —
   the suite must become a merge gate.

## B. Step-by-step checklist

### Phase R0 — Foundation (COMPLETE this session)
- [x] Restore install toolchain (pnpm 11.13.0, native better-sqlite3 build).
- [x] Full typecheck + lint green.
- [x] Make the unit suite runnable end-to-end (fix #1).
- [x] Fresh verified baseline `baseline-2026-07-22.md`.
- [x] Land cross-adapter timestamp normalization (fix #2) + SDK regression test.
- [x] Land PG application contract (fix #4) covering E1-S2/E3-S1/E4-S1/E5-S1 PG gates.
- [x] Adversarial self-review of the new code (`reviews/E4-S1-pg-contract-review.md`).
- [x] Update `sprint-status.yaml` + story files with evidence.

### Phase R1 — Sprint-1/2 closure (next; ~1–2 days)
- [ ] Spin a real PostgreSQL 16 instance in CI; run
  `npx vitest run tests/r1-application-postgres-contract.test.ts` with
  `DATABASE_URL` set (same contract file; zero code change needed).
- [x] E1-S3 project export/import dry-run (deps: E1-S1✓, E0-S3✓, E5-S1). —
  **2026-07-23: dual-engine contract green (`r1-project-transfer-contract`,
  5/5), SDK 12 transfer unit tests, routes authorized (export `memory:read`,
  dry-run `memory:write`, apply `brain:admin`); in review.**
- [x] E2-S1 provenance-backed memory management API surface checks. —
  **2026-07-23: governed create/list/archive + evidence routes, lifecycle
  receipts verified on SQLite (restart) and PostgreSQL (direct SQL); in
  review.**
- [x] Repair the two import-broken suites (`reliability/core`, `reliability/gap`) —
  restores suite collection everywhere. — **2026-07-23: done plus
  `degraded-mode`; reliability 4 files / 52 tests green.**

### Phase R2 — Sprint-3 (recall, checkpoints, capability hardening)
- [ ] E2-S2 token-budgeted hybrid recall; E3-S2 checkpointed worker execution.
- [ ] E4-S1 adversarial review sign-off → mark done; start E4-S2 durable approvals.
- [ ] Triage lane A: memory subsystem red files (13 files / ~40 tests) — largest
  coherent cluster; fix mocks drift first, then logic.

### Phase R3 — Sprint-4 (governed side effects)
- [ ] E4-S3 bounded native tool gateway; E4-S4 kill switch + quarantine; E3-S3 retry/recovery.
- [ ] Triage lane B: security core red files (kernel/recall/sentinel/security-mcp — ~70 tests).

### Phase R4 — Sprint-5 (usable golden path)
- [ ] E5-S2 telemetry, E5-S3 evidence timeline/export; E6-S1–S4 control plane UX.
- [ ] Triage lane C: scheduler/self-opt/metron cluster (~70 tests).

### Phase R5 — Sprint-6 (production gate)
- [ ] E8-S1 security/isolation verification; E8-S2 perf/reliability acceptance; E8-S3 release gate.
- [ ] CI: make `npm test`, typecheck, lint hard merge gates (would have caught #1).
- [ ] Install Rust toolchain in CI; add `cargo check --workspace` + `cargo test` gate.

## C. Regression gate (binding)

New work must keep green: all R1 suites listed in baseline §3.3.2, SDK suites,
typecheck, lint, and the PG application contract. The 258-failure inherited
set may only shrink — never grow.
