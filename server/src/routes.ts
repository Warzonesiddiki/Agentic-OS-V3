/**
 * routes.ts — versioned REST API (/api/v1) — thin handlers over services.
 * Each route validates with Zod, enforces auth + scope, and returns an envelope.
 * Per Phase 2.2: NO direct database calls — all persistence via services.
 */
import { Hono } from 'hono';
import { ok, err } from './lib/envelope.js';
import type { NexusEnv } from './lib/hono-env.js';
import { requireScope, safeJson, parse, fail } from './lib/auth-context.js';
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
import { isKillSwitchOn } from './services/safety.service.js';
import {
  createMemory,
  updateMemory,
  deleteMemory,
  checkpoint,
  captureSession,
} from './services/memory.service.js';
import { createSkill, updateSkill, deleteSkill, recordOutcome } from './services/skill.service.js';
import { transferProject } from './services/project.service.js';
import { recordFeedback } from './services/feedback.service.js';
import { setKillSwitch } from './services/session.service.js';
import { recall } from './services/recall.js';
import { exportBrain, importBrain, compressBrain } from './services/brain.js';
import { syncVault, writeBack } from './services/vault.js';
import { rebuildEmbeddings } from './services/embeddings.js';
import { dbReachable, isPgvectorInstalled } from './setup.js';
import { llmConfigured, getEnv } from './lib/env.js';
import { z } from 'zod';
import { broadcastSSE, getSSEClientCount } from './services/sse-bus.js';
import { runCompilationPipeline, listCompiledScripts } from './services/skill-template-engine.js';
import { metricsOutput, metricsContentType } from './services/metrics.js';
import {
  getSystemCounts,
  listMemoriesPaginated,
  getMemoryById,
  listSkillsPaginated,
  getSkillById,
  listProjectsPaginated,
  listVaultNotesPaginated,
  listLedgerEntries,
  getSystemMetaMap,
  recordHeartbeat,
  getAuditCount,
} from './services/system.service.js';
import { auditRouter } from './routes/audit-routes.js';
import { analyticsRouter } from './routes/analytics.js';
import { agents } from './routes/agents.js';
import { automation } from './routes/automation.js';
import { sse } from './routes/sse.js';
import { v3upgrade } from './routes/v3-upgrade.js';
import { agentLifecycle } from './routes/agent-lifecycle.js';
import { kernelRouter } from './routes/kernel.js';
import { a2aRouter } from './routes/a2a.js';
import { marketplace } from './routes/marketplace-routes.js';
import { selfOptRouter } from './routes/self-opt.js';
import { perfRoute } from './routes/perf.js';
import { enterpriseRouter } from './routes/enterprise.js';
import { kernelIntrospectRouter } from './routes/kernel-introspect.js';
import { memoryGraph } from './routes/memory-graph.js';
import { memoryHealth } from './routes/memory-health.js';
import { memoryNlQuery } from './routes/memory-nl-query.js';
import { router as memoryBatchRouter } from './routes/memory-batch.js';
import { router as memorySearchSuggestRouter } from './routes/memory-search-suggest.js';
import { memoryDedup } from './routes/memory-dedup.js';
import { memoryContradiction } from './routes/memory-contradiction.js';
import { createR1Router } from './routes/r1.js';
import { createSqlR1Runtime } from './services/r1-runtime.js';
import { createApplicationSqlExecutor } from './db/client.js';

export const api = new Hono<NexusEnv>();

api.onError((e, c) => fail(c, e));

// Mount sub-routers (extracted domain modules)
api.route('/', agents);
api.route('/', automation);
api.route('/', sse);
api.route('/', v3upgrade);
api.route('/', agentLifecycle);
api.route('/', kernelRouter);
api.route('/', a2aRouter);
api.route('/', auditRouter);
api.route('/', analyticsRouter);
// Phase 19 — Ecosystem & Marketplace
api.route('/marketplace', marketplace);
// Phase 17 — Enterprise Features (OIDC/SAML, RBAC, multi-tenant, billing)
api.route('/enterprise', enterpriseRouter);

// Phase 11/12 — Kernel introspection + Advanced Memory System routes
api.route('/', kernelIntrospectRouter);
api.route('/', memoryGraph);
api.route('/', memoryHealth);
api.route('/', memoryNlQuery);
api.route('/', memoryBatchRouter);
api.route('/', memorySearchSuggestRouter);
api.route('/api/memories', memoryDedup);
api.route('/api/memories', memoryContradiction);

// Phase 18 — AI-Native Self-Optimization (safe-exploration control surface)
api.route('/', selfOptRouter);
// Phase 15 — Performance & Scalability (stateless pool, replica router, cache)
api.route('/perf', perfRoute);
// Governed R1 project/task API: persistence remains behind the shared repository boundary.
api.route('/api/v1/r1', createR1Router(createSqlR1Runtime(createApplicationSqlExecutor())));
// Start the safe-exploration tick (idempotent; defaults to dry-run / advisory).
void import('./services/self-opt/bootstrap.js').then((m) => m.startSelfOptTick());
// Start the safe-exploration tick (idempotent; defaults to dry-run / advisory).
void import('./services/self-opt/bootstrap.js').then((m) => m.startSelfOptTick());
// Start the safe-exploration tick (idempotent; defaults to dry-run / advisory).
void import('./services/self-opt/bootstrap.js').then((m) => m.startSelfOptTick());

import { getDesktopActuatorSync } from './services/desktop-actuator.js';

// ---- Public ----
api.get('/api/v1/health', async (c) => {
  const dbOk = await dbReachable();
  const killSwitch = await isKillSwitchOn();
  const actuator = getDesktopActuatorSync();
  const status = dbOk && !killSwitch ? 'ok' : killSwitch ? 'locked' : 'degraded';
  const code = dbOk ? 200 : 503;
  return c.json(
    ok(
      {
        status,
        timestamp: Date.now(),
        components: {
          db: dbOk ? 'ok' : 'down',
          killSwitch,
          desktopActuator: actuator.mode,
        },
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

api.get('/metrics', async (c) => {
  c.header('Content-Type', metricsContentType());
  return c.body(await metricsOutput());
});

api.get('/api/v1/system', async (c) => {
  const e = getEnv();
  const counts = await getSystemCounts();
  return c.json(
    ok(
      {
        version: '2.0.0',
        nodeEnv: e.NODE_ENV,
        llmMode: llmConfigured() ? 'configured' : 'lexical',
        rateLimitPerMinute: e.NEXUS_RATE_LIMIT_PER_MINUTE,
        maxBodyBytes: e.NEXUS_MAX_BODY_BYTES,
        counts,
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
  const rawItems = await listMemoriesPaginated(limit, cursor);
  const hasMore = rawItems.length > limit;
  const items = hasMore ? rawItems.slice(0, limit) : rawItems;
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
  const m = await getMemoryById(c.req.param('id'));
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
  const items = await listSkillsPaginated(limit, offset);
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
  const s = await getSkillById(c.req.param('id'));
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
  const items = await listProjectsPaginated(limit, offset);
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
  const items = await listVaultNotesPaginated(limit);
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

// ---- Ledger ----
api.get('/api/v1/ledger', async (c) => {
  await requireScope(c, 'audit:read');
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 100)));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0));
  const { items, totalSaved, totalCount } = await listLedgerEntries(limit, offset);
  return c.json(
    ok(
      { items, totalSaved, total: totalCount, limit, offset },
      c.get('requestId') ?? ''
    )
  );
});

// ---- Safety ----
api.get('/api/v1/safety', async (c) => {
  const engaged = await isKillSwitchOn();
  const metaMap = await getSystemMetaMap();
  const last = Number(metaMap.get('lastHeartbeat') ?? 0);
  return c.json(
    ok(
      {
        killSwitch: engaged,
        killSwitchReason: metaMap.get('killSwitchReason') ?? '',
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
  const result = await recordHeartbeat(p.name);
  return c.json(ok(result, c.get('requestId') ?? ''));
});

// ---- Feedback ----
api.post('/api/v1/feedback', async (c) => {
  const p = await requireScope(c, 'memory:write');
  const input = parse(feedbackInput, await safeJson(c));
  await recordFeedback(input, p.name);
  return c.json(ok({ recorded: true }, c.get('requestId') ?? ''), 201);
});

/* ════════════════════════════════════════════════════════════════
 * System Health (Extended)
 * ════════════════════════════════════════════════════════════════ */

api.get('/api/v1/health/detailed', async (c) => {
  await requireScope(c, 'memory:read');
  const [dbOk, pgvector, auditCount] = await Promise.all([
    dbReachable(),
    isPgvectorInstalled(),
    getAuditCount(),
  ]);
  return c.json(
    ok(
      {
        db: dbOk ? 'ok' : 'down',
        pgvector: pgvector ? 'installed' : 'missing',
        recallMode: pgvector && llmConfigured() ? 'semantic_rrf' : 'lexical_bm25',
        audit: 'valid',
        auditEntries: auditCount,
        sseClients: getSSEClientCount(),
      },
      c.get('requestId') ?? ''
    )
  );
});

// ---- Admin: API-key management (brain:admin) ----

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
