# E10-S14 — Replace Private Runtime Access with Typed Service APIs

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @Warzonesiddiki (R1 architecture)
**Dependencies:** E10-S13
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a maintainer, I need typed runtime service APIs instead of private casts and fallback internals, so route behavior remains enforceable and testable after refactoring.

## Scope and acceptance criteria

1. Inventory R1 `as any`, private-field access, unsafe casts, and fallback branches in server, SDK, frontend, and client paths.
2. Replace each R1 runtime escape hatch with a typed public interface and explicit result/error contracts.
3. Validate unknown inputs with Zod at boundary adapters and preserve authorization/scope checks.
4. Add tests proving the public service path works without private runtime mutation.
5. Reject remaining prohibited casts in the defined R1 production scope.

## Negative and adversarial cases

- A wrapper that simply returns `any` or exposes a private map is not an API.
- Do not retain a demo fallback in a claimed release path.

## Delivery tasks

- [ ] Produce escape-hatch inventory.
- [ ] Design/implement public interfaces.
- [ ] Migrate callers and tests.
- [ ] Add lint/static check and review.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/evidence/r1-runtime-escape-hatch-audit.json`
- `server/src/routes/r1-extended.ts`
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
