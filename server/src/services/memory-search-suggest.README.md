# memory-search-suggest

## Purpose
Provides query auto-completion and search-suggestion helpers for the memory recall UI. Builds
prefix-based autocomplete candidates and ranks historically successful past queries for a project.

## Public exports
- `interface Suggestion` — `{ text: string; score: number }` suggestion shape.
- `function autocomplete(prefix: string, corpus: string[], limit?): Suggestion[]` — pure prefix matcher.
- `async function suggestQueries(projectId: string, limit = 8): Promise<Suggestion[]>` — ranks past queries from recall feedback.
- `class MemorySuggester` — stateful suggester (used by the dashboard route `routes/memory-search-suggest.ts`).

## Env vars
None directly. Reads recall feedback via `federated-recall` (`recall.ts`) which honours
`NEXUS_RRF_K`, `NEXUS_RECALL_WEIGHT_*`.

## Test file
- `server/tests/memory-templates.test.ts` (imports `MemorySuggester` from `routes/memory-search-suggest.js`).
- Indirect coverage via `server/tests/memory-query.test.ts`.
