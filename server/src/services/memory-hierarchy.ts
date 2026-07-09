import { and, asc, eq, isNull, lt, or } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { db, memories } from '../db/client.js';
import { callLLMStructured, llmConfigured } from './llm.js';
import { embedQuery, embeddingsAvailable } from './embeddings.js';
import { log } from '../lib/logging.js';
import { randomUUID } from 'node:crypto';

export type MemoryTier = 'STM' | 'MTM' | 'LTM';
export type Memory = InferSelectModel<typeof memories>;

export function toVector(embedding: unknown): number[] | null {
  if (embedding == null) return null;
  if (Array.isArray(embedding)) {
    return embedding.every((n) => typeof n === 'number') ? (embedding as number[]) : null;
  }
  if (typeof embedding === 'string') {
    try {
      const parsed = JSON.parse(embedding) as unknown;
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function cosineSimilarity(
  a: number[] | null | undefined,
  b: number[] | null | undefined
): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function tagsOf(m: Memory): string[] {
  return Array.isArray(m.tags) ? m.tags : [];
}

export interface DerivedMemoryInput {
  kind: string;
  title: string;
  content: string;
  tags: string[];
  importance: number;
  projectId: string | null;
  tier: MemoryTier;
  sourceChain: string[];
}

export async function createDerivedMemory(input: DerivedMemoryInput): Promise<string> {
  const id = `mem_${randomUUID()}`;
  const embedding = embeddingsAvailable()
    ? await embedQuery(`${input.title}\n${input.content}`)
    : null;
  await db.insert(memories).values({
    id,
    kind: input.kind,
    title: input.title,
    content: input.content,
    tags: input.tags,
    importance: input.importance,
    source: 'memory-hierarchy',
    projectId: input.projectId,
    embedding,
    tier: input.tier,
    sourceChain: input.sourceChain,
    recallCount: 0,
  } as unknown as InferInsertModel<typeof memories>);
  return id;
}

export interface MemoryHierarchyResult {
  created: number;
  compressed: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function unionTags(rows: Memory[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    for (const t of tagsOf(r)) set.add(t);
  }
  return [...set];
}

function avgImportance(rows: Memory[]): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce((acc, r) => acc + r.importance, 0);
  return Math.min(1, Math.max(0, sum / rows.length));
}

export async function compressStmToMtm(
  opts: { projectId?: string; limit?: number } = {}
): Promise<MemoryHierarchyResult> {
  if (!llmConfigured()) return { created: 0, compressed: 0 };
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const rows: Memory[] = await db.query.memories.findMany({
    where: and(
      isNull(memories.deletedAt),
      isNull(memories.supersededBy),
      lt(memories.createdAt, cutoff),
      or(eq(memories.tier, 'STM'), isNull(memories.tier)),
      opts.projectId ? eq(memories.projectId, opts.projectId) : undefined
    ),
    orderBy: asc(memories.createdAt),
    limit: opts.limit ?? 200,
  });

  const groups = new Map<string, Memory[]>();
  for (const r of rows) {
    const key = r.projectId ?? '';
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  let created = 0;
  let compressed = 0;
  for (const [key, group] of groups) {
    for (const batch of chunk(group, 4)) {
      const first = batch[0];
      if (!first) continue;
      try {
        const summary = await callLLMStructured<{ title: string; content: string; tags: string[] }>(
          'Summarize related short-term memories into a single medium-term memory. Respond with JSON: { "title": string, "content": string, "tags": string[] }.',
          `Memories:\n${batch.map((m) => `- ${m.title}: ${m.content}`).join('\n')}`
        );
        const newId = await createDerivedMemory({
          kind: first.kind,
          title: summary.title,
          content: summary.content,
          tags: Array.from(new Set([...(summary.tags ?? []), ...unionTags(batch)])),
          importance: avgImportance(batch),
          projectId: key === '' ? null : key,
          tier: 'MTM',
          sourceChain: batch.map((m) => m.id),
        });
        for (const m of batch) {
          await db.update(memories).set({ supersededBy: newId }).where(eq(memories.id, m.id));
          compressed++;
        }
        created++;
      } catch (e) {
        log.error('compressStmToMtm', { error: e });
      }
    }
  }
  return { created, compressed };
}

export async function compressMtmToLtm(
  opts: { limit?: number } = {}
): Promise<MemoryHierarchyResult> {
  if (!llmConfigured()) return { created: 0, compressed: 0 };
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const rows: Memory[] = await db.query.memories.findMany({
    where: and(
      isNull(memories.deletedAt),
      isNull(memories.supersededBy),
      eq(memories.tier, 'MTM'),
      lt(memories.createdAt, cutoff)
    ),
    orderBy: asc(memories.createdAt),
    limit: opts.limit ?? 200,
  });

  const groups = new Map<string, Memory[]>();
  for (const r of rows) {
    const key = r.projectId ?? '';
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  let created = 0;
  let compressed = 0;
  for (const [key, group] of groups) {
    for (const batch of chunk(group, 4)) {
      const first = batch[0];
      if (!first) continue;
      try {
        const summary = await callLLMStructured<{ title: string; content: string; tags: string[] }>(
          'Compress related medium-term memories into a single long-term archetype. Respond with JSON: { "title": string, "content": string, "tags": string[] }.',
          `Memories:\n${batch.map((m) => `- ${m.title}: ${m.content}`).join('\n')}`
        );
        const newId = await createDerivedMemory({
          kind: 'fact',
          title: summary.title,
          content: summary.content,
          tags: Array.from(new Set([...(summary.tags ?? []), ...unionTags(batch)])),
          importance: avgImportance(batch),
          projectId: key === '' ? null : key,
          tier: 'LTM',
          sourceChain: batch.map((m) => m.id),
        });
        for (const m of batch) {
          await db.update(memories).set({ supersededBy: newId }).where(eq(memories.id, m.id));
          compressed++;
        }
        created++;
      } catch (e) {
        log.error('compressMtmToLtm', { error: e });
      }
    }
  }
  return { created, compressed };
}

export async function runMemoryHierarchyCycle(
  opts: { projectId?: string } = {}
): Promise<{ stm: MemoryHierarchyResult; ltm: MemoryHierarchyResult }> {
  const stm = await compressStmToMtm(opts);
  const ltm = await compressMtmToLtm({});
  return { stm, ltm };
}
