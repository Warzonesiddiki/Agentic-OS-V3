# memory-priming

## Purpose
Builds session "priming" context — a small, budget-bounded set of recall items injected before an agent
runs, to ground it. Constants cap token/top-k/budget; `buildSessionPriming` returns the priming set.

## Public exports
- `const PRIMING_BUDGET_TOKENS = 500`.
- `const PRIMING_TOP_K = 5`.
- `const PRIMING_RECALL_BUDGET = 4000`.
- `interface PrimingItem`.
- `interface PrimingResult`.
- `async function buildSessionPriming(...): Promise<PrimingResult>`.

## Env vars
None directly (uses `recall` + `NEXUS_RECALL_BUDGET`).

## Test file
No dedicated unit test. Exercised via the `routes/memory-priming.ts` route handler.
