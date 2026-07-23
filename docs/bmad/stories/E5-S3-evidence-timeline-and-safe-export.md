# Story E5-S3 — Evidence timeline and safe export

**Epic:** E5
**Priority:** P1
**Estimate:** 5
**Status:** done
**Sprint:** sprint-5

## Acceptance criteria
- [x] Timeline joins task/step/approval/receipt/audit/trace/provenance references through service projections.
- [x] Export includes schema version, scope, selected records, redaction summary, and integrity metadata.
- [x] Export never includes configured secrets or authorization headers.
- [x] Import dry-run reports additions/conflicts/rejections without mutation.
- [x] Export/import failures leave the source project unchanged.

## Implementation
- SDK `EvidenceTimelineService`:
  - `buildTimeline` lists tasks (or single task), then steps, events, evidence, receipts, pending approvals; each entry has id, kind, timestamp, summary, refIds {taskId, stepId, approvalId, receiptId, evidenceId, traceId}, redacted flag, sorted by timestamp.
  - `exportEvidence` gets timeline, tasks (filtered by scope.taskIds or all), steps, evidence, receipts, approvals; redacts secrets via pattern `password|secret|token|api[_-]?key|authorization|credential|private[_-]?key|bearer` replacing value with [REDACTED] and counting omitted; payload for hash includes only redacted records; SHA256 canonical JSON; returns `r1.evidence-export.v1` with exportedAt, projectId, scope, timeline, tasks, steps, approvals, receipts, evidence, redactionSummary {redactedFields, omittedSecrets, totalRecords}, integrity {contentHash, recordCounts}.
- Secrets never included: redaction applied to all exports, auth headers not part of evidence.
- Import dry-run: existing `ProjectTransferService.dryRunImport` reports additions/conflicts/rejected/redactions without mutation (already implemented in E1-S3).
- Failures leave source unchanged: export is read-only; import apply runs in transaction (SQLite withTransaction, Postgres pg.begin) tested via poisoned executor rollback.
- Routes: GET /evidence/timeline?taskId=, GET /evidence/export?taskIds=.

## Evidence
- packages/sdk/src/r1-evidence-timeline.ts
- server/src/routes/r1-extended.ts
- docs/bmad/releases/R1-release-gate.md (export section)
- src/components/r1/R1MemoryWorkbench.tsx (export preview shows redaction summary, integrity hash, dry-run)

## Validation
- Export preview shows schemaVersion, record counts, redacted fields, integrity hash.
- Import dry-run via existing contract test passes.
