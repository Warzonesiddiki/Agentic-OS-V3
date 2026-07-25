# S01 · Step 7 — Epics & Stories

> S01 is itself a section; its "epic" is the hygiene baseline. Stories are sub-tasks `S01-ST#`.

| Story | Title | Points | Depends | Acceptance |
|---|---|---|---|---|
| S01-ST1 | Establish working install (Node 20 / fallback) | 2 | — | `pnpm install` exits 0 incl. `better-sqlite3` |
| S01-ST2 | Add `.gitignore` scratch patterns | 1 | — | patterns added; new scratch ignored |
| S01-ST3 | Delete verified-unreferenced scratch files | 1 | S01-ST2 | §2.1 files gone from tree |
| S01-ST4 | Verify-and-handle empty 0-byte files | 3 | — | each §2.2 file deleted-or-documented; build intact |
| S01-ST5 | Remove hardcoded-path JSON | 1 | — | `lint-clean.json`, `lint-tests.json` gone |
| S01-ST6 | Regression check (representative tests) | 2 | ST1–ST5 | no new failures vs. baseline expectation |
| S01-ST7 | Snapshot clean baseline commit | 1 | ST6 | one commit; SHA in `STATUS.md` |

**Execution order:** ST1 → ST2 → ST3 → ST4 → ST5 → ST6 → ST7.
(ST2 before ST3 ensures deletions don't race with ignore rules.)
