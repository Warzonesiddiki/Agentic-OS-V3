# E10-S24 — Add R1 Component and Accessibility Tests

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @prism (R1 UX)
**Dependencies:** E10-S23
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a workbench user, I need Dashboard, Task Detail, Approvals, and Memory Workbench states verified accessibly, so governance and failure information remain usable to all operators.

## Scope and acceptance criteria

1. Add component tests for loading, empty, error, offline, degraded, permission-denied, and recovered states on all four R1 surfaces.
2. Test keyboard flow, focus management, escape/confirmation behavior, accessible names/live regions, semantic roles, and contrast/announcements for risky actions.
3. Verify approval UI names the real side effect and recovery UI communicates uncertainty without false success.
4. Use typed client fixtures and no raw secrets in rendered test data.
5. Run accessibility assertions in CI and retain failures as release blockers.

## Negative and adversarial cases

- Snapshot-only coverage is insufficient for keyboard and screen-reader behavior.
- Do not represent an unconfirmed effect as completed in UI fixtures.

## Delivery tasks

- [ ] Add deterministic component harness.
- [ ] Implement state/action/accessibility tests.
- [ ] Fix discovered UX contracts.
- [ ] Record UX adversarial review.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `src/components/r1/*.test.tsx`
- `docs/bmad/releases/evidence/r1-accessibility-report.json`
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
