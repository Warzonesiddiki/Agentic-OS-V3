# agent-persistence

## Purpose
Crash-safe persistence of an agent's execution state. `saveAgentProcessState` upserts the latest agent
process snapshot; `loadAgentProcessState` reads it back so a runtime can resume after a crash.

## Public exports
- `interface AgentExecutionState`.
- `async function saveAgentProcessState(state: AgentExecutionState): Promise<void>`.
- `async function loadAgentProcessState(agentId: string): Promise<AgentExecutionState | null>`.

## Env vars
None directly.

## Test file
- `server/tests/agent-persistence.test.ts` (save/load round-trip).
