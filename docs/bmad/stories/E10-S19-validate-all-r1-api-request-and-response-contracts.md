# E10-S19 — Validate All R1 API Request and Response Contracts

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @Warzonesiddiki (API contract owner)
**Dependencies:** E10-S18
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As an API consumer, I need every R1 request and response boundary validated, so malformed input and accidental response drift fail safely.

## Scope and acceptance criteria

1. Inventory all R1 HTTP/MCP/client request, path/query, body, and response boundaries.
2. Use Zod schemas to parse every unknown request and validate successful/error response shapes before serialization or client consumption.
3. Return stable redacted error envelopes and reject malformed/oversized/cross-project payloads.
4. Add contract tests for invalid input, response drift, auth/scope denial, and content redaction.
5. Expose schema version/compatibility decisions where clients persist data.

## Negative and adversarial cases

- TypeScript annotations without runtime parsing do not validate HTTP input.
- Do not accept unvalidated JSON or leak parser internals/secrets in errors.

## Delivery tasks

- [ ] Build route/client contract inventory.
- [ ] Add schemas and typed helpers.
- [ ] Migrate routes/responses.
- [ ] Run API contract and security tests.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/evidence/r1-api-contract-inventory.json`
- `server/tests/r1-api-contracts.test.ts`
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
