# consensus

## Purpose
Multi-agent consensus engine. `tallyConsensus` aggregates votes under `majority` / `unanimous` / `weighted`
strategies; `judgeConsensus` runs an LLM-judge fallback; `tallyBFT` provides Byzantine-fault-tolerant tallying
with a fault tolerance `f`. Pure tally functions (no I/O).

## Public exports
- `ConsensusStrategySchema` (`majority | unanimous | weighted | llm-judge`), type `ConsensusStrategy`.
- `interface Vote`, `interface ConsensusResult`.
- `function tallyConsensus(votes: Vote[], strategy: ConsensusStrategy): ConsensusResult` — pure.
- `type JudgeFn`, `async function judgeConsensus(votes, judge): Promise<ConsensusResult>`.
- `interface BftOptions`, `function tallyBFT(votes, opts?): ConsensusResult` — pure.

## Env vars
None directly.

## Test file
- `server/tests/agent-consensus.test.ts` (tally majority/unanimous/weighted, BFT fault tolerance).
