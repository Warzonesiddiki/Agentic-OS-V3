# S01 · Step 3 — Product Brief

## Vision (this section's scope)
Deliver a **clean, installable, attributable baseline** of the repository so the
Autonomous Revenue Engine can be built on top without inheriting scratch cruft, a broken
install, or un-attributable history.

## Target users
- **Revenue Engine build team** (developers + agents) who need `pnpm install` to work and a
  diffable baseline to attribute future changes.
- **Reviewers/QA** who must be able to verify "nothing existing broke."

## Success definition
1. `pnpm install` completes (native modules build/fetch) on the supported runtime.
2. No scratch/output files remain tracked; recurrence is blocked by `.gitignore`.
3. Every empty 0-byte file is either deleted (if unreferenced) or documented (if referenced).
4. A single clean **baseline commit** exists on the branch, referenced from `STATUS.md`.
5. No previously-passing test regresses.

## Explicit non-goals (deferred)
- Reorganizing the 171-service sprawl.
- Rewriting the single-squashed-commit history.
- Changing any dependency version.
