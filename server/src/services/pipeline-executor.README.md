# pipeline-executor

## Purpose
DAG pipeline executor. Validates a pipeline DAG (acyclic, typed nodes/edges), persists pipelines and runs,
executes in topological waves with per-node compensation (`getNodeCompensator`), and records run results.
Used by the pipeline builder UI.

## Public exports (selected)
- `type NodeType` — node kinds.
- `interface PipelineNode`, `PipelineEdge`, `PipelineDAG`, `PipelineRunRequest`, `PipelineRunResult`.
- `function validateDAG(dag): { ok: true } | { ok: false; reason: string }` — pure validator.
- `async function savePipeline(input)`, `runPipeline(req)`, `listPipelineRuns(pipelineId, limit?)`,
  `listPipelines()`.
- `function getNodeCompensator(node): PipelineNode | null`.

## Env vars
None directly (uses kernel `enqueueTask` for node steps).

## Test file
- `server/tests/pipeline-executor.test.ts` (validateDAG, wave execution, compensation, persistence).
