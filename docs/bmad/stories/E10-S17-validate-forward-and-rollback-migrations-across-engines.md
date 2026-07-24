# E10-S17 — Validate Forward and Rollback Migrations Across Engines

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @quill (database QA)
**Dependencies:** E10-S16
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a release engineer, I need forward, rollback, restore, and integrity evidence on supported engines, so migration safety is demonstrated instead of inferred.

## Scope and acceptance criteria

1. Run clean forward migrations 0049–0054 on SQLite, PGlite, and PostgreSQL supported versions.
2. Run ordered rollback and restore drills with fixture data, including effect claims, approvals, receipts, checkpoints, compensation, and audit records.
3. Verify integrity, scope constraints, append-only protections, and application startup after each transition.
4. Record engine/version/commands/logs/hashes in the ledger.
5. Fail release qualification for any unavailable required engine or unsupported downgrade.

## Negative and adversarial cases

- A mock executor or one engine does not prove cross-engine migration behavior.
- A successful schema application without data integrity/restoration checks is insufficient.

## Delivery tasks

- [ ] Create deterministic migration fixture.
- [ ] Implement engine matrix harness.
- [ ] Run forward/down/restore sequences.
- [ ] Capture evidence and adversarial DB review.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `server/tests/r1-migration-matrix.integration.test.ts`
- `docs/bmad/releases/evidence/`
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
