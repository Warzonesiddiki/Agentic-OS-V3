# E10-S21 — Harden Export, Import, and Evidence Integrity

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @aegis (evidence/data governance)
**Dependencies:** E10-S20
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a project owner, I need hostile and corrupt project transfer/evidence input handled atomically and privately, so portability does not bypass tenancy, integrity, or redaction controls.

## Scope and acceptance criteria

1. Validate export/import/evidence schemas, canonical hashes, version handling, and project ownership using Zod and typed contracts.
2. Test malicious/corrupt/cross-project payloads, secret redaction, receipt omission, hash mismatch, duplicate records, poisoned transactions, and partial-write failure.
3. Prove imports are atomic on supported SQL engines and no source/destination project leaks through errors or exports.
4. Correlate exported evidence without raw secret content and preserve append-only/audit guarantees.
5. Publish compatible version and recovery behavior.

## Negative and adversarial cases

- A dry run that mutates storage or a hash that excludes meaningful data is not safe.
- Do not redact only display fields while leaving raw secrets in nested payloads.

## Delivery tasks

- [ ] Threat-model transfer/evidence paths.
- [ ] Harden parsers/canonicalization/transactions.
- [ ] Add malicious fixtures and engine tests.
- [ ] Review export artifacts for secret leakage.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `server/tests/r1-project-transfer-contract.test.ts`
- `server/tests/r1-evidence-integrity.test.ts`
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
