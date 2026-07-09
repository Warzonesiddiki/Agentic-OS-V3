# ranking-trainer

## Purpose
Pure learning-to-rank trainer for recall re-ranking. Defines `RankingFeatures`/`FeedbackTriple`/
`RankerWeights`, a `DEFAULT_WEIGHTS`, a `DbFeedbackStore`, `trainRanker` (logistic-ish fit), and
`rankCandidates`/`rerank` to apply weights. Pure math, no DB I/O in the core functions.

## Public exports (selected)
- `interface RankingFeatures`, `interface FeedbackTriple`, `interface RankerWeights`, `interface StoredFeedback`.
- `interface FeedbackStore` (interface), `interface RankCandidate`, `interface RankedCandidate`.
- `const DEFAULT_WEIGHTS: RankerWeights`.
- `function getRankerWeights(): RankerWeights`.
- `function trainRanker(feedback: FeedbackTriple[], init?): RankerWeights` — pure.
- `function rankCandidates(cands, weights): RankedCandidate[]` — pure.
- `function rerank(candidates, weights)` — pure.

## Env vars
None directly.

## Test file
- `server/tests/ranking-trainer.test.ts` (trainRanker, rankCandidates, rerank determinism).
