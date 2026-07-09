# PHASE 13 — Multi-Agent Orchestration: Architecture Design

**Owner:** Atlas (`019f12f2-6c77-7eb2-baa2-24a33d9db708`)
**Co:** Forge (kernel/scheduler), Pulse (runtime loop), Prism (DAG viz), Lorekeeper (ADR-0004/0008 resolution)
**Status:** DESIGN — final wiring deferred to Forge's kernel `idle_notification`
**Repo:** `server/src/services/` (TypeScript/Hono), `packages/a2a-server` (shared A2A types), `src/` (frontend viz)

---

## 0. ADR-0004 Packaging Contradiction — RESOLVED (per Lorekeeper ADR-0008)

### 0.1 The contradiction

ADR-0004 originally specced A2A as a **standalone HTTP service** (`packages/a2a-server` mounted as `/api/v1/a2a/`) with its own process, while the same ADR-0004 text also described A2A as an **in-process channel** for intra-node agent-to-agent calls. Two transport models under one name created the contradiction: _do local agents talk over HTTP loopback, or via the in-process message bus?_

### 0.2 Resolution (ADR-0008)

Single source of truth + two transport adapters, **no duplicated A2A types**:

- **`packages/a2a-server`** is the **canonical A2A type & envelope library** (`AgentCard`, `A2ATask`, `A2ATaskPayload`, `A2ATaskEvent`, `AgentSkill`, auth/sign). It is `private: true`, imported by both the server and any external agent. **No behavior, only types + AgentCard/Client helpers.**
- **Transport adapters** are selected by location:
  - **Same-process / same-node** → `agent-comm.ts` sends the **same `A2ATask` envelope** over the existing `message-bus.ts` (topic `a2a:<agentId>`). Zero serialization, signed envelope in-memory.
  - **Cross-node / cross-orchestrator / external** → `a2a-bridge.ts` serializes the identical `A2ATask` envelope and ships it via `A2AClient` over HTTP to `*.well-known/agent.json` + `/api/v1/a2a/tasks`.
- The Hono `a2a-server` **HTTP mount still exists** (per ADR-0004) but is now purely a _bridge ingress/egress_ — it does **not** re-implement the orchestration logic. It validates the incoming `A2ATask` envelope and forwards to `agent-comm`.
- **A2A++** (the Phase 13 typed comm layer) = `A2ATask` envelope **+** blackboard reference fields **+** per-role typed payload channels. Defined in `agent-comm.ts` and re-exported through `a2a-server` types so external agents speak the same wire format.

> This kills the contradiction: one envelope, two adapters, one type package. Lorekeeper to publish ADR-0008 ratifying this. **VERIFIED: `packages/a2a-server` (@agentic-os/a2a-server) ALREADY EXISTS on disk and is consumed by `server/src/routes/a2a.ts` + `tests/a2a.test.ts`** (workspace:*, tsconfig-mapped). Do NOT create a duplicate package — extend the existing one with `A2AEnvelopeExt`, `DagEvent`, `AgentCapability` for A2A++. Kernel's `enqueueTask(idempotencyKey)` remains the ingestion seam for orchestrator→kernel task dispatch.

---

## 1. Layered Component Map

```
                         ┌─────────────────────────────────────────┐
                         │            Orchestrator (mgr)            │  orchestrator.ts
                         │  workflow DAG · gates · SLA · HA lease    │
                         └───────┬───────────────┬───────────────────┘
               dynamic team      │  recursive     │  blackboard
               formation         │  delegation    │  (shared mem)
            team-builder.ts      │  (depth≤N)     │  blackboard.ts
                                 │  rec-del.ts    │
        ┌────────────┬───────────┴──────┬─────────┴───────────┬───────────┐
        │ sub-agent  │   sub-agent      │  sub-agent          │  sub-agent │
        │ (worker)   │   (worker)       │  (worker)           │  (worker)  │
        └─────┬──────┴─────────┬────────┴──────────┬──────────┴─────┬─────┘
              │ handoff.ts     │ consensus.ts      │ swarm-protocol   │ agent-comm.ts
              │ (state xfer)   │ (output vote)     │ (gossip/broadcast)│ (A2A++ typed)
              └────────────────┴──────────────────┴──────────────────┴───────────┘
                          ▲                                              │
                    kernel.ts (Forge) ◄──── syscall/ring ──── task-worker.ts (Forge)
                          │
                    resource-controller.ts (per-team ring budgets)
                    agent-health.ts (liveness/heartbeat)
                    checkpoint-engine.ts (snapshot/resume)
                    sla-watchdog.ts (escalation)
```

**External bridges:** `a2a-bridge.ts` (cross-orchestrator + external A2A), `mcp-discovery-bridge.ts` (MCP agent discovery, gap 13.23).

---

## 2. Core Deliverables — Design (13.1–13.20)

### 13.1 Hierarchical Orchestrator (`orchestrator.ts`)

- **Manager role:** owns the workflow DAG, schedules ready nodes, enforces gates, monitors SLA, performs HA lease renewal.
- **Sub-agent role:** a worker is itself a _nested orchestrator_ when it recursively delegates (see 13.9). Hierarchy is tree-shaped, depth-bounded.
- Manager ↔ sub-agent contract defined via `AgentTask` (`{ id, parentId, role, payload, deadline, budget, traceId }`).
- Depends on Forge's `kernel.spawnAgent(ring, spec)` and `task-worker.enqueue(task)`.

### 13.2 Blackboard Shared Memory (`blackboard.ts`)

- Key–value namespace `bb:<workflowId>:<key>` over `message-bus` pub/sub + a persistent store (Drizzle `workflow_state` table for checkpoint/resume).
- Entries carry `{ key, value, schema, writer, version, ttl }`. Readers subscribe to `bb:<id>:<key>`; writers publish.
- Schema-validated writes (gap 13.31). Idempotent key-set via `version` CAS.

### 13.3 Swarm Broadcast / Gossip (`swarm-protocol.ts`)

- Epidemic gossip over `message-bus` topic `swarm:<flockId>` for capability advertisements & heartbeats.
- Broadcast = fire-and-forget to `team:<id>`; gossip = anti-entropy merge of `{ agentId, card, lastSeen, load }`.
- Used by 13.5 specialization registry discovery & 13.27 load balancing.

### 13.4 YAML Workflow DSL → DAG (`workflow-dsl.ts`)

- DSL schema (Zod-validated):
  ```yaml
  version: 1
  name: research-pipeline
  env: { model: mini-max-m3 }
  steps:
    - id: plan
      do: planner.skill
      inputs: { topic: '{{ trigger.topic }}' }
    - id: draft
      depends: [plan]
      do: writer.skill
      inputs: { brief: '{{ plan.output }}' }
    - id: review
      depends: [draft]
      gate: hitl # 13.11
      do: critic.skill
  merge: majority # 13.14
  ```
- Compiler parses YAML → `DagNode[]` with `deps`, `gate`, `merge`, `router` (13.10), `on_error` (13.33). Cycles rejected at compile time.

### 13.5 Specialization Registry + Skill Matching (`specialization-registry.ts`)

- Registry of `AgentCapability { agentId, roles[], skills[], model, costTier, latencyP50, reputation }`.
- `match(task) → ranked[agentId]` by role∩skill, capability version (13.25), reputation (13.30), cost (13.29/13.34), load (13.27).
- Fed by swarm gossip (13.3) + kernel agent list.

### 13.6 Dynamic Team Formation (`team-builder.ts`)

- Given a DAG, `buildTeam(dag)` selects agents per step via 13.5, respects ring budget (13.19), forms a `Team { id, members[], roles[] }`.
- Re-forms on agent failure/heartbeat loss (13.18) without restarting whole workflow.

### 13.7 Agent Handoff — State Transfer (`handoff.ts`)

- `snapshot(agentId) → HandoffState { blackboard, inFlight, context, schema }`.
- `transfer(toAgentId, state)` rehydrates via kernel; transfer is atomic (checkpoint 13.17) and signed (A2A++ auth).

### 13.8 Output Voting / Consensus (`consensus.ts`)

- Strategies: `majority`, `unanimous`, `weighted` (by reputation 13.30), `llm-judge`.
- `tally(votes[]) → ConsensusResult { winner, confidence, dissenters }`. Ties → escalate to manager (13.9) or HITL (13.11).

### 13.9 Recursive Delegation w/ Depth Limit (`recursive-delegation.ts`)

- A worker may spawn a sub-DAG; depth tracked in `AgentTask.depth`, hard cap `MAX_DEPTH=6` (config). Cycle guard via `parentId` chain.
- Each recursion allocates its own sub-team + budget slice.

### 13.10 Real-time DAG Viz (`orchestration-viz.ts` + Prism)

- Emits `DagEvent { nodeId, status, ts, agentId, durationMs }` over SSE topic `viz:<workflowId>`.
- Prism renders live graph (nodes=steps, edges=deps, color=status). Handoff contract: `DagEvent` schema shared in `a2a-server` types.

### 13.11 Conditional Branching / Router (`conditional-router.ts`)

- Node `router: { when: expr, then: stepId }` evaluated against blackboard/trigger. Expression sandbox = Zod-validated predicate DSL (no `eval`). Default branch required.

### 13.12 HITL Gates (`hitl-gate.ts`)

- `gate: hitl` suspends DAG at node; emits `approval_request` to `team:<id>` + operator channel. Resume on `approval_response`. Timeout → SLA escalation (13.20) or auto-deny (config).

### 13.13 Validation Gates (`validation-gate.ts`)

- `gate: validate(schema)` runs Zod/JSON-schema over node output before downstream. Fail → compensation (13.33) or retry (bounded).

### 13.14 Merge Strategies (`merge-strategies.ts`)

- `concat`, `majority`, `first-wins`, `llm-merge`, `schema-union`. Selected per DAG `merge:` or per-node `merge:`.

### 13.15 Typed A2A++ Comm (`agent-comm.ts`)

- Envelope = `A2ATask` (from `a2a-server`) + `A2AEnvelopeExt { blackboardRefs[], channel: RoleChannel, schema }`.
- Two adapters: in-process (message-bus) and cross-node (a2a-bridge). See §0.2.

### 13.16 Per-Team Resource Controller (`resource-controller.ts`)

- Wraps Forge's ring budget: `TeamBudget { tokens, cpuMs, calls }` decremented per task; exhaustion → backpressure (13.28) or escalation.

### 13.17 Liveness / Heartbeat (`agent-health.ts`)

- Each agent emits `heartbeat` every `TICK` to `swarm:<flockId>`. Missed `3×TICK` → marked dead → 13.6 re-forms team, 13.7 hands off in-flight.

### 13.18 Workflow Checkpoint / Resume (`checkpoint-engine.ts`)

- Periodic snapshot of `{ dagState, blackboard, teams, depthCursor }` to `workflow_state` table. Resume reconstructs from latest checkpoint; idempotent (13.19).

### 13.19 Output Dedup / Idempotency (`dedup-engine.ts`)

- `taskKey = hash(workflowId+stepId+inputs)`. Replay with same key → return cached output, no re-exec. Prevents double-spend on resume/retry.

### 13.20 SLA Watchdog / Escalation (`sla-watchdog.ts`)

- Per-step `deadline`; watchdog polls. Breach → (1) reassign via 13.5, (2) HITL escalate (13.11), (3) manager-level escalation (13.9). Emits `sla_breach` to audit (13.32).

---

## 3. Gap Deliverables — Design (13.21–13.35)

| #     | Item                          | Design                                                                                                                                                  |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13.21 | Workflow templates            | `templates/` registry of YAML DSL (research, coding, review, ingest). Loaded by `workflow-dsl`.                                                         |
| 13.22 | Orchestrator HA (lease-based) | `ha-lease.ts`: Redis/DB `orch_lease{holder,expiry}`. Manager renews every `TICK/2`; on expiry a standby claims lease & resumes from checkpoint (13.18). |
| 13.23 | MCP agent discovery bridge    | `mcp-discovery-bridge.ts`: polls MCP servers for agent-exposing tools → publishes as `AgentCapability` to 13.5.                                         |
| 13.24 | Cross-orchestrator bridge     | `a2a-bridge.ts`: orchestrator↔orchestrator over A2A HTTP; federated DAG handoff via 13.7 envelope.                                                      |
| 13.25 | Capability versioning/drift   | `capability-version.ts`: semver on `AgentCapability`; drift detector warns when worker schema ≠ expected.                                               |
| 13.26 | Workflow analytics            | `workflow-analytics.ts`: emit metrics (duration, cost, fan-out, gate rate) to OTEL/prom (per AGENTS.md).                                                |
| 13.27 | Load balancing                | `load-balancer.ts`: least-loaded pick from 13.5 using `load` from gossip (13.3).                                                                        |
| 13.28 | Comm backpressure             | `backpressure.ts`: bounded mpsc (per AGENTS.md Rust rule) / queue depth cap on message-bus; pause producers when `depth>MAX`.                           |
| 13.29 | Cost estimator                | `cost-estimator.ts`: pre-exec estimate from model×tokens×steps; gates spawn if `est>budget`.                                                            |
| 13.30 | Reputation / trust            | `reputation.ts`: EWMA of success/latency/cost → `reputation∈[0,1]`; feeds 13.5/13.8.                                                                    |
| 13.31 | Per-node schema validation    | `node-schema.ts`: Zod per node I/O; invalid → 13.13 gate fail.                                                                                          |
| 13.32 | Full audit trail              | every DAG event → `appendAudit` (existing); `audit-trail.ts` correlates `traceId` across nodes.                                                         |
| 13.33 | Compensation transactions     | `compensation.ts`: `on_error: compensate` runs reverse ops (e.g. refund budget, undo blackboard writes) via logged saga log.                            |
| 13.34 | Cost-optimized selector       | `cost-selector.ts`: variant of 13.5 minimizing `estCost` subject to `deadline` & `minReputation`.                                                       |
| 13.35 | Dynamic hot-patch             | `hotpatch.ts`: reload `specialization-registry` / DSL templates / gate rules at runtime via message-bus `system:hotpatch` without restart.              |

---

## 4. Interface Contracts (against Forge's planned kernel)

Atlas designs to these **planned** kernel interfaces (final names TBD by Forge; will reconcile on `idle_notification`):

```ts
// Forge provides (Phase 11) — names below align with the team-wide seam assignment.
// Kernel ingestion seam (ratified): kernel.enqueueTask(idempotencyKey) is how the
// orchestrator dispatches a step to the kernel; idempotencyKey feeds our dedup (13.19).
kernel.spawnAgent(ring: Ring, spec: AgentSpec): Promise<AgentHandle>
kernel.killAgent(handle: AgentHandle): Promise<void>
kernel.enqueueTask(idempotencyKey: string, task: KernelTask): Promise<void>   // ingestion seam
kernel.setWatchdogPolicy(policy): void
kernel.quarantineAgent(agentId: string): Promise<void>
kernel.ringBudget(ring: Ring): BudgetHandle
scheduler.enqueue(task: KernelTask, priority: number): Promise<void>
scheduler.preempt(handle: AgentHandle): Promise<void>
scheduler.setPidGain(g): void        // Forge seam (Pulse 18.3-adjacent)
scheduler.setQueueCapacity(cap): void // Forge seam
scheduler.setRlPolicy(p): void        // Forge seam
taskWorker.run(handle, fn): Promise<Result>

// Atlas consumes
orchestrator.spawnTeam(dag) ──▶ kernel.spawnAgent × N
orchestrator.dispatch(step) ──▶ kernel.enqueueTask(step.idemKey, { agentId, payload: A2AEnvelope })
resource-controller          ──▶ kernel.ringBudget(ring) hooks
agent-health                ──▶ kernel liveness events + kernel.quarantineAgent on miss
```

**Cross-phase adapter seams (ratified division of labor — owners ship these in their own modules):**

- Forge: `scheduler.setPidGain / setQueueCapacity / setRlPolicy`, `kernel.spawnAgent / ringBudget / setWatchdogPolicy / quarantineAgent`
- Mnemosyne: `recall.setThreshold / setIndexToggles / setRrfWeights` (Phase 12; Atlas may read via specialization-registry)
- Sentinel: `guardrails.setGuardrailThreshold` (Phase 14; Atlas gates call into it at HITL/validation gates)
- Atlas (me): only the orchestration-layer seams above; **I do NOT create a2a-server** (exists) and **I do NOT add kernel/scheduler functions** (Forge owns them).

**Sequence guard:** Atlas will NOT import/implement against these until Forge signals kernel stable. This doc is the contract; wiring lands after `idle_notification`.

---

## 5. Collaboration Hand-offs

- **Lorekeeper (ADR-0008):** ratified §0 packaging resolution; `packages/a2a-server` (@agentic-os/a2a-server) ALREADY EXISTS and is the single type source (verified in `routes/a2a.ts`). I will extend it with `A2AEnvelopeExt`, `DagEvent`, `AgentCapability` for A2A++ — NOT create a new package. ADR-0009 (MLFQ) also Lorekeeper's.
- **Prism (viz):** consumes `orchestration-viz` SSE `DagEvent` schema (shared in `a2a-server`); live graph + gate/HITL overlays.
- **Forge:** provides kernel/scheduler APIs (§4) AND owns the scheduler/kernel control seams; Atlas waits for `idle_notification` before final wiring. Kernel `enqueueTask(idempotencyKey)` is the ingestion seam.
- **Pulse:** runtime loop (Phase 18) hosts per-agent execution that `agent-comm` triggers; Pulse's self-opt seams (`setPromptVariant/setBatchingPolicy/setTokenBudget`) live in `llm-gateway-v2.ts` (already added by Atlas).
- **Mnemosyne:** `recall.setThreshold/setIndexToggles/setRrfWeights` (Phase 12) feed specialization-registry matching.
- **Sentinel:** `guardrails.setGuardrailThreshold` (Phase 14) called at HITL/validation gates.

---

## 6. Implementation Plan (post Forge signal)

1. `packages/a2a-server` — add `A2AEnvelopeExt`, `DagEvent`, `AgentCapability` types (Lorekeeper ADR-0008).
2. `agent-comm.ts` + `a2a-bridge.ts` (13.15, 13.24) — wire A2A++ over message-bus + HTTP.
3. `blackboard.ts`, `swarm-protocol.ts` (13.2, 13.3).
4. `workflow-dsl.ts` + `conditional-router.ts` + `merge-strategies.ts` (13.4, 13.10, 13.14).
5. `specialization-registry.ts` + `team-builder.ts` + `load-balancer.ts` + `cost-*` (13.5, 13.6, 13.27, 13.29/34).
6. `orchestrator.ts` + `recursive-delegation.ts` + `handoff.ts` (13.1, 13.9, 13.7).
7. Gates: `hitl-gate`, `validation-gate` (13.11, 13.13) + `consensus` (13.8).
8. Reliability: `agent-health`, `checkpoint-engine`, `dedup-engine`, `sla-watchdog`, `resource-controller` (13.16–13.20).
9. Gap: 13.21–13.35 (HA lease, MCP bridge, versioning, analytics, backpressure, reputation, audit, compensation, hotpatch).
10. Tests: property-based DAG compile, consensus tally, idempotency, checkpoint/resume; `pnpm run validate` green.

---

_Design delivered. Implementation blocked on Forge kernel `idle_notification` (Phase 11). No Phase 13 code written yet — this is the architecture contract._

---

## 7. PROGRESS LOG (independent, Forge-free half)

**Done — wire-format types (packages/a2a-server, extends existing pkg, no duplicate):**

- `src/orchestration-a2a.ts` (+ `index.ts` export): `A2AEnvelopeExt`, `DagEvent`, `AgentCapability` (1:1 with PERSONA_REGISTRY + ADR-0008) + Zod validators.
- Verified: `build`/`typecheck`/`test` (11 tests) all green; `pnpm -r build` includes it.

**Done — pure orchestration logic (server/src/services, ZERO kernel/scheduler imports):**

| Module                       | Deliverable                                                                          | Tests |
| ---------------------------- | ------------------------------------------------------------------------------------ | ----- |
| `workflow-dsl.ts`            | 13.4 YAML→DAG compiler (Zod-validated, Kahn topo-sort, cycle/dangling-dep rejection) | 4     |
| `merge-strategies.ts`        | 13.14 concat/first-wins/majority/schema-union/llm-merge                              | 7     |
| `consensus.ts`               | 13.8 majority/unanimous/weighted/llm-judge tally                                     | 5     |
| `conditional-router.ts`      | 13.10 safe predicate DSL (no eval), field resolve, default-branch                    | 6     |
| `specialization-registry.ts` | 13.5 AgentCapability registry + ranked match (reputation/cost/load/costOptimized)    | 5     |
| `dedup-engine.ts`            | 13.19 idempotency key (sha256) + injectable DedupStore (Memory default)              | 3     |

All 30 tests pass; modules typecheck clean. **NOT yet done (await Phase 11 scheduler/kernel via Pulse's mlfq.ts / kernel enqueueTask):** orchestrator.ts, blackboard.ts (live store), swarm-protocol.ts, team-builder.ts, handoff.ts, agent-comm.ts (transport adapters), resource-controller.ts, agent-health.ts, checkpoint-engine.ts, orchestration-viz.ts, hitl-gate.ts, validation-gate.ts, recursive-delegation.ts, sla-watchdog.ts, and the 15 gap modules. These call Forge/Pulse seams and are deferred by the dependency guard.
