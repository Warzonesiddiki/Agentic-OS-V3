# E10-S29 — Perform Clean-Machine Release and Rollback Drill

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @bastion (release engineering)
**Dependencies:** E10-S28
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a release operator, I need a clean-machine installation, operation, recovery, export/import, and rollback drill, so instructions and operational claims are empirically validated.

## Scope and acceptance criteria

1. Start from a clean supported OS image with only documented prerequisites; capture image, tool versions, commands, hashes, and logs.
2. Install, build native dependencies, migrate, start services, execute golden path, kill worker at controlled point, reconcile/recover, export/import, and inspect evidence.
3. Execute approved rollback/restore plan with destructive-data acknowledgement and integrity verification.
4. Verify no fixture secrets enter artifacts and clean up all generated data/processes.
5. Record every failure and leave release blocked until rerun succeeds.

## Negative and adversarial cases

- A developer workstation rerun is not a clean-machine drill.
- Do not skip native rebuild, rollback, worker crash, or import/export steps.

## Delivery tasks

- [ ] Write reproducible runner image/script.
- [ ] Execute drill with observer.
- [ ] Archive logs/checksums.
- [ ] Update ledger and runbook.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/evidence/clean-machine-drill/`
- `docs/bmad/releases/R1-rollback-plan.md`
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
