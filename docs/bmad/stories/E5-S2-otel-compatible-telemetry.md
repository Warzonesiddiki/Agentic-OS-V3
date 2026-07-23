# Story E5-S2 — OTel-compatible task/model/tool telemetry

**Epic:** E5 Evidence and observability
**Priority:** P1
**Estimate:** 5
**Status:** done
**Sprint:** sprint-5

## Acceptance criteria
- [x] Emit spans for task, agent, recall, model, approval wait, tool, and outcome operations.
- [x] Record model/latency/token metadata when available.
- [x] Do not capture prompt/memory/file/tool content by default.
- [x] Trace IDs correlate with audit, receipt, task, and approval records.
- [x] Metrics cover task outcomes, retries, approval latency, recall mode/usefulness, tool failures, and provider health.
- [x] Exporter failure cannot fail the task or mutate domain state.

## Implementation
- SDK `TelemetryService` with `TelemetrySpan` {spanId, traceId, parentSpanId, kind, name, startAt, endAt, status, attributes, taskId, projectId, approvalId, receiptId} and `MetricEvent`.
- Kinds: task, agent, recall, model, approval_wait, tool, outcome, checkpoint (Zod schema).
- `startSpan` generates spanId/traceId via randomUUID, stores in memory.
- `endSpan` sets endAt and status, merges attributes (model name, latency, tokens without content).
- `recordModelMetadata` adds model.name, latency_ms, tokens_used/input/output to attributes (no prompt content).
- Metrics: task.outcome, task.retry, approval.latency, recall.mode, recall.usefulness, tool.failure, provider.health via `recordMetric`.
- Convenience helpers: taskOutcome, retry, approvalLatency, recallMode, recallUsefulness, toolFailure.
- Exporter: SpanExporter and MetricExporter interfaces; `flush()` wraps export in try/catch swallow, so exporter failure cannot fail task.
- SQL: `r1_telemetry_spans` with FK to tasks/projects, kind check, attributes JSON.
- Server runtime: telemetry spans saved via `SqlTelemetry.saveSpan` on flush, but flush failure swallowed.
- Routes: GET /projects/:id/telemetry lists spans+metrics, POST /telemetry/flush.

## Evidence
- packages/sdk/src/r1-telemetry.ts
- packages/sdk/src/sql-extended-repositories.ts (SqlTelemetry)
- server/src/db/migrations/0052_r1_extended.sql
- server/src/services/r1-extended-runtime.ts
- server/src/routes/r1-extended.ts

## Validation
- Performance test does not depend on exporter; telemetry failure does not affect domain.
- No content capture verified via attribute allowlist.
