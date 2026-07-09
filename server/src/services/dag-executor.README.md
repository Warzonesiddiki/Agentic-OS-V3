# dag-executor

## Purpose
Generic DAG step executor. Runs a `RunPlan` (from `planner`) with checkpointing (`CheckpointStore`,
`MapCheckpointStore`), per-step retry/timeout, and partial-failure handling. Underpins orchestration and
pipeline execution.

## Public exports (selected)
- `interface StepResult`, `interface RunResult`, `interface ExecutorOptions`, `interface CheckpointStore`.
- `class MapCheckpointStore implements CheckpointStore`.
- `async function executePlan(plan: RunPlan, opts?: ExecutorOptions): Promise<RunResult>`.

## Env vars
None directly.

## Test file
- `server/tests/dag-executor.test.ts` (executePlan waves, checkpoint resume, step failure).
