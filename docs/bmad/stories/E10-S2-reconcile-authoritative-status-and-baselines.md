# E10-S2 — Reconcile Authoritative Status and Baselines

**Epic:** E10-R1 Integrity, Security, and Release Requalification  
**Priority:** P0  
**Status:** in_progress

## User story

As a maintainer, I need one clearly scoped current status and baseline authority, so release decisions cannot be based on stale scores, test counts, migration ranges, or deferred-gate language.

## Acceptance criteria

1. `sprint-status.yaml` identifies the active E10-R1 remediation state and does not report a numeric perfection score before independent requalification.
2. The current baseline lists the exact current targeted counts, full-suite result, migration range, unresolved security findings, and release blockers.
3. Historical baselines contain an explicit historical-snapshot label and never claim current authority.
4. Release documentation uses `0049–0054` where it describes the current R1 migration set, unless it explicitly documents an earlier historical point.
5. Test-count references distinguish SDK targeted, targeted server, and full-suite totals; no count is presented as whole-project validation unless it is one.
6. A deterministic documentation audit reports every current authority, its date, its owner, and its evidence source.

## Negative cases

- A stale 91/91 reference must not be treated as the active SDK result.
- A migration range ending at 0052/0053 must not be used for the current release path after 0054 exists.
- A missing native dependency must not be silently converted into a passing test result.

## Evidence

- `docs/bmad/baseline-2026-07-24-gate0.md`
- `docs/bmad/sprint-status.yaml`
- `docs/bmad/releases/evidence/2026-07-24-release-evidence-ledger.json`
- release documentation audit command/result

## Definition of done

An independent reviewer can identify the one current release decision and reproduce every referenced result without interpreting historical documents as current state.
