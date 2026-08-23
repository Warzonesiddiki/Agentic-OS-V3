# E10-S30 Independent Reviewer Brief (D2)

**Role:** the independent release authority defined by decision D2 (`progression-plan` §9).
**Form:** a fresh, stateless agent session per review batch; never edits code; writes only
`docs/bmad/releases/evidence/reviews/<date>-<topic>.md`.

## First batch scope — Gate-0 exit

1. Reproduce from the evidence ledger, on a clean POSIX environment (CI ubuntu / Node 22):
   - full unit suite (expect 0 failed files),
   - `pnpm audit --prod` (expect exit 0),
   - migration forward/rollback/restore matrix per `down/README.md`,
   - Playwright e2e job result.
2. Inspect raw artifacts: WS0 transcripts, WS2 clean-audit proof, WS4 drill log (14/14),
   triage matrix with rerun pointers.
3. Verify `docs/bmad/gate0-exit-checklist.md`: every criterion ✅ with a ledger pointer;
   every ⏳/🔶 row resolved or explicitly deferred with rationale.
4. Adversarial pass: attempt to falsify one claim of your choosing end-to-end (pick any
   ledger entry and re-run it independently).

## Output (signed decision file)

- Verdict: **APPROVE** (R1 may tag) or **BLOCK** (with named, owned gaps).
- The reproducibility statement: which commands you personally executed and their results.
- Any claim in the checklist you could not reproduce.

Independence rules: no contributor may author, edit, or summarize your output; your session
must not receive implementation context beyond this brief + the public ledger artifacts.
