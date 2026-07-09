# Pulse ↔ Forge — Interface-Only Integration Contract (Phase 18 / Pillar I)

Pulse (agent 8) tunes the runtime loop LIVE through Forge's (agent 1) **public, exported setters only**.
Pulse NEVER edits Forge's files. This document is the canonical contract.

## Forge public setters consumed by Pulse
| Pulse surface | Forge setter | Forge module | Notes |
| --- | --- | --- | --- |
| self-opt tuner 18.20 (RL Scheduling Policy) | `setSchedulingPolicy(name: 'mlfq'|'edf'|'fairshare')` | `server/src/services/scheduler.ts` | invoked by `rlSchedulingAdapter.onApply` |
| self-opt tuner 18.7 (Queue Auto-Scaler) | `configureWorker(opts: Partial<WorkerOptions>)` | `server/src/services/task-worker.ts` | invoked by `queueAutoScalerAdapter.onApply`; clamps `maxConcurrency` to [1,50] |
| self-improvement-harness `env` patch key `NEXUS_SCHEDULER_POLICY` | `setSchedulingPolicy(...)` | `scheduler.ts` | applied in `applyPatch` when the ADVISORY env override is allowed |
| self-improvement-harness `pool_size` patch | `configureWorker({ maxConcurrency })` | `task-worker.ts` | applied in `applyPatch` |

`WorkerOptions` (task-worker.ts): `pollIntervalMs, maxConcurrency, defaultTimeoutMs, maintenanceIntervalMs, staleTaskTimeoutMs, agentHeartbeatTimeoutMs, autoKillEnabled`.

## Safety / safe-exploration
- All writes go through `GuardrailGuard` (layers L0 budget, L1 cost, L2 circuit breaker, L3 versioning, L4 fairness, L5 explainability, L6 satisfaction, L7 meta).
- Default `dryRunDefault: true` ⇒ `SelfOptController.runCycle()` runs in SHADOW / ADVISORY mode and never calls a live setter. An operator must explicitly disable dry-run (or use `force`) to make a change live.
- `TunerAdapter.hasLiveSetter()` reports whether the owner currently accepts runtime writes. Forge-owned live adapters return `true`; all other adapters return `false` (ADVISORY — they compute and record the optimal delta but apply nothing).
- `applyPatch` hard-refuses `BLOCKING` / `SAFETY` risk classes and any patch kind outside `ALLOWED_PATCH_KINDS`; env overrides are restricted to `ENV_OVERRIDE_ALLOWLIST`.

## How a live tune happens
1. `SelfOptController.runCycle()` snapshots telemetry, asks each tuner to `propose()`, and runs the delta through `GuardrailGuard.evaluate()`.
2. If allowed and NOT dry-run, `tuner.adapter.apply(delta)` is invoked.
3. For a LIVE Forge adapter, `apply` calls the Forge public setter (`setSchedulingPolicy` / `configureWorker`), which mutates Forge's in-memory runtime config. Forge's loop reads those options on the next tick — Pulse never touches Forge's source.
4. The change is stamped into `self_opt_param_versions` and double-audited.

## Adding a new live seam
Add a new `EnvBackedAdapter` with `liveSetter: () => true` and an `onApply` that calls the owner's public setter. Never import internal/mutable state from the owner module — only its exported functions. Coordinate the setter name with the owning agent (Forge) via the dispatcher.
