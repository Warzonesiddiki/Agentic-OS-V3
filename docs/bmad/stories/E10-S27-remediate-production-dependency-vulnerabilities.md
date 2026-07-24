# E10-S27 — Remediate Production Dependency Vulnerabilities

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** backlog
**Accountable owner:** @bastion (supply-chain security)
**Dependencies:** E10-S26
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a deployer, I need production dependency advisories remediated or formally mitigated, so known vulnerable code is not silently shipped.

## Scope and acceptance criteria

1. Run and retain `pnpm audit --prod`/lockfile advisory results on a clean install.
2. Remediate high/critical fast-uri and applicable Hono Node server/React Router findings through compatible upgrades, overrides, removals, or code-path elimination.
3. For any approved exception, record advisory, affected runtime path, severity, exploitability, compensating control, owner, due date, approval, and retest command.
4. Run relevant typecheck/build/tests after every dependency change and inspect lockfile provenance.
5. Release remains blocked for unapproved high/critical production advisories.

## Negative and adversarial cases

- A dev-only classification must be proven from the production dependency graph.
- Do not suppress audit output or use an undocumented override.

## Delivery tasks

- [ ] Inventory advisories.
- [ ] Upgrade/remediate and test.
- [ ] Create exceptions only through S28 matrix.
- [ ] Publish fresh audit evidence.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/releases/evidence/dependency-audit.json`
- `pnpm-lock.yaml`
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
