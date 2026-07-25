# S01 · Step 1 — Brainstorming: Repo Hygiene Precondition

> **Section:** S01 — Repo hygiene precondition (minimal safe cleanup before any Revenue-Engine code lands)
> **Techniques:** First Principles · SCAMPER · Ideation Mapping
> **Output type:** Options + recommendation → user input → Step 2 (Research)

## 1. The question (framed)

> Before any money-handling code is added to this repo, what is the **minimal, safe**
> cleanup that must happen so the engine builds on a clean, attributable, testable base?

## 2. First Principles — what MUST be true?

1. **The install must work.** We cannot test money logic if `pnpm install` fails on the
   `better-sqlite3` native build (it currently fails fetching node headers — confirmed in audit).
2. **No misleading emptiness.** A codebase that will handle real money must not contain
   empty 0-byte stubs that could be mistaken for real implementations. Empty `marketplace.service.ts`
   / `meta.ts` at root, `.hermes-tmp.*`, empty `tests/*.test.ts`, and a file literally named
   `sandbox-worker-bootstrap.cjs --notes-fallback` are risk signals, not features.
3. **Attributability.** The repo currently has **1 squashed commit**. To attribute future
   Revenue-Engine changes cleanly, we need a clean baseline snapshot we can diff against.
4. **Do no harm.** Cleanup must not break existing functionality or the existing 1,746 passing tests.
   Every deletion must be verified unreferenced first.

## 3. SCAMPER on "cleanup"

- **S**ubstitute scratch dumps → `.gitignore` + proper temp dirs (replace the ~24 `tsc-*.txt` /
  `eslint_*.json` / `vitest_out.txt` / `err.txt` files in `server/`).
- **C**ombine the scattered scratch outputs into one ignored location so they stop recurring.
- **A**dopt the repo's own `_bmad-output/*.err` pattern but make it gitignored.
- **M**odify scope to **minimal** — only what unblocks the engine. (The 171-service sprawl is
  explicitly **out of scope** for S01; it is noted, not fixed here.)
- **E**liminate clearly-junk files (after verifying they are unreferenced).
- **R**everse the default: instead of "clean everything," clean **only what blocks** (targeted).

## 4. Ideation map — three candidate approaches

| Approach | What it does | Risk | Effort |
|---|---|---|---|
| **(a) Build on messy base** | Nothing; start coding immediately | High — install broken, stubs mislead, no attribution | 0 |
| **(b) Full hygiene pass** | Clean all sprawl, reorganize 171 services, full history | High scope-creep; could destabilize R1-gate work | Large |
| **(c) Targeted minimal cleanup** ⭐ | Fix install; remove junk scratch + unreferenced empty files; prevent recurrence; snapshot baseline | Low — minimal, reversible, verified | Small |

## 5. Recommendation: (c) Targeted minimal cleanup

Concrete actions (to be confirmed in Steps 2–10):
1. **Fix the install** — resolve the `better-sqlite3` native build (research Step 2 will pick the
   method: node-version alignment with CI / header mirror / prebuilt; the known constraint is the
   sandbox network couldn't fetch `node-v22.22.3-headers.tar.gz`).
2. **Remove junk scratch/output files** and add `.gitignore` rules so they don't recur
   (`server/tsc-*.txt`, `server/eslint_*.json`, `server/vitest_out.txt`, `server/err.txt`,
   `agent-dag-real.txt`, `dd-real.txt`, `__check.*`, root `marketplace.service.ts`, root `meta.ts`,
   the `… --notes-fallback` file, `.hermes-tmp.*`).
3. **Verify-then-remove empty 0-byte files** — grep each for imports/references before deletion;
   referenced ones are documented, not deleted.
4. **Snapshot a clean baseline** so future Revenue-Engine changes are diffable & attributable.
5. **Defer** the 171-service sprawl and squashed-history issues — explicitly out of scope for S01.

## 6. Observable proof (when S01 is done)
- `pnpm install` exits 0 including native modules.
- `git status` is clean of scratch/output files; recurrence is blocked by `.gitignore`.
- A representative test run executes without environment/native errors.
- No previously-passing test is broken.
- Baseline snapshot committed and referenced from `STATUS.md`.

## 7. Open questions for you (before Step 2 — Research)

1. **Scope confirmation** — agree to approach **(c) targeted minimal** and explicitly defer the
   171-service sprawl + single-commit history to a later section (not S01)?
2. **Install fix policy** — may I change the **Node version** used locally (e.g., align to Node 20
   like CI) and/or add a header mirror config to unblock `better-sqlite3`? (This touches build
   tooling, so I want explicit yes before changing it.)
3. **History** — for attribution, is it acceptable to create a clean baseline **commit** on this
   branch (`arena/019f98ab-agentic-os-v3`) before any engine code, or do you want the cleanup
   folded into the first feature commit?
4. **Aggressiveness on empty files** — delete all unreferenced 0-byte files, or only those inside
   the Revenue-Engine's future namespace?

> Reply to these four (or just "go with your recommendation") and I proceed to **Step 2 — Research**.
