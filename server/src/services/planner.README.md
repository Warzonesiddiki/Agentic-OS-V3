# planner

## Purpose
Plans a multi-step run from a goal: decomposes into a directed acyclic `RunPlan` (steps + edges) and
validates acyclicity (`validatePlanAcyclic`). Fed to `dag-executor` / `pipeline-executor`.

## Public exports
- `interface PlanStep`, `interface RunPlan`, `interface PlanRequest`.
- `async function planRun(req: PlanRequest): Promise<RunPlan>`.
- `function validatePlanAcyclic(plan): { ok: boolean; cycle?: string[] }` — pure.

## Env vars
None directly.

## Test file
- `server/tests/planner.test.ts` (planRun output, cycle detection).
