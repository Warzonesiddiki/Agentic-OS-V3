# ADR-0011: Compile-Gate Discipline — False-Green Trap, Phantom Errors & Serial Fix

**Status:** Accepted (ratified 2026-07-09, Lorekeeper authority; session lesson)
**Owner:** Lorekeeper (docs namespace) · **Applies to:** all 20 agents + Leader
**Companion:** `docs/adr/0010-frozen-routes-signoff.md`, `docs/AUTONOMOUS_OPERATIONS_MANUAL_v4.0.0.md` §10, `docs/PLAN_TRACKER.md`

---

## 1. Context

During the autonomous relaunch the fleet's compile gate oscillated wildly: **267 → 1 → 134 → 2 →
171 → (phantom) 161/46/30/1/2** as measured by _individual agents'_ `tsc` runs. The root cause was
**not** 171 real errors — it was **measurement methodology**:

1. **False-green trap:** a naive `npx tsc --noEmit` (incremental, default) returns 0 while a stale
   `*.tsbuildinfo` masks ~50 real errors. The cached result is untrustworthy.
2. **Phantom errors:** when 9 agents edit in parallel and each runs the full-repo `tsc`, every agent
   samples _other agents' half-written files_. Those reads produce spurious `error TS` lines that
   shift run-to-run (e.g. `agent-dag.ts:186` one run, `forge-selfheal.ts:248` the next) because the
   underlying file changes between samples. The error set is **noise from mid-write files**, not real
   defects.
3. **Correlated halts:** agents halted on phantoms they saw in _other_ namespaces, freezing useful
   work. A HARD HALT + serial-fix token was tried, then abandoned once the phantom nature was proven
   (Leader measured the settled/quiescent FS: **0 errors**).

The real repo was green underneath the entire storm. The lesson: **measure the true gate correctly,
and never trust a single agent's in-flight `tsc` as the source of truth.**

## 2. Decision

1. **The ONE TRUE GATE:** `cd server && rm -f *.tsbuildinfo && npx tsc --noEmit --incremental false`,
   run in a **single clean shell**. Incremental `npx tsc --noEmit` is **not** trusted.
2. **Authoritative snapshot = settled FS:** the Leader (or a designated quiescent measurer) shuts all
   writers, lets the FS settle, then runs the true gate. That count is authoritative. In-flight agent
   `tsc` counts are mirrors and may differ.
3. **Phantom rule:** an error in _another owner's_ file during parallel work is **phantom** (half-
   written read) → **do not halt, do not fix, just note "saw phantom in X:NN, ignored"** and continue.
   Only an error in _your own_ namespace after a fresh gate is real.
4. **Edit discipline:** one file → fresh gate → 0 → next file. Never batch many cross-file edits then
   validate once (that widened the storm).
5. **FROZEN rule (ADR-0010):** never change a FROZEN/shared-surface file's import shape; fix your own
   module's signature. A real break there = revert + escalate.
6. **Reporting:** each agent reports per batch "<area>: my-namespace tsc=0, <shipped>; phantom-in-X
   ignored." The Leader periodically settles the FS and confirms the true gate; if it stays 0, the
   repo is green and phases may flip to COMPLETED.

## 3. Consequences

- The fleet holds `tsc=0` continuously while working in parallel, because phantom reads are ignored
  and real errors are caught in the writer's own namespace.
- `PLAN_TRACKER.md` reflects the **true** (settled) gate state, not any single agent's in-flight
  mirror. Lorekeeper escalates only on a Leader-confirmed non-zero settled gate.
- `docs/**` is exempt: it contains **no `.ts` files**, contributes 0 `tsc` errors by construction, and
  can never redden the gate. Lorekeeper validates/report the gate but never breaks it.

## 4. Reconciliation note

Authored after the storm resolved to GATE=0 (Leader settled-FS measurement). It codifies why the
171/46/30 counts were phantom and how to avoid re-triggering a false halt. Supersedes the earlier
HARD-HALT/serial-token experiment (kept as historical context, not current protocol).

_End of ADR-0011._
