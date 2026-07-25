# S01 · Step 6 — Architecture (section-scoped)

## What changes
| Layer | Change | Reversible? |
|---|---|---|
| Filesystem | Delete ~30 verified-unreferenced scratch/output files | ✅ via `git` |
| Filesystem | Delete/remove-import for ~25 empty 0-byte files (after verify) | ✅ via `git` |
| Config | `.gitignore` += scratch patterns (§3 of research) | ✅ |
| Config | Remove `server/scripts/lint-clean.json`, `lint-tests.json` (hardcoded paths) | ✅ |
| Local runtime | Align to Node 20 (match CI) for the install | env-only, not committed |
| History | One baseline commit on the branch | ✅ (it's an additive commit) |

## What does NOT change
- No source code under `server/src`, `src`, `packages`, `crates`.
- No `package.json` / `pnpm-lock.yaml` / dependency versions.
- No DB schema, migrations, routes, or services.
- No CI workflow files.

## Baseline-snapshot approach
- Stage all S01 changes, then create **one commit** `chore(revenue-engine): S01 hygiene baseline`.
- Reference its SHA from `STATUS.md`.
- All subsequent Revenue-Engine work diffs against this commit → attributable history even though
  the repo currently has a single squashed root commit.

## Risk controls
- **Verify-before-delete:** every §2.2 empty file is `grep`-checked for imports before removal.
- **Gitignore-first:** add ignore patterns before bulk delete so nothing re-enters.
- **Atomic-ish:** deletions are one logical change set; a single revert recovers everything.
- **No force-push, no history rewrite** — additive commit only.
