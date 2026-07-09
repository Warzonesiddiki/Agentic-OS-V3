import { Hono } from 'hono';
import type { NexusEnv } from '../lib/hono-env.js';
import { requireScope, safeJson, parse } from '../lib/auth-context.js';
import { z } from 'zod';
import { ok } from '../lib/envelope.js';
import { answerNaturalLanguageQuery } from '../services/memory-nl-query.js';
import { explainRecallResults } from '../services/memory-search-explanation.js';
import { recall } from '../services/recall.js';

export const memoryNlQuery = new Hono<NexusEnv>();

const queryBodySchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(50).optional(),
  budget: z.number().int().min(1).max(20000).optional(),
  explain: z.boolean().optional(),
});

memoryNlQuery.post('/api/memories/query', async (c) => {
  const principal = await requireScope(c, 'memory:read');
  const body = parse(queryBodySchema, await safeJson(c));
  const explainFlag = c.req.query('explain') === 'true' || body.explain === true;

  if (explainFlag) {
    const result = await recall(body.query, body.budget ?? 4000, principal.id, {
      limit: body.limit ?? 10,
    });
    return c.json(ok({ explanation: explainRecallResults(result) }, c.get('requestId') ?? ''));
  }

  const answer = await answerNaturalLanguageQuery(body.query, {
    actor: principal.id,
    limit: body.limit,
  });
  return c.json(ok(answer, c.get('requestId') ?? ''));
});
