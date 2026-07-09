# deadlock-detector

## Purpose
Wait-for-graph deadlock detection. `analyzeWaitForGraph` computes cycles + per-node degree from a node set;
`detectDeadlock` accepts either an edge list or a `{ nodes }` graph and reports any cycle; `suggestBreakpoints`
returns minimal node breakpoints to break detected cycles.

## Public exports
- `interface WaitEdge`, `interface WaitNode`, `interface DeadlockResult`, `interface GraphAnalysis`.
- `function analyzeWaitForGraph(nodes: WaitNode[]): GraphAnalysis` — pure.
- `function detectDeadlock(input: WaitEdge[] | { nodes: WaitNode[] }): DeadlockResult` — pure.
- `interface Breakpoint`, `function suggestBreakpoints(analysis: GraphAnalysis): Breakpoint[]` — pure.

## Env vars
None directly.

## Test file
- `server/tests/deadlock-detector.test.ts` (cycle detection, breakpoint suggestion).
