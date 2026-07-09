# memory-export-v3

## Purpose
Version-3 brain export format. Defines the `BrainV3` schema, a content hash, an async `exportBrainV3`
serialiser, and an `isV3` guard for format detection.

## Public exports
- `const EXPORT_SCHEMA_VERSION = 3`.
- `interface BrainV3` — the v3 export shape.
- `function contentHash(payload): string` — pure hash.
- `async function exportBrainV3(...): Promise<BrainV3>`.
- `function isV3(brain): boolean` — pure schema-version guard.

## Env vars
None directly.

## Test file
No dedicated unit test. Exercised via the `routes/memory-export-v3.ts` route handler.
