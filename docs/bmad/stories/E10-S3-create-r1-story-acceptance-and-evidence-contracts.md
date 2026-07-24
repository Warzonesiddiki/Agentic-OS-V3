# E10-S3 — Create E10-R1 Story Acceptance and Evidence Contracts

**Epic:** E10-R1 — Integrity, Security, and Release Requalification
**Priority:** P0
**Status:** in_progress
**Accountable owner:** @lorekeeper (BMAD backlog owner)
**Dependencies:** E10-S1, E10-S2
**Release authority:** None. R1 remains blocked until an independent E10-S30 approval.

## User story

As a remediation owner, I need every E10-R1 workstream expressed as a testable story with evidence and review requirements, so implementation cannot be declared complete by task count alone.

## Scope and acceptance criteria

1. Create and maintain one detailed story file for every E10-S1 through E10-S30 workstream.
2. Each story must name an accountable owner, dependencies, scoped user outcome, objective acceptance criteria, negative/failure cases, implementation tasks, validation commands, evidence paths, and adversarial review requirement.
3. Each story must prohibit release approval and manual done status absent the common E10 definition of done.
4. Sprint status must link every E10 story to its detailed file and real evidence, with status no stronger than the evidence supports.
5. The epic index must link to the detailed story inventory and preserve dependency ordering.

## Negative and adversarial cases

- A checklist, code reference, or expected future test is not evidence of story completion.
- Do not mark an E10 story done merely because its story file now exists.

## Delivery tasks

- [ ] Create the 30 story contracts.
- [ ] Update epic and sprint traceability links.
- [ ] Review story boundaries for missing security, ownership, failure, or evidence requirements.
- [ ] Record a backlog-review result and leave the release gate blocked.

## Required validation

- Run the story-specific unit, contract, integration, and E2E checks and retain raw output in the release evidence directory.
- Run relevant TypeScript typechecks and lint; for production changes, run the prescribed targeted R1 tests and the full suite according to the ledger policy.
- Re-run the evidence ledger/triage validator and documentation claim scan when evidence, status, or release wording changes.
- Record an adversarial review that attempts the negative cases above. A self-authored implementation note is not that review.

## Expected evidence

- `docs/bmad/stories/E10-S1-freeze-unsupported-release-and-perfection-claims.md`
- `docs/bmad/stories/E10-S30-conduct-independent-adversarial-release-audit.md`
- `docs/bmad/sprint-status.yaml`
- `docs/bmad/07-epics-and-stories.md`
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
