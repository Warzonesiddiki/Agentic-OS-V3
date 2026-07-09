import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db, memories } from '../db/client.js';
import { cosineSimilarity, toVector } from './memory-hierarchy.js';
import type { Memory } from './memory-hierarchy.js';

export { cosineSimilarity, toVector } from './memory-hierarchy.js';
export type { Memory } from './memory-hierarchy.js';

export const DEDUP_SIMILARITY_THRESHOLD = 0.92;

export interface MemoryLike {
  id: string;
  title: string;
  content: string;
  importance: number;
  recallCount: number;
  tags: string[];
}

export interface MergePreview {
  keptId: string;
  droppedId: string;
  title: string;
  content: string;
  tags: string[];
  recallCount: number;
  importance: number;
}

export function previewMerge(a: MemoryLike, b: MemoryLike): MergePreview {
  const kept = a.importance >= b.importance ? a : b;
  const dropped = kept === a ? b : a;
  const tags = Array.from(new Set([...a.tags, ...b.tags]));
  return {
    keptId: kept.id,
    droppedId: dropped.id,
    title: kept.title,
    content: `${kept.content}\n\n${dropped.content}`,
    tags,
    recallCount: a.recallCount + b.recallCount,
    importance: Math.max(a.importance, b.importance),
  };
}

export function findDuplicatePairs(
  list: Memory[],
  threshold: number = DEDUP_SIMILARITY_THRESHOLD
): Array<[Memory, Memory, number]> {
  const pairs: Array<[Memory, Memory, number]> = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (!a || !b) continue;
      const sim = cosineSimilarity(toVector(a.embedding), toVector(b.embedding));
      if (sim >= threshold) pairs.push([a, b, sim]);
    }
  }
  return pairs;
}

export interface DedupResult {
  merged: number;
}

function toLike(m: Memory): MemoryLike {
  return {
    id: m.id,
    title: m.title,
    content: m.content,
    importance: m.importance,
    recallCount: m.recallCount,
    tags: Array.isArray(m.tags) ? m.tags : [],
  };
}

export async function deduplicateMemories(
  opts: { projectId?: string; threshold?: number; limit?: number } = {}
): Promise<DedupResult> {
  const threshold = opts.threshold ?? DEDUP_SIMILARITY_THRESHOLD;
  const rows: Memory[] = await db.query.memories.findMany({
    where: and(
      isNull(memories.deletedAt),
      isNull(memories.supersededBy),
      isNotNull(memories.embedding),
      opts.projectId ? eq(memories.projectId, opts.projectId) : undefined
    ),
    limit: opts.limit ?? 2000,
  });

  const pairs = findDuplicatePairs(rows, threshold);
  for (const [a, b] of pairs) {
    const merge = previewMerge(toLike(a), toLike(b));
    await db
      .update(memories)
      .set({
        content: merge.content,
        recallCount: merge.recallCount,
        importance: merge.importance,
        tags: merge.tags,
      })
      .where(eq(memories.id, merge.keptId));
    await db
      .update(memories)
      .set({ supersededBy: merge.keptId, deletedAt: new Date() })
      .where(eq(memories.id, merge.droppedId));
  }
  return { merged: pairs.length };
}

/**
 * Lexical token overlap (Jaccard) between two strings — DB-free, testable.
 * Used for theme clustering when embeddings are unavailable.
 */
export function tokenOverlap(a: string, b: string): number {
  const norm = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2)
    );
  const sa = norm(a);
  const sb = norm(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * Greedy single-linkage clustering of memories by content/title similarity.
 * Returns groups of memory ids. Pure + DB-free so it is fully unit-testable.
 */
export function clusterBySimilarity(
  items: Array<{ id: string; title: string; content: string; tags?: string[] }>,
  threshold = 0.25
): string[][] {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let cur = x;
    while (parent[cur] !== undefined && parent[cur] !== cur) {
      const nxt = parent[cur];
      if (nxt === undefined) break;
      parent[cur] = parent[nxt] ?? nxt;
      cur = nxt;
    }
    return cur;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = items[i];
      const b = items[j];
      if (!a || !b) continue;
      const tagOverlap =
        a.tags && b.tags
          ? a.tags.filter((t) => (b.tags ?? []).includes(t)).length /
            Math.max(1, new Set([...a.tags, ...b.tags]).size)
          : 0;
      const sim = Math.max(
        tokenOverlap(a.title + ' ' + a.content, b.title + ' ' + b.content),
        tagOverlap
      );
      if (sim >= threshold) union(i, j);
    }
  }
  const groups = new Map<number, string[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const item = items[i];
    if (!item) continue;
    const arr = groups.get(root) ?? [];
    arr.push(item.id);
    groups.set(root, arr);
  }
  return Array.from(groups.values());
}
