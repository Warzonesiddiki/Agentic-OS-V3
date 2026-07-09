# blackboard

## Purpose
Shared blackboard for multi-agent coordination. A scoped key/value fact store (`global`/`run`/`agent`) with
typed condition evaluation (`evaluateCondition`) and an `applyAuditRows` replay helper. `blackboard` is the
default singleton.

## Public exports (selected)
- `interface BlackboardEntry`, `type Blackboard`, `type ConditionOp`, `type BlackboardScope`,
  `interface BlackboardFact`, `type BlackboardCondition`.
- `function evaluateCondition(board, cond): boolean` — pure.
- `class BlackboardStore` — `set`, `get`, `delete`, `list`, `clearScope`, `watch`.
- `function applyAuditRows(...)`.
- `const blackboard` — default singleton.

## Env vars
None directly.

## Test file
- `server/tests/blackboard.test.ts` (set/get, condition eval, scope isolation).
