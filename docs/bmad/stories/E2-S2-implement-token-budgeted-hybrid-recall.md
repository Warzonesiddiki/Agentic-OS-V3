# Story E2-S2 — Implement token-budgeted hybrid recall

**Epic:** E2 — Trusted memory and recall
**Priority:** P1
**Estimate:** 5 points
**Sprint:** sprint-3
**Status:** done
**Source:** docs/bmad/07-epics-and-stories.md

## User story
As an agent runtime, I want scoped recall within a token budget so that I can receive useful project context without overflowing the model context window.

## Acceptance criteria
- [x] Query accepts project/agent scope and positive token budget.
- [x] Results are candidate-filtered by scope before packing.
- [x] Lexical mode works without embeddings.
- [x] Vector mode is used only when the provider/index is available and dimension-compatible.
- [x] Response includes result IDs, provenance, mode, budget requested, budget used, and truncation state.
- [x] Packing never exceeds the requested budget according to the documented tokenizer/estimator.

## Implementation notes
- SDK `R1RecallService` with `estimateTokens` chars/4 estimator, lexicalScore Jaccard+TF, scope filtering before packing, hybrid blend with vector hook.
- Vector search optional via injected `vectorSearch`, dimension compatibility check, fallback to lexical.
- Server extended runtime wires recall service with SQL repos, telemetry records recall.mode.
- Routes: POST /projects/:projectId/recall validates query via Zod, returns resultIds, provenance map, modeUsed, budget, truncation.
- Frontend: R1MemoryWorkbench shows scope, source, confidence, freshness, mode, matchedBy, explanation.
- Tests: performance test for lexical recall p95 <=1.5s on 500 fixture; SDK typecheck passes.

## Evidence
- packages/sdk/src/r1-recall.ts
- packages/sdk/src/sql-extended-repositories.ts
- server/src/services/r1-extended-runtime.ts
- server/src/routes/r1-extended.ts
- src/components/r1/R1MemoryWorkbench.tsx

## Validation
- SDK 91/91 pass; recall path exercised via API contract.
- Token budget guarantee documented: estimator same for scoring and packing.
