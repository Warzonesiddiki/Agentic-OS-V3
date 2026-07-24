# E10-S13 — Enforce Principal-to-Project Authorization

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @sentinel (authorization)
**Dependencies:** E10-S12
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a project member, I need principal-to-project authorization enforced at route and service boundaries, so possession of a broad scope cannot access every project.

## Scope and acceptance criteria

1. Define project membership/role authorization independently from global scopes and validate it at every R1 route and service operation.
2. Require an authorized principal for read, mutation, effect recovery, export/import, approval, and evidence actions.
3. Fail closed on absent, malformed, stale, cross-project, or revoked membership.
4. Audit decisions without logging raw secrets and test route/service defense in depth.
5. Publish authorization matrix and revocation/recovery behavior.

## Negative and adversarial cases

- A `brain:admin` or `memory:read` scope alone must not grant arbitrary project access.
- Do not rely only on UI filtering.

## Delivery tasks

- [ ] Model membership and authorization API.
- [ ] Apply to route/service boundaries.
- [ ] Add negative matrix tests.
- [ ] Review audit/redaction behavior.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/evidence/r1-project-authorization-matrix.md`
- `server/tests/r1-project-authorization.test.ts`
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
