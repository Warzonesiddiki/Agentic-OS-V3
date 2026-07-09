# ADR-0008: A2A Packaging Decision — `packages/a2a-server` (already exists, Phase 13 extends)

- **Status:** Accepted
- **Date:** 2026-07-09 (ratified by Lorekeeper per Atlas PHASE-13 design §0)
- **Deciders:** Lorekeeper (recorder), Atlas (Phase 13 architecture owner), Forge (kernel)
- **Resolves:** ADR-0004 packaging contradiction ("standalone A2A HTTP service" vs "in-process A2A channel")
- **Amends:** ADR-0004 (A2A Protocol) — clarifies transport model; the Hono `/api/v1/a2a` mount becomes bridge-only

## Context

ADR-0004 originally specced A2A two ways under one name:

1. a **standalone HTTP service** (`packages/a2a-server` mounted at `/api/v1/a2a/`) with its own
   process, and
2. an **in-process channel** for intra-node agent-to-agent calls.

That created a real contradiction: _do local agents talk over HTTP loopback, or via the
in-process message bus?_ Two transport models, one name, duplicated type definitions.

**Verified reality (2026-07-09):** `packages/a2a-server` **already exists** — `package.json` name
`@agentic-os/a2a-server` (version 2.0.0, `private: true`), `src/` contains `index.ts`, `types.ts`,
`card.ts`, `auth.ts`, `client.ts`, `task-manager.ts`. It is consumed by the server via
`workspace:*` (`server/package.json`), mapped in `server/tsconfig.json` (`../packages/a2a-server/src`),
and used in `server/src/routes/a2a.ts` + `server/test/integration/a2a.test.ts`. A prior draft of
this ADR incorrectly stated the package "does not exist / must be created" — **that was wrong**;
this version corrects it.

## Decision

**ONE envelope, TWO transport adapters, ONE existing type package.** No duplicated A2A types.

- **`packages/a2a-server`** is the **canonical A2A type & envelope library**
  (`AgentCard`, `A2ATask`, `A2ATaskPayload`, `A2ATaskEvent`, `AgentSkill`, auth/sign helpers).
  - `private: true`; imported by the server **and** any external agent.
  - **No behavior** — types + `AgentCard`/`A2AClient` helpers only.
  - **Phase 13 EXTENDS this package** (it is NOT created from scratch): Atlas adds
    `A2AEnvelopeExt`, `DagEvent`, `AgentCapability` (the latter aligns with Lorekeeper's
    `PERSONA_REGISTRY` persona cards — see Coordination).
- **Transport is adapter-selected, NOT duplicated:**
  - **Same-process / same-node** → `agent-comm.ts` sends the **same `A2ATask` envelope** over
    the existing `message-bus.ts` (topic `a2a:<agentId>`). Zero serialization; signed envelope
    in-memory.
  - **Cross-node / cross-orchestrator / external** → `a2a-bridge.ts` serializes the identical
    `A2ATask` envelope and ships it via `A2AClient` HTTP to `*.well-known/agent.json` +
    `/api/v1/a2a/tasks`.
- The Hono `a2a-server` **HTTP mount still exists** (per ADR-0004) but is now **purely a bridge
  ingress/egress** — it does NOT re-implement orchestration. It validates the `A2ATask` envelope
  and forwards to `agent-comm`.
- **A2A++** (Phase 13 typed comm layer) = `A2ATask` envelope **+** blackboard reference fields
  **+** per-role typed payload channels. Defined in `agent-comm.ts`, re-exported via
  `a2a-server` so every agent speaks one wire format.

## Rationale

1. **Kills the contradiction** — one envelope, two adapters, one type package. Local vs remote
   is a transport concern, not a protocol concern.
2. **No type drift** — external agents and the server import the same `@agentic-os/a2a-server`
   types; wire compatibility is guaranteed by construction.
3. **Reuses infrastructure** — in-process path rides the existing `message-bus`, avoiding a
   redundant HTTP loopback hop for co-located agents.
4. **Bridge-only mount** — the HTTP endpoint stays for cross-node/external traffic but is a thin
   validator/forwarder, not a second orchestration implementation.

## Consequences

- `packages/a2a-server` **exists and is consumed**; do NOT create a second/duplicate package.
- Phase 13 **extends** it (adds the three types above); it must not fork or replace it.
- The A2A `TaskManager` enqueues received tasks into the NEXUS runtime via `enqueueTask(...)`
  (idempotency-keyed); it MUST NOT spawn agents or mutate kernel state directly.
- All new A2A++ surface (signed RPC, federation, capability negotiation) lives in `agent-comm`
  and is re-exported from `a2a-server`.
- No new ADR unless a _protocol-level_ incompatibility with the v1 `A2ATask` envelope is
  introduced; if so, that becomes ADR-0010.

## Coordination

- **Atlas (Phase 13):** extend `packages/a2a-server` (do NOT recreate); add `A2AEnvelopeExt`,
  `DagEvent`, `AgentCapability`. The Hono mount becomes bridge-only per §0.2.
- **Lorekeeper (PERSONA_REGISTRY):** `AgentCapability` (added to `a2a-server`) MUST stay aligned
  with persona-card capability fields so external agents and the registry share one schema.
- **Forge (Phase 11):** `kernel.spawnAgent` / `scheduler.enqueue` are the ingestion seams A2A++
  builds on; no A2A logic in the kernel.

## References

- `docs/adr/0004-a2a-protocol.md`
- `docs/phase-13-orchestration-design.md` §0 (resolution source of truth)
- `packages/a2a-server/` (exists: `package.json` `@agentic-os/a2a-server` v2.0.0; `src/index.ts`,
  `types.ts`, `card.ts`, `auth.ts`, `client.ts`, `task-manager.ts`)
- `server/src/services/message-bus.ts` (topic `a2a:<agentId>`), `server/src/services/agent-comm.ts`
- `server/src/routes/a2a.ts` (bridge ingress/egress), `server/src/services/a2a-bridge.ts`
