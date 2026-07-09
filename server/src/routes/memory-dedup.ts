import { Hono } from 'hono';
import type { NexusEnv } from '../lib/hono-env.js';
import { requireScope, safeJson, parse } from '../lib/auth-context.js';
import { z } from 'zod';
import { ok } from '../lib/envelope.js';
import {
  deduplicateMemories,
  DEDUP_SIMILARITY_THRESHOLD,
  previewMerge,
  type MemoryLike,
} from '../services/memory-dedup.js';

/**
 * Memory dedup routes (Mnemosyne namespace).
 * NOTE: this router is NOT mounted in routes.ts (which is FROZEN). Flagged for
 * Leader sign-off to add `app.route('/api/memories', memoryDedup)` in routes.ts.
 */
export const memoryDedup = new Hono<NexusEnv>();

const runSchema = z.object({
  projectId: z.string().optional(),
  threshold: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

const previewSchema = z.object({
  a: z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    importance: z.number(),
    recallCount: z.number(),
    tags: z.array(z.string()),
  }),
  b: z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    importance: z.number(),
    recallCount: z.number(),
    tags: z.array(z.string()),
  }),
});

memoryDedup.get('/api/memories/dedup/threshold', async (c) => {
  await requireScope(c, 'memory:read');
  return c.json(ok({ threshold: DEDUP_SIMILARITY_THRESHOLD }, c.get('requestId') ?? ''));
});

memoryDedup.post('/api/memories/dedup/preview', async (c) => {
  await requireScope(c, 'memory:read');
  const body = parse(previewSchema, await safeJson(c));
  const merged = previewMerge(body.a as MemoryLike, body.b as MemoryLike);
  return c.json(ok(merged, c.get('requestId') ?? ''));
});

memoryDedup.post('/api/memories/dedup/run', async (c) => {
  const principal = await requireScope(c, 'memory:write');
  const body = parse(runSchema, await safeJson(c));
  const result = await deduplicateMemories({
    projectId: body.projectId,
    threshold: body.threshold,
    limit: body.limit,
  });
  return c.json(ok({ merged: result.merged, actor: principal.id }, c.get('requestId') ?? ''));
});
