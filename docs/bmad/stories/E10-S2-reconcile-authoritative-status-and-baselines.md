# E10-S2 — Reconcile Authoritative Status and Baselines

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** in_progress
**Accountable owner:** @lorekeeper (baseline and status owner)
**Dependencies:** E10-S1
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a maintainer, I need a single clearly scoped status authority and a historical-evidence policy, so a release decision cannot be based on stale scores, counts, migrations, or status words.

## Scope and acceptance criteria

1. Record the current known R1 migration set as 0049–0054, while preserving earlier migration ranges only as explicitly dated history.
2. Reconcile each reported SDK count (91, 249, 254, and handoff 255) to a dated source; do not select a count as current until a fresh rerun has a retained artifact.
3. Ensure sprint status has no numeric perfection score or language that implies independently qualified release status.
4. Make prior baseline files explicitly historical/non-authoritative for current R1 release decisions.
5. Replace stale current release-gate counts and completion wording with the Gate 0 decision and the ledger reference.
6. Publish an authority table listing document, scope, owner, evidence source, and expiry/re-run requirement.

## Negative and adversarial cases

- Do not alter a historical command result to match a newer result.
- A missing native module or unavailable platform must remain a blocker rather than becoming a pass by prose.

## Delivery tasks

- [ ] Build the authority table and discrepancy register.
- [ ] Add historical notices to superseded baselines and campaign records.
- [ ] Reconcile current R1 release gate terminology and migration references.
- [ ] Run the claim scan and ledger validator after edits.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/baseline-2026-07-24-gate0.md`
- `docs/bmad/releases/evidence/2026-07-24-authoritative-claim-scan.json`
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
