# E10-S1 — Freeze Unsupported Release and Perfection Claims

**Epic:** E10-R1 Integrity, Security, and Release Requalification  
**Priority:** P0  
**Status:** in_progress  
**Trigger:** 2026-07-24 adversarial audit found that completion/perfection claims exceeded executable evidence.

## User story

As a release stakeholder, I need every public and internal release claim to state only what current reproducible evidence proves, so I am not misled into deploying an unqualified system.

## Acceptance criteria

1. README, sprint status, scorecard, release gate, and current baseline all state `release blocked` until E10-S30 independently approves release.
2. Historical snapshots remain dated and are never silently rewritten as current evidence.
3. No current artifact presents 94, 98, or 100 as a release/perfection decision.
4. Every release claim links to a dated evidence ledger and command artifact.
5. Search-based regression check proves that `production-ready`, `release candidate`, `100/100`, and `zero compromises` are either historical/contextual or explicitly blocked.
6. An adversarial documentation reviewer verifies that stale feature claims cannot be mistaken for current validation.

## Negative cases

- A historical 249-test snapshot must not be deleted or relabeled as a 254-test current run.
- A passing targeted suite must not clear a failing full-suite blocker.
- A release checklist item may not be checked merely because an implementation exists.

## Evidence

- `docs/bmad/README.md`
- `docs/bmad/releases/R1-release-gate.md`
- `docs/bmad/subagents/perfection-scorecard.yaml`
- `docs/bmad/baseline-2026-07-24-gate0.md`
- `docs/bmad/releases/evidence/2026-07-24-release-evidence-ledger.json`

## Definition of done

All acceptance criteria pass, affected documentation is reviewed adversarially, sprint status records real paths, and E10-S2 confirms a single current authority.
