# memory-provenance

## Purpose
Records and queries *influence* provenance for memories — how a memory influenced a later decision/recall
(priming, provenance, nl-query, recall). Supports batch recording.

## Public exports
- `type InfluenceReason` — `'priming' | 'provenance' | 'nl-query' | 'recall'`.
- `interface InfluenceInput` / `interface StoredInfluence extends InfluenceInput`.
- `async function recordMemoryInfluence(input): Promise<StoredInfluence>`.
- `async function recordMemoryInfluences(inputs): Promise<StoredInfluence[]>`.

## Env vars
None directly.

## Test file
No dedicated unit test. Exercised via the `routes/memory-provenance.ts` route handler.
