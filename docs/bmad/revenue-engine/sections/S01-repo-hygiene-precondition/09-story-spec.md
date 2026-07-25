# S01 · Step 9 — Story Spec (implementation prep)

> Per-story dev guide: exact commands, files, and verification. Execution happens in Step 10.

## S01-ST1 — Working install
- **Probe:** check Node 20 availability (`node -v`; look for nvm/nvs; if only Node 22, attempt corepack
  or a Node 20 download; if impossible, fall back).
- **Primary:** install under Node 20 (matches CI) → `pnpm install --frozen-lockfile`.
- **Fallback:** retry on Node 22 + `pnpm rebuild better-sqlite3`; if header fetch still fails, set
  `NODEJS_ORG_MIRROR` to a reachable mirror; document residual constraint.
- **Verify:** exit code 0; `node -e "require('better-sqlite3')"` loads without ABI error.

## S01-ST2 — `.gitignore` patterns
- Append the §3 block from `02-research.md` to `.gitignore`.
- **Verify:** `git check-ignore server/tsc-x.txt __check.cjs _bmad-output/x.err` returns matches.

## S01-ST3 — Delete verified-unreferenced scratch
- Remove the §2.1 list (root `__check*`, `agent-dag-real.txt`, `dd-real.txt`, `marketplace.service.ts`,
  `meta.ts`; `server/` scratch dumps + temps).
- **Verify:** `git status` shows deletions only; no source file references them.

## S01-ST4 — Verify-and-handle empty 0-byte files
- For each §2.2 file: `grep -rn "<basename without ext>" --include=*.ts --include=*.tsx .`.
- Unreferenced → delete. Referenced → delete file AND its import line; re-run typecheck.
- **Verify:** `tsc --noEmit` (server + root) still passes; `find ... -size 0` list shrinks to intended.

## S01-ST5 — Remove hardcoded-path JSON
- Delete `server/scripts/lint-clean.json`, `server/scripts/lint-tests.json`.
- **Verify:** nothing imports them (they're data dumps); `grep` confirms.

## S01-ST6 — Regression check
- Run a representative test slice (e.g. `cd server && pnpm exec vitest run tests/lib` or the audit
  tests) — environment-stable subset, not the full flaky suite.
- **Verify:** no NEW failures attributable to S01; record pass/fail counts.

## S01-ST7 — Baseline commit
- Stage all S01 changes; commit `chore(revenue-engine): S01 hygiene baseline`.
- Record SHA in `STATUS.md`; mark Step 10 done.
- **Verify:** `git show --stat HEAD` lists only intended changes.

## Step-10 execution log
(To be filled in `10-dev-story.md` as each story runs, with commands + results.)
