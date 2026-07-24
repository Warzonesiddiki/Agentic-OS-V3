# E10-S25 — Add Real 14-Step R1 Golden-Path E2E Test

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @quill (E2E QA)
**Dependencies:** E10-S24
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a release reviewer, I need the documented 14-step path exercised end to end, so R1 usability, approval, real effects, recovery, and evidence are validated together.

## Scope and acceptance criteria

1. Execute all 14 specified steps against real runtime composition: project init, context, task, recall, approval, approved write, constrained command, failure injection, recovery, evidence, export/import, and feedback.
2. Use controlled real side effects and assert approval-before-effect, no duplicate effects, project authorization, redaction, and final evidence correlations.
3. Run in a clean reproducible environment with deterministic fixtures and retain browser/server/process artifacts.
4. Cover a worker crash at the designated boundary and governed reconciliation for uncertain effect state.
5. Fail on any manual repair, hidden test route, or simulated result.

## Negative and adversarial cases

- A scripted API-only smoke test does not substitute for the user-facing E2E path.
- Do not bypass approvals, policy, or recovery to make the path pass.

## Delivery tasks

- [ ] Map specification steps to assertions.
- [ ] Build Playwright/runtime fixture.
- [ ] Implement crash/recovery orchestration.
- [ ] Run and publish artifacts.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `e2e/r1-golden-path.spec.ts`
- `docs/bmad/GOLDEN-PATH-SPECIFICATION.md`
## Non-negotiable delivery rules

- R1 remains **release blocked**. This story cannot authorize a release, score, or production-readiness claim; only E10-S30 can issue an independent decision.
- Do not delete, skip, or weaken a failing test to make a command green. Preserve historical evidence and label it historical rather than rewriting it.
- Use Zod at external or unknown data boundaries; introduce no explicit `any` in R1 production code; never place secrets in fixtures, logs, telemetry, receipts, evidence, or exports.
- Before a story can move to `done`, its acceptance tests, relevant lint/typecheck/integration checks, documentation/status evidence, and an adversarial review must be recorded. A plan or an implementation-only assertion is not completion evidence.

## Definition of done

This story remains `in_progress`, `review`, or `blocked` until every acceptance criterion has passing, retained evidence and an adversarial review. It may not be marked `done` by the author or used to advance the R1 release decision.

## References

- `docs/bmad/baseline-2026-07-24-gate0.md`
- `docs/bmad/releases/R1-release-gate.md`
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-24.md`
- `docs/bmad/sprint-status.yaml`
