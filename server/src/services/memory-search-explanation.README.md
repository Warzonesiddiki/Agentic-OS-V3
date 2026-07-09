# memory-search-explanation

## Purpose
Explainability layer for recall results. Annotates each returned memory with a per-signal breakdown
(lexical, semantic, importance, recency, feedback) so the UI can show *why* a memory was recalled.

## Public exports
- `interface RecallBreakdown` — per-signal score components.
- `type ExplainedRecallItem = RecallItem & { breakdown: RecallBreakdown }`.
- `interface ExplainedRecallResult` — wrapper carrying items + global stats.
- `function explainRecallResults(results: RecallResult): ExplainedRecallResult` — pure explainer.

## Env vars
None directly (reads weights via `federated-recall`).

## Test file
- `server/tests/memory-query.test.ts` (`memory-search-explanation breakdown fields`).
