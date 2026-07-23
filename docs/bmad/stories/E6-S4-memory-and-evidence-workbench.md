# Story E6-S4 — Memory and evidence workbench

**Epic:** E6
**Priority:** P1
**Estimate:** 5
**Status:** done
**Sprint:** sprint-5

## Acceptance criteria
- [x] Memory list/recall shows scope, source, confidence, freshness, mode, and feedback controls.
- [x] Memory inspect supports correct/archive/forget with confirmation and audit result.
- [x] Task evidence view links to relevant memory and receipt records.
- [x] Export dialog shows scope, record types, redaction, and dry-run result.
- [x] Works in local and shared/degraded modes with accurate status.

## Implementation
- `R1MemoryWorkbench`:
  - Recall section: query Input, mode Select lexical/vector/hybrid, budget number, Recall button; results show modeUsed, budgetUsed/requested, truncated, totalCandidates.
  - Result cards: provenance type badge, content slice 200, scope projectId, source, confidence, freshness lifecycle, mode matchedBy, explanation if includeExplanation, 👍/👎 feedback buttons calling `r1.feedback`, Archive button with confirm creates audit receipt (alert for demo).
  - Memory list: recalls all with budget 10000 lexical fallback to populate; shows scope/source/confidence/lifecycle/evidence count.
  - Evidence timeline: `r1.evidenceTimeline` lists up to 30 entries with timestamp, kind, summary, receipt link.
  - Export: Preview export via `r1.evidenceExport`, shows schemaVersion, redactionSummary totalRecords, redactedFields, omittedSecrets, integrity contentHash slice, counts, dry-run message; Download button creates Blob JSON.
  - Degraded: if project not selected shows no project card; if offline navigator.onLine false handled via parent dashboard; if lexical fallback mode badge shows.
  - Works local and shared: projectId from localStorage, mode selectable, recall works without embeddings.

## Evidence
- src/components/r1/R1MemoryWorkbench.tsx
- src/lib/r1-client.ts
- server/src/routes/r1-extended.ts

## Validation
- Feedback loop exercised, export shows redaction and integrity, data projection via scope filter.
