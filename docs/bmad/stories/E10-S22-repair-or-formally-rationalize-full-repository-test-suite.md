# E10-S22 — Repair or Formally Replace Every Full-Suite Failure

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @quill (repository QA)
**Dependencies:** E10-S21
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a release owner, I need the configured full suite healthy or every removed test formally replaced, so a green command represents actual repository coverage.

## Scope and acceptance criteria

1. Drive every S5 remediation record to a passing rerun or approved replacement with equivalent coverage and retained review/evidence.
2. Repair native build environment in supported CI and distinguish environment failure from behavioral failure.
3. Keep `pnpm test` as a blocking command until it passes under the approved test policy.
4. Document any test-policy change with scope, rationale, approver, replacement path, and command impact.
5. Publish before/after totals and raw final output in the ledger.

## Negative and adversarial cases

- No test may be skipped, deleted, filtered, quarantined, or marked flaky to create a pass without approved equivalent coverage.
- A targeted green run cannot close a full-suite record.

## Delivery tasks

- [ ] Triage/fix by owner workstream.
- [ ] Rerun and attach artifacts per record.
- [ ] Review proposed replacements.
- [ ] Run full suite on supported environment and update ledger.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/evidence/2026-07-24-full-suite-triage.json`
- `docs/bmad/releases/evidence/full-suite-final.log`
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
