# S01 · Step 8 — Sprint Planning

## Sprint: `s01-hygiene-baseline`
- **Goal:** A clean, installable, attributable baseline for the Revenue Engine.
- **Capacity:** 11 points.
- **Status:** planned → in-progress.
- **Committed stories:** S01-ST1, ST2, ST3, ST4, ST5, ST6, ST7 (in order).

## Burndown / order
1. ST1 working install (blocker for ST6 verification).
2. ST2 gitignore (enables clean ST3).
3. ST3 delete verified scratch.
4. ST4 verify + handle empties.
5. ST5 remove hardcoded-path JSON.
6. ST6 regression check.
7. ST7 baseline commit.

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| Node 20 unavailable in sandbox | Fall back to retry + header mirror; document residual env constraint; no dep bump |
| Deleting a referenced empty file breaks build | `grep` verify each before delete; remove import alongside; ST6 catches regressions |
| Scratch files recur | ST2 gitignore patterns lock it down |
| Native ABI still mismatched at runtime | `pnpm rebuild better-sqlite3` (CI's own step) |

## Definition of Done for the sprint
All 7 stories done + Step-11 adversarial review passes → S01 `COMPLETE: 100% READY` → unlock S02.
