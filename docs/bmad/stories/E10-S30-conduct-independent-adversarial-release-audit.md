# E10-S30 — Conduct Independent Adversarial Release Audit

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** Independent reviewer — unassigned (must not be implementation author)
**Dependencies:** E10-S1 through E10-S29
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a release stakeholder, I need a fresh independent adversarial audit, so final release approval or continued block is based on reproducible evidence rather than self-certification.

## Scope and acceptance criteria

1. Reviewer is independent of implementation and records identity/role, commit SHA, environment, scope, date, and conflicts of interest.
2. Reproduce ledger commands from a clean environment and inspect raw artifacts, full-suite policy, dependency audit, migration drill, security matrix, golden path, and documentation claims.
3. Attempt to bypass approval, project isolation, effect recovery, redaction, and process-runner controls; record methods and results safely.
4. Issue only `approved` or `blocked` with explicit finding IDs, evidence links, and any required remediation; no numeric perfection score.
5. Only an approved E10-S30 review may change the release decision from blocked.

## Negative and adversarial cases

- An implementer’s test run or narrative sign-off is not independent approval.
- An audit with unexecuted commands, missing artifacts, or unresolved high/critical findings must remain blocked.

## Delivery tasks

- [ ] Assign independent reviewer.
- [ ] Run reproduction/adversarial protocol.
- [ ] Publish signed decision/evidence.
- [ ] Update ledger only after review.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/reviews/E10-S30-independent-adversarial-release-audit.md`
- `docs/bmad/releases/evidence/2026-07-24-release-evidence-ledger.json`
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
