# federated-recall

## Purpose
The central recall pipeline and the federated (cross-tenant) memory-proof subsystem. Implements
BM25 lexical + vector cosine recall, Reciprocal Rank Fusion (RRF), importance/recency/feedback
weighting, budget-packed result composition, adaptive weight tuning, and a signed proof protocol
for federated memory sharing with a privacy budget. Also ships an `LRUCache` and agent-state cache.

## Public exports
- Types: `RecallItem`, `RecallResult`, `RecallFilters`, `RecallOptions`, `RecallQuery`, `LRUStats`,
  `PrivacyClass`, `MemoryProof`, `MaterializationDecision`, `AdaptiveWeights`.
- Proof/verify: `canonicalizeProof`, `publishMemoryProof`, `verifyMemoryProofSignature`,
  `decideMaterialization`, `ingestMemoryProof`, `listRecentProofs`, `federatedStats`.
- Privacy budget: `privacyBudgetForTopic`, `consumeBudget`, `refundBudget`.
- Adaptive weights: `recordRecallFeedback`, `getAdaptiveWeights`, `getEffectiveWeights`, `getRecallFeedbackStats`.
- Scoring: `computeRecency`, `computeImportance`, `cosineSimilarity`, `reciprocalRankFusion(ranks, k = RRF_K)`.
- Agent-state cache: `agentStateCache`, `getCachedAgentState`, `setCachedAgentState`, `invalidateAgentState`, `getAgentStateCacheStats`.
- Session store: `persistSessionMemories`, `loadSessionMemories`, `pruneStaleSessions`, `listActiveSessions`.
- Classes: `LRUCache<K,V>`, `FederatedRecall`; singleton `fedRecall`.
- Helpers: `memoryCardToRecallItem`, `composeAgentState`.

## Env vars
- `NEXUS_RRF_K` — RRF constant `k` (default 60).
- `NEXUS_RECENCY_HALFLIFE_DAYS` — recency decay half-life.
- `NEXUS_RECALL_WEIGHT_RRF` / `_IMPORTANCE` / `_RECENCY` — fusion weights.
- `NEXUS_MAX_RECALL_CORPUS` — max candidate corpus size.
- `NEXUS_SEMANTIC_THRESHOLD` — cosine cutoff for semantic inclusion.

## Test file
- `server/tests/federated-recall.test.ts` (proof, budget, materialization, RRF).
- `server/tests/memory-perfection.test.ts` (adaptive weights, ML-003).
- `server/tests/routes/v3-upgrade.test.ts` (mocked `federatedStats`).
