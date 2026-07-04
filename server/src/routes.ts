/**
 * routes.ts — versioned REST API (/api/v1) — thin handlers over services.
 * Each route validates with Zod, enforces auth + scope, and returns an envelope.
 */
import { Hono } from 'hono';
import { db } from './db/client.js';
import {
  memories,
  skills,
  projects,
  notes,
  auditLog,
  tokenLedger,
  systemMeta,
  agents as agentsTable,
} from './db/client.js';
import { eq, gt, sql } from 'drizzle-orm';
import { ok, err } from './lib/envelope.js';
import type { NexusEnv } from './lib/hono-env.js';
import { requireScope, safeJson, parse, fail } from './lib/auth-context.js';
import { createPrincipal, listPrincipals, revokePrincipal, type Scope } from './lib/security.js';
import {
  memoryInput,
  memoryPatch,
  skillInput,
  recallQuery,
  captureInput,
  outcomeInput,
  killSwitchInput,
  feedbackInput,
} from './lib/schemas.js';
import {
  createMemory,
  updateMemory,
  deleteMemory,
  createSkill,
  updateSkill,
  deleteSkill,
  recordOutcome,
  captureSession,
  setKillSwitch,
  recordFeedback,
  transferProject,
  checkpoint,
  isKillSwitchOn,
} from './services.js';
import { recall } from './services/recall.js';
import { exportBrain, importBrain, compressBrain } from './services/brain.js';
import { syncVault, writeBack } from './services/vault.js';
import { rebuildEmbeddings } from './services/embeddings.js';
import { verifyAuditChain } from './lib/audit.js';
import { dbReachable, isPgvectorInstalled } from './setup.js';
import { llmConfigured, getEnv } from './lib/env.js';
import { z } from 'zod';
import { verifyAndAutoKill, logTrajectory, logToolReceipt } from './services/audit-engine.js';
import { broadcastSSE, getSSEClientCount } from './services/sse-bus.js';
import { runCompilationPipeline, listCompiledScripts } from './services/skill-compiler.js';
import { metricsOutput, metricsContentType } from './services/metrics.js';
import { agents } from './routes/agents.js';
import { automation } from './routes/automation.js';
import { sse } from './routes/sse.js';
import { v3upgrade } from './routes/v3-upgrade.js';
import { agentLifecycle } from './routes/agent-lifecycle.js';

export const api = new Hono<NexusEnv>();

api.onError((e, c) => fail(c, e));

// Mount sub-routers (extracted domain modules)
api.route('/', agents);
api.route('/', automation);
api.route('/', sse);
api.route('/', v3upgrade);
api.route('/', agentLifecycle);

// ---- Public ----
api.get('/api/v1/health', async (c) => {
  const dbOk = await dbReachable();
  const killSwitch = await isKillSwitchOn();
  const status = dbOk && !killSwitch ? 'ok' : killSwitch ? 'locked' : 'degraded';
  const code = dbOk ? 200 : 503;
  return c.json(
    ok(
      {
        status,
        timestamp: Date.now(),
        components: { db: dbOk ? 'ok' : 'down', killSwitch },
      },
      c.get('requestId') ?? ''
    ),
    code
  );
});

api.get('/api/v1/metrics', async (c) => {
  c.header('Content-Type', metricsContentType());
  return c.body(await metricsOutput());
});

api.get('/api/v1/system', async (c) => {
  const e = getEnv();
  const count = sql<number>`count(*)::int`;
  const [mem, skl, prj, aud] = await Promise.all([
    db.select({ n: count }).from(memories),
    db.select({ n: count }).from(skills),
    db.select({ n: count }).from(projects),
    db.select({ n: count }).from(auditLog),
  ]);
  return c.json(
    ok(
      {
        version: '2.0.0',
        nodeEnv: e.NODE_ENV,
        llmMode: llmConfigured() ? 'configured' : 'lexical',
        rateLimitPerMinute: e.NEXUS_RATE_LIMIT_PER_MINUTE,
        maxBodyBytes: e.NEXUS_MAX_BODY_BYTES,
        counts: {
          memories: mem[0]?.n ?? 0,
          skills: skl[0]?.n ?? 0,
          projects: prj[0]?.n ?? 0,
          audit: aud[0]?.n ?? 0,
        },
      },
      c.get('requestId') ?? ''
    )
  );
});

// ---- Memories ----
api.get('/api/v1/memories', async (c) => {
  await requireScope(c, 'memory:read');
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 200)));
  const cursor = c.req.query('cursor');
  const items = cursor
    ? await db.query.memories.findMany({
        limit: limit + 1,
        where: gt(memories.id, cursor),
        orderBy: memories.id,
      })
    : await db.query.memories.findMany({ limit: limit + 1, orderBy: memories.id });
  const hasMore = items.length > limit;
  if (hasMore) items.pop();
  return c.json(
    ok(
      {
        total: items.length,
        items,
        limit,
        cursor,
        hasMore,
        nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      },
      c.get('requestId') ?? ''
    )
  );
});

api.post('/api/v1/memories', async (c) => {
  const p = await requireScope(c, 'memory:write');
  const input = parse(memoryInput, await safeJson(c));
  const created = await createMemory(input as Parameters<typeof createMemory>[0], p.name);
  return c.json(ok(created, c.get('requestId') ?? ''), 201);
});

api.get('/api/v1/memories/:id', async (c) => {
  await requireScope(c, 'memory:read');
  const m = await db.query.memories.findFirst({ where: eq(memories.id, c.req.param('id')) });
  if (!m) return c.json(err('NOT_FOUND', 'Memory not found.', c.get('requestId') ?? ''), 404);
  return c.json(ok(m, c.get('requestId') ?? ''));
});

api.patch('/api/v1/memories/:id', async (c) => {
  const p = await requireScope(c, 'memory:write');
  const patch = parse(memoryPatch, await safeJson(c));
  const updated = await updateMemory(c.req.param('id'), patch, p.name);
  return c.json(ok(updated, c.get('requestId') ?? ''));
});

api.delete('/api/v1/memories/:id', async (c) => {
  const p = await requireScope(c, 'memory:write');
  await deleteMemory(c.req.param('id'), p.name);
  return c.json(ok({ deleted: true }, c.get('requestId') ?? ''));
});

// ---- Recall ----
api.get('/api/v1/recall', async (c) => {
  const p = await requireScope(c, 'memory:read');
  const q = parse(recallQuery, {
    q: c.req.query('q'),
    budget: c.req.query('budget'),
    cursor: c.req.query('cursor'),
    limit: c.req.query('limit'),
  });
  const result = await recall(q.q, q.budget as number, p.name, {
    cursor: q.cursor,
    limit: q.limit,
  });
  return c.json(ok(result, c.get('requestId') ?? ''));
});

// ---- Skills ----
api.get('/api/v1/skills', async (c) => {
  await requireScope(c, 'skill:read');
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 200)));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0));
  const items = await db.query.skills.findMany({ limit, offset, orderBy: skills.createdAt });
  return c.json(ok({ total: items.length, items, limit, offset }, c.get('requestId') ?? ''));
});

api.post('/api/v1/skills', async (c) => {
  const p = await requireScope(c, 'skill:write');
  const input = parse(skillInput, await safeJson(c));
  const created = await createSkill(input as Parameters<typeof createSkill>[0], p.name);
  return c.json(ok(created, c.get('requestId') ?? ''), 201);
});

api.get('/api/v1/skills/:id', async (c) => {
  await requireScope(c, 'skill:read');
  const s = await db.query.skills.findFirst({ where: eq(skills.id, c.req.param('id')) });
  if (!s) return c.json(err('NOT_FOUND', 'Skill not found.', c.get('requestId') ?? ''), 404);
  return c.json(ok(s, c.get('requestId') ?? ''));
});

api.patch('/api/v1/skills/:id', async (c) => {
  const p = await requireScope(c, 'skill:write');
  const patch = parse(skillInput.partial(), await safeJson(c));
  const updated = await updateSkill(c.req.param('id'), patch, p.name);
  return c.json(ok(updated, c.get('requestId') ?? ''));
});

api.delete('/api/v1/skills/:id', async (c) => {
  const p = await requireScope(c, 'skill:write');
  await deleteSkill(c.req.param('id'), p.name);
  return c.json(ok({ deleted: true }, c.get('requestId') ?? ''));
});

api.post('/api/v1/skills/:id/outcome', async (c) => {
  const p = await requireScope(c, 'skill:write');
  const { outcome } = parse(outcomeInput, await safeJson(c));
  const updated = await recordOutcome(c.req.param('id'), outcome, p.name);
  return c.json(ok(updated, c.get('requestId') ?? ''));
});

// ---- Recall conversation + checkpoint ----
api.post('/api/v1/recall/conversation', async (c) => {
  const p = await requireScope(c, 'memory:read');
  const body = parse(
    z.object({
      query: z.string().min(1),
      budget: z.number().int().min(64).max(8192).default(1500),
    }),
    await safeJson(c)
  );
  const r = await recall(body.query, body.budget as number, p.name);
  return c.json(ok(r, c.get('requestId') ?? ''));
});

api.post('/api/v1/checkpoint', async (c) => {
  const p = await requireScope(c, 'memory:write');
  const body = parse(
    z.object({
      label: z.string().min(1).max(160),
      context: z.string().min(1),
      projectName: z.string().optional(),
    }),
    await safeJson(c)
  );
  const row = await checkpoint(body.label, body.context, body.projectName, p.name);
  return c.json(ok(row, c.get('requestId') ?? ''), 201);
});

// ---- Sessions / capture ----
api.post('/api/v1/sessions/capture', async (c) => {
  const p = await requireScope(c, 'memory:write');
  const input = parse(captureInput, await safeJson(c));
  const report = await captureSession(input.transcript, input.projectName, p.name);
  return c.json(ok(report, c.get('requestId') ?? ''), 201);
});

// ---- Projects ----
api.get('/api/v1/projects', async (c) => {
  await requireScope(c, 'memory:read');
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 100)));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0));
  const items = await db.query.projects.findMany({ limit, offset, orderBy: projects.createdAt });
  return c.json(ok({ total: items.length, items, limit, offset }, c.get('requestId') ?? ''));
});

api.post('/api/v1/projects/transfer', async (c) => {
  const p = await requireScope(c, 'memory:write');
  const body = parse(
    z.object({
      projectName: z.string().min(1).max(120),
      description: z.string().max(1000).optional(),
      memories: z
        .array(
          z.object({
            kind: z
              .enum(['episodic', 'semantic', 'preference', 'reflexion', 'fact'])
              .default('semantic'),
            title: z.string().min(1),
            content: z.string().min(1),
            tags: z.array(z.string()).default([]),
            importance: z.number().default(0.6),
          })
        )
        .default([]),
      skills: z
        .array(
          z.object({
            name: z.string().min(1),
            title: z.string().min(1),
            description: z.string().min(1),
            content: z.string().min(1),
            category: z.string().default('general'),
            tags: z.array(z.string()).default([]),
            trigger: z.string().nullable().default(null),
            source: z.string().default('transfer'),
          })
        )
        .default([]),
    }),
    await safeJson(c)
  );
  const report = await transferProject(body as Parameters<typeof transferProject>[0], p.name);
  return c.json(ok(report, c.get('requestId') ?? ''), 201);
});

// ---- Brain ----
api.get('/api/v1/brain/export', async (c) => {
  await requireScope(c, 'brain:admin');
  const data = await exportBrain();
  return c.json(ok(data, c.get('requestId') ?? ''));
});

api.post('/api/v1/brain/import', async (c) => {
  const p = await requireScope(c, 'brain:admin');
  const report = await importBrain(await safeJson(c), p.name);
  return c.json(ok(report, c.get('requestId') ?? ''), 201);
});

api.post('/api/v1/brain/compress', async (c) => {
  const p = await requireScope(c, 'brain:admin');
  const report = await compressBrain(p.name);
  return c.json(ok(report, c.get('requestId') ?? ''));
});

api.post('/api/v1/brain/embeddings/rebuild', async (c) => {
  await requireScope(c, 'brain:admin');
  const report = await rebuildEmbeddings();
  return c.json(ok(report, c.get('requestId') ?? ''));
});

// ---- Vault ----
api.get('/api/v1/vault/notes', async (c) => {
  await requireScope(c, 'vault:read');
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 200)));
  const items = await db.query.notes.findMany({ limit, orderBy: notes.indexedAt });
  return c.json(ok({ items, total: items.length, limit }, c.get('requestId') ?? ''));
});

api.post('/api/v1/vault/sync', async (c) => {
  const p = await requireScope(c, 'vault:write');
  const report = await syncVault(p.name);
  return c.json(ok(report, c.get('requestId') ?? ''));
});

api.post('/api/v1/vault/write-back', async (c) => {
  const p = await requireScope(c, 'vault:write');
  const body = parse(
    z.object({ memoryId: z.string().min(1), path: z.string().max(500).optional() }),
    await safeJson(c)
  );
  const report = await writeBack(body.memoryId, body.path, p.name);
  return c.json(ok(report, c.get('requestId') ?? ''));
});

// ---- Audit / ledger ----
api.get('/api/v1/audit', async (c) => {
  await requireScope(c, 'audit:read');
  const result = await verifyAuditChain();
  return c.json(ok(result, c.get('requestId') ?? ''));
});

api.get('/api/v1/ledger', async (c) => {
  await requireScope(c, 'audit:read');
  // Total savings computed in DB (SUM), items are bounded + paginated.
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 100)));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0));
  const [items, sumRow] = await Promise.all([
    db.select().from(tokenLedger).limit(limit).offset(offset),
    db
      .select({
        total: sql<number>`coalesce(sum(tokens_saved), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(tokenLedger),
  ]);
  return c.json(
    ok(
      { items, totalSaved: sumRow[0]?.total ?? 0, total: sumRow[0]?.count ?? 0, limit, offset },
      c.get('requestId') ?? ''
    )
  );
});

// ---- Safety ----
api.get('/api/v1/safety', async (c) => {
  const engaged = await isKillSwitchOn();
  const meta = await db.query.systemMeta.findMany();
  const m = new Map(meta.map((r: { key: string; value: string | null }) => [r.key, r.value]));
  const last = Number(m.get('lastHeartbeat') ?? 0);
  return c.json(
    ok(
      {
        killSwitch: engaged,
        killSwitchReason: m.get('killSwitchReason') ?? '',
        lastHeartbeat: last,
        heartbeatOk: Date.now() - last < 60_000,
        llmMode: llmConfigured() ? 'configured' : 'lexical',
      },
      c.get('requestId') ?? ''
    )
  );
});

api.post('/api/v1/safety/kill-switch', async (c) => {
  const p = await requireScope(c, 'safety:write');
  const input = parse(killSwitchInput, await safeJson(c));
  await setKillSwitch(input.enabled, input.reason, p.name);
  return c.json(ok({ killSwitch: input.enabled }, c.get('requestId') ?? ''));
});

api.post('/api/v1/safety/heartbeat', async (c) => {
  const p = await requireScope(c, 'safety:write');
  const now = Date.now();
  await db
    .insert(systemMeta)
    .values({ key: 'lastHeartbeat', value: String(now), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemMeta.key,
      set: { value: String(now), updatedAt: new Date() },
    });
  return c.json(ok({ lastHeartbeat: now, actor: p.name }, c.get('requestId') ?? ''));
});

// ---- Feedback ----
api.post('/api/v1/feedback', async (c) => {
  const p = await requireScope(c, 'memory:write');
  const input = parse(feedbackInput, await safeJson(c));
  await recordFeedback(input, p.name);
  return c.json(ok({ recorded: true }, c.get('requestId') ?? ''), 201);
});

// ---- Admin: API-key management (brain:admin) ----
api.get('/api/v1/admin/keys', async (c) => {
  await requireScope(c, 'brain:admin');
  const limit = Number(c.req.query('limit')) || 50;
  const offset = Number(c.req.query('offset')) || 0;
  const { items, total } = await listPrincipals(db, { limit, offset });
  return c.json(ok({ items, total, limit, offset }, c.get('requestId') ?? ''));
});

api.post('/api/v1/admin/keys', async (c) => {
  await requireScope(c, 'brain:admin');
  const body = parse(
    z.object({
      name: z.string().trim().min(1).max(80),
      scopes: z
        .array(
          z.enum([
            'memory:read',
            'memory:write',
            'skill:read',
            'skill:write',
            'brain:admin',
            'vault:read',
            'vault:write',
            'safety:write',
            'audit:read',
          ] as [Scope, ...Scope[]])
        )
        .min(1),
    }),
    await safeJson(c)
  );
  const created = await createPrincipal(db, body.name, body.scopes);
  // Raw key shown exactly once; caller must store it.
  return c.json(
    ok(
      {
        id: created.id,
        name: body.name,
        scopes: body.scopes,
        key: created.rawKey,
        note: 'Store this key now — it will not be shown again.',
      },
      c.get('requestId') ?? ''
    ),
    201
  );
});

api.delete('/api/v1/admin/keys/:id', async (c) => {
  await requireScope(c, 'brain:admin');
  const revoked = await revokePrincipal(db, c.req.param('id'));
  if (!revoked)
    return c.json(err('NOT_FOUND', 'Principal not found.', c.get('requestId') ?? ''), 404);
  return c.json(ok({ revoked: true }, c.get('requestId') ?? ''));
});

/* ════════════════════════════════════════════════════════════════
 * Advanced Audit Engine
 * ════════════════════════════════════════════════════════════════ */

api.get('/api/v1/audit/verify', async (c) => {
  await requireScope(c, 'audit:read');
  const result = await verifyAndAutoKill();
  return c.json(ok(result, c.get('requestId') ?? ''));
});

api.post('/api/v1/audit/trajectory', async (c) => {
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

api.post('/api/v1/audit/receipt', async (c) => {
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

/* ════════════════════════════════════════════════════════════════
 * System Health (Extended)
 * ════════════════════════════════════════════════════════════════ */

api.get('/api/v1/health/detailed', async (c) => {
  await requireScope(c, 'memory:read');
  const [dbOk, pgvector, audit] = await Promise.all([
    dbReachable(),
    isPgvectorInstalled(),
    verifyAuditChain(),
  ]);
  return c.json(
    ok(
      {
        db: dbOk ? 'ok' : 'down',
        pgvector: pgvector ? 'installed' : 'missing',
        recallMode: pgvector && llmConfigured() ? 'semantic_rrf' : 'lexical_bm25',
        audit: audit.valid ? 'valid' : 'BROKEN',
        auditEntries: audit.total,
        sseClients: getSSEClientCount(),
      },
      c.get('requestId') ?? ''
    )
  );
});

/* ════════════════════════════════════════════════════════════════
 * Analytics Dashboard
 * ════════════════════════════════════════════════════════════════ */

api.get('/api/v1/analytics', async (c) => {
  await requireScope(c, 'audit:read');
  const c1 = sql<number>`count(*)::int`;
  const sum = sql<number>`coalesce(sum(tokens_saved), 0)::int`;

  // Last 30 days of token ledger activity, grouped by day
  const dailyActivity = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', created_at), 'YYYY-MM-DD')`.as('day'),
      events: c1,
      tokensSaved: sum,
    })
    .from(tokenLedger)
    .where(sql`created_at > now() - interval '30 days'`)
    .groupBy(sql`date_trunc('day', created_at)`)
    .orderBy(sql`date_trunc('day', created_at)`);

  // Tool call breakdown from audit log
  const toolCalls = await db
    .select({
      action: auditLog.action,
      count: c1,
    })
    .from(auditLog)
    .where(sql`action LIKE 'agent.%' OR action LIKE 'task.%' OR action LIKE 'recall.%'`)
    .groupBy(auditLog.action)
    .orderBy(sql`count(*) DESC`)
    .limit(20);

  // Agent activity
  const agentActivity = await db
    .select({
      status: agentsTable.status,
      count: c1,
    })
    .from(agentsTable)
    .groupBy(agentsTable.status);

  // Single query for all totals (replaces 6 sequential COUNT queries)
  const totalsQuery = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM memories) AS memories,
      (SELECT count(*)::int FROM skills) AS skills,
      (SELECT count(*)::int FROM audit_log) AS audit,
      (SELECT coalesce(sum(tokens_saved), 0)::int FROM token_ledger) AS tokens_saved,
      (SELECT count(*)::int FROM agents) AS agents,
      (SELECT count(*)::int FROM agent_tasks) AS tasks
  `);

  const t: Record<string, unknown> =
    (Array.isArray(totalsQuery) ? totalsQuery[0] : totalsQuery) ?? {};

  return c.json(
    ok(
      {
        totals: {
          memories: Number(t.memories ?? 0),
          skills: Number(t.skills ?? 0),
          audit: Number(t.audit ?? 0),
          tokensSaved: Number(t.tokens_saved ?? 0),
          agents: Number(t.agents ?? 0),
          tasks: Number(t.tasks ?? 0),
        },
        dailyActivity,
        toolCalls,
        agentActivity,
      },
      c.get('requestId') ?? ''
    )
  );
});

/* ════════════════════════════════════════════════════════════════
 * Neural Skill Compilation (Self-Evolving Engine)
 * ════════════════════════════════════════════════════════════════ */

api.get('/api/v1/compiled-scripts', async (c) => {
  await requireScope(c, 'memory:read');
  const items = await listCompiledScripts();
  return c.json(ok({ items }, c.get('requestId') ?? ''));
});

api.post('/api/v1/compiled-scripts/compile', async (c) => {
  const p = await requireScope(c, 'brain:admin');
  const result = await runCompilationPipeline(p.id);
  if (result.activated > 0) {
    broadcastSSE({
      type: 'audit.appended',
      data: { event: 'skill.compiled', activated: result.activated },
      timestamp: Date.now(),
    });
  }
  return c.json(ok(result, c.get('requestId') ?? ''));
});
