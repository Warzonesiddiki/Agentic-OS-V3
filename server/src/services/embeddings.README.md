# embeddings

## Purpose
Embedding generation and management. Wraps the configured embedding provider, maintains an in-process
cache, and provides `rebuildEmbeddings()` to (re)vectorise memories/skills/notes against pgvector
(or the SQLite vector path). Pure in-memory fallbacks are used when no provider is configured.

## Public exports
- `function embeddingCacheSize(): number` — current cache entry count.
- `interface EmbeddingsReport` — `{ embedded, skipped, errors, durationMs }`.
- `async function rebuildEmbeddings(): Promise<EmbeddingsReport>` — bulk (re)embedding job.
- `async function embedQuery(query: string): Promise<number[] | null>` — single query vector.
- `async function batchEmbedTexts(texts: string[]): Promise<(number[] | null)[]>` — batched vectors.
- `function embeddingsAvailable(): boolean` — whether a provider is configured.

## Env vars
- `NEXUS_EMBEDDING_MODEL` — model name.
- `NEXUS_EMBEDDING_DIM` — vector dimension.
- `NEXUS_EMBEDDING_BATCH_SIZE` — batch size for `batchEmbedTexts` (default 16).

## Test file
- `server/tests/services/embeddings.test.ts` (extensive: availability, rebuild, batch).
