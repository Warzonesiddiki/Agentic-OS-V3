# E10-S9 — Implement Durable Scoped Side-Effect Idempotency

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @Warzonesiddiki (persistence/R1 boundary)
**Dependencies:** E10-S8
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a worker, I need project-scoped atomic effect claims on supported SQL engines, so competing workers cannot concurrently execute the same governed effect.

## Scope and acceptance criteria

1. Use a unique scoped identity over project, task, correlation, and operation with atomic claim acquisition on SQLite/PGlite/PostgreSQL.
2. Expose claim state transitions and receipts through typed repositories; a duplicate contender must receive a non-effecting result.
3. Bind claim records to task, checkpoint, approval, receipt, actor, and evidence correlation.
4. Validate migration/schema constraints on real engines, not only fake executors.
5. Keep uncertain claimed effects non-replayable pending governed reconciliation.

## Negative and adversarial cases

- A process-local map, route cast, or check-after-effect is not atomic idempotency.
- A claim from one project must never block or reveal another project.

## Delivery tasks

- [ ] Audit schema/indexes and repository SQL.
- [ ] Add concurrent race contracts for each engine.
- [ ] Integrate claim/receipt completion ordering.
- [ ] Record engine-specific evidence.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `packages/sdk/src/r1-effect-claims.ts`
- `server/src/db/migrations/0054_r1_effect_claims.sql`
- `server/src/db/migrations/0054_r1_effect_claims.sqlite.sql`
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
