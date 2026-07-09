# memory-privacy-zones

## Purpose
Privacy zones for memories (`public | shared | private | pii`). Implements a clearance lattice (read access
rules), zone application, and scoped read helpers that filter by clearance.

## Public exports
- `type PrivacyZone` — `'public' | 'shared' | 'private' | 'pii'`.
- `function canRead(targetZone: PrivacyZone, clearance: PrivacyZone): boolean` — pure lattice check.
- `function applyZone(memory, clearance): memory | null` — pure projection.
- `async function setZone(memoryId, zone): Promise<void>`.
- `async function readScoped(agentId, clearance): Promise<...>`.
- `async function idsInZones(zones: PrivacyZone[]): Promise<string[]>`.

## Env vars
None directly.

## Test file
- `server/tests/memory-perfection.test.ts` (`canRead`/`applyZone` describe block).
