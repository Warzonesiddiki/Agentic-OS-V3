# E10-R1 Gate 0 Validation Baseline — 2026-07-24

**Status:** Release blocked. This document supersedes prior *current-state* claims but does not rewrite historical validation snapshots.  
**Authority:** `docs/bmad/sprint-status.yaml` for delivery status; `docs/bmad/releases/evidence/2026-07-24-release-evidence-ledger.json` for reproducible command evidence.  
**Decision owner:** Independent reviewer assigned by E10-S30.

## Current evidence

| Surface | Current result | Release interpretation |
|---|---:|---|
| SDK unit suite | 254 passed | Positive targeted evidence only |
| Targeted R1 server suite | 16 passed | Positive targeted evidence only |
| SDK/A2A/server typechecks | Pass | Compilation evidence only |
| Server lint | 0 errors, 0 warnings | Static-style evidence only |
| Full repository suite | **98 failed files; 159 failed tests** | **Release blocker** |
| Production dependency audit | Unresolved high/moderate findings | **Release blocker** |
| Clean-machine golden path | Not executed | **Release blocker** |
| Rollback plan/drill | Not executed | **Release blocker** |

## Historical claim reconciliation

| Historic artifact/value | Meaning now | Disposition |
|---|---|---|
| README 94/100 campaign status | Outdated campaign metadata | Replaced by release-blocked notice |
| Sprint/campaign 98/100 | Historical planning score, not validation evidence | Invalid for release decision |
| Validated baseline 100/100 / 249 SDK tests | Historical narrow-scope validation at the stated commit | Retained as historical snapshot; not current release proof |
| Release-gate 91-test/0049–0052 references | Stale post-expansion counts | Must be corrected by E10-S2 before gate closure |
| Current SDK result 254 | Reproducible targeted result from this remediation branch | Recorded in evidence ledger; still insufficient alone |

## Full-suite triage

The current run is retained without suppression:

- raw output: `docs/bmad/releases/evidence/2026-07-24-full-suite.log`
- machine-readable classification: `docs/bmad/releases/evidence/2026-07-24-full-suite-triage.json`

The triage records one primary category per failing test file, while retaining all individual failed cases in the raw log:

| Category | Failing test files | Required disposition |
|---|---:|---|
| Actual product defect | 51 | Reproduce, assign owner, repair, add regression evidence |
| Environment/native dependency failure | 26 | Run with built `better-sqlite3`; then preserve/fix any remaining behavioral failure |
| Stale/broken test or mock/import contract | 21 | Repair test/code contract, or replace only through approved evidence-preserving change |

No category is an exclusion. Every entry remains a release blocker until it has a green replacement result or an explicit approved removal with equivalent coverage.

## Gate 0 exit criteria

Gate 0 is not complete until:

1. all current release/perfection claims reference this baseline and ledger;
2. E10-S1 through E10-S5 have detailed stories and acceptance evidence;
3. each full-suite failure has an owner, disposition, and rerun evidence;
4. the release document contains no stale count, migration, or completion claim;
5. an independent reviewer confirms the evidence ledger is reproducible.
