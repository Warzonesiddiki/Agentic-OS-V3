# E10-S8 — Adversarially Test Sandbox Execution

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** in_progress
**Accountable owner:** @sentinel (security QA)
**Dependencies:** E10-S7
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a security reviewer, I need adversarial evidence against the real runner, so bounded execution cannot be certified with echo-only unit tests.

## Scope and acceptance criteria

1. Test real project-root `git`, `node`, and package-manager fixtures using controlled executable and filesystem inputs.
2. Prove rejection or safe handling of PATH hijack, command spoofing, shell metacharacters, secret inheritance, symlink roots, network-risk commands, output floods, timeouts, nested children, and nonzero exit.
3. Test Windows-specific launch and taskkill behavior on Windows or record it as an explicit release block with a supported-platform policy.
4. Verify no test logs or receipts reveal fixture secrets.
5. Retain process cleanup and negative-test evidence in the ledger.

## Negative and adversarial cases

- Do not infer PATH safety from a direct absolute binary invocation.
- Do not silently skip Windows or nested-child tests.

## Delivery tasks

- [ ] Build disposable fixtures outside release source paths.
- [ ] Implement adversarial tests with cleanup assertions.
- [ ] Run on Linux and Windows supported runners.
- [ ] Review residual risks against S6.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `server/tests/r1-sandbox-runner.test.ts`
- `server/tests/r1-security-isolation.test.ts`
- `docs/bmad/releases/R1-sandbox-security-contract.md`
- `docs/bmad/releases/evidence/2026-07-24-e10-s7-r1-targeted-server.log`
- `docs/bmad/releases/evidence/`

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
