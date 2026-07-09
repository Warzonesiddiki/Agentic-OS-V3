# specialization-registry

## Purpose
Registry of agent specializations/capabilities for capability-based routing. Tracks each registered agent's
capabilities (with versions) and matches incoming requests to the best-fit agent(s).

## Public exports
- `CapabilityVersionSchema` / type `CapabilityVersion`.
- `interface RegisteredAgent` — `{ agentId, capabilities, version }`.
- `interface MatchRequest` — `{ capability, minVersion?, tags? }`.
- `class SpecializationRegistry` — `register`, `unregister`, `match(request)`, `list()`.

## Env vars
None directly.

## Test file
- `server/tests/specialization-registry.test.ts` (register + match by capability/version).
