# E10-S7 — Implement Real Constrained Process Runner

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** in_progress
**Accountable owner:** @artisan (runtime implementation)
**Dependencies:** E10-S6
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As an approved task executor, I need an actual constrained process runner, so an approved command has a real, observable effect instead of a simulated result.

## Scope and acceptance criteria

1. Execute only an exact approved allowlisted command with `spawn`/`shell:false`; reject shell syntax, absolute paths, aliases, unsafe arguments, and unapproved operations before spawn.
2. Resolve the project root once, reject symlink aliases, and run only with that root as cwd.
3. Use a minimal inherited environment with no ambient secrets; set safe PATH/HOME/NO_COLOR only.
4. Enforce bounded timeout, combined output cap, ignored stdin, explicit pipes, nonzero result handling, and POSIX process-tree cleanup; fail closed on Windows until a separately validated platform implementation exists.
5. Create redacted receipt/effect-claim links for every allow/deny/spawn/exit outcome.

## Negative and adversarial cases

- Do not use shell execution, simulated success, caller-controlled cwd, or unbounded output.
- Do not call the runner a security sandbox.

## Delivery tasks

- [ ] Implement typed request/result adapter and Zod boundary.
- [ ] Integrate approval, policy, claim, receipt, and task/checkpoint context.
- [ ] Add real project-root command integration tests.
- [ ] Run lint/typecheck and S8 adversarial suite.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `server/src/services/r1-sandbox-runner.ts`
- `server/tests/r1-sandbox-runner.test.ts`
- `docs/bmad/releases/evidence/2026-07-24-e10-s7-r1-targeted-server.log`
- `docs/bmad/releases/evidence/2026-07-24-full-suite-e10-s7-rerun.log`

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
