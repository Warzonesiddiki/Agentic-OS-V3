# E10-S18 — Eliminate Explicit any in R1 Production Paths

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @Warzonesiddiki (type-safety owner)
**Dependencies:** E10-S17
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a maintainer, I need R1 production paths free of explicit `any`, so safety contracts are enforced rather than bypassed at runtime boundaries.

## Scope and acceptance criteria

1. Define a reviewed R1 source manifest covering SDK, server, frontend, and client production paths.
2. Eliminate explicit `any` and unsafe casts in the manifest; use unknown plus Zod parsing or precise unions/interfaces.
3. Add a scoped CI check that reports file/line and fails on regression.
4. Preserve or improve runtime validation and error behavior with targeted tests.
5. Record exclusions only when non-production and approved with owner/reason/date.

## Negative and adversarial cases

- Replacing `any` with unchecked `unknown as T` is not remediation.
- Tests and generated code are not silently removed from the manifest without approval.

## Delivery tasks

- [ ] Generate baseline inventory.
- [ ] Refactor boundaries incrementally.
- [ ] Add static CI guard.
- [ ] Run typecheck/lint/tests and adversarial type review.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/evidence/r1-explicit-any-audit.json`
- `scripts/check-r1-no-explicit-any.ts`
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
