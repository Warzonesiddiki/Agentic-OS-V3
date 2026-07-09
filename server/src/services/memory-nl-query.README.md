# memory-nl-query

## Purpose
Natural-language query parsing and answering over the memory store. Parses a free-text query into a
structured `NLQueryParse` (filters, intents, time ranges) and answers it by delegating to the recall
pipeline, returning a summarised `NLQueryResult`.

## Public exports
- `interface NLQueryParse` — structured parse of a natural-language query.
- `interface RecallSummary` — aggregated recall stats for an answer.
- `interface NLQueryResult` — `{ parse, summary, items, answer }`.
- `function parseNaturalLanguageQuery(input: string): NLQueryParse` — pure parser.
- `async function answerNaturalLanguageQuery(...): Promise<NLQueryResult>` — recall-backed answer.

## Env vars
None directly.

## Test file
No dedicated unit test. Exercised via the `routes/memory-nl-query.ts` route handler.
