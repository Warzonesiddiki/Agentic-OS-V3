# scheduler

## Purpose
Swappable task scheduler for the kernel's task queue. Ships `MLFQPolicy` (Q0–Q4, timeslice/boost/
starvation-promotion), `EDFPolicy` (earliest-deadline-first), and `FairSharePolicy`, selectable via
`setSchedulingPolicy`. Also includes a `CronParser`, a `Scheduler` for cron/event jobs, and an
`MlfqSelfTuner` auto-tuner (Phase 18 seam).

## Public exports (selected)
- Types: `CronStatus`, `ExecutionStatus`, `EventType`, `QueueLevel`, `SchedulerConfig`, `CronJob`,
  `EventTrigger`, `JobExecution`, `ScheduleInput`, `ListFilter`, `QueuedTask`, `MlfqSelfTunerConfig`.
- `class CronParser`, `class Scheduler`.
- `function getScheduler(config?)`, `resetScheduler()`.
- MLFQ: `MLFQ_LEVELS`, `MLFQ_QUANTUM_MS`, `MLFQ_PRIORITY`, `MLFQ_BOOST_MS`, `getQuantum/setQuantum/resetQuantum`,
  `riskLevelForTask`, `compareRisk`.
- Policy: `setSchedulingPolicy(policy)`, `getSchedulingPolicy()`.
- Self-tuner: `configureMlfqSelfTuner`, `getMlfqSelfTunerConfig`, `mlfqSelfTuneStep`, `startMlfqSelfTuner`,
  `stopMlfqSelfTuner`, `isMlfqSelfTunerRunning`.

## Env vars
- `NEXUS_SCHEDULER_POLICY` — `mlfq` (default) | `edf` | `fairshare`.

## Test file
- `server/tests/scheduler.test.ts` (MLFQ promotion, EDF ordering, policy swap).
- `server/tests/scheduler-*.test.ts` (cron parser, fairshare).
