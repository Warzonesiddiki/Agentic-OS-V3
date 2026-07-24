# E10-S6 — Specify Governed Sandbox Security Contract

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** in_progress
**Accountable owner:** @sentinel (security architecture)
**Dependencies:** E10-S5
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a security reviewer, I need a precise bounded-process contract and threat model, so consumers do not mistake a local process runner for isolation from hostile code.

## Scope and acceptance criteria

1. State that the runner is not a VM, container, or security sandbox and identify the deployment controls required for higher-risk operations.
2. Specify command admission, executable provenance, cwd, environment, PATH, input, output, timeout, process-tree, symlink, network, Windows, receipt, approval, and recovery semantics.
3. Map each threat to preventative/detective control, test, residual risk, owner, and release disposition.
4. Document the crash boundary from claim through external effect and explicitly prohibit automatic replay of uncertainty.
5. Make the contract traceable to runner code, API policy, and adversarial tests.

## Negative and adversarial cases

- An allowlist must not be described as executable provenance or network isolation.
- Repository-controlled npm/node/git execution must remain classified as high risk.

## Delivery tasks

- [ ] Complete the threat model and admission/recovery tables.
- [ ] Review platform and process-group assumptions.
- [ ] Define acceptance tests for S7/S8/S11.
- [ ] Obtain independent security review.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/R1-sandbox-security-contract.md`
- `docs/bmad/stories/E10-S8-adversarially-test-sandbox-execution.md`
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
