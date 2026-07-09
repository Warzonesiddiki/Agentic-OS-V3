# agent-runtime

## Purpose
Per-agent execution runtime. `ActionRegistry` registers actions; `AgentRuntime` steps an agent through its
plan (think → act → observe), persists execution state to survive crashes, and `runAgent` is the top-level
driver. Default actions created by `createDefaultActions`.

## Public exports (selected)
- `interface ActionExample`, `type ActionHandler`, `interface ActionContext`, `interface ActionMetadata`,
  `interface Action`.
- `class ActionRegistry` — `register`, `get`, `list`.
- `function createDefaultActions(): Action[]`.
- `interface AgentConfig`, `interface AgentStep`, `interface AgentResult`.
- `class AgentRuntime` — `run`, `step`.
- `interface AgentExecutionState`.
- `async function saveAgentProcessState(state)`, `loadAgentProcessState(agentId)`.
- `async function runAgent(config): Promise<AgentResult>`.

## Env vars
None directly.

## Test file
- `server/tests/agent-runtime.test.ts` (action registry, runAgent happy path, state save/load).
