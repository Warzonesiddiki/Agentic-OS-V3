# memory-consolidation

## Purpose
Memory consolidation job: merges related/redundant memories, updates importance, and records a run report.
Driven by `consolidation.ts` + `consolidation-budget.ts` (Lethe area).

## Public exports
- `interface ConsolidationRun` / `interface ConsolidationOptions`.
- `async function consolidate(options): Promise<ConsolidationRun>`.

## Env vars
None directly.

## Test file
No dedicated unit test. Exercised via the `routes/memory-consolidation.ts` route handler.
