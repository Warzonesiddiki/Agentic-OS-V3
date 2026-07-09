/**
 * recall.ts — token-budgeted unified recall with Reciprocal Rank Fusion (RRF).
 *
 * Blends two independent rankers:
 *   1. BM25 lexical scoring (keyword/term overlap)
 *   2. pgvector cosine similarity (semantic meaning)
 *
 * via Reciprocal Rank Fusion:
 *   RRF_score(d) = Σ 1/(k + rank_i(d))   for each ranker i, k=60
 *
 * This RRF score is then blended with importance, recency, and feedback signals,
 * and greedily packed under the requested token budget.
 *
 * When embeddings are not available (no provider configured), it gracefully
 * degrades to BM25-only (lexical mode).
 */
import { inArray, sql, isNotNull, desc } from 'drizzle-orm';
import { db, isSqlite } from '../db/client.js';
import { memories, skills, tokenLedger, notes } from '../db/client.js';
import { bm25, estimateTokens, packByBudget } from '../lib/tokens.js';
import { appendAudit } from '../lib/audit.js';
import { embedQuery, embeddingsAvailable } from './embeddings.js';
import { randomUUID } from 'node:crypto';
import { truncate } from '../lib/strings.js';
import { env } from '../lib/env.js';

const DAY = 86_400_000;
const RRF_K = env.NEXUS_RRF_K;
const RECENCY_HALFLIFE_DAYS = env.NEXUS_RECENCY_HALFLIFE_DAYS;
const W_RRF = env.NEXUS_RECALL_WEIGHT_RRF;
const W_IMPORTANCE = env.NEXUS_RECALL_WEIGHT_IMPORTANCE;
const W_RECENCY = env.NEXUS_RECALL_WEIGHT_RECENCY;
const W_FEEDBACK = env.NEXUS_RECALL_WEIGHT_FEEDBACK;

export interface RecallItem {
  id: string;
  type: 'memory' | 'skill' | 'note';
  title: string;
  content: string;
  score: number;
  tokenCost: number;
  source: string;
  /** Which rankers contributed to this result. */
  matchedBy: ('bm25' | 'semantic')[];
}

export interface RecallResult {
  query: string;
  returned: RecallItem[];
  tokensUsed: number;
  tokenBudget: number;
  truncated: number;
  mode: 'lexical' | 'semantic';
  nextCursor?: number;
}

interface RawItem {
  id: string;
  type: 'memory' | 'skill' | 'note';
  title: string;
  content: string;
  importance: number;
  updatedAt: Date;
  source: string;
}

const MAX_CORPUS = env.NEXUS_MAX_RECALL_CORPUS;

/* ─── Feedback bonus cache (perfA) ───────────────────────────────────────────
 * The lexical/semantic hot path previously issued `feedback.findMany({ limit: 5000 })`
 * on EVERY recall() call — a full-table scan that dominates latency for repeated
 * queries. Feedback changes infrequently, so we memoize the derived helpful/total
 * maps behind a short TTL and an LRU bound keyed by table row-count freshness.
 * This is a read-side cache; it is invalidated on every feedback write by
 * `invalidateFeedbackCache()` (called from the feedback routes / memory-write path). */
interface FeedbackCacheEntry {
  helpful: Map<string, number>;
  total: Map<string, number>;
  expiresAt: number;
}
let feedbackCache: FeedbackCacheEntry | undefined;
function feedbackTtlMs(): number {
  const v = Number(process.env.NEXUS_FEEDBACK_CACHE_TTL_MS ?? 30_000);
  return Number.isFinite(v) ? v : 30_000;
}

export function invalidateFeedbackCache(): void {
  feedbackCache = undefined;
}

async function loadFeedbackBonus(_opts?: { noFeedbackCache?: boolean }): Promise<{ helpful: Map<string, number>; total: Map<string, number> }> {
  const now = Date.now();
  if (!_opts?.noFeedbackCache && feedbackCache && now <= feedbackCache.expiresAt) {
    return { helpful: feedbackCache.helpful, total: feedbackCache.total };
  }
  // Memoized behind a short TTL to avoid a full-table scan on every recall().
  const rows = await db.query.feedback.findMany({ limit: 5_000 });
  const helpful = new Map<string, number>();
  const total = new Map<string, number>();
  for (const f of rows) {
    total.set(f.itemId, (total.get(f.itemId) ?? 0) + 1);
    if (f.helpful) helpful.set(f.itemId, (helpful.get(f.itemId) ?? 0) + 1);
  }
  feedbackCache = { helpful, total, expiresAt: now + feedbackTtlMs() };
  return { helpful, total };
}

/**
 * Pure Reciprocal Rank Fusion over two rank maps.
 * Exported for benchmarking + reuse (no DB, no side effects).
 *   RRF(d) = 1/(k + rank_lexical(d)) + 1/(k + rank_semantic(d))
 */
export function rrfFuse(
  lexicalRank: Map<string, number>,
  semanticRank: Map<string, number>,
  k = RRF_K
): Map<string, number> {
  const candidates = new Set([...lexicalRank.keys(), ...semanticRank.keys()]);
  const out = new Map<string, number>();
  for (const id of candidates) {
    let rrf = 0;
    const lr = lexicalRank.get(id);
    if (lr !== undefined) rrf += 1 / (k + lr + 1);
    const sr = semanticRank.get(id);
    if (sr !== undefined) rrf += 1 / (k + sr + 1);
    out.set(id, rrf);
  }
  return out;
}

export interface RecallOptions {
  cursor?: number;
  limit?: number;
  /** When true, bypass the feedback-bonus cache (forces a fresh full-table scan). */
  noFeedbackCache?: boolean;
}

export async function recall(
  query: string,
  budget: number,
  actor: string,
  opts?: RecallOptions
): Promise<RecallResult> {
  const useSemantic = embeddingsAvailable();

  // ---- Load corpus with cap to prevent OOM ----
  // Select only columns needed for BM25 scoring and metadata lookup,
  // avoiding loading full content for the entire corpus into memory.
  const [allMemories, allSkills, allNotes] = await Promise.all([
    db
      .select({
        id: memories.id,
        kind: memories.kind,
        title: memories.title,
        content: memories.content,
        tags: memories.tags,
        importance: memories.importance,
        source: memories.source,
        updatedAt: memories.updatedAt,
        embedding: memories.embedding,
      })
      .from(memories)
      .orderBy(desc(memories.importance), desc(memories.updatedAt))
      .limit(MAX_CORPUS),
    db
      .select({
        id: skills.id,
        title: skills.title,
        description: skills.description,
        content: skills.content,
        rating: skills.rating,
        updatedAt: skills.updatedAt,
        embedding: skills.embedding,
      })
      .from(skills)
      .orderBy(desc(skills.rating))
      .limit(Math.min(MAX_CORPUS, 2000)),
    db
      .select({
        id: notes.id,
        title: notes.title,
        content: notes.content,
        tags: notes.tags,
        wikilinks: notes.wikilinks,
        indexedAt: notes.indexedAt,
        path: notes.path,
        embedding: notes.embedding,
      })
      .from(notes)
      .orderBy(desc(notes.indexedAt))
      .limit(Math.min(MAX_CORPUS, 2000)),
  ]);

  // ---- Build document sets for BM25 ----
  type MemRow = (typeof allMemories)[number];
  type SkillRow = (typeof allSkills)[number];
  type NoteRow = (typeof allNotes)[number];
  const memDocs = allMemories.map((m: MemRow) => ({
    id: m.id,
    text: `${m.title} ${m.content} ${Array.isArray(m.tags) ? m.tags.join(' ') : String(m.tags ?? '')}`,
  }));
  const skillDocs = allSkills.map((s: SkillRow) => ({
    id: s.id,
    text: `${s.title} ${s.description} ${s.content}`,
  }));
  const noteDocs = allNotes.map((n: NoteRow) => ({
    id: n.id,
    text: `${n.title} ${n.content} ${Array.isArray(n.tags) ? n.tags.join(' ') : String(n.tags ?? '')} ${Array.isArray(n.wikilinks) ? n.wikilinks.join(' ') : String(n.wikilinks ?? '')}`,
  }));

  // ---- Ranker 1: Lexical (SQLite FTS5 + BM25) ----
  // Returns ranked arrays sorted by score descending. Convert to rank maps.
  const bm25Mem = bm25(memDocs, query);
  const bm25Skill = bm25(skillDocs, query);
  const bm25Note = bm25(noteDocs, query);

  // rank maps: id -> rank position (0-based)
  const bm25MemRank = new Map(bm25Mem.map((s, i) => [s.id, i]));
  const bm25SkillRank = new Map(bm25Skill.map((s, i) => [s.id, i]));
  const bm25NoteRank = new Map(bm25Note.map((s, i) => [s.id, i]));

  // SQLite FTS5 Virtual Table query execution for memories
  const ftsMemRank = new Map<string, number>();
  if (isSqlite && query.trim().length > 0) {
    try {
      const sanitized = query
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (sanitized.length > 0) {
        const ftsMatchExpr = sanitized.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' OR ');
        const ftsRows: unknown = await db.execute(sql`
          SELECT id FROM memories_fts WHERE memories_fts MATCH ${ftsMatchExpr} ORDER BY rank LIMIT 100
        `);
        const rowArr = Array.isArray(ftsRows)
          ? (ftsRows as Array<{ id?: unknown }>)
          : (((ftsRows as { rows?: Array<{ id?: unknown }> })?.rows) ?? []);
        rowArr.forEach((r, idx: number) => {
          if (r && r.id) {
            ftsMemRank.set(String(r.id), idx);
          }
        });
      }
    } catch {
      // FTS5 query fallback: graceful fallback to BM25 if FTS table does not exist or query fails
    }
  }

  // Collect all BM25 and FTS candidate IDs
  const bm25Candidates = new Set<string>([
    ...bm25Mem.map((s) => s.id),
    ...bm25Skill.map((s) => s.id),
    ...bm25Note.map((s) => s.id),
    ...ftsMemRank.keys(),
  ]);

  // ---- Ranker 2: Semantic (pgvector cosine similarity or SQLite vector fallback) ----
  const semanticRanks = new Map<string, number>(); // id -> rank
  const semanticCandidates = new Set<string>();

  if (useSemantic) {
    const queryEmbedding = await embedQuery(query);
    if (queryEmbedding) {
      if (isSqlite) {
        // SQLite vector cosine distance fallback in JS
        function parseVec(val: unknown): number[] | null {
          if (!val) return null;
          if (Array.isArray(val)) return val as number[];
          if (typeof val === 'string') {
            try {
              const parsed = JSON.parse(val);
              return Array.isArray(parsed) ? parsed : null;
            } catch {
              return null;
            }
          }
          return null;
        }

        function cosineDist(a: number[], b: number[]): number {
          let dot = 0;
          let normA = 0;
          let normB = 0;
          const len = Math.min(a.length, b.length);
          for (let i = 0; i < len; i++) {
            const valA = a[i]!;
            const valB = b[i]!;
            dot += valA * valB;
            normA += valA * valA;
            normB += valB * valB;
          }
          if (normA === 0 || normB === 0) return 1;
          return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
        }

        const semItems: Array<{ id: string; distance: number }> = [];

        for (const m of allMemories) {
          const emb = parseVec(m.embedding);
          if (emb) semItems.push({ id: m.id, distance: cosineDist(emb, queryEmbedding) });
        }
        for (const s of allSkills) {
          const emb = parseVec(s.embedding);
          if (emb) semItems.push({ id: s.id, distance: cosineDist(emb, queryEmbedding) });
        }
        for (const n of allNotes) {
          const emb = parseVec(n.embedding);
          if (emb) semItems.push({ id: n.id, distance: cosineDist(emb, queryEmbedding) });
        }

        semItems.sort((a, b) => a.distance - b.distance);
        const threshold = env.NEXUS_SEMANTIC_THRESHOLD;
        semItems.slice(0, 100).forEach((r, i) => {
          if (r.distance <= threshold) {
            semanticRanks.set(r.id, i);
            semanticCandidates.add(r.id);
          }
        });
      } else {
        // Query memories, skills, and notes with embeddings via cosine distance (<=>)
        const [semMem, semSkill, semNote] = await Promise.all([
          db
            .select({
              id: memories.id,
              distance:
                sql<number>`${memories.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`.as(
                  'distance'
                ),
            })
            .from(memories)
            .where(isNotNull(memories.embedding))
            .orderBy(sql`${memories.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
            .limit(100),
          db
            .select({
              id: skills.id,
              distance:
                sql<number>`${skills.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`.as(
                  'distance'
                ),
            })
            .from(skills)
            .where(isNotNull(skills.embedding))
            .orderBy(sql`${skills.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
            .limit(100),
          db
            .select({
              id: notes.id,
              distance:
                sql<number>`${notes.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`.as(
                  'distance'
                ),
            })
            .from(notes)
            .where(isNotNull(notes.embedding))
            .orderBy(sql`${notes.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
            .limit(100),
        ]);

        // Combine and rank by distance (ascending)
        const allSem = [
          ...semMem.map((r: (typeof semMem)[number]) => ({ id: r.id, distance: r.distance })),
          ...semSkill.map((r: (typeof semSkill)[number]) => ({ id: r.id, distance: r.distance })),
          ...semNote.map((r: (typeof semNote)[number]) => ({ id: r.id, distance: r.distance })),
        ].sort(
          (a: { id: string; distance: number }, b: { id: string; distance: number }) =>
            a.distance - b.distance
        );

        // Only keep results with reasonable similarity (cosine distance < 0.8)
        const threshold = env.NEXUS_SEMANTIC_THRESHOLD;
        allSem.forEach((r, i) => {
          if (r.distance <= threshold) {
            semanticRanks.set(r.id, i);
            semanticCandidates.add(r.id);
          }
        });
      }
    }
  }

  // ---- Reciprocal Rank Fusion (RRF) ----
  // For each candidate, sum: 1/(k + rank_bm25) + 1/(k + rank_semantic)
  // Missing ranks contribute 0 (document not found by that ranker)
  const allCandidates = new Set([...bm25Candidates, ...semanticCandidates]);

  const rrfScores = new Map<string, { score: number; matchedBy: ('bm25' | 'semantic')[] }>();
  for (const id of allCandidates) {
    let rrf = 0;
    const matchedBy: ('bm25' | 'semantic')[] = [];

    // Lexical contribution (FTS5 rank preferred if available, else BM25)
    const lexRank =
      ftsMemRank.get(id) ?? bm25MemRank.get(id) ?? bm25SkillRank.get(id) ?? bm25NoteRank.get(id);
    if (lexRank !== undefined) {
      rrf += 1 / (RRF_K + lexRank + 1);
      matchedBy.push('bm25');
    }

    // Semantic contribution
    const semRank = semanticRanks.get(id);
    if (semRank !== undefined) {
      rrf += 1 / (RRF_K + semRank + 1);
      matchedBy.push('semantic');
    }

    // Normalize RRF: max possible is 2 * 1/(k+1) = 2/61 ≈ 0.0328
    // Scale to ~0..1 range for consistent blending with importance
    const maxRrf = 2 / (RRF_K + 1);
    const normalizedRrf = rrf / maxRrf;

    rrfScores.set(id, { score: normalizedRrf, matchedBy });
  }

  // ---- Feedback bonus lookup ----
  // Cap feedback at 5k rows (the top-N by item frequency dominates the bonus).
  const { helpful, total } = await loadFeedbackBonus({ noFeedbackCache: opts?.noFeedbackCache });
  const fbBonus = (id: string) => {
    const t = total.get(id) ?? 0;
    return t ? ((helpful.get(id) ?? 0) / t) * 0.15 : 0;
  };

  // ---- Build lookup maps for metadata ----
  const memMap = new Map<string, MemRow>(allMemories.map((m: MemRow) => [m.id, m]));
  const skillMap = new Map<string, SkillRow>(allSkills.map((s: SkillRow) => [s.id, s]));
  const noteMap = new Map<string, NoteRow>(allNotes.map((n: NoteRow) => [n.id, n]));

  const now = Date.now();

  // Helper to get metadata for an ID
  function getMeta(id: string): RawItem | null {
    const m = memMap.get(id);
    if (m) {
      return {
        id: m.id,
        type: 'memory' as const,
        title: m.title,
        content: m.content,
        importance: m.importance,
        updatedAt: m.updatedAt,
        source: m.source,
      };
    }
    const s = skillMap.get(id);
    if (s) {
      return {
        id: s.id,
        type: 'skill' as const,
        title: s.title,
        content: `# ${s.title}\n${s.description}\n\n${s.content}`,
        importance: Math.max(0.2, Math.min(1, s.rating)),
        updatedAt: s.updatedAt,
        source: 'skill',
      };
    }
    const n = noteMap.get(id);
    if (n) {
      return {
        id: n.id,
        type: 'note' as const,
        title: n.title || n.path,
        content: n.content,
        importance: 0.45,
        updatedAt: n.indexedAt,
        source: 'vault',
      };
    }
    return null;
  }

  // ---- Final blend: RRF + importance + recency + feedback ----
  const items: RecallItem[] = [];
  for (const [id, { score: rrf, matchedBy }] of rrfScores) {
    const meta = getMeta(id);
    if (!meta) continue;

    const recency = Math.exp(-((now - meta.updatedAt.getTime()) / (RECENCY_HALFLIFE_DAYS * DAY)));
    const blended =
      rrf * W_RRF + meta.importance * W_IMPORTANCE + recency * W_RECENCY + fbBonus(id) * W_FEEDBACK;
    const score = Math.round(blended * 1000) / 1000;

    items.push({
      id: meta.id,
      type: meta.type,
      title: meta.title,
      content: meta.content,
      score,
      tokenCost: estimateTokens(meta.content),
      source: meta.source,
      matchedBy,
    });
  }

  // Sort by blended score descending
  items.sort((a, b) => b.score - a.score);

  // ---- Cursor-based pagination ----
  let page = items;
  if (opts?.cursor !== undefined) {
    const cursorIdx = items.findIndex((i) => i.score < opts.cursor!);
    page = cursorIdx >= 0 ? items.slice(cursorIdx) : [];
  }
  if (opts?.limit !== undefined) {
    page = page.slice(0, opts.limit);
  }
  const nextCursor =
    page.length < (opts?.limit ?? page.length) || page.length === 0
      ? undefined
      : page[page.length - 1]?.score;

  // ---- Token budget packing ----
  const packStart = performance.now();
  const { packed, tokensUsed, truncated } = packByBudget(page, budget);
  const packDurationMs = performance.now() - packStart;
  if (packDurationMs > 5.0) {
    const { log } = await import('../lib/logging.js');
    log.warn('token_packing_slow', { durationMs: packDurationMs, budget, itemsCount: page.length });
  }

  // ---- Side effects: bump recallCount + ledger ----
  const memIds = packed.filter((p) => p.type === 'memory').map((p) => p.id);
  await db.transaction(async (tx: typeof db) => {
    if (memIds.length) {
      await tx
        .update(memories)
        .set({ recallCount: sql`${memories.recallCount} + 1`, lastRecalledAt: new Date() })
        .where(inArray(memories.id, memIds));
    }
    await tx.insert(tokenLedger).values({
      id: `ldg_${randomUUID()}`,
      eventType: 'recall',
      query: truncate(query, 120),
      tokensInjected: tokensUsed,
      tokensReused: tokensUsed,
      tokensSaved: tokensUsed,
      itemsReturned: packed.length,
      real: true,
    });
  });
  await appendAudit(
    'recall.performed',
    {
      query: truncate(query, 80),
      items: packed.length,
      tokensUsed,
      mode: useSemantic ? 'semantic' : 'lexical',
    },
    actor
  );

  return {
    query,
    returned: packed,
    tokensUsed,
    tokenBudget: budget,
    truncated,
    mode: useSemantic ? 'semantic' : 'lexical',
    nextCursor,
  };
}
