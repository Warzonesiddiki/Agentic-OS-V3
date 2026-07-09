# graph-engine

## Purpose
A LangGraph-style stateful graph runtime (independent of agent-dag). `StateGraph` builds nodes/channels/edges
with reducers and conditional routing; `CompiledGraph` executes with checkpointing (`InMemoryCheckpointer`)
and per-step result capture (`GraphStep`). Throws `GraphError` / `NodeExecutionError` on bad graphs.

## Public exports (selected)
- Types: `GraphState`, `ChannelReducer<T>`, `ChannelConfig`, `ChannelMap`, `NodeFn`, `ConditionFn`,
  `EdgeMap`, `Checkpoint`, `Checkpointer`, `GraphConfig`, `CheckpointConfig`, `GraphRunResult`,
  `GraphStep`.
- `class GraphError extends Error`, `class NodeExecutionError extends GraphError`.
- `class StateGraph<S>` — `addNode`, `addEdge`, `addConditionalEdges`, `compile`.
- `interface CompiledGraphOptions<S>`, `class CompiledGraph<S>` — `invoke`.
- `class InMemoryCheckpointer implements Checkpointer`.

## Env vars
None directly.

## Test file
- `server/tests/graph-engine.test.ts` (state graph invoke, checkpoint resume, conditional edges).
