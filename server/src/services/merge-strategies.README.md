# merge-strategies

## Purpose
Pure strategies for merging the outputs of multiple agents/branches in a DAG/pipeline. Zod `MergeStrategy`
enum (`concat | firstWins | majority | schemaUnion | llm`), pure functions for each, plus an async
`mergeWithLlm` and a `mergeBy` dispatcher.

## Public exports
- `MergeStrategySchema` / type `MergeStrategy`.
- `interface MergeInput`.
- `mergeConcat(items)`, `mergeFirstWins(items)`, `mergeMajority(items)`, `mergeSchemaUnion(items)` — pure.
- `type LlmMergeFn`, `mergeWithLlm(items, llm, instruction?)` — async.
- `mergeBy(strategy, items)` — dispatcher.

## Env vars
None directly.

## Test file
- `server/tests/merge-strategies.test.ts` (each strategy + mergeBy).
