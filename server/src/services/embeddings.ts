/**
 * embeddings.ts — pgvector embedding pipeline.
 *
 * Generates embeddings via the configured OpenAI-compatible provider, stores
 * them in the pgvector `embedding` column, and reports coverage. When no
 * provider is configured, reports an honest lexical fallback.
 *
 * All provider calls go through safeFetch (SSRF + timeout guarded).
 * Batched to respect API rate limits (batches of 64).
 */
import { getEnv, env, llmConfigured } from "../lib/env.js";
import { safeFetch } from "../lib/http.js";
import { db } from "../db/client";
import { memories, skills, notes } from "../db/client.js";
import { sql, isNull } from "drizzle-orm";

const BATCH_SIZE = env.NEXUS_EMBEDDING_BATCH_SIZE;

export interface EmbeddingsReport {
  mode: "semantic" | "lexical";
  reason: string;
  documents: number;
  embedded: number;
  skipped: number;
  error?: string;
}

interface EmbedResponse {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
}

/**
 * Call the configured embedding provider for a batch of texts.
 * Returns an array of embedding vectors (number[]).
 */
async function embedBatch(texts: string[]): Promise<number[][]> {
  const e = getEnv();
  const result = await safeFetch(`${e.NEXUS_LLM_BASE_URL}/embeddings`, {
    method: "POST",
    timeoutMs: 30_000,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${e.NEXUS_LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: e.NEXUS_EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!result.ok) {
    const errBody = result.body as EmbedResponse | string | null;
    const msg =
      (typeof errBody === "object" && errBody?.error?.message) ||
      `HTTP ${result.status}`;
    throw new Error(`Embedding API error: ${msg}`);
  }

  const body = result.body as EmbedResponse;
  if (!body.data || !Array.isArray(body.data)) {
    throw new Error("Embedding API returned no data array");
  }

  return body.data.map((d) => {
    const emb = d.embedding ?? [];
      const dim = env.NEXUS_EMBEDDING_DIM;
      if (emb.length !== dim) {
        throw new Error(`Embedding dimension mismatch: expected ${dim}, got ${emb.length}`);
    }
    return emb;
  });
}

/** Update a single memory's embedding. */
async function updateMemoryEmbedding(id: string, embedding: number[]): Promise<void> {
  await db
    .update(memories)
    .set({ embedding })
    .where(sql`${memories.id} = ${id}`);
}

/** Update a single skill's embedding. */
async function updateSkillEmbedding(id: string, embedding: number[]): Promise<void> {
  await db
    .update(skills)
    .set({ embedding })
    .where(sql`${skills.id} = ${id}`);
}

/** Update a single note's embedding. */
async function updateNoteEmbedding(id: string, embedding: number[]): Promise<void> {
  await db
    .update(notes)
    .set({ embedding })
    .where(sql`${notes.id} = ${id}`);
}

/**
 * Rebuild embeddings for all memories and skills that lack them.
 * Processes in batches of 64. Reports progress.
 */
export async function rebuildEmbeddings(): Promise<EmbeddingsReport> {
  const count = sql<number>`count(*)::int`;

  // Count total documents
  const [memTotal, sklTotal, noteTotal] = await Promise.all([
    db.select({ n: count }).from(memories),
    db.select({ n: count }).from(skills),
    db.select({ n: count }).from(notes),
  ]);
  const totalDocs = (memTotal[0]?.n ?? 0) + (sklTotal[0]?.n ?? 0) + (noteTotal[0]?.n ?? 0);

  const e = getEnv();
  if (!llmConfigured() || !e.NEXUS_EMBEDDING_MODEL) {
    return {
      mode: "lexical",
      reason: "No embedding provider configured (NEXUS_LLM_BASE_URL + API_KEY + EMBEDDING_MODEL). Recall uses BM25 lexical ranking.",
      documents: totalDocs,
      embedded: 0,
      skipped: 0,
    };
  }

  let embedded = 0;
  let skipped = 0;

  try {
    // Process memories missing embeddings
    const memsToEmbed = await db
      .select({ id: memories.id, text: sql<string>`${memories.title} || ' ' || ${memories.content}`.as("text") })
      .from(memories)
      .where(isNull(memories.embedding));

    for (let i = 0; i < memsToEmbed.length; i += BATCH_SIZE) {
      const batch = memsToEmbed.slice(i, i + BATCH_SIZE);
      const texts = batch.map((m) => m.text.slice(0, 8000)); // cap input length
      const embeddings = await embedBatch(texts);
      for (let j = 0; j < batch.length; j++) {
        await updateMemoryEmbedding(batch[j]!.id, embeddings[j]!);
        embedded++;
      }
    }

    // Process skills missing embeddings
    const skillsToEmbed = await db
      .select({ id: skills.id, text: sql<string>`${skills.title} || ' ' || ${skills.description} || ' ' || ${skills.content}`.as("text") })
      .from(skills)
      .where(isNull(skills.embedding));

    for (let i = 0; i < skillsToEmbed.length; i += BATCH_SIZE) {
      const batch = skillsToEmbed.slice(i, i + BATCH_SIZE);
      const texts = batch.map((s) => s.text.slice(0, 8000));
      const embeddings = await embedBatch(texts);
      for (let j = 0; j < batch.length; j++) {
        await updateSkillEmbedding(batch[j]!.id, embeddings[j]!);
        embedded++;
      }
    }

    // Process notes missing embeddings
    const notesToEmbed = await db
      .select({ id: notes.id, text: sql<string>`${notes.title} || ' ' || ${notes.content} || ' ' || COALESCE(array_to_string(${notes.tags}, ' '), '')`.as("text") })
      .from(notes)
      .where(isNull(notes.embedding));

    for (let i = 0; i < notesToEmbed.length; i += BATCH_SIZE) {
      const batch = notesToEmbed.slice(i, i + BATCH_SIZE);
      const texts = batch.map((n) => n.text.slice(0, 8000));
      const embeddings = await embedBatch(texts);
      for (let j = 0; j < batch.length; j++) {
        await updateNoteEmbedding(batch[j]!.id, embeddings[j]!);
        embedded++;
      }
    }

    skipped = totalDocs - embedded;

    return {
      mode: "semantic",
      reason: `Embeddings generated for ${embedded} documents via ${e.NEXUS_EMBEDDING_MODEL}. Recall now uses RRF (Reciprocal Rank Fusion) blending BM25 + cosine similarity.`,
      documents: totalDocs,
      embedded,
      skipped,
    };
  } catch (err) {
    return {
      mode: "lexical",
      reason: `Embedding rebuild failed — falling back to BM25 lexical only. Error: ${err instanceof Error ? err.message : String(err)}`,
      documents: totalDocs,
      embedded,
      skipped,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Generate an embedding for a single query string (used by semantic recall).
 * Returns null if the provider is not configured or the call fails.
 */
export async function embedQuery(query: string): Promise<number[] | null> {
  const e = getEnv();
  if (!llmConfigured() || !e.NEXUS_EMBEDDING_MODEL) return null;

  try {
    const embeddings = await embedBatch([query.slice(0, 8000)]);
    return embeddings[0] ?? null;
  } catch (e) {
    // Log the failure so it's visible — embedding provider issues shouldn't be silent.
    const { log } = await import("../lib/logging.js");
    log.warn("embed_query_failed", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** Returns whether embeddings are available (provider configured). */
export function embeddingsAvailable(): boolean {
  return llmConfigured() && Boolean(getEnv().NEXUS_EMBEDDING_MODEL);
}
