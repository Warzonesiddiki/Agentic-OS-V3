# memory-graph-browser

## Purpose
Builds and sanitises a graph view of related memories for exploration/visualisation. Produces
nodes (memories) and typed edges (causal, similarity, tag, contradiction) and a sanitise pass that
strips unsafe fields before sending to the dashboard.

## Public exports
- `interface GraphNode` — a memory node.
- `interface GraphEdge` — a typed relationship edge.
- `interface MemoryGraph` — `{ nodes, edges }`.
- `function sanitizeGraph(graph: MemoryGraph): MemoryGraph` — safe-for-client projection.
- `async function buildMemoryGraph(...): Promise<MemoryGraph>` — assembles the graph for a root memory/project.
- `async function neighborhood(...)` — subgraph around a set of nodes.

## Env vars
None directly.

## Test file
- `server/tests/memory-perfection.test.ts` (`sanitizeGraph` describe block).
