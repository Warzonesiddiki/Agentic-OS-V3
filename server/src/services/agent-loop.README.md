# agent-loop

## Purpose
Single-agent planning/execution loop runtime (`AgentRuntime` + `runAgent`). This is the lower-level sibling
of `agent-runtime.ts` — defines the core `AgentConfig`/`AgentStep`/`AgentResult` shapes and steps an agent
through think→act→observe. (Kept for compatibility; `agent-runtime.ts` is the richer version.)

## Public exports
- `interface AgentConfig`, `interface AgentStep`, `interface AgentResult`.
- `class AgentRuntime` — `run`, `step`.
- `async function runAgent(config: AgentConfig): Promise<AgentResult>`.

## Env vars
None directly.

## Test file
- `server/tests/agent-loop.test.ts` (runAgent happy path + agent-runtime parity).
