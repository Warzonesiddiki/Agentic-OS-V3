# memory-consolidation-budget

## Purpose
Budget controller for the consolidation maintenance job (Lethe area). Caps how much work a single
consolidation pass may do (token/time/count budget) so it stays bounded.

## Public exports
- `interface ConsolidationBudget` — `{ maxPairs, maxTokens, maxMs }`.
- `function getConsolidationBudget(): ConsolidationBudget` — pure default budget.
- `function consumeBudget(budget, used): ConsolidationBudget` — pure decrement.
- `function budgetRemaining(budget): boolean` — pure guard.

## Env vars
None directly.

## Test file
No dedicated unit test. Referenced by `server/tests/memory-analysis.test.ts` (budget helper checks).
