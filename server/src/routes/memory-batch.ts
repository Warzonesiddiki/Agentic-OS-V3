import { Hono } from 'hono';
import type { NexusEnv } from '../lib/hono-env.js';
import { requireScope, safeJson, parse } from '../lib/auth-context.js';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db, memories, memoryDiffMarkers } from '../db/client.js';
import { ok } from '../lib/envelope.js';
import { randomUUID } from 'node:crypto';
import { type Tx } from '../lib/audit.js';

export const router = new Hono<NexusEnv>();

interface BatchFilter {
  tags?: string[];
  importance_lt?: number;
  createdBefore?: string;
}

interface MemoryFilterRow {
  id: unknown;
  tags: unknown;
  importance: unknown;
  createdAt: unknown;
}

function matchesFilter(row: MemoryFilterRow, filter: BatchFilter): boolean {
  if (filter.tags && filter.tags.length > 0) {
    const rt = Array.isArray(row.tags) ? (row.tags as string[]) : [];
    if (!filter.tags.some((t) => rt.includes(t))) return false;
  }
  if (typeof filter.importance_lt === 'number' && typeof row.importance === 'number') {
    if (!(row.importance < filter.importance_lt)) return false;
  }
  if (filter.createdBefore) {
    const cb = new Date(filter.createdBefore).getTime();
    const ca = new Date(row.createdAt as string).getTime();
    if (!(ca < cb)) return false;
  }
  return true;
}

async function selectIds(filter: BatchFilter): Promise<string[]> {
  const rows = await db
    .select({
      id: memories.id,
      tags: memories.tags,
      importance: memories.importance,
      createdAt: memories.createdAt,
    })
    .from(memories);
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => matchesFilter(r as MemoryFilterRow, filter))
    .map((r) => r.id as string);
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

router.post('/api/memories/batch/delete', async (c) => {
  await requireScope(c, 'memory:write');
  const body = parse(
    z.object({
      tags: z.array(z.string()).optional(),
      importance_lt: z.number().optional(),
      createdBefore: z.string().optional(),
    }),
    await safeJson(c)
  );
  const ids = await selectIds(body);
  let deleted = 0;
  if (ids.length > 0) {
    await db.transaction(async (tx: Tx) => {
      await tx.delete(memories).where(inArray(memories.id, ids));
      for (const id of ids) {
        await tx.insert(memoryDiffMarkers).values({
          id: `mdm_${randomUUID()}`,
          memoryId: id,
          operation: 'delete',
          createdAt: new Date(),
        });
      }
    });
    deleted = ids.length;
  }
  return c.json(ok({ deleted }, c.get('requestId') ?? ''), 200);
});

router.post('/api/memories/batch/tag', async (c) => {
  await requireScope(c, 'memory:write');
  const body = parse(
    z.object({
      ids: z.array(z.string()).optional(),
      filter: z
        .object({
          tags: z.array(z.string()).optional(),
          importance_lt: z.number().optional(),
          createdBefore: z.string().optional(),
        })
        .optional(),
      add: z.array(z.string()).default([]),
      remove: z.array(z.string()).default([]),
    }),
    await safeJson(c)
  );
  const add = body.add ?? [];
  const remove = body.remove ?? [];
  let ids: string[];
  if (body.ids && body.ids.length > 0) {
    ids = body.ids;
  } else {
    ids = await selectIds(body.filter ?? {});
  }
  let updated = 0;
  for (const id of ids) {
    const mem = await db
      .select({ tags: memories.tags })
      .from(memories)
      .where(eq(memories.id, id))
      .limit(1);
    const current =
      Array.isArray(mem) && mem.length > 0 && Array.isArray(mem[0].tags)
        ? (mem[0].tags as string[])
        : [];
    const next = dedupeTags([...current, ...add].filter((t) => !remove.includes(t)));
    await db.update(memories).set({ tags: next, updatedAt: new Date() }).where(eq(memories.id, id));
    updated++;
  }
  return c.json(ok({ updated }, c.get('requestId') ?? ''), 200);
});

export default router;
