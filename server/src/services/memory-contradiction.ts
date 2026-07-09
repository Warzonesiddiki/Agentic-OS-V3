import { and, eq, inArray, not, or, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { memories } from '../db/client.js';
import { memoryContradictions } from '../db/schema.js';
import { callLLMStructured } from './llm.js';
import { llmConfigured } from '../lib/env.js';
import { assertOperational } from './safety.service.js';
import { randomUUID } from 'node:crypto';

export type ContradictionClassification = 'supporting' | 'contradicting' | 'neutral';

export interface ContradictionRecord {
  id: string;
  memoryA: string;
  memoryB: string;
  classification: ContradictionClassification;
  resolutionOf: string | null;
  createdAt: Date;
}

export interface ContradictionInput {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

function asNumberArray(v: unknown): number[] | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s.startsWith('[')) return null;
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed)) return (parsed as unknown[]).map((x) => Number(x));
      return null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) return (v as unknown[]).map((x) => Number(x));
  return null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function tagOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = new Set<string>([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

export function coerceClassification(raw: string): ContradictionClassification {
  const v = raw.trim().toLowerCase();
  if (v.includes('contradict')) return 'contradicting';
  if (v.includes('support') || v.includes('agree') || v.includes('consistent')) return 'supporting';
  return 'neutral';
}

/**
 * Pure, DB-free heuristic for whether two tag sets are consistent, conflicting,
 * or unrelated. Used as a fast pre-filter before the (LLM-backed) contradiction
 * judge and is fully unit-testable.
 */
export function classifyByTags(
  a: string[],
  b: string[]
): 'supporting' | 'contradicting' | 'neutral' {
  if (a.length === 0 || b.length === 0) return 'neutral';
  const sa = new Set(a.map((t) => t.toLowerCase()));
  const sb = new Set(b.map((t) => t.toLowerCase()));
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared += 1;
  if (shared === 0) return 'neutral';
  // Tags are treated as supporting context; strong overlap (>= half of the
  // smaller set) signals the two memories describe the same subject.
  const overlapRatio = shared / Math.min(sa.size, sb.size);
  return overlapRatio >= 0.5 ? 'supporting' : 'neutral';
}

export async function judgeContradiction(
  a: ContradictionInput,
  b: ContradictionInput
): Promise<{
  classification: ContradictionClassification;
  confidence: number;
  explanation: string;
}> {
  const userMessage = `Memory A:\nTitle: ${a.title}\nContent: ${a.content.slice(0, 500)}\n\nMemory B:\nTitle: ${b.title}\nContent: ${b.content.slice(0, 500)}\n\nDoes memory B support, contradict, or is it neutral relative to memory A? Respond with strict JSON only: {"classification": "supporting"|"contradicting"|"neutral", "confidence": number between 0 and 1, "explanation": string}.`;

  if (!llmConfigured()) {
    return {
      classification: 'neutral',
      confidence: 0,
      explanation: 'LLM unavailable; defaulting to neutral.',
    };
  }

  try {
    const res = await callLLMStructured<{
      classification: string;
      confidence: number;
      explanation: string;
    }>('You are a logical consistency judge. Respond with strict JSON only.', userMessage);
    return {
      classification: coerceClassification(res.classification),
      confidence: clamp01(res.confidence),
      explanation: res.explanation || '',
    };
  } catch {
    return {
      classification: 'neutral',
      confidence: 0,
      explanation: 'Judgement failed; defaulting to neutral.',
    };
  }
}

async function findCandidates(
  memoryId: string,
  options?: { candidateIds?: string[]; projectId?: string; limit?: number }
): Promise<{
  target: ContradictionInput;
  candidates: Array<ContradictionInput & { score: number }>;
}> {
  const target = await db
    .select({
      id: memories.id,
      title: memories.title,
      content: memories.content,
      tags: memories.tags,
      projectId: memories.projectId,
      embedding: memories.embedding,
    })
    .from(memories)
    .where(eq(memories.id, memoryId))
    .limit(1);

  const t = target[0];
  if (!t) return { target: { id: memoryId, title: '', content: '', tags: [] }, candidates: [] };

  const tEmb = asNumberArray(t.embedding);
  if (!tEmb) {
    return {
      target: { id: t.id, title: t.title, content: t.content, tags: t.tags ?? [] },
      candidates: [],
    };
  }

  const conditions: SQL[] = [not(eq(memories.id, memoryId))];
  if (t.projectId) conditions.push(eq(memories.projectId, t.projectId));
  if (options?.candidateIds && options.candidateIds.length > 0) {
    conditions.push(inArray(memories.id, options.candidateIds));
  }

  const pool = await db
    .select({
      id: memories.id,
      title: memories.title,
      content: memories.content,
      tags: memories.tags,
      embedding: memories.embedding,
    })
    .from(memories)
    .where(and(...conditions));

  const limit = options?.limit ?? 10;
  const scored = pool
    .map(
      (p: {
        id: string;
        title: string;
        content: string;
        tags?: string[] | null;
        embedding?: unknown;
      }) => {
        const emb = asNumberArray(p.embedding);
        const overlap = tagOverlap(t.tags ?? [], p.tags ?? []);
        const sim = emb ? cosineSimilarity(tEmb, emb) : 0;
        const score = Math.max(overlap, sim >= 0.55 ? sim : 0);
        return { id: p.id, title: p.title, content: p.content, tags: p.tags ?? [], score };
      }
    )
    .filter(
      (x: { id: string; title: string; content: string; tags: string[]; score: number }) =>
        x.score > 0
    )
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, limit);

  return {
    target: { id: t.id, title: t.title, content: t.content, tags: t.tags ?? [] },
    candidates: scored,
  };
}

export async function detectContradictions(
  memoryId: string,
  options?: { candidateIds?: string[]; projectId?: string; limit?: number }
): Promise<ContradictionRecord[]> {
  await assertOperational();

  const { target, candidates } = await findCandidates(memoryId, options);
  const records: ContradictionRecord[] = [];

  for (const c of candidates) {
    const verdict = await judgeContradiction(target, c);
    const id = `con_${randomUUID()}`;
    await db.insert(memoryContradictions).values({
      id,
      memoryA: memoryId,
      memoryB: c.id,
      relation: verdict.classification,
      resolutionOf: null,
    });
    records.push({
      id,
      memoryA: memoryId,
      memoryB: c.id,
      classification: verdict.classification,
      resolutionOf: null,
      createdAt: new Date(),
    });
  }

  return records;
}

export async function listContradictions(memoryId?: string): Promise<ContradictionRecord[]> {
  const rows = memoryId
    ? await db
        .select()
        .from(memoryContradictions)
        .where(
          or(eq(memoryContradictions.memoryA, memoryId), eq(memoryContradictions.memoryB, memoryId))
        )
    : await db.select().from(memoryContradictions);
  return rows.map(
    (r: {
      id: string;
      memoryA: string;
      memoryB: string;
      relation: unknown;
      resolutionOf: string | null;
      createdAt: Date | null;
    }) => ({
      id: r.id,
      memoryA: r.memoryA,
      memoryB: r.memoryB,
      classification: coerceClassification(String(r.relation)),
      resolutionOf: r.resolutionOf,
      createdAt: r.createdAt,
    })
  );
}

export interface ResolveAllResult {
  resolved: number;
  skipped: number;
  errors: Array<{ memoryA: string; memoryB: string; message: string }>;
}

/** Lightweight edge descriptor for recall annotations. */
export interface ContradictionEdge {
  memoryA: string;
  memoryB: string;
  classification: ContradictionRecord['classification'];
}

/**
 * Return the contradiction edges whose BOTH endpoints are within the given id
 * set (used to annotate a recall result with the conflicts among its hits).
 * Pure DB read; no LLM call. Safe to invoke on every recall path.
 */
export async function contradictionsAmong(ids: string[]): Promise<ContradictionEdge[]> {
  if (ids.length === 0) return [];
  const idSet = new Set(ids);
  const all = await listContradictions();
  return all
    .filter((r) => idSet.has(r.memoryA) && idSet.has(r.memoryB))
    .map((r) => ({ memoryA: r.memoryA, memoryB: r.memoryB, classification: r.classification }));
}

import { resolveConflict, type ConflictStrategy } from './memory-conflict-resolver.js';

/**
 * Self-healing batch resolver: walks every recorded contradiction that has not
 * yet been resolved and applies the chosen strategy via the conflict-resolver
 * seam. Pure-DB orchestration only — no LLM calls. Fully unit-testable when the
 * underlying resolver is stubbed.
 */
export async function resolveAllContradictions(
  strategy: ConflictStrategy = 'highest_importance',
  options?: { batchSize?: number }
): Promise<ResolveAllResult> {
  const unresolved = (await listContradictions()).filter((r) => r.resolutionOf === null);
  const batchSize = options?.batchSize ?? 50;
  const result: ResolveAllResult = { resolved: 0, skipped: 0, errors: [] };
  for (let i = 0; i < unresolved.length; i += batchSize) {
    const slice = unresolved.slice(i, i + batchSize);
    for (const rec of slice) {
      try {
        await resolveConflict(strategy, rec.memoryA, rec.memoryB);
        result.resolved += 1;
      } catch (e) {
        result.errors.push({
          memoryA: rec.memoryA,
          memoryB: rec.memoryB,
          message: e instanceof Error ? e.message : 'unknown error',
        });
        result.skipped += 1;
      }
    }
  }
  return result;
}
