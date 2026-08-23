# WS4 Drill Runbook — Clean-Machine Golden Path (B4)

**Purpose:** turn `docs/bmad/GOLDEN-PATH-SPECIFICATION.md` (14 steps) into an executable,
evidence-producing drill. This runbook adds only environment + evidence protocol; the steps
themselves and their acceptance criteria live in the specification and are not duplicated here.

**Preconditions to fire this drill (all must hold):**
1. WS1 full suite green locally AND on CI ubuntu/Node 22 (the authority run).
2. WS8 e2e job green on CI.
3. A clean environment: WSL2 Ubuntu 22.04+ or a fresh CI runner. Windows-native is NOT a
   supported drill platform for R1 (ADR-0031) because the constrained runner is POSIX-first.
4. Toolchain exactly as pinned: Node ^22.x via `.nvmrc`, pnpm 9.15.0 via corepack
   (`corepack enable && corepack prepare pnpm@9.15.0 --activate`).

## Evidence protocol (what makes the drill admissible)

Every step of the 14 produces one transcript segment appended to a single log file:

```
docs/bmad/releases/evidence/<date>-ws4-golden-path-drill.log
```

- Start each segment with `=== STEP <n>: <title> ===`, end with the observable acceptance
  line from the specification (e.g., receipt id, checkpoint sequence number, export hash).
- Steps 7 and 10 additionally capture: the receipt row, the checkpoint rows before/after
  recovery, and proof that no duplicate side effect exists after restart (the exact-once
  assertion from E10-S11).
- Any manual intervention beyond the documented commands = step FAILED. The suite may not
  be "repaired mid-drill"; a failed step aborts the drill, the defect is fixed as an owner
  wave item, and the drill restarts from step 1.

## Execution order

1. `git clone` the repo into an empty directory (no hardlinks, no shared caches).
2. Follow R1-release-gate local-only setup: corepack → `pnpm install` → start API
   (`PORT=1422` matches e2e config; SQLite mode, no DATABASE_URL).
3. Execute steps 1–14 of GOLDEN-PATH-SPECIFICATION verbatim, logging per protocol.
4. On completion: attach the log, the export artifact hash, and the import dry-run output
   as a ledger entry; update `sprint-status.yaml` E10-S29 state with the pointer.

## Failure handling

Any failure → file the failing step + transcript excerpt into the ledger as a blocker note,
map it to an owning namespace, fix through the normal WS1 discipline (owner namespace,
exact-file rerun), then re-run the whole drill from step 1. Partial passes are not evidence.
