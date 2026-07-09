# agent-permissions

## Purpose
In-memory role/scope permission store for agents. `defineRole` registers a role with scopes; `grant`/`deny`/
`revoke`/`revokeAll` mutate per-agent scopes; `hasPermission`/`assertPermission` gate tool calls; `applyRole`
bulk-applies a role. Sentinel-owned coordination surface (quarantine lives in kernel).

## Public exports
- `function applyRole(agentId, role)`, `defineRole(role, scopes)`.
- `function grant(agentId, scope)`, `deny(agentId, scope)`, `revoke(agentId, scope)`, `revokeAll(agentId)`.
- `function hasPermission(agentId, scope): boolean`.
- `function assertPermission(agentId, scope): void` — throws on missing scope.
- `function listPermissions(agentId): string[]`.

## Env vars
None directly.

## Test file
- `server/tests/agent-permissions.test.ts` (grant/deny/assert/role apply).
