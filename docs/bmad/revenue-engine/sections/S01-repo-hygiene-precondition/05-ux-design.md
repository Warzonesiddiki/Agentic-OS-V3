# S01 · Step 5 — UX Design (developer-facing)

> S01 is an internal hygiene task with no end-user UI. "UX" here = the **developer experience**
> and the **observable states** a developer or agent encounters.

## Primary actor
A developer (or agent) running the Revenue Engine build.

## Journey U-S01 — "Get to a clean, working base"
1. Clone/checkout `arena/019f98ab-agentic-os-v3`.
2. Run `pnpm install` → **expected:** exits 0, `better-sqlite3` builds/fetches, no header-fetch error.
3. Run `git status` → **expected:** clean working tree (no `tsc-*.txt`, no `*.err`, no `.hermes-tmp.*`).
4. Touch a scratch file (e.g. `echo x > server/tsc-test.txt`) → **expected:** it is **ignored**, not tracked.
5. Run a representative test → **expected:** runs without native-ABI / environment errors; no new failures.

## Observable "done" states (what success looks like)
- **Install:** green, fast (prebuilt, no source compile).
- **Tree:** `git status --porcelain` shows nothing unexpected.
- **Ignore:** the scratch patterns are inert.
- **History:** one clearly-labelled baseline commit; future engine commits diff cleanly against it.

## Error/degraded states (and how they present)
- **Node mismatch:** install fails on `better-sqlite3` source build → message names Node version;
  mitigation documented in `04-prd.md` Open decisions.
- **Accidental tracked scratch:** `git status` shows new junk → `.gitignore` gap to fix immediately.

## Accessibility/notes
- All commands must run non-interactively (sandbox has no TTY).
- Every action is logged into `10-dev-story.md` for review.
