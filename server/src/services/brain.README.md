# brain

## Purpose
Brain export/import/compress. Defines the v3 brain schema (`BrainExportV3` with `MemoryV3`/`SkillV3`),
`exportBrain`/`importBrain` (legacy) plus `exportBrainV3`/`importBrainV3`, a `compressBrain` prune pass, and
a `migrateBrainV2ToV3` upgrader. (Cerebrum area.)

## Public exports (selected)
- `const BRAIN_SCHEMA_VERSION = 3`.
- `type MemoryV3`, `type SkillV3`, `type BrainExportV3`, `type BrainImportV3Report`.
- `async function exportBrain(): Promise<unknown>`.
- `async function importBrain(raw, actor): Promise<unknown>`.
- `async function compressBrain(actor): Promise<{ pruned; kept }>`.
- `function migrateBrainV2ToV3(old): BrainExportV3`.
- `async function exportBrainV3(): Promise<BrainExportV3>`.
- `async function importBrainV3(raw, actor): Promise<BrainImportV3Report>`.

## Env vars
None directly.

## Test file
- `server/tests/brain.test.ts` (export/import round-trip, migration, compress).
