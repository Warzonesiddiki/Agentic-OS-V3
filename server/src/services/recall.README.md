# recall

## Purpose
Core recall engine: BM25 lexical + vector cosine recall, Reciprocal Rank Fusion (`rrfFuse`), importance/
recency/feedback weighting, semantic-threshold filtering, and budget-packed results. The central
retrieval primitive for the whole OS.

## Public exports
- `interface RecallItem` — `{ id, kind, text, score, ... }`.
- `interface RecallResult` — `{ items, total, ... }`.
- `const RRF_K` / `RECENCY_HALFLIFE_DAYS` / `W_RRF` / `W_IMPORTANCE` / `W_RECENCY` / `W_FEEDBACK` / `MAX_CORPUS`
  — weighting + corpus constants (from `env`).
- `const FEEDBACK_TTL_MS` — feedback-cache TTL.
- `function invalidateFeedbackCache(): void`.
- `function rrfFuse(rankLists, k = RRF_K): RecallItem[]` — pure fusion.
- `async function recall(query, options?): Promise<RecallResult>` — main entrypoint.

## Env vars
- `NEXUS_RRF_K`, `NEXUS_RECENCY_HALFLIFE_DAYS`, `NEXUS_RECALL_WEIGHT_{RRF,IMPORTANCE,RECENCY,FEEDBACK}`.
- `NEXUS_MAX_RECALL_CORPUS`, `NEXUS_SEMANTIC_THRESHOLD`, `NEXUS_FEEDBACK_CACHE_TTL_MS`.

## Test file
- `server/tests/recall.test.ts` (fusion, weighting, budget).
- `server/tests/memory-query.test.ts` (recall integration).
