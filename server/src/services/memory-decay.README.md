# memory-decay

## Purpose
Time-based memory importance decay. Per-kind half-lives (constants) drive `computeDecayedImportance`, and
`decayImportance` applies decay across the store as a maintenance job.

## Public exports
- `const HALFLIFE_HOURS: Record<string, number>` — per-kind half-life map.
- `function halflifeForKind(kind: string): number` — pure lookup.
- `function computeDecayedImportance(base, kind, ageHours): number` — pure.
- `interface MemoryDecayResult`.
- `async function decayImportance(): Promise<MemoryDecayResult>`.

## Env vars
None directly (half-lives are constants; `NEXUS_RECENCY_HALFLIFE_DAYS` from `federated-recall` is related).

## Test file
- `server/tests/memory-perfection.test.ts` (`computeDecayedImportance` / `halflifeForKind` describe block).
