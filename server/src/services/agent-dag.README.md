# agent-dag

## Purpose
In-memory agent DAG builder + executor. Defines DAG nodes/edges/configs, a registry with `createDAG` /
`addNode` / `addEdge` / `compile` (topological waves), an `invoke` driver that runs agents per wave, subgraph
extraction (`getSubgraph` / `executeSubgraph`), and an agent→tool bridge (`agentToTool`, `registerTool`,
`getToolRegistry`) with metrics. `selectBestAgent` chooses among candidates.

## Public exports (selected)
- Types: `DAGNodeConfig`, `DAGNode`, `DataMapping`, `EdgeCondition`, `DAGEdge`, `DAGDefinition`, `DAGConfig`,
  `ExecutionTimelineEntry`, `ExecutionResult`, `SubgraphDef`, `AgentTool`, `ToolMetrics`.
- Registry: `createDAG`, `addNode`, `addEdge`, `compile`, `getDAG`, `listDAGs`, `deleteDAG`, `resetDAGRegistry`.
- Run: `invoke`, `getSubgraph`, `executeSubgraph`, `selectBestAgent`.
- Tool bridge: `agentToTool`, `getToolRegistry`, `registerTool`, `getToolMetrics`.

## Env vars
None directly (uses kernel for agent dispatch).

## Test file
- `server/tests/agent-dag.test.ts` (compile waves, invoke, subgraph, tool bridge). Phase-13 suite 23/23.
