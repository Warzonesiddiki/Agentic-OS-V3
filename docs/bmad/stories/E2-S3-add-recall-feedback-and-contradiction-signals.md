# Story E2-S3 — Add recall feedback and contradiction signals

**Epic:** E2
**Priority:** P2
**Estimate:** 3
**Status:** done
**Sprint:** sprint-5

## Acceptance criteria
- [x] Feedback is recorded with query, result, actor, timestamp, and scope.
- [x] Feedback cannot change memory content or provenance by itself.
- [x] Contradiction candidates are flagged with linked evidence.
- [x] Recall can expose signal explanations without leaking unrelated records.
- [x] Feedback and contradiction changes are auditable.

## Implementation
- SDK `RecallFeedbackService` with FeedbackRepository and ContradictionRepository (in-memory + SQL via `SqlFeedback` and `SqlContradiction`)
- Feedback recorded via `recordFeedback` checks project exists, result memory belongs to project, creates receipt `recall.feedback`.
- Contradiction flagged via `flagContradiction` verifies both memories belong to project, evidence IDs in scope, creates candidate signal + receipt.
- `explainResult` returns feedbackCount, helpfulRatio, contradictions without leaking unrelated records.
- SQL migration 0052 adds `r1_feedback` and `r1_contradictions` tables with FK to projects and memories.
- Routes: POST/GET /projects/:projectId/recall/feedback, GET /recall/explain, POST/GET /contradictions.
- Frontend: workbench shows 👍/👎 controls, feedback count, helpful ratio, contradiction list via `r1.contradictions()`.
- Audit: every feedback and contradiction appends receipt.

## Evidence
- packages/sdk/src/r1-feedback.ts
- packages/sdk/src/sql-extended-repositories.ts (SqlFeedback, SqlContradiction)
- server/src/db/migrations/0052_r1_extended.sql
- server/src/routes/r1-extended.ts
- src/components/r1/R1MemoryWorkbench.tsx

## Validation
- Security test ensures cross-project evidence fails closed.
- Performance test includes recall with feedback loop.
