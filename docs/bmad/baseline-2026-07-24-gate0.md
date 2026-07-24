# E10-R1 Gate 0 Validation Baseline — 2026-07-24

**Status:** Release blocked. This document supersedes prior *current-state* claims but does not rewrite historical validation snapshots.
**Authority:** `docs/bmad/sprint-status.yaml` for delivery status; `docs/bmad/releases/evidence/2026-07-24-release-evidence-ledger.json` for reproducible command evidence.
**Decision owner:** Independent reviewer assigned by E10-S30.
**Gate state:** In progress. This document does not close Gate 0; 88 full-suite remediation records remain open, ten exact-file repairs await a green full-suite confirmation, and independent review remains pending.

## Current evidence

| Surface | Current result | Release interpretation |
|---|---:|---|
| SDK unit suite | 255 passed (fresh E10-S7 rerun; raw log retained) | Positive targeted evidence only |
| Targeted R1 server suite | 24 passed (fresh E10-S7 rerun; raw log retained) | Positive targeted evidence only |
| SDK/A2A/server typechecks | Pass | Compilation evidence only |
| Server lint | 0 errors, 0 warnings (fresh E10-S7 rerun; raw log retained) | Static-style evidence only |
| Full repository suite | **88 failed files; 141 failed tests; 1,777 passed; 12 skipped** (latest remediation rerun) | **Release blocker** |
| Production dependency audit | Unresolved high/moderate findings | **Release blocker** |
| Clean-machine golden path | Not executed | **Release blocker** |
| R1 migration set | `0049–0054` present; forward/rollback/restore matrix not executed | **Release blocker** |
| Rollback plan/drill | Not executed | **Release blocker** |

## Historical claim reconciliation

| Historic artifact/value | Meaning now | Disposition |
|---|---|---|
| README 94/100 campaign status | Outdated campaign metadata | Replaced by release-blocked notice |
| Sprint/campaign 98/100 | Historical planning score, not validation evidence | Invalid for release decision |
| Validated baseline 100/100 / 249 SDK tests | Historical narrow-scope validation at the stated commit | Retained as historical snapshot; not current release proof |
| Earlier ledger 254 SDK tests / handoff 255 SDK tests | 254 was an earlier targeted observation; 255 is the fresh 2026-07-24 rerun | The dated raw rerun log records 255; neither targeted total is whole-project proof |
| Release-gate 91-test/0049–0052 references | Historical values corrected in the release document | Current migration inventory is 0049–0054; validation remains incomplete |
| Fresh SDK result 255 | Reproducible targeted result from this remediation branch | Raw output and checksum are recorded in the evidence ledger; still insufficient alone |

## Full-suite triage

The current run is retained without suppression:

- latest remediation rerun raw output: `docs/bmad/releases/evidence/2026-07-24-full-suite-e10-s7-root-health-and-security-remediation.log`
- earlier root/health remediation rerun retained as historical evidence: `docs/bmad/releases/evidence/2026-07-24-full-suite-e10-s7-root-and-health-remediation.log`
- E10-S7 baseline rerun retained as historical evidence: `docs/bmad/releases/evidence/2026-07-24-full-suite-e10-s7-rerun.log`
- earlier Gate 0 rerun retained as historical evidence: `docs/bmad/releases/evidence/2026-07-24-full-suite-rerun-current.log`
- original historical raw capture retained: `docs/bmad/releases/evidence/2026-07-24-full-suite.log`
- machine-readable classification: `docs/bmad/releases/evidence/2026-07-24-full-suite-triage.json`

The triage records one primary category per failing test file, while retaining all individual failed cases in the raw log:

| Category | Failing test files | Required disposition |
|---|---:|---|
| Actual product defect | 51 baseline; **41 open in latest rerun** | Reproduce, assign owner, repair, add regression evidence |
| Environment/native dependency failure | 26 baseline; **26 open in latest rerun** | Run with built `better-sqlite3`; then preserve/fix any remaining behavioral failure |
| Stale/broken test or mock/import contract | 21 baseline; **21 open in latest rerun** | Repair test/code contract, or replace only through approved evidence-preserving change |

No category is an exclusion. Every entry remains a release blocker until it has a green replacement result or an explicit approved removal with equivalent coverage.

## Gate 0 exit criteria

Gate 0 is not complete until:

1. all current release/perfection claims reference this baseline and ledger;
2. E10-S1 through E10-S5 have detailed stories and acceptance evidence;
3. each full-suite failure has an owner, disposition, and rerun evidence;
4. the release document contains no stale count, migration, or completion claim;
5. an independent reviewer confirms the evidence ledger is reproducible.
