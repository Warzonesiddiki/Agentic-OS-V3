# E10-S11 — Prove Exactly-Once Crash Recovery with a Real Effect

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @forge (reliability QA)
**Dependencies:** E10-S10
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a release reviewer, I need controlled real-effect fault injection across the side-effect boundary, so exactly-once claims are backed by evidence rather than receipt-only simulation.

## Scope and acceptance criteria

1. Use a controlled real filesystem/process effect with independently inspectable marker/sequence evidence.
2. Inject crash/termination after claim, after effect, after receipt, and after completion; restart with fresh runtime composition.
3. Prove one external effect and one terminal receipt/completion outcome for confirmed paths, with no automatic replay for uncertain paths.
4. Prove reconciliation behavior for the after-effect-before-receipt boundary and preserve all correlations.
5. Run on each supported persistence engine and retain raw fault logs.

## Negative and adversarial cases

- An in-memory boolean, mocked executor, or assertion only on receipt count is insufficient.
- Do not auto-retry an effect merely because completion is absent.

## Delivery tasks

- [ ] Create controlled effect fixture and fault hooks.
- [ ] Execute matrix across boundaries/engines.
- [ ] Assert durable evidence after restart.
- [ ] Perform adversarial reliability review.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `server/tests/r1-effect-recovery.integration.test.ts`
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
