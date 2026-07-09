# workflow-dsl

## Purpose
Declarative workflow DSL. Zod schemas define `Gate` (`hitl`/`validate`), `OnError` (`compensate`/`retry`/`fail`),
`WorkflowStep`, and the top-level `WorkflowDSL`. `compileWorkflow` validates + compiles a DSL into a
`CompiledWorkflow` (ordered steps + gates + onError policy).

## Public exports
- `GateSchema` / type `Gate`, `OnErrorSchema` / type `OnError`.
- `WorkflowStepSchema` / type `WorkflowStep`.
- `WorkflowDSLSchema` / type `WorkflowDSL`.
- `interface CompiledWorkflow`.
- `function compileWorkflow(dsl: unknown): CompiledWorkflow` — validates + compiles.

## Env vars
None directly.

## Test file
- `server/tests/workflow-dsl.test.ts` (compile valid, reject invalid, gate/onError mapping).
