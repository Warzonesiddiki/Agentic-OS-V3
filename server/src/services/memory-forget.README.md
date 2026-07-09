# memory-forget

## Purpose
Right-to-be-forgotten + purge. `forgetMe` anonymises/forgets memories tied to an identifier; `purgeForgottenMemories`
physically deletes already-forgotten rows after a grace window. (Lethe area.)

## Public exports
- `interface ForgetReport` / `interface PurgeReport`.
- `async function forgetMe(identifier: string): Promise<ForgetReport>`.
- `async function purgeForgottenMemories(opts?): Promise<PurgeReport>`.

## Env vars
None directly.

## Test file
No dedicated unit test. Exercised via the `routes/memory-forget.ts` route handler.
