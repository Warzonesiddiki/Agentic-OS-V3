import { Hono } from 'hono';
import type { NexusEnv } from '../lib/hono-env.js';
import { requireScope, safeJson, parse } from '../lib/auth-context.js';
import { z } from 'zod';
import { ok, err } from '../lib/envelope.js';
import {
  resolveConflict,
  proposeResolution,
  type ConflictStrategy,
} from '../services/memory-conflict-resolver.js';

/**
 * Memory contradiction-resolution routes (Mnemosyne namespace).
 * NOTE: this router is NOT mounted in routes.ts (which is FROZEN). Flagged for
 * Leader sign-off to add `app.route('/api/memories', memoryContradiction)` in
 * routes.ts.
 */
export const memoryContradiction = new Hono<NexusEnv>();

const strategyEnum = z.enum(['newest_wins', 'highest_importance', 'llm_merge', 'prompt_user']);

const resolveSchema = z.object({
  strategy: strategyEnum,
  memoryAId: z.string().min(1),
  memoryBId: z.string().min(1),
});

const proposeSchema = z.object({
  memoryAId: z.string().min(1),
  memoryBId: z.string().min(1),
});

memoryContradiction.post('/api/memories/conflict/resolve', async (c) => {
  const principal = await requireScope(c, 'memory:write');
  const body = parse(resolveSchema, await safeJson(c));
  try {
    const result = await resolveConflict(
      body.strategy as ConflictStrategy,
      body.memoryAId,
      body.memoryBId
    );
    return c.json(ok({ ...result, actor: principal.id }, c.get('requestId') ?? ''));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'resolution failed';
    return c.json(err('CONFLICT_RESOLVE_FAILED', message, c.get('requestId') ?? ''), 400);
  }
});

memoryContradiction.post('/api/memories/conflict/propose', async (c) => {
  await requireScope(c, 'memory:read');
  const body = parse(proposeSchema, await safeJson(c));
  try {
    const proposal = await proposeResolution(body.memoryAId, body.memoryBId);
    return c.json(ok(proposal, c.get('requestId') ?? ''));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'proposal failed';
    return c.json(err('CONFLICT_PROPOSE_FAILED', message, c.get('requestId') ?? ''), 400);
  }
});
