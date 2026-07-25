# S01 · Step 4 — PRD (section-scoped)

## Functional requirements
- **FR-1** `pnpm install` succeeds end-to-end on the supported runtime (Node 20, matching CI).
- **FR-2** All §2.1 verified-unreferenced scratch/output files are deleted.
- **FR-3** Every §2.2 empty 0-byte file is `grep`-verified; unreferenced → deleted, referenced →
  deleted together with its import statement OR documented and kept.
- **FR-4** `.gitignore` gains the scratch patterns from `02-research.md` §3.
- **FR-5** Hardcoded-path JSON (`server/scripts/lint-clean.json`, `lint-tests.json`) removed.
- **FR-6** One clean baseline commit created on `arena/019f98ab-agentic-os-v3`, referenced in `STATUS.md`.
- **FR-7** A representative test command runs without environment/native-ABI failure.

## Non-functional requirements
- **NFR-SAFE** No previously-passing test regresses. All changes are reversible (delete-only +
  gitignore + 1 commit; recoverable via `git`).
- **NFR-MIN** Minimal scope: zero source-code edits, zero dependency changes, zero schema changes.
- **NFR-ATTR** The baseline commit message follows the repo's conventional-commit style and names S01.
- **NFR-AUDIT** Every deletion is listed in `10-dev-story.md` so the change set is fully auditable.

## Acceptance criteria (= STATUS.md definition of done)
1. `pnpm install` exits 0 including `better-sqlite3`.
2. `git status` clean of scratch/output files; `.gitignore` prevents recurrence.
3. Representative test run executes without native/env errors.
4. No previously-passing test broken.
5. Baseline commit exists and is referenced from `STATUS.md`.
6. Step-11 adversarial review confirms safe/minimal/reversible.

## Open decisions
- If Node 20 is unavailable in this sandbox, fall back to retry + header mirror (Option 2/3) and
  document the residual environment constraint; do NOT bump the dependency.
