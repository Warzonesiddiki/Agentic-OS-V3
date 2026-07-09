import { randomUUID } from 'node:crypto';
import { eq, gt } from 'drizzle-orm';
import { db, memories, memoryDiffMarkers } from '../db/client.js';
import { type Tx } from '../lib/audit.js';

export interface MemoryDiffRecord {
  id: string;
  title: string;
  kind: string;
  updatedAt: string;
  hash: string;
}

export interface MemoryDiff {
  since: string;
  exportedAt: string;
  memories: MemoryDiffRecord[];
  deletedIds: string[];
}

export interface MemoryDiffApplyResult {
  upserted: number;
  deleted: number;
  skipped: number;
}

export interface MemoryDiffSourceRow {
  id: string;
  title: string;
  content: string;
  kind: string;
  tags: string[];
  updatedAt: string | Date;
}

export interface MemoryDiffStoreEntry {
  id: string;
  updatedAt: string;
  deleted?: boolean;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return String(value);
}

export function hashMemory(input: {
  title: string;
  content: string;
  tags?: string[];
  kind?: string;
}): string {
  const data = JSON.stringify({
    title: input.title,
    content: input.content,
    tags: input.tags ?? [],
    kind: input.kind ?? '',
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function computeExport(
  sources: MemoryDiffSourceRow[],
  deletedIds: string[],
  since: Date
): MemoryDiff {
  const sinceMs = since.getTime();
  const memoriesOut = sources
    .filter((s) => new Date(s.updatedAt).getTime() > sinceMs)
    .map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      updatedAt: toIso(s.updatedAt),
      hash: hashMemory({ title: s.title, content: s.content, tags: s.tags, kind: s.kind }),
    }));
  return {
    since: since.toISOString(),
    exportedAt: new Date().toISOString(),
    memories: memoriesOut,
    deletedIds: [...new Set(deletedIds)],
  };
}

export function applyDiffToStore(
  store: Map<string, MemoryDiffStoreEntry>,
  diff: MemoryDiff
): MemoryDiffApplyResult {
  let upserted = 0;
  let deleted = 0;
  let skipped = 0;
  for (const rec of diff.memories) {
    const existing = store.get(rec.id);
    if (existing && existing.deleted) {
      store.delete(rec.id);
    }
    const existingUpdated =
      existing && !existing.deleted ? new Date(existing.updatedAt).getTime() : -1;
    if (existingUpdated >= new Date(rec.updatedAt).getTime()) {
      skipped++;
      continue;
    }
    store.set(rec.id, { id: rec.id, updatedAt: rec.updatedAt });
    upserted++;
  }
  for (const id of diff.deletedIds) {
    if (store.has(id)) {
      store.delete(id);
      deleted++;
    } else {
      skipped++;
    }
  }
  return { upserted, deleted, skipped };
}

export async function exportDiff(since: Date): Promise<MemoryDiff> {
  const rows = await db
    .select({
      id: memories.id,
      title: memories.title,
      content: memories.content,
      kind: memories.kind,
      tags: memories.tags,
      updatedAt: memories.updatedAt,
    })
    .from(memories)
    .where(gt(memories.updatedAt, since));
  const sources: MemoryDiffSourceRow[] = (Array.isArray(rows) ? rows : []).map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    kind: r.kind,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    updatedAt: r.updatedAt,
  }));
  const markerRows = await db
    .select({ memoryId: memoryDiffMarkers.memoryId, createdAt: memoryDiffMarkers.createdAt })
    .from(memoryDiffMarkers)
    .where(gt(memoryDiffMarkers.createdAt, since));
  const deletedIds = [
    ...new Set((Array.isArray(markerRows) ? markerRows : []).map((m) => m.memoryId as string)),
  ];
  return computeExport(sources, deletedIds, since);
}

export async function recordDeletion(memoryId: string): Promise<void> {
  await db.insert(memoryDiffMarkers).values({
    id: `mdm_${randomUUID()}`,
    memoryId,
    operation: 'delete',
    createdAt: new Date(),
  });
}

export async function applyDiff(diff: MemoryDiff): Promise<MemoryDiffApplyResult> {
  const store = new Map<string, MemoryDiffStoreEntry>();
  const rows = await db.select({ id: memories.id, updatedAt: memories.updatedAt }).from(memories);
  for (const r of Array.isArray(rows) ? rows : []) {
    store.set(r.id as string, { id: r.id as string, updatedAt: toIso(r.updatedAt) });
  }
  const result = applyDiffToStore(store, diff);
  await db.transaction(async (tx: Tx) => {
    for (const id of diff.deletedIds) {
      await tx.delete(memories).where(eq(memories.id, id));
    }
  });
  return result;
}
