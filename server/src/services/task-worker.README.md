# task-worker

## Purpose
The runtime-loop driver. Polls the kernel's MLFQ queue, dispatches tasks with bounded concurrency, runs
maintenance (stale-task reaping, heartbeat), supports cooperative yield, and exposes a control surface
(setters) that Pulse's auto-tuner calls to live-tune the loop. This is Forge's half of the kernel seam;
Pulse tunes it without editing loop code.

## Public exports (selected)
- `interface WorkerOptions` — knobs (`pollIntervalMs`, `maxConcurrency`, `defaultTimeoutMs`,
  `maintenanceIntervalMs`, `staleTaskTimeoutMs`, `agentHeartbeatTimeoutMs`, `autoKillEnabled`).
- Health: `reportWorkerHealth(score, metrics?)`, `getWorkerHealth()`.
- Pulse control surface: `configureWorker(opts)`, `setConcurrency`, `setWorkerConcurrency`, `setMaintenance`,
  `setStaleTask`, `setHeartbeat`, `setWorkerTimeout`, `prewarmCache`.
- Loop: `workerStatus()`, `startWorker(actor)`, `wakeWorker()`, `stopWorker()`.
- Yield: `class CooperativeYield extends Error`, `cooperativeYield()`.
- Scheduling-mode wrapper: `interface SchedulingOptions`, `interface SchedulingResult`,
  `runWithSchedulingMode(opts)`.

## Env vars
- `NEXUS_WORKER_POLL_MS`, `NEXUS_WORKER_MAX_CONCURRENCY`, `NEXUS_WORKER_TIMEOUT_MS`,
  `NEXUS_WORKER_MAINTENANCE_MS`, `NEXUS_WORKER_STALE_TASK_MS`, `NEXUS_WORKER_HEARTBEAT_MS`,
  `NEXUS_WORKER_AUTO_KILL`.

## Test file
- `server/tests/task-worker.test.ts` (concurrency, stale reaping, cooperative yield, setters).
