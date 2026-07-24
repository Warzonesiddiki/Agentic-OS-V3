# E10-S4 — Establish Machine-Readable Release Evidence Ledger

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** in_progress
**Accountable owner:** @bastion (CI and release-evidence tooling)
**Dependencies:** E10-S1
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As an independent reviewer, I need a versioned and validated command ledger, so the release decision is reproducible and derived from evidence instead of narrative.

## Scope and acceptance criteria

1. Define a versioned schema for repository identity, environment, command intent, expected/actual structured results, artifacts, reviewer, rerun state, blocking reason, and decision derivation.
2. Validate the ledger and full-suite triage with Zod; reject invalid paths, missing artifacts, malformed hashes, duplicate IDs, invalid status/exit-code combinations, and a manually contradicted release decision.
3. Retain and integrity-address raw output for non-passing commands; distinguish targeted, compilation, integration, and full-release evidence.
4. Run validation from CI/release-gate workflow before tests and publish a deterministic failure message.
5. The ledger must derive `blocked` while any blocking record is not passed and cannot be changed to pass by a targeted result.

## Negative and adversarial cases

- A nonzero exit code cannot be marked pass.
- A path outside the repository evidence directory, an absent artifact, or a targeted result replacing a full-suite result must fail validation.

## Delivery tasks

- [ ] Publish ledger and triage schemas.
- [ ] Implement Zod validator and artifact/hash checks.
- [ ] Upgrade the ledger to structured v2 records and derive its decision.
- [ ] Wire validation into CI and run it against the committed evidence.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/evidence/schemas/release-evidence-ledger.schema.json`
- `scripts/validate-r1-release-evidence.ts`
- `scripts/test-r1-release-evidence-validator.ts`
- `docs/bmad/releases/evidence/2026-07-24-evidence-validator-negative-tests.log`
- `docs/bmad/releases/evidence/2026-07-24-release-evidence-ledger.json`
- `.github/workflows/validate.yml`
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
