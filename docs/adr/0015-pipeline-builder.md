# ADR-0015: Visual Pipeline Builder & DAG Executor

- Status: Accepted
- Date: 2026-07-09
- Deciders: Atlas (owner), Forge, Prism, Leader
- Supersedes: ADR-0008 (A2A Packaging — DAG events)

## Context

Agents orchestrate work as DAGs (`server/src/services/agent-dag.ts`,
`dag-executor.ts`, `orchestrator.ts`). Building these DAGs required hand-writing
JSON/code. Operators wanted a **visual pipeline builder** in the dashboard
(Prism) that compiles to the same DAG the executor already runs, with no parallel
runtime.

## Decision

- **Executor (Atlas, unchanged contract):** `server/src/services/pipeline-executor.ts`
  runs DAGs in **waves** — topological layers executed concurrently, each node
  producing a `NodeResult`. Nodes declare `dependsOn` and an optional
  `compensation` callback for saga-style rollback (Forge's kernel saga support).
- **Builder (Prism frontend):** `src/pages/**` pipeline builder emits a
  `PipelineDef` (nodes + edges + per-node config) validated by a shared schema in
  `packages/sdk/src`. On "run", it POSTs to `routes/automation.ts` which calls
  `orchestrator.runPipeline(def)` → `pipeline-executor`.
- **Single source of truth:** the DAG data model is defined once in
  `packages/sdk/src` and imported by both the builder and the executor, so the
  visual graph and the executed graph cannot drift.
- **Observability:** each wave emits an `otel` span (Metron `tracing.ts`) and a
  `DagEvent` over A2A (`specialization-registry` / `blackboard`) so the dashboard
  can live-render progress.

## Consequences

- No new execution engine — the visual builder compiles to the existing,
  battle-tested wave executor, eliminating a whole class of "builder vs runtime"
  mismatches.
- Compensation/rollback is first-class: failed pipelines unwind via the
  `compensation` callbacks, reusing Forge's saga machinery.
- Prism owns the UI; Atlas owns the schema + executor; the SDK owns the shared
  type — clean namespace boundaries preserved.
- Tests: `pipeline-executor.test.ts` covers wave ordering, compensation on
  failure, and cycle detection.
