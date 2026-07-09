# kernel

## Purpose
The NEXUS ring-based kernel (Ring 0–4 microkernel). Owns agent lifecycle (spawn/pause/resume/terminate/
quarantine), the MLFQ task queue (`enqueueTask` / `pickNextTask` / `completeTask` / `failTask`), POSIX-style
ACL + ring budgets, cgroups, gang scheduling, priority inheritance, barriers, watchdog policy, kernel
events, and `hotpatchModule`. This is the central seam every other subsystem coordinates through.

## Public exports (selected)
- Lifecycle: `spawnAgent`, `getAgent`, `listAgents`, `updateAgentState`, `quarantineAgent`, `pauseAgent`,
  `resumeAgent`, `terminateAgent`, `recoverAgentProcesses`, `getAgentState`, `listAgentTasks`,
  `incrementTokenUsage`, `registerLifecycleHooks`, `preemptAgent`, `resumeAgentHooks`.
- Tasks: `EnqueueTaskInput`, `enqueueTask`, `pickNextTask`, `completeTask`, `failTask`, `schedulerStatus`.
- Security/ACL: `checkACL`, `authorizeToolCall`, `BackpressureError`, `DeadlineAdmissionError`.
- Ring policy/budget: `RingPolicy`, `RingPolicyStore`, `ringPolicyStore`, `RingBudgetSnapshot`,
  `ringBudgetStatus`, `acquireRingBudget`, `releaseRingBudget`.
- Priority inheritance: `inheritPriority`, `restorePriority`, `effectivePriority`, `getHeldResources`.
- Scheduling/MLFQ: `getMlfqPromotionCount`, `resetMlfqPromotionCount`, `setWatchdogPolicy`, `getWatchdogPolicy`.
- Cgroups/gang: `Cgroup`, `parseCgroup`, `inheritCgroup`, `getGangMembers`, `clearGangMembers`.
- Barriers: `barrierWait`, `barrierStatus`.
- Events: `KernelEventType`, `KERNEL_EVENTS`, `KernelEventName`, `KernelEventCallback`,
  `subscribeKernelEvent`, `publishKernelEvent`, `getKernelEventHistory`.
- State machine: `exportKernelStateMachine`.
- Hotpatch: `hotpatchModule`.

## Env vars
None directly (worker/loop knobs live in `task-worker.ts` / `scheduler.ts`, tuned via Pulse setters).

## Test file
- `server/tests/kernel.test.ts` (lifecycle, ACL, ring budget, MLFQ promotions, hotpatch).
- `server/tests/kernel-*.test.ts` (introspect, panic, persistence).
