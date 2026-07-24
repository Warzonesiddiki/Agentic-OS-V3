> **Historical Correct Course proposal.** This document records the 2026-07-24 change analysis and its then-current observations. It is not current validation evidence; the Gate 0 baseline, evidence ledger, and sprint status govern the blocked R1 decision.

# Sprint Change Proposal — Remediation and Release Requalification

**Project:** NEXUS 2.0 / Agentic OS V3  
**Workflow:** BMAD Correct Course  
**Date:** 2026-07-24  
**Trigger:** Adversarial repository audit after R1 was represented as complete, 100/100, zero-compromise, and release-ready.  
**Scope classification:** **Major** — completed story status and release claims are invalidated pending remediation and requalification.  
**Review mode selected by user:** Batch  
**Decision required:** Approve this proposal before implementation or status changes.

---

## 1. Issue Summary

The audit confirmed a distinction between a passing curated R1 slice and the actual repository/release state. The curated SDK suite (249 tests) and two targeted R1 server files (12 tests) pass. The full repository test command does not: `pnpm test` produced **98 failed test files, 159 failed tests, 155 passed files, and 1,746 passed tests**. This is incompatible with whole-project completion claims.

The audit also found production-source contradictions to core R1 guarantees:

1. `server/src/services/r1-extended-runtime.ts` returns a simulated command result rather than executing a bounded process. Thus Golden Path Step 9 is not a real constrained test run.
2. `packages/sdk/src/r1-task-worker.ts` returns `false` from `isStepAlreadyExecuted` with an explicit placeholder comment. The exactly-once/duplicate-side-effect recovery guarantee is not implemented.
3. `packages/sdk/src/sql-extended-repositories.ts` contains SQL mutations/lookups for approvals and contradictions that do not constrain by project ID, contrary to the fail-closed isolation invariant.
4. `server/src/routes/r1-extended.ts` exposes checkpoint behavior through private `any` casts and a placeholder fallback.
5. SQL compensation discovery is implemented only through in-memory private-map inspection and returns an empty list for SQL.
6. The codebase contains extensive explicit `any` usage despite the stated prohibition, including the R1 client and components.
7. R1 components have no dedicated component tests or golden-path E2E coverage.
8. The release gate remains incomplete: clean-machine walkthrough, formal security triage, and rollback plan are unchecked; no R1 down migrations exist.
9. `pnpm audit --prod` reports a high-severity `fast-uri` host-confusion issue plus moderate Hono and React Router findings.
10. BMAD status/scoring/release documents conflict (94, 98, and 100 scores; older test/migration counts coexist with newer claims).

### Evidence

- Audit commands and results recorded in the 2026-07-24 session.
- `pnpm test`: exit 1, 98 failing files / 159 failing tests.
- `pnpm audit --prod`: exit 1, including high-severity `fast-uri@3.1.3` advisory.
- Passing but insufficient checks: SDK 249/249, targeted R1 server 12/12, SDK/A2A/server typechecks, frontend build.
- `docs/bmad/releases/R1-release-gate.md` has unchecked release requirements.

### Root Cause Classification

- Failed approach requiring different solution: release confidence was inferred from isolated tests and documentation rather than an executable, end-to-end release qualification gate.
- Technical limitations discovered during implementation: simulated sandboxing, placeholder idempotency, and persistence scope gaps.
- Misunderstanding of original requirements: “implemented” was treated as equivalent to “verified in the production path.”

---

## 2. Checklist Record and Impact Analysis

| Checklist item | Status | Finding / consequence |
|---|---|---|
| 1.1 Triggering story | Done | E3-S2/E3-S3/E4-S3/E8-S1/E8-S2/E8-S3 and E6 UI stories expose the material contradictions. |
| 1.2 Core problem | Done | Completion, security, and operational claims exceed verified implementation. |
| 1.3 Evidence | Done | Full-test failure, static audit, source placeholders, dependency audit, and incomplete gate evidence. |
| 2.1 Existing epic viability | Action-needed | E3, E4, E5, E6, E8, E7, and E9 need requalification; “done” must not mean release-qualified. |
| 2.2 Epic-level changes | Done | Add a remediation/requalification epic; revise release gate and DoD. |
| 2.3 Remaining epic dependencies | Done | New critical work must precede E10–E14 or any release branch/sign-off. |
| 2.4 New epic needed | Done | Yes: E10-R1, “R1 Integrity, Security, and Release Requalification.” Existing marketplace epic numbering must be renamed/resequenced by an approved backlog change. |
| 2.5 Priority/order | Done | Security, real side effects, idempotency, tenancy, and test health precede feature work. |
| 3.1 PRD conflict | Action-needed | FRs/NFRs imply real sandboxing, no duplicate effects, tenant isolation, typed boundaries, accessible UI, and release qualification. Acceptance criteria need executable proof requirements. |
| 3.2 Architecture conflict | Action-needed | Replace simulated sandbox adapter, private-repository access, and scope-unsafe persistence APIs with explicit typed interfaces and transactional invariants. |
| 3.3 UX conflict | Action-needed | UI quality claims lack tests; error/degraded/approval/event-replay accessibility needs executable verification. |
| 3.4 Other artifacts | Action-needed | CI, dependency update policy, rollback operations, clean-machine documentation, scorecard, release evidence, and security triage require changes. |
| 4.1 Direct adjustment | Not viable alone | Too broad; individual fixes without a release requalification track would repeat the original governance failure. |
| 4.2 Rollback | Not viable as primary path | Source rollback would discard useful work while not repairing test-health and process failures. Narrow revert remains available for unsafe release claims only. |
| 4.3 MVP review | Viable | R1 MVP remains possible, but only as a requalified vertical slice; protocol breadth and future epics freeze. |
| 4.4 Recommendation | Done | Hybrid: create a remediation epic, freeze release claims, repair P0 guarantees, establish deterministic validation, then requalify. |

---

## 3. Recommended Approach

Adopt a **hybrid remediation and requalification program**.

1. Freeze all production-ready, 100/100, and zero-compromise claims immediately.
2. Keep existing implementation only where it can be proven against strengthened acceptance criteria.
3. Create a dedicated remediation epic and 30 independently reviewable workstreams.
4. Repair critical capability implementation before broad test cleanup.
5. Make the release gate executable: a release is blocked unless the complete suite policy, security audit, dependency audit, migration reversal, and clean-machine golden path pass.
6. Do not mark prior stories “done” as release-qualified until their updated acceptance evidence exists. Preserve historic implementation completion separately for traceability.

### Why this is preferred

- A direct patch-only approach leaves the invalid status model and incomplete validation design intact.
- A full rollback does not solve documentation drift, CI policy, dependency governance, or end-to-end test gaps.
- A requalified MVP protects users by narrowing claims to what is actually proven.

### Program risk and effort

| Attribute | Assessment |
|---|---|
| Effort | High |
| Technical risk | High, concentrated in process execution, persistence invariants, migrations, and test stabilization |
| Release risk if deferred | Critical |
| Feature work policy | Frozen until Gates 0–3 pass |
| Completion definition | Evidence-based, not story-count-based |

---

## 4. Proposed Epic and 30 Remediation Workstreams

### Proposed epic

**E10-R1 — Integrity, Security, and Release Requalification (P0)**

**Goal:** Make every externally claimed R1 behavior real, project-scoped, typed, testable, operationally reversible, and validated from a clean machine before release.

**Exit criteria:**
- no placeholder/simulated production behavior in governed R1 paths;
- tenant-scope contracts pass for every R1 repository and route mutation;
- exactly-once side-effect behavior proven through real crash/restart tests;
- all intended repository tests are green or formally removed with documented replacement coverage;
- no known high/critical production dependency vulnerability remains without approved, time-bound exception;
- R1 component and E2E golden-path tests pass;
- rollback and clean-machine walkthrough are executed and evidenced;
- release documentation has one truthful status and one source of validation truth.

### Wave A — Program controls and truthful status (workstreams 01–05)

| ID | Workstream | Primary role | Acceptance evidence | Dependency |
|---|---|---|---|---|
| 01 | Freeze unsupported completion/release claims | Release gate owner | Claims replaced by “blocked pending requalification”; audit reference retained | Approval |
| 02 | Reconcile BMAD score/status/doc baselines | Traceability keeper | One authoritative score, status, test count, migration set, and date | 01 |
| 03 | Create E10-R1 stories and DoD | Product owner / scrum master | Stories with AC, threat/failure tests, evidence paths, review requirements | 01 |
| 04 | Establish release-evidence ledger | Evidence auditor | Machine-readable command/result/environment ledger | 01 |
| 05 | Establish test triage taxonomy | QA lead | Every current failure classified as defect, environment, stale test, or excluded-with-replacement | 04 |

### Wave B — Real governed execution and recovery (workstreams 06–11)

| ID | Workstream | Primary role | Acceptance evidence | Dependency |
|---|---|---|---|---|
| 06 | Specify sandbox security contract | Security architect | Allowed commands, executable paths, cwd, env, limits, signals, outputs, audit model | 03 |
| 07 | Implement real constrained runner | Runtime engineer | Spawn-without-shell implementation, timeout/process-tree kill, cwd and output caps | 06 |
| 08 | Test sandbox adversarially | Security QA | Injection, traversal, env leakage, timeouts, signal kill, output flood, command aliases | 07 |
| 09 | Implement durable idempotency ledger | Persistence engineer | Scoped unique effect key / receipt state and transaction semantics | 03 |
| 10 | Implement recovery state machine | Worker engineer | Checkpoint/retry/lease transition model, no terminal reopen, recovery audit | 09 |
| 11 | Prove crash exactly-once behavior | Reliability QA | Three fault boundaries, real controlled side effect, one receipt/effect after restart | 07, 10 |

### Wave C — Tenancy, persistence, and migrations (workstreams 12–17)

| ID | Workstream | Primary role | Acceptance evidence | Dependency |
|---|---|---|---|---|
| 12 | Scope every R1 SQL query/mutation | Persistence security engineer | `project_id` enforced on all lookup/update/delete statements | 03 |
| 13 | Enforce ownership and capability authorization | Auth engineer | Principal/project authorization matrix at routes and service boundaries | 12 |
| 14 | Replace private runtime access with typed APIs | SDK architect | Checkpoint/compensation services expose typed methods; no `any` internals | 12 |
| 15 | Complete SQL compensation support | Worker/persistence engineer | Project/task lookup works for SQL and in-memory implementations | 14 |
| 16 | Add migration forward/backward plan | Migration strategist | Ordered up/down scripts and verification for 0049–0053 | 12, 15 |
| 17 | Validate migrations on supported engines | Database QA | PostgreSQL and SQLite/PGlite test evidence, rollback/restore proof | 16 |

### Wave D — Type contracts, APIs, and client boundaries (workstreams 18–21)

| ID | Workstream | Primary role | Acceptance evidence | Dependency |
|---|---|---|---|---|
| 18 | Eliminate R1 production `any` | Type-safety engineer | ESLint zero explicit-any in R1 scope; schemas at unknown boundaries | 14 |
| 19 | Validate every R1 request/response contract | API engineer | Zod input schemas, typed errors, response schemas/client contracts | 18 |
| 20 | Remove placeholders/mocks from claimed paths | Runtime auditor | No placeholder/mock/simulated behavior in production R1 release path | 07, 14 |
| 21 | Harden export/import/evidence integrity | Data-governance engineer | Scope, redaction, canonical hash, poisoned import, transaction tests | 12, 19 |

### Wave E — Test health, UX, and observable quality (workstreams 22–26)

| ID | Workstream | Primary role | Acceptance evidence | Dependency |
|---|---|---|---|---|
| 22 | Repair full suite or rationalize scope | Repository QA | `pnpm test` green, or a documented repository test policy with every excluded test replaced/removed by approval | 05 |
| 23 | Build deterministic R1 integration harness | Test infrastructure engineer | Real DB/runtime/clock/process fixture, no private-field mutation | 07, 17 |
| 24 | Add R1 component accessibility tests | UX QA | Dashboard/task/approvals/memory tests for loading/error/offline/degraded/keyboard/screen reader | 19 |
| 25 | Add golden-path E2E test | E2E QA | 14 steps including approval, real write, real command, crash, recovery, evidence/export/import | 11, 23, 24 |
| 26 | Establish coverage and mutation thresholds | Quality engineer | Thresholds by R1 critical module; CI blocks regressions | 22–25 |

### Wave F — Supply chain, release operations, and final audit (workstreams 27–30)

| ID | Workstream | Primary role | Acceptance evidence | Dependency |
|---|---|---|---|---|
| 27 | Remediate dependency vulnerabilities | Supply-chain security engineer | `pnpm audit --prod` has no high/critical; approved exceptions documented | 01 |
| 28 | Complete security triage and penetration matrix | Security reviewer | Severity, exploitability, owner, due date, retest evidence for every finding | 08, 12, 27 |
| 29 | Perform clean-machine release drill | Release engineer | Actual install/start/UI golden path/worker kill/rollback/export-import evidence | 17, 25, 27 |
| 30 | Independent adversarial release audit | Quality auditor general | Fresh review, reproducible commands, signed decision: approve or block | All 01–29 |

### Execution model

The requested “30 subagents” is mapped to these 30 separately accountable workstreams. This environment provides one implementation agent and cannot truthfully claim 30 concurrent autonomous agents. The workstreams will therefore be executed as independently reviewable tracks, with parallelism used only where dependencies permit. No workstream may self-certify; every one requires test evidence and adversarial review.

---

## 5. Artifact Change Proposals

### 5.1 Sprint status

**Current:** all stories done, no backlog, no deferred work.  
**Proposed:** add E10-R1 in `backlog` after approval; do not change existing historic implementation status without an approved status vocabulary update. Add a release-qualification field/status that distinguishes implementation-complete from release-qualified.

**Rationale:** Existing `done` status is overloaded and permits false release inference.

### 5.2 PRD

**Current:** requirements describe safety, recovery, sandboxing, isolation, and accessibility without mandatory executable validation definitions.  
**Proposed:** amend affected FR/NFR acceptance criteria to require: actual command execution; durable idempotency; project-scoped SQL access; production-path no-`any` boundaries; component/E2E coverage; dependency audit; and rollback/clean-machine proof.

**Rationale:** Requirements must define proof, not only intended behavior.

### 5.3 Architecture

**Current:** intended capability gateway and persistence contracts do not match selected runtime implementations.  
**Proposed:** specify concrete interfaces for `SandboxExecutor`, `EffectLedger`, `CheckpointRepository`, `CompensationRepository`, `ApprovalRepository`, and scoped transactional SQL operations. State that production adapters must not use private-field access or simulated execution.

**Rationale:** The architecture must make unsafe shortcuts structurally impossible.

### 5.4 UX design

**Current:** state and accessibility claims are documented but not proven.  
**Proposed:** add interaction test requirements for each R1 screen and explicit behavior for failed runner, recovery conflict, stale approval, inaccessible storage, and export/import validation errors.

**Rationale:** A safe workbench cannot hide failed side effects or recovery uncertainty.

### 5.5 Release documentation

**Current:** claims and checklist states conflict.  
**Proposed:** mark R1 as blocked pending E10-R1, retain historical results with dates, publish one command matrix, add rollback/runbook evidence, and prohibit completion claims until Workstream 30 approves.

**Rationale:** Release evidence must be truthful, reproducible, and time-bounded.

---

## 6. MVP Impact

The R1 MVP remains viable but is **not currently releasable**. Marketplace, RBAC expansion, billing, advanced LSP, plugins, and other non-remediation feature work must be frozen until at minimum Workstreams 01–17 pass. No scope reduction is proposed for R1 safety guarantees; the reduction is in feature breadth and release claims until the core vertical slice is proven.

---

## 7. Handoff and Governance Plan

| Responsibility | Workstreams | Required output |
|---|---|---|
| Product owner / scrum master | 01–05 | Corrected backlog, status semantics, approval records |
| Security architect / reviewer | 06, 08, 12, 13, 27, 28 | Threat model, test results, vulnerability disposition |
| Runtime and worker engineers | 07, 09–11, 15, 20 | Implemented code, unit/integration/recovery evidence |
| Persistence and migration engineers | 12, 14–17, 21 | Scoped repositories, migrations, rollback evidence |
| API/type engineer | 18–19 | Schema/type reports and contract tests |
| QA / UX QA / E2E QA | 22–26 | Green test ledger and accessibility/E2E evidence |
| Release engineer | 29 | Clean-machine and rollback drill report |
| Independent quality auditor | 30 | Fresh release decision and revised scorecard |

### Non-negotiable Definition of Done for every workstream

1. Explicit acceptance tests exist and pass.
2. Relevant lint, typecheck, unit, integration, and E2E suites pass.
3. No secrets occur in fixtures, logs, evidence, or exports.
4. Zod validation is used for every external/unknown boundary.
5. Scope/authorization tests include negative cross-project cases where applicable.
6. Documentation, traceability, sprint status, and release evidence are updated through BMAD workflow artifacts.
7. An adversarial reviewer signs off.
8. The full release gate cannot be marked complete until the entire program is independently re-audited.

---

## 8. Approval Request

**Requested decision:** Approve this major Correct Course proposal and authorize creation of E10-R1 remediation stories plus implementation in dependency order.

Approval means:
- release and perfection claims will be corrected to reflect blocked/requalification status;
- the 30 workstreams become the governing remediation backlog;
- the first implementation work begins with Workstreams 01–03, then 06–17;
- no current story is silently marked requalified without new evidence.

**Options:** `approve`, `revise`, or `reject`.
