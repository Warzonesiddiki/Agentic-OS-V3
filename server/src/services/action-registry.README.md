# action-registry

## Purpose
Tool/action registry and execution with timeout + risk gating. `ActionRegistry` stores actions (each with a
`Ring` 0–4, `RiskLevel`, `ToolProvider`, examples, and a handler); `executeActionWithTimeout` runs an action
under a deadline; `createDefaultActions` seeds built-in actions. Types `Action`/`ActionContext`/
`ActionMetadata` are shared with `agent-runtime.ts`.

## Public exports
- `type Ring = 0|1|2|3|4`, `type RiskLevel`, `type ToolProvider`.
- `interface ToolSpec`, `interface ActionExample`, `type ActionHandler`, `interface ActionContext`,
  `interface ActionMetadata`, `interface Action`, `interface ActionExecuteResult`.
- `class ActionRegistry` — `register`, `get`, `list`, `has`, `execute`.
- `async function executeActionWithTimeout(action, args, context, timeoutMs): Promise<ActionExecuteResult>`.
- `function createDefaultActions(): Action[]`.

## Env vars
None directly (risk gating enforced by kernel `authorizeToolCall`).

## Test file
- `server/tests/action-registry.test.ts` (register, timeout, default actions).
