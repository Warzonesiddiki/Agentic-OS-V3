# E10-S20 — Remove Placeholders and Simulations from Claimed R1 Paths

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @Warzonesiddiki (runtime audit owner)
**Dependencies:** E10-S19
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a release reviewer, I need claimed R1 paths to perform their stated real behavior or be removed from release scope, so demos and fallback placeholders cannot masquerade as production capability.

## Scope and acceptance criteria

1. Inventory placeholder, mock, simulation, TODO, fallback, and private-map behavior reachable from claimed R1 paths.
2. Replace each with real implementation, explicitly deprecated unavailable behavior, or a narrowed documented non-release path.
3. Prove real effect/provider/filesystem/SQL behavior where the feature claim requires it.
4. Make static scan and route integration tests fail on newly introduced claimed-path simulations.
5. Update release documentation to state only verified behavior and residual limits.

## Negative and adversarial cases

- Returning a plausible object without performing the effect is not implementation.
- Do not suppress a placeholder by renaming a marker while retaining the behavior.

## Delivery tasks

- [ ] Create claimed-path inventory.
- [ ] Fix/narrow each item.
- [ ] Add proof tests and static scan.
- [ ] Review release wording against code.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/evidence/r1-claimed-path-audit.json`
- `scripts/scan-r1-claimed-path-placeholders.ts`
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
