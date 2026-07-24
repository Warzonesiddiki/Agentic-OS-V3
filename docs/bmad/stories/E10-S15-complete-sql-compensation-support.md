# E10-S15 — Complete SQL Compensation Support

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @forge (worker/persistence)
**Dependencies:** E10-S14
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As an operator, I need durable project-scoped compensation lifecycle support, so required reversals can be authorized, recovered, audited, and observed on SQL backends.

## Scope and acceptance criteria

1. Persist compensation discovery/state for SQL and in-memory adapters with project/task/action correlation.
2. Authorize compensation separately, validate state transitions, and record append-only receipts/audit links.
3. Recover pending/failed compensation without inspecting private maps and prevent duplicate/reordered destructive reversal.
4. Expose safe project-scoped status and evidence to authorized users.
5. Test normal, denied, crash, cross-project, and retry paths.

## Negative and adversarial cases

- Returning an empty SQL compensation list or reading a private in-memory map is not support.
- Compensation cannot bypass kill switch, approval, or audit.

## Delivery tasks

- [ ] Specify lifecycle and schema.
- [ ] Implement repository/service/route path.
- [ ] Add engine contracts and recovery tests.
- [ ] Update runbook.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `packages/sdk/src/sql-extended-repositories.ts`
- `server/tests/r1-compensation-contract.test.ts`
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
