# memory-rehearsal

## Purpose
Spaced-repetition ("rehearsal") for memories. Pure helpers compute the next interval (expanding 1/3/7/30
days) and an importance boost; async jobs rehearse due memories and individual memories.

## Public exports
- `const REHEARSAL_INTERVALS_DAYS = [1, 3, 7, 30]`.
- `function nextRehearsalInterval(rehearsalCount: number): number` — pure.
- `function boostForRehearsal(rehearsalCount: number): number` — pure.
- `interface MemoryRehearsalResult`.
- `async function rehearseDueMemories(options?): Promise<MemoryRehearsalResult>`.
- `async function rehearseMemory(id, now?): Promise<boolean>`.

## Env vars
None directly.

## Test file
- `server/tests/memory-rehearsal.test.ts` (`nextRehearsalInterval` / `boostForRehearsal`).
