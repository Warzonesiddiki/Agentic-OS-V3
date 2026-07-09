# memory-multilingual

## Purpose
Multilingual memory storage and language detection. Stores a memory together with its detected language and
translation metadata, and reports a language distribution across the store.

## Public exports
- `function detectLanguage(text: string): string` — pure ISO-code detector.
- `interface MultilingualMemoryInput` / `interface MultilingualMemoryResult`.
- `async function storeMultilingualMemory(input): Promise<MultilingualMemoryResult>`.
- `async function getLanguageDistribution(): Promise<Record<string, number>>`.

## Env vars
None directly (translation delegation via `memory-multimodal` when configured).

## Test file
No dedicated unit test. Referenced by `server/tests/memory-analysis.test.ts`.
