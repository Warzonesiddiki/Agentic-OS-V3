# agent-lifecycle

## Purpose
Agent lifecycle event capture + auditor. Records spawn/terminate/quarantine lifecycle transitions, emits
structured lifecycle events, and provides `getLifecycleEvents` history. Complements kernel lifecycle.

## Public exports
- `type AgentLifecycleEventKind` — lifecycle transition kinds.
- `interface AgentLifecycleEvent`.
- `async function recordLifecycleEvent(agentId, kind, meta?): Promise<void>`.
- `async function getLifecycleEvents(agentId?, limit?): Promise<AgentLifecycleEvent[]>`.
- `const agentLifecycle` — default singleton auditor.

## Env vars
None directly.

## Test file
- `server/tests/agent-lifecycle.test.ts` (record + list events).
