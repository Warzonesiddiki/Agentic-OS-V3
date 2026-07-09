import { Hono } from 'hono';
import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { db, auditLog } from '../db/client.js';
import { ok, err } from '../lib/envelope.js';
import type { NexusEnv } from '../lib/hono-env.js';
import { requireScope, parse, safeJson } from '../lib/auth-context.js';
import { verifyAuditChain } from '../lib/audit.js';
import { verifyAndAutoKill, logTrajectory, logToolReceipt } from '../services/audit-engine.js';

export const auditRouter = new Hono<NexusEnv>();

auditRouter.get('/api/v1/audit', async (c) => {
  await requireScope(c, 'audit:read');
  const result = await verifyAuditChain();
  return c.json(ok(result, c.get('requestId') ?? ''));
});

auditRouter.get('/api/v1/audit/logs', async (c) => {
  await requireScope(c, 'audit:read');
  const logs = await db.select().from(auditLog).orderBy(desc(auditLog.sequence)).limit(500);
  return c.json(ok(logs, c.get('requestId') ?? ''));
});

auditRouter.get('/api/v1/audit/verify', async (c) => {
  await requireScope(c, 'audit:read');
  const result = await verifyAndAutoKill();
  return c.json(ok(result, c.get('requestId') ?? ''));
});

auditRouter.get('/api/v1/audit/verify/:anchorId', async (c) => {
  await requireScope(c, 'audit:read');
  const anchorId = c.req.param('anchorId');
  const { verifyAnchor } = await import('../services/blockchain.js');
  const result = await verifyAnchor(anchorId);
  if (!result.found) {
    return c.json(
      err('NOT_FOUND', `Anchor '${anchorId}' not found.`, c.get('requestId') ?? ''),
      404
    );
  }
  return c.json(ok(result, c.get('requestId') ?? ''));
});

auditRouter.post('/api/v1/audit/anchor', async (c) => {
  await requireScope(c, 'audit:read');
  const { anchorAuditLogsBatch } = await import('../services/blockchain.js');
  const result = await anchorAuditLogsBatch();
  return c.json(
    ok(result ?? { message: 'No pending audit entries to anchor.' }, c.get('requestId') ?? ''),
    result ? 201 : 200
  );
});

auditRouter.post('/api/v1/audit/trajectory', async (c) => {
  const p = await requireScope(c, 'audit:read');
  const body = parse(
    z.object({
      agentId: z.string(),
      model: z.string(),
      promptSent: z.string(),
      responseReceived: z.string().optional(),
      tokenUsage: z
        .object({ prompt: z.number(), completion: z.number(), total: z.number() })
        .optional(),
      latencyMs: z.number().optional(),
    }),
    await safeJson(c)
  );
  const result = await logTrajectory(body, p.id);
  return c.json(ok(result, c.get('requestId') ?? ''), 201);
});

auditRouter.post('/api/v1/audit/receipt', async (c) => {
  const p = await requireScope(c, 'audit:read');
  const body = parse(
    z.object({
      agentId: z.string(),
      tool: z.string(),
      target: z.string().optional(),
      preState: z.string().optional(),
      postState: z.string().optional(),
      exitCode: z.number().optional(),
      authorized: z.boolean(),
    }),
    await safeJson(c)
  );
  const result = await logToolReceipt(body, p.id);
  return c.json(ok(result, c.get('requestId') ?? ''), 201);
});
