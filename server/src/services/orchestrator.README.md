# orchestrator

## Purpose
Multi-agent orchestration entrypoint. `orchestrate` runs a request across agents via the kernel/scheduler,
`orchestrateGated` runs behind the admission gate, and the `orchestrator` object bundles helpers. Coordinates
with `agent-runtime`, `blackboard`, `planner`, `dag-executor`.

## Public exports
- `interface OrchestrateRequest`, `interface OrchestrateReceipt`.
- `async function orchestrate(req): Promise<OrchestrateReceipt>`.
- `async function orchestrateGated(req, opts?)`.
- `const orchestrator` — `{ orchestrate, orchestrateGated, ... }`.

## Env vars
None directly.

## Test file
- `server/tests/orchestrator.test.ts` (orchestrate receipt, gated admission).
