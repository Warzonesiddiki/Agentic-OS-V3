# Story E3-S2 — Implement checkpointed worker execution

**Epic:** E3 Durable task execution
**Priority:** P0
**Estimate:** 8
**Status:** done
**Sprint:** sprint-3

## Acceptance criteria
- [x] Worker claims tasks with a lease and heartbeat.
- [x] Each step writes durable state before continuing past its side-effect boundary.
- [x] Worker restart recovers expired leases from the last checkpoint.
- [x] A confirmed receipt prevents duplicate execution of an idempotent step.
- [x] Task state transitions are race-safe and terminal states cannot reopen.
- [x] Crash injection tests cover before/after checkpoint and before/after side effect.

## Implementation
- SDK `TaskWorker` class with LeaseRepository, CheckpointRepository, CompensationRepository.
- `claimNext` lists queued tasks, attempts atomic claim via `leases.claim`, verifies fresh state still queued, transitions queued->running via `transitionTask`, emits event, returns lease.
- `checkpoint` saves sequence-sorted snapshot before side effect.
- `recoverExpired` lists expired leases, gets latest checkpoint per task, re-queues task to queued, releases lease.
- `transition` enforces terminal states cannot reopen via early throw.
- SQL: `r1_checkpoints` unique (task_id, sequence), `r1_leases` primary key task_id, `r1_tasks` lease columns added in 0052.
- Routes: POST /tasks/:taskId/checkpoints, GET /checkpoints, POST /tasks/claim, POST /tasks/:taskId/heartbeat, GET /worker/recover.
- Reliability tests: crash injection before checkpoint, after checkpoint before side effect, recovery without duplicate receipt.

## Evidence
- packages/sdk/src/r1-task-worker.ts
- packages/sdk/src/sql-extended-repositories.ts (SqlCheckpoints, SqlLeases)
- server/src/db/migrations/0052_r1_extended.sql
- server/src/services/r1-extended-runtime.ts
- server/tests/r1-performance-reliability.test.ts (worker crash/restart)

## Validation
- Lease expiry and recovery logic covered, p95 task status <500ms, no unbounded lease leak (100 heartbeats still single entry).
