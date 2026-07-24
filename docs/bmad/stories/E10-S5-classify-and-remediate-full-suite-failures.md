# E10-S5 — Classify and Remediate Full-Suite Failures

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** in_progress
**Accountable owner:** @quill (test-health coordinator)
**Dependencies:** E10-S4
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a release owner, I need every failing full-suite test file owned and tracked through remediation, so test selection cannot conceal defects or environment gaps.

## Scope and acceptance criteria

1. Preserve the raw full-suite log and represent each of its 98 failing files in a unique machine-readable remediation record.
2. Every record must have a primary classification, named accountable owner, workstream, concrete repair/replacement action, required coverage, exact rerun command, evidence destination, and open/verified disposition.
3. Native dependency records must require a rerun on a supported built binding and a follow-up defect record for any behavioral failure exposed there.
4. Stale/mock/import records must repair the contract or cite an approved replacement test before removal; product defects must add or retain a regression assertion.
5. The validator must reject a duplicate/missing test file, an unowned record, a closure without passing rerun evidence, or replacement removal without approved equivalent coverage.

## Negative and adversarial cases

- No category is excluded from the release gate.
- A native-binding failure cannot hide a behavioral failure or be considered a green result.

## Delivery tasks

- [ ] Normalize raw test-file identifiers while retaining their source text.
- [ ] Assign source-domain owners and concrete repair actions.
- [ ] Add required rerun and replacement-coverage fields.
- [ ] Rerun records incrementally and update only with retained artifacts; aggregate at E10-S22.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/evidence/2026-07-24-full-suite-triage.json`
- `docs/bmad/releases/evidence/2026-07-24-full-suite.log`
- `scripts/validate-r1-release-evidence.ts`
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
