# E10-S16 — Create and Test Ordered R1 Down Migrations

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @Warzonesiddiki (database change owner)
**Dependencies:** E10-S15
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a release engineer, I need ordered destructive-data-aware down migrations for 0049–0054, so rollback decisions are explicit, testable, and cannot silently discard governed evidence.

## Scope and acceptance criteria

1. Provide ordered down migrations for PostgreSQL and SQLite/PGlite covering 0054 through 0049 with dependency-aware ordering.
2. For each destructive step, document data loss, backup/export prerequisite, restore procedure, approval role, and no-go conditions.
3. Ensure down scripts fail safely when preconditions/evidence retention requirements are not met.
4. Test syntax and ordering without assuming additive tables are safe to drop.
5. Publish a human rollback runbook distinct from automatic deployment behavior.

## Negative and adversarial cases

- “Drop tables because additive” is not an approved rollback plan.
- A down migration must not remove audit/effect evidence without an explicit destructive-data acknowledgement.

## Delivery tasks

- [ ] Inventory schema dependencies.
- [ ] Author paired down scripts and preflight checks.
- [ ] Write rollback plan.
- [ ] Exercise ordered rollback in S17.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `server/src/db/migrations/down/`
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
