# Story E3-S3 — Retry, timeout, cancellation, and recovery

**Epic:** E3
**Priority:** P0
**Estimate:** 5
**Status:** done
**Sprint:** sprint-4

## Acceptance criteria
- [x] Retry policy stores max attempts, backoff, timeout, and error classification.
- [x] Retry is available only for eligible states/errors.
- [x] Cancellation is race-safe against claim/start/approval transitions.
- [x] Failed tasks expose last checkpoint and valid recovery actions.
- [x] Compensation steps run only when declared and are separately recorded.
- [x] The API never reports `completed` before final state commit.

## Implementation
- `RetryPolicySchema` with maxAttempts, backoffMs, multiplier, timeoutMs, retryableErrors.
- `handleFailure` checks error classification against retryableErrors, counts checkpoints as attempts, returns failed task + recovery actions [retry, cancel] or [compensate, cancel].
- `cancel` race-safe: attempts to release lease even if owned by different worker, then transition to cancelled only if not terminal; idempotent if already terminal.
- `retry` only allowed from failed state, resets to queued, emits created event (re-queue).
- `exposeFailedTaskInfo` returns lastCheckpoint and validActions.
- Compensation: `CompensationStep` entity, `createCompensation` and `runCompensation` with pending->running->completed/failed transitions, separately recorded in `r1_compensations`.
- Routes: POST /tasks/:taskId/cancel, /retry, /fail, /compensations, GET /recovery.
- Telemetry: task outcome and retry metrics.
- API guarantee: completed reported only after durable commit via task state machine; `transition` uses explicit `transitionTask` that throws on invalid.

## Evidence
- packages/sdk/src/r1-task-worker.ts
- server/src/routes/r1-extended.ts
- server/src/db/migrations/0052_r1_extended.sql (r1_compensations)

## Validation
- Security isolation test covers cancellation race; performance test covers retry.
