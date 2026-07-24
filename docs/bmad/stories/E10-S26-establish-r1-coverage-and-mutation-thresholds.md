# E10-S26 — Establish R1 Coverage and Mutation Thresholds

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @quill (quality engineering)
**Dependencies:** E10-S25
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a maintainer, I need meaningful critical-module coverage and mutation thresholds in CI, so superficially green tests cannot regress safety behavior unnoticed.

## Scope and acceptance criteria

1. Define critical R1 module manifest and justified line/branch/function/mutation thresholds for runner, claims, recovery, auth, SQL scope, transfer, and API schemas.
2. Measure baseline coverage/mutation score with reproducible commands and retain reports.
3. Make CI fail only for documented critical modules/thresholds and prevent baseline laundering.
4. Require surviving-mutant triage with owner/action/evidence.
5. Review thresholds independently for adequacy, not merely attainability.

## Negative and adversarial cases

- A global coverage number cannot hide untested critical modules.
- Do not exclude code or lower thresholds without an approved risk decision.

## Delivery tasks

- [ ] Define manifest and thresholds.
- [ ] Add coverage/mutation tooling.
- [ ] Baseline and remediate gaps.
- [ ] Wire CI and review report.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/evidence/r1-quality-thresholds.json`
- `.github/workflows/ci.yml`
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
