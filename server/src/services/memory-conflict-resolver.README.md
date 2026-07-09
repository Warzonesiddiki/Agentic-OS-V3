# memory-conflict-resolver

## Purpose
Detects and resolves conflicting memories using pluggable strategies (newest_wins, highest_importance,
llm_merge, prompt_user). Produces a resolution proposal and applies it.

## Public exports
- `type ConflictStrategy` — union of strategies.
- `interface MemoryLite` / `interface ConflictResolutionProposal` / `interface ResolveResult`.
- `function selectWinner(strategy, a, b): string` — pure winner selection.
- `async function proposeResolution(...)`, `resolveConflict(...)`.

## Env vars
None directly.

## Test file
No dedicated unit test. Exercised via the `routes/memory-conflict-resolver.ts` route handler.
