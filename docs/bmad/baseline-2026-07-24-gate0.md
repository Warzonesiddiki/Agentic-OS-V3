# E10-R1 Gate 0 Validation Baseline — 2026-07-24

**Status:** Release blocked. This document supersedes prior *current-state* claims but does not rewrite historical validation snapshots.
**Authority:** `docs/bmad/sprint-status.yaml` for delivery status; `docs/bmad/releases/evidence/2026-07-24-release-evidence-ledger.json` for reproducible command evidence.
**Decision owner:** Independent reviewer assigned by E10-S30.
**Gate state:** In progress. This document does not close Gate 0; the latest retained rerun has 63 full-suite remediation records open, 35 exact-file repairs still await a green full-suite confirmation, and independent review remains pending.

## Current evidence

| Surface | Current result | Release interpretation |
|---|---:|---|
| SDK unit suite | 257 passed (latest retained rerun; raw log and checksum retained) | Positive targeted evidence only |
| Targeted E10-S8/S9 server suite | 29 passed across 4 files (latest retained rerun; raw log and checksum retained) | Positive targeted evidence only; live PostgreSQL remains unexecuted |
| SDK/A2A/server typechecks | Pass | Compilation evidence only |
| Server lint | 0 errors, 0 warnings (latest retained E10-S8 rerun; raw log and checksum retained) | Static-style evidence only |
| Full repository suite | **63 failed files; 200 failed tests; 192 passed files; 2,236 passed tests; 21 skipped; 2 unhandled errors** (latest retained rerun with a locally built native binding) | **Release blocker** |
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
| Earlier ledger 254 SDK tests / handoff 255 SDK tests | 254 and 255 were earlier targeted observations; the latest retained 2026-07-24 rerun has 257 | The dated raw rerun logs preserve each result; no targeted total is whole-project proof |
| Release-gate 91-test/0049–0052 references | Historical values corrected in the release document | Current migration inventory is 0049–0054; validation remains incomplete |
| Latest SDK result 257 | Reproducible targeted result from this validation batch | Raw output and checksum are recorded in the evidence ledger; still insufficient alone |

## Full-suite triage

The current run is retained without suppression:

- latest retained rerun raw output: `docs/bmad/releases/evidence/2026-07-24-e10-s8-s9-full-suite-final.log`
- earlier native-enabled validation rerun retained as historical evidence: `docs/bmad/releases/evidence/2026-07-24-arena-019f958d-full-suite.log`
- earlier root/health/security remediation rerun retained as historical evidence: `docs/bmad/releases/evidence/2026-07-24-full-suite-e10-s7-root-health-and-security-remediation.log`
- earlier root/health remediation rerun retained as historical evidence: `docs/bmad/releases/evidence/2026-07-24-full-suite-e10-s7-root-and-health-remediation.log`
- E10-S7 baseline rerun retained as historical evidence: `docs/bmad/releases/evidence/2026-07-24-full-suite-e10-s7-rerun.log`
- earlier Gate 0 rerun retained as historical evidence: `docs/bmad/releases/evidence/2026-07-24-full-suite-rerun-current.log`
- original historical raw capture retained: `docs/bmad/releases/evidence/2026-07-24-full-suite.log`
- machine-readable classification: `docs/bmad/releases/evidence/2026-07-24-full-suite-triage.json`

The triage records one primary category per failing test file, while retaining all individual failed cases in the raw log:

| Category | Failing test files | Required disposition |
|---|---:|---|
| Actual product defect | 51 baseline; **30 open in the same current classification** | Reproduce, assign owner, repair, add regression evidence |
| Environment/native dependency failure | 26 baseline; **0 current failures remain classified solely as native-load failures in this local run**; prescribed clean preparation is still not reproducibly green | Do not treat the local-header workaround as clean-machine proof; retain preparation failures and rerun on the supported clean environment |
| Behavioral failure exposed after native build | **13 open records originated in the native baseline category** | Reproduce and classify each exposed failure as product or contract debt, repair it, and retain regression evidence |
| Stale/broken test or mock/import contract | 21 baseline; **20 open in latest rerun** | Repair test/code contract, or replace only through approved evidence-preserving change |

No category is an exclusion. Thirty-five baseline records now have passing exact-file evidence, but they do not establish a green repository suite. The 63 records corresponding to currently failing files remain open release blockers; every verified repair still awaits a fully green suite or an explicit independently approved replacement with equivalent coverage.

## Gate 0 exit criteria

Gate 0 is not complete until:

1. all current release/perfection claims reference this baseline and ledger;
2. E10-S1 through E10-S5 have detailed stories and acceptance evidence;
3. each full-suite failure has an owner, disposition, and rerun evidence;
4. the release document contains no stale count, migration, or completion claim;
5. an independent reviewer confirms the evidence ledger is reproducible.
