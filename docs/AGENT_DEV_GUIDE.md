# Agent Development Guide

**Last updated:** 2026-07-09 (Lorekeeper)
**Companion:** `docs/PERSONA_REGISTRY.md`, `docs/skill-registry-design.md`, `docs/adr/0008-a2a-packaging-decision.md`.

This guide explains how to author a NEXUS agent (persona) and register it for orchestration.

## 1. Persona card (the contract)

Every agent is described by a **persona card** (see `docs/PERSONA_REGISTRY.md` §2 for the full
template + JSON Schema). Minimum viable card:

```yaml
persona:
  id: my-agent
  name: My Agent
  role: Does a thing
  domain: dev
  tier: specialist
  capabilities:
    - name: 'exec:skill'
      domain: dev
      category: exec
      sideEffects: ['net.send']
      scopes: ['skills:translate']
      failureMode: fail-closed
  skills: ['translate']
  ring: 2
  reportsTo: forge
  status: draft
```

The `capabilities[]` field is consumed by `@agentic-os/a2a-server` as `AgentCapability[]` (ADR-0008)
so the orchestrator and external agents share one schema.

## 2. System prompt

Store the canonical prompt at `personas/<id>/system.md` (or reference a key). Keep it aligned
with the card's `role` and `domain`.

## 3. Register & activate

1. Validate the card against the JSON Schema (`PERSONA_REGISTRY.md` §6).
2. Seed it into the Phase 13 **specialization registry** (skill matching + dynamic team formation).
3. Promote `status: draft → active` only when the agent's phase module ships **with tests**
   (coverage gate ≥ 80%).

## 4. Communication (A2A)

- Intra-node calls ride `agent-comm.ts` over the `message-bus` (topic `a2a:<id>`) using the
  shared `A2ATask` envelope (ADR-0008).
- Cross-node/external calls use `a2a-bridge.ts` via `A2AClient` HTTP to `/api/v1/a2a/tasks`.
- The Hono `/api/v1/a2a` mount is **bridge ingress/egress only** — do not re-implement
  orchestration there.

## 5. Scheduling & rings

- The kernel (`server/src/services/kernel.ts`) dispatches via `pickNextTask()` using the
  MLFQ scheduler (`server/src/services/scheduler.ts`): Q0–Q4, 5s boost, EDF/FairShare policies.
- Assign `ring` (0–4) per privilege; per-ring budgets enforced via `acquireRingBudget`.
- Gang scheduling: set `gangId` for all-or-nothing co-scheduling.

## 6. Local testing

```bash
cd server && npm test -- --grep "my-agent"
# integration (needs DATABASE_URL)
npm run test:integration -- --grep "my-agent"
```

## 7. Rules

- camelCase in TS, snake_case in Rust; 2-space indent, LF.
- No `any`; structured errors via `server/src/lib/errors.ts`.
- Capability changes MUST keep `AgentCapability` (a2a-server) in sync; Sentinel reviews
  `exec`/`comms` side-effects.
