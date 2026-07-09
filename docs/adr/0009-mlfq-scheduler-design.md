# ADR-0009: MLFQ Scheduler Design (Phase 11)

- **Status:** Accepted
- **Date:** 2026-07-09
- **Deciders:** Forge (kernel engineer, design owner), Lorekeeper (recorder)
- **Implements:** Phase 11.1, 11.4, 11.5, 11.8 of `PHASES_11_30_MASTER_PLAN.md`; gap items 11.21, 11.25
- **Superseded by:** none

## Context

Phase 11 ("Advanced Kernel & Scheduling") requires a production-grade scheduler with Multi-Level
Feedback Queue (MLFQ), priority inheritance (PIP), preemption, EDF hard-real-time support, and
per-ring resource budgets. The master plan called for _replacing a flat priority+age sort in
`pickNextTask()`_ with true MLFQ.

An audit of the current tree (`docs/PHASE11_WORKLIST.md`, 2026-07-08) found the scheduler
**already substantially built** in `server/src/services/scheduler.ts` and wired through
`kernel.ts`'s `pickNextTask()`. This ADR ratifies the _designed_ behaviour — capturing Forge's
decisions — and records the residual gaps that remain as explicit follow-ups.

## Designed Behaviour (ratified)

### 1. MLFQ core (`MLFQPolicy`)

- **Levels:** `Q0` (highest) → `Q4` (lowest), defined by `MLFQ_LEVELS = ['Q0'..'Q4']`.
- **Quantum:** `MLFQ_QUANTUM_MS` — Q0 smallest timeslice, Q4 largest (preemptive).
- **Priority weight:** `MLFQ_PRIORITY` — normalized urgency per level; Q0 highest.
- **Boost:** `boostMlfqQueues()` promotes all non-Q0 queued tasks to Q0 on a fixed interval
  (`NEXUS_MLFQ_BOOST_MS`, default 5000 ms) via `startMlfqBooster()`. This is the
  _aging/starvation-avoidance_ mechanism.
- **Selection:** `pickByPolicy()` is the dispatch seam in `kernel.ts` `pickNextTask()`; the
  active policy is swappable at runtime.

### 2. Pluggable policy interface (`SchedulingPolicy`)

- Contract: `pick(tasks: QueuedTask[]): QueuedTask`.
- Three shipped policies: `MLFQPolicy` (default), `EDFPolicy` (deadline-driven),
  `FairSharePolicy` (weighted fairness).
- Runtime swap via `setSchedulingPolicy('mlfq' | 'edf' | 'fairshare')`; current name from
  `getSchedulingPolicyName()`. Env knob: `NEXUS_SCHEDULER_POLICY`.

### 3. EDF hard-real-time (`EDFPolicy`)

- Honours `EnqueueTaskInput.deadline` / `QueuedTask.deadline`; earliest-deadline-first when set.
- Deadline admission control via `checkDeadlineAdmission()` — rejects tasks that cannot meet
  their deadline before enqueue.

### 4. Per-ring resource budgets (`RingPolicy` / `RingPolicyStore`)

- Rolling-window concurrency / token / api-call budgets per ring (0–4), DB-backed policies.
- Enforced in `pickNextTask()` via `acquireRingBudget()` / `releaseRingBudget()`;
  `ringBudgetStatus()` exposes live state.
- Config: `server/src/config/kernel-schema.ts` (`mlfqLevels`, `quantumMs`, etc.).

### 5. Priority Inheritance Protocol (PIP) — designed, partially wired

- `inheritPriority()` / `restorePriority()` / `effectivePriority()` / `getHeldResources()`.
- Holder→waiter priority escalation on contended resources (`pip_inherit` audit event).
- **Gap (carried forward):** no caller yet registers `HeldResource` on real lock acquisition —
  must be wired into shared-resource paths for the verify scenario.

### 6. Gang scheduling (designed, built)

- `gangId` on `EnqueueTaskInput`; `pickNextTask()` performs all-or-nothing co-claim of gang
  members in `pickNextTask()`.

## Consequences / Out-of-Scope (explicit follow-ups)

The following are **NOT** fully closed by the current build and are tracked as Phase 11 gap work
(see `docs/PHASE11_WORKLIST.md`):

| ID          | Gap                                                                           | State   |
| ----------- | ----------------------------------------------------------------------------- | ------- |
| 11.3        | Cooperative `yield()` + checkpoint/resume for cooperative mode                | PARTIAL |
| 11.6        | Quantum context **restore** (save exists, restore missing)                    | PARTIAL |
| 11.10       | `GET /api/kernel/state-machine` route (Mermaid generator built)               | PARTIAL |
| 11.14       | Cgroup budget **enforcement** (struct + inheritance built, gating not wired)  | PARTIAL |
| 11.15       | Hierarchical per-team scheduler **wiring** into dispatch                      | PARTIAL |
| 11.21       | Targeted starvation scoring (current boost is blanket, not starvation-scored) | PARTIAL |
| 11.22–11.34 | New infrastructure (fairness correction, full persistence, etc.)              | NEW     |

Decision: keep MLFQ as the **default** policy; do not promote FairShare/EDF to default without a
benchmark (Phase 15 perf work owns that evaluation).

## References

- `server/src/services/scheduler.ts` (`MLFQPolicy` L742, `EDFPolicy` L751, `FairSharePolicy` L767, `MLFQ_LEVELS` L695, `boostMlfqQueues` L823, `startMlfqBooster` L1019)
- `server/src/services/kernel.ts` (`pickNextTask` L477, `pickByPolicy` dispatch, `RingPolicy` L868, `acquireRingBudget` L1015, `inheritPriority` L1052)
- `server/src/config/kernel-schema.ts`, `server/src/lib/env.ts` (`NEXUS_MLFQ_BOOST_MS`, `NEXUS_SCHEDULER_POLICY`)
- `docs/PHASE11_WORKLIST.md` (35/35 classification)
- `PHASES_11_30_MASTER_PLAN.md` § Phase 11; `PHASES_11_30_GAP_UPDATE.md` § 11.21, 11.35
