# E10-S12 — Scope Every R1 SQL Lookup and Mutation

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @Warzonesiddiki (R1 persistence boundary)
**Dependencies:** E10-S11
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a project member, I need every R1 SQL operation scoped by project, so an identifier from another project cannot read, mutate, compensate, or correlate my data.

## Scope and acceptance criteria

1. Inventory every R1 query/mutation across SDK and server repositories, including joins, upserts, compensations, effects, exports, recovery, and evidence.
2. Require project ID in lookup/update/delete predicates or enforce it with a scoped foreign-key/unique constraint and document the proof.
3. Add negative cross-project tests for every repository operation family.
4. Review dynamic SQL and executor abstractions for parameterization and scope propagation.
5. Publish audit inventory with file, SQL operation, scope mechanism, test, owner, and disposition.

## Negative and adversarial cases

- A route scope, request field, or unscoped primary-key lookup alone does not establish tenant isolation.
- Do not omit internal/recovery/export paths from the inventory.

## Delivery tasks

- [ ] Create SQL inventory.
- [ ] Patch scope omissions.
- [ ] Add contract tests on supported engines.
- [ ] Review inventory adversarially.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/evidence/r1-sql-scope-audit.json`
- `packages/sdk/src/sql-extended-repositories.ts`
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
