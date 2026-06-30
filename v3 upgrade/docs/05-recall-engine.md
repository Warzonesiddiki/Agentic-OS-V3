# 05 — Recall Engine (RRF) + Embeddings Pipeline
## NEXUS V3 — Reciprocal Rank Fusion

> **This file contains complete code for:**
> - `server/src/services/recall.ts` — RRF recall (BM25 + pgvector)
> - `server/src/services/embeddings.ts` — Batch embedding generation + query embedding
> - `server/src/lib/tokens.ts` — BM25, token estimation, budget packing

---

## lib/tokens.ts — BM25 + Token Estimation

```typescript
// server/src/lib/tokens.ts
// Pure functions — no I/O, fully unit-testable

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const t = text.trim();
  if (!t) return 0;
  return Math.max(1, Math.ceil(t.length / 4));
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "to", "of", "in", "on", "for",
  "with", "as", "by", "at", "it", "this", "that", "be", "from", "i", "you", "we", "they",
]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 1 && !STOP.has(t));
}

export interface Scored { id: string; score: number; }

/** BM25 lexical scoring. Returns sorted array of {id, score}. */
export function bm25(docs: { id: string; text: string }[], query: string, k1 = 1.5, b = 0.75): Scored[] {
  const qTerms = tokenize(query);
  if (!qTerms.length || !docs.length) return [];
  const N = docs.length;
  const df = new Map<string, number>();
  const prepared = docs.map((d) => {
    const tf = new Map<string, number>();
    let len = 0;
    for (const t of tokenize(d.text)) { tf.set(t, (tf.get(t) ?? 0) + 1); len++; }
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return { id: d.id, tf, len };
  });
  const avgLen = prepared.reduce((s, x) => s + x.len, 0) / N || 1;

  const out: Scored[] = [];
  for (const p of prepared) {
    let score = 0;
    for (const qt of qTerms) {
      const f = p.tf.get(qt) ?? 0;
      if (!f) continue;
      const d = df.get(qt) ?? 0;
      const idf = Math.log(1 + (N - d + 0.5) / (d + 0.5));
      const denom = f + k1 * (1 - b + b * (p.len / avgLen));
      score += (idf * (f * (k1 + 1))) / denom;
    }
    if (score > 0) out.push({ id: p.id, score });
  }
  return out.sort((x, y) => y.score - x.score);
}

export interface PackResult<T> { packed: T[]; tokensUsed: number; truncated: number; }

/** Greedily pack items under a token budget. Never exceeds budget. */
export function packByBudget<T extends { tokenCost: number }>(items: T[], budget: number): PackResult<T> {
  let tokensUsed = 0;
  const packed: T[] = [];
  let truncated = 0;
  for (const item of items) {
    if (tokensUsed + item.tokenCost <= budget) { packed.push(item); tokensUsed += item.tokenCost; }
    else truncated++;
  }
  return { packed, tokensUsed, truncated };
}
```

---

## services/embeddings.ts — Batch embedding pipeline

```typescript
// server/src/services/embeddings.ts
import { getEnv, llmConfigured } from "../lib/env.js";
import { safeFetch } from "../lib/http.js";
import { db } from "../db/client.js";
import { memories, skills, notes } from "../db/schema.js";
import { sql, isNull } from "drizzle-orm";
import { log } from "../lib/logging.js";

const EMBEDDING_DIM = getEnv().NEXUS_EMBEDDING_DIM;
const BATCH_SIZE = 64;

export interface EmbeddingsReport {
  mode: "semantic" | "lexical";
  reason: string;
  documents: number;
  embedded: number;
  skipped: number;
  error?: string;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const e = getEnv();
  const result = await safeFetch(`${e.NEXUS_LLM_BASE_URL}/embeddings`, {
    method: "POST",
    timeoutMs: 30_000,
    headers: { "content-type": "application/json", authorization: `Bearer ${e.NEXUS_LLM_API_KEY}` },
    body: JSON.stringify({ model: e.NEXUS_EMBEDDING_MODEL, input: texts }),
  });
  if (!result.ok) {
    const errBody = result.body as { error?: { message?: string } } | null;
    throw new Error(`Embedding API error: ${errBody?.error?.message || `HTTP ${result.status}`}`);
  }
  const body = result.body as { data?: Array<{ embedding?: number[] }> };
  if (!body.data) throw new Error("Embedding API returned no data array");
  return body.data.map((d) => {
    const emb = d.embedding ?? [];
    if (emb.length !== EMBEDDING_DIM) throw new Error(`Dimension mismatch: expected ${EMBEDDING_DIM}, got ${emb.length}`);
    return emb;
  });
}

/** Rebuild embeddings for all documents lacking them. */
export async function rebuildEmbeddings(): Promise<EmbeddingsReport> {
  const c = sql<number>`count(*)::int`;
  const [mem, skl, nts] = await Promise.all([
    db.select({ n: c }).from(memories),
    db.select({ n: c }).from(skills),
    db.select({ n: c }).from(notes),
  ]);
  const totalDocs = (mem[0]?.n ?? 0) + (skl[0]?.n ?? 0) + (nts[0]?.n ?? 0);

  if (!llmConfigured() || !getEnv().NEXUS_EMBEDDING_MODEL) {
    return { mode: "lexical", reason: "No embedding provider configured.", documents: totalDocs, embedded: 0, skipped: 0 };
  }

  let embedded = 0;
  try {
    // Embed memories
    const mems = await db.select({ id: memories.id, text: sql<string>`${memories.title} || ' ' || ${memories.content}` })
      .from(memories).where(isNull(memories.embedding));
    for (let i = 0; i < mems.length; i += BATCH_SIZE) {
      const batch = mems.slice(i, i + BATCH_SIZE);
      const texts = batch.map((m) => m.text.slice(0, 8000));
      const embeddings = await embedBatch(texts);
      for (let j = 0; j < batch.length; j++) {
        await db.update(memories).set({ embedding: embeddings[j] }).where(sql`${memories.id} = ${batch[j]!.id}`);
        embedded++;
      }
    }
    // Embed skills
    const skls = await db.select({ id: skills.id, text: sql<string>`${skills.title} || ' ' || ${skills.description} || ' ' || ${skills.content}` })
      .from(skills).where(isNull(skills.embedding));
    for (let i = 0; i < skls.length; i += BATCH_SIZE) {
      const batch = skls.slice(i, i + BATCH_SIZE);
      const texts = batch.map((s) => s.text.slice(0, 8000));
      const embeddings = await embedBatch(texts);
      for (let j = 0; j < batch.length; j++) {
        await db.update(skills).set({ embedding: embeddings[j] }).where(sql`${skills.id} = ${batch[j]!.id}`);
        embedded++;
      }
    }
    // Embed notes (V3: notes now have embedding column)
    const nts2 = await db.select({ id: notes.id, text: sql<string>`${notes.title} || ' ' || ${notes.content}` })
      .from(notes).where(isNull(notes.embedding));
    for (let i = 0; i < nts2.length; i += BATCH_SIZE) {
      const batch = nts2.slice(i, i + BATCH_SIZE);
      const texts = batch.map((n) => n.text.slice(0, 8000));
      const embeddings = await embedBatch(texts);
      for (let j = 0; j < batch.length; j++) {
        await db.update(notes).set({ embedding: embeddings[j] }).where(sql`${notes.id} = ${batch[j]!.id}`);
        embedded++;
      }
    }
    return { mode: "semantic", reason: `Embedded ${embedded} docs.`, documents: totalDocs, embedded, skipped: totalDocs - embedded };
  } catch (err) {
    log.warn("embed_rebuild_failed", { error: err instanceof Error ? err.message : String(err) });
    return { mode: "lexical", reason: `Failed: ${err instanceof Error ? err.message : String(err)}`, documents: totalDocs, embedded, skipped: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Generate embedding for a single query string. */
export async function embedQuery(query: string): Promise<number[] | null> {
  if (!llmConfigured() || !getEnv().NEXUS_EMBEDDING_MODEL) return null;
  try {
    const embeddings = await embedBatch([query.slice(0, 8000)]);
    return embeddings[0] ?? null;
  } catch (e) {
    log.warn("embed_query_failed", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export function embeddingsAvailable(): boolean {
  return llmConfigured() && Boolean(getEnv().NEXUS_EMBEDDING_MODEL);
}
```

---

## services/recall.ts — RRF Recall Engine

```typescript
// server/src/services/recall.ts
// Reciprocal Rank Fusion: BM25 + pgvector cosine similarity

import { inArray, sql, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { memories, skills, tokenLedger, feedback, notes } from "../db/schema.js";
import { bm25, estimateTokens, packByBudget } from "../lib/tokens.js";
import { appendAudit } from "../lib/audit.js";
import { embedQuery, embeddingsAvailable } from "./embeddings.js";
import { getEnv } from "../lib/env.js";
import { randomUUID } from "node:crypto";
import { truncate } from "../lib/strings.js";

const DAY = 86_400_000;

export interface RecallItem {
  id: string;
  type: "memory" | "skill" | "note";
  title: string;
  content: string;
  score: number;
  tokenCost: number;
  source: string;
  matchedBy: ("bm25" | "semantic")[];
}

export interface RecallResult {
  query: string;
  returned: RecallItem[];
  tokensUsed: number;
  tokenBudget: number;
  truncated: number;
  mode: "lexical" | "semantic";
}

export async function recall(query: string, budget: number, actor: string): Promise<RecallResult> {
  const e = getEnv();
  const useSemantic = embeddingsAvailable();
  const RRF_K = e.NEXUS_RRF_K;
  const threshold = e.NEXUS_SEMANTIC_THRESHOLD;
  const halfLifeDays = e.NEXUS_RECENCY_HALFLIFE_DAYS;

  // Load corpus
  const [allMemories, allSkills, allNotes] = await Promise.all([
    db.query.memories.findMany(),
    db.query.skills.findMany(),
    db.query.notes.findMany(),
  ]);

  // BM25 ranking
  const memDocs = allMemories.map((m) => ({ id: m.id, text: `${m.title} ${m.content} ${m.tags.join(" ")}` }));
  const skillDocs = allSkills.map((s) => ({ id: s.id, text: `${s.title} ${s.description} ${s.content}` }));
  const noteDocs = allNotes.map((n) => ({ id: n.id, text: `${n.title} ${n.content} ${n.tags.join(" ")} ${n.wikilinks.join(" ")}` }));

  const bm25Mem = bm25(memDocs, query);
  const bm25Skill = bm25(skillDocs, query);
  const bm25Note = bm25(noteDocs, query);

  const bm25MemRank = new Map(bm25Mem.map((s, i) => [s.id, i]));
  const bm25SkillRank = new Map(bm25Skill.map((s, i) => [s.id, i]));
  const bm25NoteRank = new Map(bm25Note.map((s, i) => [s.id, i]));

  const bm25Candidates = new Set<string>([...bm25Mem.map((s) => s.id), ...bm25Skill.map((s) => s.id), ...bm25Note.map((s) => s.id)]);

  // Semantic ranking (pgvector)
  const semanticRanks = new Map<string, number>();
  let semanticCandidates = new Set<string>();

  if (useSemantic) {
    const queryEmbedding = await embedQuery(query);
    if (queryEmbedding) {
      const vecStr = JSON.stringify(queryEmbedding);
      const [semMem, semSkill, semNote] = await Promise.all([
        db.select({ id: memories.id, distance: sql<number>`${memories.embedding} <=> ${vecStr}::vector` })
          .from(memories).where(isNotNull(memories.embedding))
          .orderBy(sql`${memories.embedding} <=> ${vecStr}::vector`).limit(100),
        db.select({ id: skills.id, distance: sql<number>`${skills.embedding} <=> ${vecStr}::vector` })
          .from(skills).where(isNotNull(skills.embedding))
          .orderBy(sql`${skills.embedding} <=> ${vecStr}::vector`).limit(100),
        db.select({ id: notes.id, distance: sql<number>`${notes.embedding} <=> ${vecStr}::vector` })
          .from(notes).where(isNotNull(notes.embedding))
          .orderBy(sql`${notes.embedding} <=> ${vecStr}::vector`).limit(100),
      ]);

      const allSem = [...semMem, ...semSkill, ...semNote].sort((a, b) => a.distance - b.distance);
      allSem.forEach((r, i) => {
        if (r.distance <= threshold) { semanticRanks.set(r.id, i); semanticCandidates.add(r.id); }
      });
    }
  }

  // RRF Fusion
  const allCandidates = new Set([...bm25Candidates, ...semanticCandidates]);
  const rrfScores = new Map<string, { score: number; matchedBy: ("bm25" | "semantic")[] }>();

  for (const id of allCandidates) {
    let rrf = 0;
    const matchedBy: ("bm25" | "semantic")[] = [];

    const bm25Rank = bm25MemRank.get(id) ?? bm25SkillRank.get(id) ?? bm25NoteRank.get(id);
    if (bm25Rank !== undefined) { rrf += 1 / (RRF_K + bm25Rank + 1); matchedBy.push("bm25"); }

    const semRank = semanticRanks.get(id);
    if (semRank !== undefined) { rrf += 1 / (RRF_K + semRank + 1); matchedBy.push("semantic"); }

    const maxRrf = 2 / (RRF_K + 1);
    const normalizedRrf = rrf / maxRrf;
    rrfScores.set(id, { score: normalizedRrf, matchedBy });
  }

  // Feedback bonus
  const fbRows = await db.query.feedback.findMany();
  const helpful = new Map<string, number>();
  const total = new Map<string, number>();
  for (const f of fbRows) {
    total.set(f.itemId, (total.get(f.itemId) ?? 0) + 1);
    if (f.helpful) helpful.set(f.itemId, (helpful.get(f.itemId) ?? 0) + 1);
  }
  const fbBonus = (id: string) => {
    const t = total.get(id) ?? 0;
    return t ? ((helpful.get(id) ?? 0) / t) * 0.15 : 0;
  };

  // Build lookup maps
  const memMap = new Map(allMemories.map((m) => [m.id, m]));
  const skillMap = new Map(allSkills.map((s) => [s.id, s]));
  const noteMap = new Map(allNotes.map((n) => [n.id, n]));
  const now = Date.now();

  function getMeta(id: string) {
    const m = memMap.get(id);
    if (m) return { id: m.id, type: "memory" as const, title: m.title, content: m.content, importance: m.importance, updatedAt: m.updatedAt, source: m.source };
    const s = skillMap.get(id);
    if (s) return { id: s.id, type: "skill" as const, title: s.title, content: `# ${s.title}\n${s.description}\n\n${s.content}`, importance: Math.max(0.2, Math.min(1, s.rating)), updatedAt: s.updatedAt, source: "skill" };
    const n = noteMap.get(id);
    if (n) return { id: n.id, type: "note" as const, title: n.title || n.path, content: n.content, importance: 0.45, updatedAt: n.indexedAt, source: "vault" };
    return null;
  }

  // Final blend: RRF (0.5) + importance (0.3) + recency (0.1) + feedback (0.1)
  const items: RecallItem[] = [];
  for (const [id, { score: rrf, matchedBy }] of rrfScores) {
    const meta = getMeta(id);
    if (!meta) continue;
    const recency = Math.exp(-((now - meta.updatedAt.getTime()) / (halfLifeDays * DAY)));
    const blended = rrf * 0.5 + meta.importance * 0.3 + recency * 0.1 + fbBonus(id);
    items.push({
      id: meta.id, type: meta.type, title: meta.title, content: meta.content,
      score: Math.round(blended * 1000) / 1000,
      tokenCost: estimateTokens(meta.content), source: meta.source, matchedBy,
    });
  }

  items.sort((a, b) => b.score - a.score);
  const { packed, tokensUsed, truncated } = packByBudget(items, budget);

  // Side effects: bump recallCount + ledger
  const memIds = packed.filter((p) => p.type === "memory").map((p) => p.id);
  await db.transaction(async (tx) => {
    if (memIds.length) {
      await tx.update(memories).set({ recallCount: sql`${memories.recallCount} + 1`, lastRecalledAt: new Date() }).where(inArray(memories.id, memIds));
    }
    await tx.insert(tokenLedger).values({
      id: `ldg_${randomUUID()}`, eventType: "recall", query: truncate(query, 120),
      tokensInjected: tokensUsed, tokensReused: tokensUsed, tokensSaved: tokensUsed, itemsReturned: packed.length, real: true,
    });
  });
  await appendAudit("recall.performed", { query: truncate(query, 80), items: packed.length, tokensUsed, mode: useSemantic ? "semantic" : "lexical" }, actor);

  return { query, returned: packed, tokensUsed, tokenBudget: budget, truncated, mode: useSemantic ? "semantic" : "lexical" };
}
```

---

## Success Checklist

```
[ ] estimateTokens returns ~len/4
[ ] bm25 ranks relevant docs higher than irrelevant
[ ] packByBudget never exceeds budget
[ ] embedBatch validates dimensions
[ ] rebuildEmbeddings processes memories, skills, AND notes
[ ] recall() fuses BM25 + semantic via RRF
[ ] recall() degrades to lexical when embeddings unavailable
[ ] recall() returns matchedBy field showing which ranker matched
[ ] All RRF constants are configurable via env
```
