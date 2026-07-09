# Runtime Loop Reference Design — NEXUS 2.0

**Owner:** Pulse (Runtime / Self-Optimization)
**Status:** Reference design (canonical)
**Audience:** Kernel (Forge), Scheduler (Pulse/Forge), Orchestration (Atlas), Self-Opt (Pulse), Frontend (Prism), QA (Sentinel)
**Grounded in:** `server/src/services/task-worker.ts`, `kernel.ts`, `scheduler.ts`, `message-bus.ts`, `pipeline-executor.ts` (as of 2026-07-09 snapshot)

This document is the **single source of truth for how the NEXUS runtime loop works** — the closed control loop that picks a task, dispatches it, and reconciles its outcome back into the kernel. It is a _reference_, not a spec for new code: everything described here already exists in the snapshot unless explicitly called out as a **GAP**.

---

## 1. Purpose & Scope

The runtime loop is the heartbeat of the agentic OS. It is responsible for:

1. **Pulling** runnable work from the kernel's task queue.
2. **Admitting** work through the scheduler (policy, ring budget, gang, starvation).
3. **Dispatching** work to the correct handler (LLM, agent runtime, memory, pipeline DAG, maintenance).
4. **Enforcing** time quanta, circuit breakers, token budgets, and kill-switch safety.
5. **Reconciling** outcomes (succeed / fail / preempt / dead-letter / quarantine).
6. **Maintaining** the system (stale reaper, heartbeat monitor, auto-kill, cron, shadow cycle).
7. **Emitting** observability + kernel events so the self-optimization control plane (Phase 18) can tune it live.

Out of scope here (covered by their own ADRs/docs): the **ring kernel internals** (ADR-0005), **scheduler policy math** (ADR-0009), **pipeline DAG format** (Pillar V), **sandbox/isolation** (ADR-0006), **security modules** (Phase 14).

---

## 2. Component Map

```
                         ┌──────────────────────────────────────────┐
                         │              RING KERNEL                   │
                         │  enqueueTask → agentTasks (status=queued)  │
                         │  pickNextTask()  [kernel.ts:477]           │
                         │  completeTask / failTask                   │
                         │  ring budgets / gang / checkpoint          │
                         └───────────────┬────────────────────────────┘
                                         │ pickNextTask() returns 1 task
                                         ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │                     TASK WORKER  (task-worker.ts)                │
        │  startWorker() ── setInterval(tick, pollIntervalMs)              │
        │  onTaskQueued() ── wakeWorker()  (LISTEN/NOTIFY push)            │
        │  setInterval(runMaintenance, maintenanceIntervalMs)              │
        │                                                                   │
        │   tick(actor) ──► executeTask(task) ──► dispatchTask(task)       │
        │                       │  quantum/AbortController                  │
        │                       ▼                                          │
        │              Scheduler policy (scheduler.ts) decides *order*     │
        │              MessageBus fans out agent.state / task.update       │
        └───────────────┬───────────────────────────┬─────────────────────┘
                        │ succeed/fail               │ dispatch by kind
                        ▼                            ▼
              completeTask / failTask        handleLLM / handleAgentRuntime
              (ring budget release)          handleRecall / handleBrainCompress
                                             pipeline-executor (DAG waves)
                        │
                        ▼
                 appendAudit + publishKernelEvent
```

| Component             | File                                       | Role                                                                     |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| **Task Worker**       | `server/src/services/task-worker.ts`       | The loop driver (poll + wake + maintenance).                             |
| **Kernel**            | `server/src/services/kernel.ts`            | Task lifecycle, ring budget, gang, checkpoint, events.                   |
| **Scheduler**         | `server/src/services/scheduler.ts`         | `pickByPolicy`, MLFQ/EDF/FairShare, starvation aging, latency profiling. |
| **Message Bus**       | `server/src/services/message-bus.ts`       | Fan-out of `agent.state` / `task.update` to SSE + subscribers.           |
| **Pipeline Executor** | `server/src/services/pipeline-executor.ts` | DAG-wave execution model (Pillar V).                                     |
| **Task Notifier**     | `server/src/services/task-notifier.ts`     | Postgres `LISTEN/NOTIFY` → `wakeWorker()`.                               |

---

## 3. The Core Loop (poll + wake)

### 3.1 Lifecycle

`startWorker(actor)` (`task-worker.ts:99`):

1. Guards against double-start (`if (running) return`).
2. `initializeSchedulingPolicy()` — selects policy from `NEXUS_SCHEDULER_POLICY` env.
3. `startMlfqBooster()` — starts the 5s blanket Q0 boost timer (scheduler.ts:1019).
4. Starts `pollTimer` = `setInterval(tick, pollIntervalMs)` — **zero DB writes when idle** (design goal: "no DB writes when the queue is empty").
5. Starts `maintenanceTimer` = `setInterval(runMaintenance, maintenanceIntervalMs)`.
6. Subscribes to `onTaskQueued()` so a Postgres `NOTIFY` can `wakeWorker()` instead of waiting for the next poll tick.

`wakeWorker()` (`task-worker.ts:137`) fires an immediate `tick('system')` (fire-and-forget, errors logged). This is what removes the latency of `pollIntervalMs` when work arrives.

### 3.2 `tick(actor)` — `task-worker.ts:260`

```
tick(actor):
  task = await pickNextTask()           # kernel.ts:477 (scheduler-admitted)
  if !task: return                      # idle → no DB writes
  if workerHealth.score < 0.3 and task.kind != 'maintenance':
      re-queue task; log 'worker_deprioritized_unhealthy'; return
  activeCount++
  try: await executeTask(task, actor)
  finally: activeCount--
```

Concurrency is bounded by `activeCount >= options.maxConcurrency` — the poll simply returns early when saturated (backpressure by admission throttle, not queue rejection).

### 3.3 `executeTask(task, actor)` — `task-worker.ts:289`

This is the per-task state machine driver:

1. **Resolve scheduling mode** — `cooperative` vs `preemptive` from the agent (`agent.schedulingMode`). Preemptive gets a hard wall-clock `quantum` (`task.quantumMs ?? agent.timeoutMs ?? defaultTimeoutMs`); cooperative gets `quantum = 0` (run-to-completion).
2. **State transition** — `updateAgentState(agentId, 'thinking')` + `bus.publish('agent.state', …)` + `bus.publish('task.update', status:'running')`.
3. **Quantum enforcement** — an `AbortController` + `setTimeout(quantum)` aborts the dispatch when the quantum elapses.
4. **Dispatch with circuit breaker** — `withCircuitBreaker('task:<id>', runDispatch)`.
5. **Reconcile**:
   - **Success** → `completeTask`, `updateAgentState('idle')`, publish events, `recordHealth(true)`.
   - **Preempted** (aborted by quantum) → snapshot `checkpoint`, re-queue, `releaseRingBudget`, `preemptAgent`, `recordHealth` skipped.
   - **Failed** (other error) → `failTask`, `updateAgentState('errored')`, publish events, `recordHealth(false)`.

> **GAP 11.6 (checkpoint restore):** the _save_ path exists (snapshot written to `agentTasks.checkpoint`), but `pickNextTask`/`executeTask` does **not** deserialize `checkpoint` to resume — a preempted task re-runs `dispatchTask` from scratch on re-claim. Restore is the outstanding wiring task.

---

## 4. Scheduling Integration (where the order comes from)

`pickNextTask()` (`kernel.ts:477`) is the admission gate. Sequence:

1. **Fetch** up to 100 `queued` tasks, ordered by `priority DESC, createdAt ASC`.
2. **Build `QueuedTask[]` pool** with `deadline`, `gangId`, `estimatedDurationMs`.
3. **Resolve agent rings** in one batched query (for ring-budget gating).
4. **Loop** while pool non-empty:
   - `pick = pickByPolicy(pool)` — delegates to the active `SchedulingPolicy` (MLFQ default). `pickByPolicy` also runs `applyStarvationAging` (scheduler.ts:833): every _non-picked, non-Q0_ task gets `starvationScore++`; at `STARVATION_PROMOTE_THRESHOLD = 5` it is promoted to Q0 and score reset.
   - **Ring budget gate** — `acquireRingBudget(ring)`. If exhausted, drop that candidate and retry (does **not** block the loop).
   - **Gang scheduling** — if `pick.gangId`, co-claim _all_ queued members of the gang in one `UPDATE … WHERE gangId` (all-or-nothing), record membership, return.
   - Otherwise claim the single task (`status='running'`) and return.
5. If pool drains without a claimable task → return `null` (idle).

### 4.1 Policies (`scheduler.ts:732`)

| Policy                 | Selector                                  | Notes                                                                         |
| ---------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `MLFQPolicy` (default) | lowest MLFQ level first, then `createdAt` | Q0–Q4, quantum 50/100/200/400/800 ms (ADR-0009).                              |
| `EDFPolicy`            | earliest `deadline`, then `createdAt`     | hard-real-time; `deadline` required at enqueue.                               |
| `FairSharePolicy`      | least-recently-served agent first         | last-served-time based; **GAP 11.25**: no deficit/measurement correction yet. |

Swap at runtime via `setSchedulingPolicy('mlfq'|'edf'|'fairshare')` (scheduler.ts:803). The policy object is module-global (`activePolicy`).

### 4.2 Tuning surface for Phase 18 (Self-Opt)

These are the **live-tunable knobs** the auto-tuner (Phase 18) adjusts. All currently exist as either `WorkerOptions` (`task-worker.ts:27`) or scheduler constants:

| Knob                                | Current home                                     | Self-Opt target             |
| ----------------------------------- | ------------------------------------------------ | --------------------------- |
| `pollIntervalMs`                    | `WorkerOptions` (`NEXUS_WORKER_POLL_MS`)         | latency vs DB-load tradeoff |
| `maxConcurrency`                    | `WorkerOptions` (`NEXUS_WORKER_MAX_CONCURRENCY`) | saturation control          |
| `defaultTimeoutMs`                  | `WorkerOptions` (`NEXUS_WORKER_TIMEOUT_MS`)      | default quantum             |
| `maintenanceIntervalMs`             | `WorkerOptions` (`NEXUS_WORKER_MAINTENANCE_MS`)  | reaper aggressiveness       |
| `staleTaskTimeoutMs`                | `WorkerOptions` (`NEXUS_WORKER_STALE_TASK_MS`)   | stale reclaim window        |
| `agentHeartbeatTimeoutMs`           | `WorkerOptions` (`NEXUS_WORKER_HEARTBEAT_MS`)    | dead-agent detection        |
| MLFQ boost interval (5s)            | `startMlfqBooster` (scheduler.ts:1019)           | starvation vs churn         |
| `STARVATION_PROMOTE_THRESHOLD`      | scheduler.ts:716                                 | fairness bound              |
| `MLFQ_QUANTUM_MS` / `MLFQ_PRIORITY` | scheduler.ts:695/707                             | level urgency               |

> **Integration seam:** Phase 18's auto-tuner should call the existing `configureWorker(partial)` (`task-worker.ts:83`) and `setSchedulingPolicy` + a (to-be-added) `setStarvationThreshold`/`setBoostInterval` setter on the scheduler. **No new loop code is required** — only setters that delegate to these. This keeps the loop itself stable while the control plane tunes it.

---

## 5. Task Lifecycle State Machine

```
            enqueueTask()
   (queued) ─────────────────────────────────────────────────────┐
       │                                                            │
       │ pickNextTask() admits + claims                            │
       ▼                                                            │
   (running) ──executeTask──► SUCCESS ──completeTask──► (succeeded)│
       │                                                            │
       │ FAIL (non-preempt) ──failTask──► (failed)                 │
       │                                                            │
       │ QUANTUM exceeded ──snapshot checkpoint──► re-queue (queued)┘ (loop)
       │                                         (preempted)
       │                                                            │
   maintenance reaper: (running) stuck > staleTaskTimeoutMs        │
       └─ retryCount++ ; if >= maxRetries → (dead_letter)          │
                         else → re-queue (queued)                  │
   dead_letter on agent → quarantineAgent()                        │
```

State is persisted in `agentTasks.status`. The Mermaid export already exists (`exportKernelStateMachine`, kernel.ts:1128) — **GAP 11.10**: it is not yet wired to a `GET /api/kernel/state-machine` route.

---

## 6. Backpressure, Health Gating & Safety

- **Queue-depth backpressure** — `enqueueTask` throws `BackpressureError` when depth exceeds `NEXUS_SCHEDULER_BACKPRESSURE_DEPTH` (kernel.ts:851). The HTTP 429 mapping is the route layer's job.
- **Worker health gating** — `tick` refuses non-maintenance work when `workerHealth.score < 0.3` (task-worker.ts:266), returning the task to `queued`. Health is a rolling success/error ratio (`recordHealth`, task-worker.ts:75).
- **Circuit breaker** — every dispatch wrapped in `withCircuitBreaker('task:<id>', …)` (operations-ext.ts) to fail fast on flapping handlers.
- **Kill-switch consistency** — `failTask`/`completeTask` run under the kernel's transactional guard; the safety layer asserts `assertKillSwitchConsistent` after kill-switch mutation (Phase 1.7, verified closed).
- **Token budget** — `handleLLM` enforces `agent.tokensUsed >= agent.tokenBudget` before calling the model and `incrementTokenUsage` after (task-worker.ts:494,521).

---

## 7. Maintenance Loop — `runMaintenance(actor)` (`task-worker.ts:164`)

Runs every `maintenanceIntervalMs`. Five duties:

1. **Stale-task reaper** — `running` tasks whose `startedAt < now - staleTaskTimeoutMs` get `retryCount++`; if `>= maxRetries` → `dead_letter` (and `quarantineAgent` if dead-lettered); else re-queue.
2. **Agent heartbeat monitor** — agents `thinking` with `lastHeartbeatAt` older than `agentHeartbeatTimeoutMs` → `errored`.
3. **Auto-kill watchdog** — if `autoKillEnabled`, `verifyAndAutoKill()` audits integrity (Phase 10).
4. **Cron tick** — `tickCron(actor)` under a `cronBusy` guard (no concurrent cron).
5. **Shadow cognition cycle** — every 10th maintenance cycle (~10 min at defaults) runs `runShadowCycle()` from `health-monitor.ts` (Phase 9 ambient distillation / self-improvement).

---

## 8. Dispatch Routing — `dispatchTask(task, actor, signal)` (`task-worker.ts:396`)

Route by `kind` + label heuristics:

| `kind`                       | Label match                                  | Handler                                       |
| ---------------------------- | -------------------------------------------- | --------------------------------------------- |
| `interactive` / `background` | `ambient`/`distill`                          | `handleAmbientDistillation`                   |
|                              | `recall`/`search`                            | `handleRecall`                                |
|                              | `capture`/`session`                          | `handleSessionCapture`                        |
|                              | `checkpoint`                                 | `handleCheckpoint`                            |
|                              | `research`/`explore`/`investigate`/`analyze` | `handleAgentRuntime` (multi-step)             |
|                              | (default, LLM configured)                    | `handleLLM`                                   |
| `maintenance`                | `compress`/`prune`                           | `handleBrainCompress`                         |
|                              | `compile`/`pattern`/`self-improve`           | `handleSkillCompilation`                      |
|                              | `health`/`heartbeat`                         | `{ok:true}`                                   |
|                              | `sync`/`workspace`                           | `handleWorkspaceSync`                         |
| `self_improvement`           | —                                            | `handleSkillCompilation`                      |
| `safety`                     | —                                            | logged, **HITL-required** (not auto-executed) |

Handlers are **lazily imported** (`await import(...)`) to keep the worker boot light and to isolate failures.

---

## 9. Pipeline Executor Loop (Pillar V) — `pipeline-executor.ts`

The pipeline DAG uses a **different loop shape**: wave-based, not single-task poll.

- **Validation** (`validateDAG`) — non-empty, single `trigger.manual`, all edges resolve, **acyclic** (Kahn's algorithm, cycles rejected at save).
- **Execution** — topological sort, then run nodes in **waves**; each node's output is passed to downstream nodes keyed by edge id.
- **Node types** — `trigger.manual`, `agent.run`, `tool.invoke`, `guardrail.check`, `output.sink`.
- Each node runs as a unit of work that the runtime loop _could_ enqueue as a task; the executor orchestrates the wave ordering and guards `guardrail.check` failures (branch fails).

> **Integration note for Atlas (Phase 13):** the orchestrator/DAG engine should re-use `pipeline-executor`'s wave scheduler and feed `agent.run` nodes back through `enqueueTask` so they inherit ring budgets, gang scheduling, and MLFQ ordering. The pipeline executor is the _in-DAG_ coordinator; the task worker is the _cross-DAG_ scheduler.

---

## 10. Observability & Events

The loop emits two parallel signal streams:

1. **Message Bus** (`message-bus.ts`) — `agent.state`, `task.update`, `task.enqueued` published by the worker/kernel; fanned out to SSE subscribers and the kernel event bus.
2. **Kernel Events** (`publishKernelEvent`, kernel.ts:819) — typed `KernelEventType` (`task.enqueued`, `task.completed`, `kernel.panic`, `deadlock.detected`, …). Subscribable in-process via `subscribeKernelEvent`.
3. **Audit** — every lifecycle transition appends to the audit chain via `appendAudit` (`task.enqueued`, `task.completed`, `worker.llm_completed`, …).
4. **Scheduler profiling** — `recordQueueLatency` (scheduler.ts:861) feeds `getQueueLatencyPercentiles` (p50/p90/p99/p999). **GAP 11.17**: no `GET /api/scheduler/latency` route yet.
5. **Structured logging** — `log.info/warn/error` with context (taskId, label, durationMs, score).

**Self-Opt consumption:** Pulse's control plane reads `workerStatus()` (`task-worker.ts:87`), `getWorkerHealth()`, `getQueueLatencyPercentiles()`, `ringBudgetStatus()` (kernel.ts:993), and `getSchedulingPolicyName()` to compute tuning decisions. These getters are the read side of the tuning surface in §4.2.

---

## 11. Open Gaps (tracked by Phase 11 worklist)

| Gap                              | What's missing                                                                      | Impact on loop                                 |
| -------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| **11.6** checkpoint restore      | `pickNextTask` doesn't read `checkpoint`                                            | preempted tasks re-run from scratch            |
| **11.10** state-machine route    | getter exists, no HTTP route                                                        | frontend can't render FSM live                 |
| **11.13** ring-policy PATCH      | `RingPolicyStore.set` exists, no route                                              | can't mutate ring policy via API               |
| **11.14** cgroup enforcement     | cgroup budgets stored, not gating                                                   | nested budget isolation inactive               |
| **11.15** hierarchical scheduler | `HierarchicalScheduler` built, not wired                                            | no per-team time-budget allocation             |
| **11.17** latency route          | percentile getter exists, no route                                                  | no API for scheduler latency                   |
| **11.21** targeted starvation    | blanket boost only, no per-task score in DB                                         | promotion not durable across restarts          |
| **11.22** bootstrap ordering     | `kernel-bootstrap.ts` EXISTS                                                        | start order topo-sorted (verify at boot)       |
| **11.23** preemption guard       | `preemption-leak-guard.ts` in Forge namespace                                       | sensitive ops guarded                          |
| **11.24** panic handler          | **IMPLEMENTED** — `kernel-panic.ts` exists (real crash-dump/emergency mode)         | closes the old "placeholder only" gap          |
| **11.25** fair-share correction  | selection only, no measurement                                                      | no deficit correction >20% deviation           |
| **11.27** introspection API      | `kernel-introspect.ts` + `kernel-introspect-state.ts` exist                         | aggregate endpoint present                     |
| **11.28** kernel audit trail     | `kernel-persistence.ts` + `ring-audit.ts`                                           | `kernel_audit_events` persisted via ring-audit |
| **11.29** ring oscillation       | **IMPLEMENTED** — `RingOscillationDetector` in `ring-audit.ts`                      | ring flapping detected                         |
| **11.30** config schema          | only `getEnv()`                                                                     | no Zod cross-field validation at boot          |
| **11.31** overhead accounting    | no `hrtime` instrumentation                                                         | scheduler cost invisible                       |
| **11.32** deadlock detection     | **IMPLEMENTED** — `deadlock-detector.ts` exists (wait-for graph + victim selection) | closes the old "placeholders only" gap         |
| **11.33** hot-patch              | **IMPLEMENTED** — `kernel-hotpatch.ts` exists (live module upgrade/rollback)        | beyond policy hot-swap                         |
| **11.34** property tests         | none                                                                                | no invariant tests (starvation bound, etc.)    |
| **11.35** state persistence      | agent recovery only                                                                 | volatile scheduler state lost on restart       |

> **Living doc note (2026-07-09):** rows marked **IMPLEMENTED** were closed by Forge's Phase-11
> delivery (`kernel-panic.ts`, `ring-audit.ts`, `deadlock-detector.ts`, `kernel-hotpatch.ts`,
> `kernel-introspect*.ts`, `kernel-bootstrap.ts`, `kernel-persistence.ts`). This table is a
> snapshot; treat `docs/PLAN_TRACKER.md` as the live accuracy source.

---

## 12. Design Invariants (must hold after any change)

1. **Idle loop is free** — no DB writes when `pickNextTask()` returns `null`.
2. **Single-claim** — a task is `running` for exactly one worker; claimed atomically (`UPDATE … WHERE status='queued' … RETURNING`).
3. **Ring budget released on every terminal path** — success, fail, _and_ preempt (kernel.ts:554, task-worker.ts:365).
4. **Gang all-or-nothing** — either every gang member is claimed or none (kernel.ts:519).
5. **Quantum abort is swallowed, not fatal** — preempted ≠ failed (task-worker.ts:352).
6. **Health gate never starves maintenance** — unhealthy workers still run `kind='maintenance'` (task-worker.ts:266).
7. **Safety tasks never auto-execute** — `kind='safety'` returns a HITL note (task-worker.ts:459).
8. **Events mirrored** — every state change publishes to both Message Bus and Kernel Event bus.

---

## 13. API Surface (loop-facing endpoints)

| Concern                         | Status               | Note                                                           |
| ------------------------------- | -------------------- | -------------------------------------------------------------- |
| `POST /api/v1/tasks` (enqueue)  | exists               | backpressure throws → 429 at route                             |
| `GET /api/kernel/state-machine` | **GAP 11.10**        | wire `exportKernelStateMachine`                                |
| `GET /api/scheduler/latency`    | **GAP 11.17**        | wire `getQueueLatencyPercentiles`                              |
| `PATCH /api/kernel/ring-policy` | **GAP 11.13**        | wire `RingPolicyStore.set`                                     |
| `GET /api/kernel/introspect`    | **GAP 11.27**        | aggregate existing getters                                     |
| `GET /api/v1/worker/status`     | suggested            | expose `workerStatus()` + `getWorkerHealth()`                  |
| `POST /api/v1/worker/tune`      | suggested (Phase 18) | Self-Opt setter facade → `configureWorker` + scheduler setters |

---

## 14. Relationship to Other Phases

- **Phase 11 (Kernel/Scheduling):** this loop _consumes_ the kernel + scheduler. Gaps 11.6/11.13/11.14/11.15/11.17/11.21 are loop-integration work.
- **Phase 13 (Orchestration):** the orchestrator/DAG should route `agent.run` nodes through `enqueueTask` (§9).
- **Phase 15 (Perf/Scalability):** `maxConcurrency` + stateless worker pool + replica router are the scaling levers; the loop is intentionally process-local today (single-node). **GAP:** no cross-node claim coordination — a future `distributed` backend must make `pickNextTask` claim-safe across replicas.
- **Phase 16 (SDK/DX):** the SDK should surface `workerStatus` / `schedulerStatus` for operators.
- **Phase 18 (Self-Opt):** this doc's §4.2 is the contract between the loop and Pulse's auto-tuner. The loop is the _plant_; the tuner is the _controller_.
- **Phase 20 (Reliability/Chaos):** `runMaintenance` reaper + health gate are the loop's resilience primitives; chaos drills should exercise `preemptAgent` + stale reaper paths.

---

## 15. Summary

The NEXUS runtime loop is a **single-node, poll-and-wake, claim-once** control loop: `task-worker.ts` drives it, `kernel.ts::pickNextTask` admits work under ring/gang/starvation rules, `scheduler.ts` decides order via a swappable policy, `message-bus.ts` + kernel events provide observability, and `pipeline-executor.ts` runs DAGs in waves above the same kernel. The loop is stable and production-shaped; remaining work is **integration/wiring + a few new infrastructure modules** (Phase 11 gaps), plus the **Phase 18 control-plane seam** that tunes it live without changing loop code.

**Pulse's next action items (owner: Pulse):**

1. Author `setStarvationThreshold` / `setBoostInterval` setters on `scheduler.ts` to complete the §4.2 tuning surface.
2. Draft the `POST /api/v1/worker/tune` control-plane route (Phase 18) wrapping `configureWorker` + scheduler setters.
3. File property-based tests (11.34) asserting the §12 invariants (single-claim, gang all-or-nothing, starvation bound).

---

## 16. Tool Invocation Contract

Every side-effecting action an agent takes — calling an LLM, hitting an external
API, executing a sandboxed script, writing to memory, mutating the kernel — flows
through a **single, auditable tool contract** implemented in `agent-runtime.ts`
(`executeAction` / `runAgentLoop`) and `kernel.ts` (`authorizeToolCall`). This is
the only sanctioned way for an agent to leave its sandbox; anything bypassing it
is a policy violation and is blocked by the kernel admission gate.

### 16.1 The 5-phase contract

```
┌──────────────────────────────────────────────────────────────────────┐
│  agent emits an "action" (name + args + metadata)                      │
└───────────────────────────────────┬──────────────────────────────────┘
                                     ▼
   [1] VALIDATE    Zod-parse args against the action's input schema.
                  │  On failure → return { ok:false, error:"Custom validation
                  │  failed: …" }, NO execution, NO audit of a side effect.
                  ▼
   [2] AUTHORIZE  Resolve agent → ring (kernel.agentRing, default 2).
                  │  Reject if agent.status ∈ {quarantined,paused,terminated}.
                  │  Call authorizeToolCall(agentId, ring, actionName, …).
                  │  On deny → { ok:false, error:"ACL denied action …" }.
                  ▼
   [3] EXECUTE    withTimeout(action.handler(parsed, ctx), timeoutMs).
                  │  Hard cap; on timeout the handler is aborted and the
                  │  action is marked failed (not retried silently).
                  ▼
   [4] AUDIT      appendAudit('action.executed', { agentId, action, ok, dur }).
                  │  Every terminal outcome (success OR failure) is logged to
                  │  the append-only audit chain (hash-chained).
                  ▼
   [5] RESPOND    { ok, data?, error?, durationMs } returned to caller.
                  │  Output is fed back into the agent loop as the next
                  │  observation; the loop decides whether to emit another action.
```

### 16.2 Ring-based ACL (the authorization spine)

`authorizeToolCall` consults the kernel's `RingPolicyStore` (see §18.2). The
default tool matrix (`RING_TOOL_ACCESS`) is:

| Ring | Allowed tools (illustrative)                           | Limits            |
| ---- | ------------------------------------------------------ | ----------------- |
| 0    | `kernel.*`, `scheduler.*`, `audit.*` (supervisor-only) | set by policy row |
| 1    | `orchestrator.*`, `agent.lifecycle`, `memory.admin`    | set by policy row |
| 2    | `llm.call`, `memory.read/write`, `recall`, `skill.run` | set by policy row |
| 3    | `skill.run` (sandboxed), `memory.read`, `recall.read`  | set by policy row |
| 4    | `memory.read` (public only), `recall.read`             | set by policy row |

An agent may only invoke a tool if its ring is **listed** for that tool _and_ it
has not exceeded `maxConcurrency` / `maxTokensPerMin` / `maxApiCallsPerMin`
from its ring policy. Ring 0 is reserved for the kernel dispatcher and can only
be exercised by supervisor-owned processes.

### 16.3 Action registry & metadata

Actions are registered in `action-registry.ts` with:

- `name` — namespaced (`domain.verb`, e.g. `llm.call`)
- `handler` — the implementation invoked at phase [3]
- `inputSchema` — Zod schema used at phase [1]
- `metadata.minRing` — minimum ring required; enforced at phase [2]
- `metadata.timeoutMs` — optional per-action override of the global timeout

The agent loop **only** ever calls registered actions; ad-hoc `eval`/dynamic
dispatch is not supported.

### 16.4 Failure semantics

| Outcome            | Phase | Audit recorded?         | Retried by loop?            |
| ------------------ | ----- | ----------------------- | --------------------------- |
| Validation failure | 1     | No (no side effect)     | Yes (agent may reformulate) |
| Authorization deny | 2     | Yes (`action.denied`)   | No (hard block)             |
| Execution timeout  | 3     | Yes (`action.timeout`)  | Per task `maxAttempts`      |
| Execution error    | 3     | Yes (`action.error`)    | Per task `maxAttempts`      |
| Success            | 3     | Yes (`action.executed`) | n/a                         |

This contract is the seam Pulse's self-optimization harness observes: every
action carries `durationMs` and an `ok` flag, which feeds the latency-aware
provider failover (18.4), the queue auto-scaler (18.7), and the behavioral
anomaly quarantine (18.9).

---

## 17. Memory Hooks

Memory is not a service the loop calls out to — it is a **hook surface** woven
into the task lifecycle so every task leaves a durable trace and every agent can
recall prior context. The hooks are low-overhead: they are no-ops when memory is
disabled and never block task dispatch.

### 17.1 Lifecycle hook points

```
onTaskDequeued(task)     ─►  (optional) prime working set from memory
   │                         via memory-priming / memory-rehearsal.
   ▼
runAgentLoop(task)
   │  ├─ agent emits recall action  ─►  recall.ts (BM25 + pgvector → RRF)
   │  ├─ agent emits memory.write   ─►  memory.service storeMemory(...)
   │  └─ agent emits memory.read    ─►  memory.service getMemory(...)
   ▼
onTaskCompleted(task, result)
   │  ├─ storeMemory(result.summary, { projectId, tier })
   │  ├─ recordMemoryEmotion(task, valence)        (memory-emotion)
   │  └─ scheduleRehearsal(task) if durable        (memory-consolidation)
   ▼
onTaskFailed(task)
      ├─ storeMemory(error context, { tier:'cold' })  (for post-mortem)
      └─ emit system:memory.error for the consolidation budget
```

### 17.2 Recall hook (read path)

When an agent needs context it calls the `recall` action, which dispatches to
`recall.ts`:

```
recall(query, budget, actor)
   ├─ BM25 lexical pass    (memories FTS)
   ├─ pgvector cosine pass (embedding similarity)
   ├─ RRF fusion (k = NEXUS_RRF_K = 60)
   ├─ importance × recency × feedback weighting
   └─ budget-packed results (NEXUS_RECALL_BUDGET)
```

`task-worker.ts` also short-circuits recall-intent labels
(`labelLower.includes('recall' | 'search')`) to call `recall` directly, saving a
round-trip through the LLM for pure retrieval tasks.

### 17.3 Write / consolidation hooks (write path)

- **Tiering** — `memory-hierarchy.ts` assigns each stored memory a tier
  (hot / warm / cold). Hot memories are recalled first; cold memories may be
  offloaded to `memory-cold-storage` or defraged by `memory-fragmentation`.
- **Decay** — `memory-decay.ts` applies a half-life (`decayHalflifeHours`) so
  stale memories sink in recall ranking; `memory-forget.ts` purges below a
  salience floor.
- **Rehearsal** — `memory-rehearsal.ts` + `memory-consolidation.ts` re-surface
  due memories (`nextReviewAt`) via an SM-2 schedule, promoting warm → hot.
- **Emotion / Provenance** — `memory-emotion.ts` tags valence;
  `memory-provenance.ts` records the originating task/agent for the audit chain.

### 17.4 Pulse integration

Pulse's auto-tuner calibrates this hook surface live without editing
`memory-*.ts`:

- **Memory threshold self-calibration (18.2)** adjusts `NEXUS_RECALL_BUDGET`
  and tier cut-offs from observed hit-ratios.
- **RRF online optimization (18.15)** nudges the lexical/vector blend weights.
- **Predictive cache warming (18.8)** pre-primes the working set in
  `onTaskDequeued` for the next predicted task class.

---

## 18. Hot-Reload

The OS evolves **without a process restart** along three independent axes. Each
axis is failure-isolated: a bad reload on one axis cannot take down the others,
and every reload is reversible.

### 18.1 Runtime hot-patch (`kernel-hotpatch.ts`)

`HotPatchRegistry` keeps a versioned history per module and supports
`patch(module, impl)` → new version, `rollback(module)` → previous version, and
`getActiveImpl(module)`. A lighter `HotpatchSpec` surface (`applyHotpatch` /
`rollbackHotpatch`) lets an operator ship a named patch with an `apply`/`rollback`
pair and a stable id.

```
patchModule('scheduler.pickNext', newPicker)   // → version 2
// … later, if 2 misbehaves …
rollbackModule('scheduler.pickNext')            // → back to version 1
```

All transitions are logged (`hotpatch_applied` / `hotpatch_rolled_back`) and are
themselves audited. **Caveat:** hot-patched functions only take effect for code
paths that _read_ the registry (e.g. via `getActiveImpl`); pure module-level
exports are not transparently swapped. Phase-11 modules that support live swap
expose a registry-backed accessor.

### 18.2 Ring policy hot-reload (`RingPolicyStore`)

ACL and ring budgets live in the `ringPolicies` table and are cached in
`RingPolicyStore`. Calling `ringPolicyStore.reload()` re-reads every row and
rebuilds the cache **atomically**; `ensureLoaded()` lazily loads on first use.

```ts
await ringPolicyStore.reload(); // pick up a just-edited ring policy row
```

This is how Pulse's guardrail calibration (18.18) and the scheduler PID tuner
(18.1) push new limits into the admission gate without downtime. The reload is
lock-free for readers (Map swap) and is the canonical "change ACL live" path.

### 18.3 Skill hot-swap (`skill-template-engine.ts` → `kernel.ts`)

Compiled skills (deterministic task→script mappings) are stored in
`compiledScripts` with a `patternSignature` (sha256 of the normalized label).
Before the kernel dispatches an LLM task it calls `checkCompiledScript(label, input)`:

- If a matching **active** script exists, the OS executes it via the sandbox
  (`sandbox.ts`, Docker when available, in-process fallback) and **skips the LLM
  call entirely** — the token-saving "hot-swap."
- If the sandboxed execution fails, the script is auto-marked `deprecated` and
  the kernel falls back to the normal LLM path on the next attempt.

```
kernel: checkCompiledScript("summarize ticket", input)
   ├─ hit  → executeSandboxed(script) → return output (no LLM)
   └─ miss → proceed to runAgentLoop (LLM)
```

This is the _behavioral_ hot-reload layer: new skills can be compiled and
activated while the system runs, and bad skills self-disable.

### 18.4 Reload isolation summary

| Axis              | Module                  | Trigger             | Reversible?        | Blast radius   |
| ----------------- | ----------------------- | ------------------- | ------------------ | -------------- |
| Code patch        | `kernel-hotpatch.ts`    | operator / self-opt | Yes (`rollback`)   | per-module     |
| ACL / ring budget | `RingPolicyStore`       | `reload()`          | Yes (reload again) | admission gate |
| Skill behavior    | `skill-template-engine` | compile + activate  | Yes (deprecate)    | per-label task |

All three emit bus events (`system:hotpatch`, `system:ringpolicy.reloaded`,
`system:skill.swapped`) so dashboards and the audit chain observe every live
change — satisfying the "no silent mutation" governance rule.
