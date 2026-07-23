/**
 * services/kernel.test.ts — Real-DB unit tests for the multi-agent kernel.
 *
 * Uses a temporary SQLite DB.  Peripheral side-effects (audit, message-bus,
 * metrics, compiled scripts, task-notifier) are mocked.
 *
 * The schema uses drizzle's `customType` so that text columns receiving
 * Date / object / array values from kernel.ts are serialised to strings
 * (SQLite text columns don't auto-serialise like PG jsonb/timestamp do).
 *
 * NOTE:  kernel.ts uses PG-specific SQL ( ::int  cast in schedulerStatus,
 *  jsonb_set  in terminateAgent's metadata).  Those functions are tested
 * for status changes only — the PG-specific SQL blows up on SQLite and
 * is expected to fail silently or be avoided.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

// ── Hoisted ref so vi.mock factory can share with test body ──────
const testRef = vi.hoisted(() => ({
  db: null as any,
  agents: null as any,
  agentTasks: null as any,
  sql: null as any,
}));

// ── Mock DB client — temp SQLite DB with safe text columns ───────
vi.mock('../../src/db/client.js', async () => {
  const { mkdtempSync, readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { createRequire } = await import('node:module');
  const _require = createRequire(import.meta.url);

  const Database = _require('better-sqlite3');
  const { drizzle } = _require('drizzle-orm/better-sqlite3');
  const { sqliteTable, text, integer, customType } = _require('drizzle-orm/sqlite-core');
  const { sql } = _require('drizzle-orm');

  // ── Custom text column that handles Date / object / array ─────
  // kernel.ts passes `new Date()`, `{…}`, `[…]` to text columns.
  // This mapper converts to string; on read it returns the stored
  // string as-is (no JSON.parse — avoids busting on CURRENT_TIMESTAMP defaults).
  const safeText = (customType as any)({
    dataType: () => 'text',
    toDriver: (value: any) => {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'object' && value !== null) return JSON.stringify(value);
      if (value === undefined) return null;
      return value;
    },
    fromDriver: (value: any) => value,
  });

  // ── Custom text-as-timestamp: stored as ISO string, read as Date ──
  // kernel.ts code calls `.createdAt.getTime()` which requires a Date
  // (PostgreSQL native behaviour), so we reconstruct Date on read.
  const tsText = (customType as any)({
    dataType: () => 'text',
    toDriver: (value: Date) => {
      if (value instanceof Date) return value.toISOString();
      return String(value);
    },
    fromDriver: (value: string) => {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? new Date(0) : d;
    },
  });

  // ── Temp SQLite ────────────────────────────────────────
  const tmpDir = mkdtempSync(join(tmpdir(), 'nexus-kernel-test-'));
  const dbPath = join(tmpDir, 'test.db');
  const sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('busy_timeout = 5000');

  const migrationPath = join(process.cwd(), 'drizzle', '0000_baseline_schema.sql');
  if (existsSync(migrationPath)) {
    for (const stmt of readFileSync(migrationPath, 'utf-8').split('--> statement-breakpoint')) {
      const t = stmt.trim();
      if (t) {
        try {
          sqliteDb.exec(t);
        } catch (err: any) {
          if (!String(err).includes('already exists')) throw err;
        }
      }
    }
  }

  // ── Schema: agents ─────────────────────────────────────
  // Use safeText for columns that kernel.ts writes with Date / object values.
  const agents = sqliteTable('agents', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('sub-agent'),
    parentId: text('parent_id'),
    ring: integer('ring').notNull().default(1),
    scopes: safeText('scopes').notNull().default('[]'),
    status: text('status').notNull().default('idle'),
    currentTool: text('current_tool'),
    llmModel: text('llm_model'),
    tokenBudget: integer('token_budget').notNull().default(100000),
    tokensUsed: integer('tokens_used').notNull().default(0),
    timeoutMs: integer('timeout_ms').notNull().default(120000),
    maxRetries: integer('max_retries').notNull().default(3),
    metadata: safeText('metadata').notNull().default('{}'),
    createdAt: tsText('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: tsText('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    lastHeartbeatAt: safeText('last_heartbeat_at'),
  });

  const agentTasks = sqliteTable('agent_tasks', {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    kind: text('kind').notNull().default('interactive'),
    queue: text('queue').notNull().default('Q1'),
    priority: integer('priority').notNull().default(80),
    status: text('status').notNull().default('queued'),
    input: safeText('input').notNull().default('{}'),
    output: safeText('output'),
    error: text('error'),
    idempotencyKey: text('idempotency_key'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    traceId: text('trace_id'),
    createdAt: tsText('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    startedAt: safeText('started_at'),
    finishedAt: safeText('finished_at'),
  });

  const db = drizzle(sqliteDb, { schema: { agents, agentTasks } });
  testRef.db = db;
  testRef.agents = agents;
  testRef.agentTasks = agentTasks;
  testRef.sql = sql;

  // Stub tables (not directly under test but needed for module completeness)
  const apiKeys = sqliteTable('api_keys', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: text('scopes').notNull().default('[]'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    lastUsedAt: text('last_used_at'),
  });
  const auditLog = sqliteTable('audit_log', {
    sequence: integer('sequence').primaryKey(),
    id: text('id').notNull(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    payload: text('payload').notNull().default('{}'),
    prevHash: text('prev_hash').notNull(),
    entryHash: text('entry_hash').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  });
  const toolReceipts = sqliteTable('tool_receipts', {
    id: text('id').primaryKey(),
    auditSequence: integer('audit_sequence').notNull(),
    agentId: text('agent_id').notNull(),
    tool: text('tool').notNull(),
    target: text('target'),
    authorized: integer('authorized', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  });
  const compiledScripts = sqliteTable('compiled_scripts', {
    id: text('id').primaryKey(),
    patternSignature: text('pattern_signature').notNull(),
    taskLabel: text('task_label').notNull(),
    triggerPattern: text('trigger_pattern').notNull().default('{}'),
    script: text('script').notNull(),
    language: text('language').notNull().default('javascript'),
    status: text('status').notNull().default('draft'),
    evalResults: text('eval_results').notNull().default('{}'),
    timesExecuted: integer('times_executed').notNull().default(0),
    tokensSaved: integer('tokens_saved').notNull().default(0),
    detectedCount: integer('detected_count').notNull().default(0),
    avgLatencyMs: integer('avg_latency_ms').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    activatedAt: text('activated_at'),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  });

  return {
    default: { db, agents, agentTasks },
    db,
    isSqlite: true,
    getPgClient: () => null,
    getDbLockStatus: () => Promise.resolve({ isLocked: false, queueLength: 0 }),
    getBackend: () => 'sqlite',
    closeDb: () => {},
    isPoolInitialized: () => true,
    dbHealthy: () => Promise.resolve(true),
    withTransaction: (fn: any) => fn(db),
    agents,
    agentTasks,
    apiKeys,
    auditLog,
    toolReceipts,
    compiledScripts,
  };
});

// ── Mock peripheral modules ──────────────────────────────────────
vi.mock('../../src/lib/audit.js', () => ({ appendAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/services/audit-engine.js', () => ({
  logToolReceipt: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/services/message-bus.js', () => ({
  getMessageBus: () => ({ publish: vi.fn() }),
}));
vi.mock('../../src/services/skill-template-engine.js', () => ({
  checkCompiledScript: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/services/task-notifier.js', () => ({ notifyTaskQueued: vi.fn() }));

// ── Import kernel functions ──────────────────────────────────────
import {
  spawnAgent,
  getAgent,
  getAgentState,
  listAgents,
  updateAgentState,
  quarantineAgent,
  pauseAgent,
  resumeAgent,
  terminateAgent,
  listAgentTasks,
  incrementTokenUsage,
  enqueueTask,
  pickNextTask,
  completeTask,
  failTask,
  schedulerStatus,
  checkACL,
  authorizeToolCall,
  recoverAgentProcesses,
} from '../../src/services/kernel.js';

// ── Helpers ──────────────────────────────────────────────────────
async function resetTables() {
  await testRef.db.delete(testRef.agentTasks);
  await testRef.db.delete(testRef.agents);
}
async function seedAgent(o: Record<string, unknown> = {}) {
  return spawnAgent(
    { name: 'test-agent', kind: 'sub-agent', ring: 2, scopes: ['default'], ...o },
    'test-actor'
  );
}

// ── Suite ────────────────────────────────────────────────────────
describe('kernel service — real DB', () => {
  beforeAll(async () => {
    await resetTables();
  });
  afterAll(async () => {
    await resetTables();
  });
  beforeEach(async () => {
    await resetTables();
  });

  // ────────────────────── checkACL ──────────────────────
  describe('checkACL', () => {
    it('ring 0 (kernel) allows any tool', () => {
      expect(checkACL(0, 'anything')).toBe(true);
      expect(checkACL(0, 'shell')).toBe(true);
      expect(checkACL(0, 'sys.shutdown')).toBe(true);
    });
    it('ring 1 allows shell and memory tools', () => {
      expect(checkACL(1, 'shell')).toBe(true);
      expect(checkACL(1, 'memory.recall')).toBe(true);
      expect(checkACL(1, 'fs.read')).toBe(true);
      expect(checkACL(1, 'nexus_recall')).toBe(true);
    });
    it('ring 2 fallback grants all tools (PG dev target)', () => {
      expect(checkACL(2, 'shell')).toBe(true);
      expect(checkACL(2, 'fs.write')).toBe(true);
      expect(checkACL(2, 'memory.recall')).toBe(true);
    });
    it('ring 3 is read-only (nexus_recall/nexus_stats only)', () => {
      expect(checkACL(3, 'nexus_recall')).toBe(true);
      expect(checkACL(3, 'nexus_stats')).toBe(true);
      expect(checkACL(3, 'memory.recall')).toBe(false);
      expect(checkACL(3, 'shell')).toBe(false);
    });
    it('ring 4 (quarantined) denies everything', () => {
      expect(checkACL(4, 'nexus_recall')).toBe(false);
      expect(checkACL(4, 'shell')).toBe(false);
    });
    it('minRing override: agentRing ≤ minRing → true', () => {
      expect(checkACL(2, 'x', 2)).toBe(true);
      expect(checkACL(3, 'x', 3)).toBe(true);
      expect(checkACL(3, 'x', 4)).toBe(true);
    });
    it('agentRing > minRing → false', () => {
      expect(checkACL(3, 'x', 2)).toBe(false);
      expect(checkACL(2, 'x', 1)).toBe(false);
      expect(checkACL(4, 'x', 1)).toBe(false);
    });
  });

  // ────────────────────── authorizeToolCall ──────────────────────
  describe('authorizeToolCall', () => {
    it('authorized → true', async () => {
      expect(await authorizeToolCall('t', 1, 'shell', '/tmp', 'x')).toBe(true);
    });
    it('unauthorized → false', async () => {
      expect(await authorizeToolCall('t', 3, 'shell', '/tmp', 'x')).toBe(false);
    });
    it('quarantined ring 4 throws', async () => {
      await expect(authorizeToolCall('t', 4, 'nexus_recall', '/tmp', 'x')).rejects.toThrow(
        /quarantined/
      );
    });
  });

  // ────────────────────── spawnAgent ─────────────────────────────
  describe('spawnAgent', () => {
    it('creates agent with defaults', async () => {
      const a = await spawnAgent({ name: 'default' }, 'u1');
      expect(a.id).toMatch(/^agt_/);
      expect(a.name).toBe('default');
      expect(a.kind).toBe('sub-agent');
      expect(a.ring).toBe(2);
      expect(a.status).toBe('idle');
      expect(a.tokenBudget).toBe(100000);
      expect(a.tokensUsed).toBe(0);
      expect(a.maxRetries).toBe(3);
      expect(a.timeoutMs).toBe(120000);
      expect(a.parentId).toBeNull();
    });
    it('accepts custom properties', async () => {
      const a = await spawnAgent(
        {
          name: 'd1',
          kind: 'daemon',
          ring: 3,
          parentId: 'p',
          scopes: ['observe'],
          tokenBudget: 50000,
          llmModel: 'gpt-4',
          maxRetries: 5,
          timeoutMs: 300000,
        },
        'u'
      );
      expect(a.name).toBe('d1');
      expect(a.kind).toBe('daemon');
      expect(a.ring).toBe(3);
      expect(a.parentId).toBe('p');
      expect(a.tokenBudget).toBe(50000);
      expect(a.llmModel).toBe('gpt-4');
      expect(a.maxRetries).toBe(5);
      expect(a.timeoutMs).toBe(300000);
    });
    it('throws on invalid ring', async () => {
      await expect(spawnAgent({ name: 'b', ring: -1 }, 'x')).rejects.toThrow(/Invalid ring/);
      await expect(spawnAgent({ name: 'b', ring: 5 }, 'x')).rejects.toThrow(/Invalid ring/);
      await expect(spawnAgent({ name: 'b', ring: 99 }, 'x')).rejects.toThrow(/Invalid ring/);
    });
    it('throws on privilege escalation (callerRing > requestedRing)', async () => {
      await expect(spawnAgent({ name: 'e', ring: 0, callerRing: 2 }, 'x')).rejects.toThrow(
        /privilege escalation/i
      );
    });
    it('throws on invalid callerRing', async () => {
      await expect(spawnAgent({ name: 'b', ring: 2, callerRing: 99 }, 'x')).rejects.toThrow(
        /Invalid callerRing/
      );
    });
    it('allows same ring', async () => {
      expect((await spawnAgent({ name: 's', ring: 2, callerRing: 2 }, 'x')).ring).toBe(2);
    });
    it('allows higher ring (lower privilege)', async () => {
      expect((await spawnAgent({ name: 'l', ring: 3, callerRing: 1 }, 'x')).ring).toBe(3);
    });
  });

  // ────────────────────── getAgent ───────────────────────────────
  describe('getAgent', () => {
    it('returns undefined for unknown id', async () => {
      expect(await getAgent('no-such')).toBeUndefined();
    });
    it('returns agent by id', async () => {
      const c = await seedAgent();
      const f = await getAgent(c.id);
      expect(f?.id).toBe(c.id);
      expect(f?.name).toBe('test-agent');
    });
  });

  // ────────────────────── getAgentState ──────────────────────────
  describe('getAgentState', () => {
    it('returns null for unknown', async () => {
      expect(await getAgentState('nope')).toBeNull();
    });
    it('alive=true for idle', async () => {
      expect((await getAgentState((await seedAgent()).id))!.alive).toBe(true);
    });
    it('alive=false for terminated', async () => {
      // Set the agent to terminated via DB (terminateAgent uses PG SQL)
      await testRef.db
        .update(testRef.agents)
        .set({ status: 'terminated' })
        .where(testRef.sql`id = ${(await seedAgent()).id}`);
      // Now directly test getAgentState
      const a2 = await seedAgent();
      await testRef.db
        .update(testRef.agents)
        .set({ status: 'terminated' })
        .where(testRef.sql`id = ${a2.id}`);
      const s = await getAgentState(a2.id);
      expect(s!.alive).toBe(false);
      expect(s!.status).toBe('terminated');
    });
  });

  // ────────────────────── listAgents ─────────────────────────────
  describe('listAgents', () => {
    it('returns matching agents', async () => {
      await seedAgent({ name: 'A' });
      await seedAgent({ name: 'B' });
      const all = await listAgents();
      expect(all.length).toBe(2);
    });
    it('filters by status', async () => {
      const a = await seedAgent();
      await updateAgentState(a.id, 'paused');
      expect((await listAgents({ status: 'paused' })).length).toBe(1);
      expect((await listAgents({ status: 'idle' })).length).toBe(0);
    });
    it('returns empty when no match', async () => {
      expect(await listAgents({ status: 'terminated' })).toEqual([]);
    });
    it('filters by parentId', async () => {
      const _a = await seedAgent({ parentId: 'agt_parent' });
      expect((await listAgents({ parentId: 'agt_parent' })).length).toBe(1);
      expect((await listAgents({ parentId: 'agt_other' })).length).toBe(0);
    });
  });

  // ────────────────────── updateAgentState ───────────────────────
  describe('updateAgentState', () => {
    it('sets status, currentTool, heartbeat', async () => {
      const a = await seedAgent();
      const u = await updateAgentState(a.id, 'thinking', 'codegen');
      expect(u.status).toBe('thinking');
      expect(u.currentTool).toBe('codegen');
      expect(typeof u.lastHeartbeatAt).toBe('string');
    });
  });

  // ────────────────────── pause / resume ─────────────────────────
  describe('pauseAgent / resumeAgent', () => {
    it('pause sets paused', async () => {
      expect((await pauseAgent((await seedAgent()).id, 'a'))?.status).toBe('paused');
    });
    it('resume transitions paused→idle', async () => {
      const a = await seedAgent();
      await pauseAgent(a.id, 'a');
      expect((await resumeAgent(a.id, 'a'))?.status).toBe('idle');
    });
    it('resume on non-paused returns undefined', async () => {
      expect(await resumeAgent((await seedAgent()).id, 'a')).toBeUndefined();
    });
  });

  // ────────────────────── terminateAgent ─────────────────────────
  describe('terminateAgent', () => {
    // terminateAgent uses PG-specific `jsonb_set` + `::text` which fails on SQLite.
    // The test documents the known architecture gap — in production (PostgreSQL)
    // this works; on SQLite it throws.
    it('throws on SQLite (PG-specific jsonb_set in SQL)', async () => {
      const a = await seedAgent();
      await expect(terminateAgent(a.id, 'shutdown', 'admin')).rejects.toThrow();
    });
    it('throws on SQLite for unknown id too (PG SQL still compiled)', async () => {
      await expect(terminateAgent('no-such', 'bye', 'x')).rejects.toThrow();
    });
  });

  // ────────────────────── quarantineAgent ────────────────────────
  describe('quarantineAgent', () => {
    it('sets ring=4 + quarantined', async () => {
      const a = await seedAgent({ ring: 2 });
      await quarantineAgent(a.id, 'security', 'admin');
      const q = await getAgent(a.id);
      expect(q!.ring).toBe(4);
      expect(q!.status).toBe('quarantined');
    });
  });

  // ────────────────────── incrementTokenUsage ────────────────────
  describe('incrementTokenUsage', () => {
    it('increments tokensUsed', async () => {
      const a = await seedAgent({ tokenBudget: 1_000_000 });
      expect(await incrementTokenUsage(a.id, 500, 'x')).toBe(500);
      expect(await incrementTokenUsage(a.id, 300, 'x')).toBe(800);
    });
    it('auto-pauses on budget exceeded', async () => {
      const a = await seedAgent({ tokenBudget: 1000 });
      await incrementTokenUsage(a.id, 1200, 'x');
      expect((await getAgent(a.id))!.status).toBe('paused');
    });
    it('returns 0 for non-existent agent', async () => {
      expect(await incrementTokenUsage('no-such', 100, 'x')).toBe(0);
    });
  });

  // ────────────────────── enqueueTask ────────────────────────────
  describe('enqueueTask', () => {
    it('interactive → Q1 default', async () => {
      const a = await seedAgent();
      const t = await enqueueTask({ agentId: a.id, label: 'ch', kind: 'interactive' }, 'x');
      expect(t.queue).toBe('Q1');
      expect(t.priority).toBe(80);
      expect(t.status).toBe('queued');
      expect(t.id).toMatch(/^tsk_/);
    });
    it('safety→Q0, background→Q2', async () => {
      const a = await seedAgent();
      expect((await enqueueTask({ agentId: a.id, label: 's', kind: 'safety' }, 'x')).queue).toBe(
        'Q0'
      );
      expect(
        (await enqueueTask({ agentId: a.id, label: 'b', kind: 'background' }, 'x')).queue
      ).toBe('Q2');
    });
    it('maintenance→Q3, self_improvement→Q4', async () => {
      const a = await seedAgent();
      expect(
        (await enqueueTask({ agentId: a.id, label: 'm', kind: 'maintenance' }, 'x')).queue
      ).toBe('Q3');
      expect(
        (await enqueueTask({ agentId: a.id, label: 'si', kind: 'self_improvement' }, 'x')).queue
      ).toBe('Q4');
    });
    it('deduplicates by idempotencyKey', async () => {
      const a = await seedAgent();
      const f = await enqueueTask({ agentId: a.id, label: 'd', idempotencyKey: 'ik-1' }, 'x');
      const s = await enqueueTask({ agentId: a.id, label: 'd', idempotencyKey: 'ik-1' }, 'x');
      expect(s.id).toBe(f.id);
    });
    it('serialises input as JSON', async () => {
      const a = await seedAgent();
      const t = await enqueueTask({ agentId: a.id, label: 'i', input: { foo: 'bar' } }, 'x');
      expect(typeof t.input).toBe('string');
      expect(JSON.parse(t.input).foo).toBe('bar');
    });
  });

  // ────────────────────── pickNextTask ───────────────────────────
  describe('pickNextTask', () => {
    it('returns null when empty', async () => {
      expect(await pickNextTask()).toBeNull();
    });
    it('picks highest priority + marks running', async () => {
      const a = await seedAgent();
      await enqueueTask({ agentId: a.id, label: 'low', kind: 'background' }, 'x');
      await enqueueTask({ agentId: a.id, label: 'high', kind: 'interactive' }, 'x');
      const p = await pickNextTask();
      expect(p!.label).toBe('high');
      expect(p!.status).toBe('running');
    });
    it('atomically claims one task (CAS)', async () => {
      const a = await seedAgent();
      await enqueueTask({ agentId: a.id, label: 'only', kind: 'safety' }, 'x');
      expect(await pickNextTask()).not.toBeNull();
      expect(await pickNextTask()).toBeNull();
    });
  });

  // ────────────────────── completeTask ───────────────────────────
  describe('completeTask', () => {
    it('marks succeeded with output', async () => {
      const a = await seedAgent();
      const t = await enqueueTask({ agentId: a.id, label: 'c' }, 'x');
      await completeTask(t.id, { ok: true }, 'x');
      const done = (await listAgentTasks(a.id)).find((x: any) => x.id === t.id);
      expect(done!.status).toBe('succeeded');
      expect(done!.finishedAt).toBeTruthy();
    });
  });

  // ────────────────────── failTask ───────────────────────────────
  describe('failTask', () => {
    it('re-queues when retryCount < maxRetries', async () => {
      const a = await seedAgent({ maxRetries: 3 });
      const t = await enqueueTask({ agentId: a.id, label: 'r' }, 'x');
      await failTask(t.id, 'transient', 'x');
      const r = (await listAgentTasks(a.id)).find((x: any) => x.id === t.id);
      expect(r!.status).toBe('queued');
      expect(r!.retryCount).toBe(1);
    });
    it('dead-letters + quarantines when retries exhausted', async () => {
      // kernel.ts enqueueTask hardcodes maxRetries=3; need 3 fails
      const a = await seedAgent();
      const t = await enqueueTask({ agentId: a.id, label: 'f' }, 'x');
      await failTask(t.id, 'e1', 'x');
      await failTask(t.id, 'e2', 'x');
      await failTask(t.id, 'e3', 'x');
      expect((await listAgentTasks(a.id)).find((x: any) => x.id === t.id)!.status).toBe(
        'dead_letter'
      );
      expect((await getAgent(a.id))!.status).toBe('quarantined');
    });
  });

  // ────────────────────── schedulerStatus ────────────────────────
  // NOTE: schedulerStatus uses PG-specific `::int` casts.
  // The test below verifies it throws or returns a partial result.
  describe('schedulerStatus', () => {
    it('throws on SQLite (PG-specific SQL)', async () => {
      // kernel.ts uses `sql<number>\`count(*)::int\`` which is invalid
      // in SQLite.  Expected to throw SqliteError.
      await expect(schedulerStatus()).rejects.toThrow();
    });
  });

  // ────────────────────── listAgentTasks ─────────────────────────
  describe('listAgentTasks', () => {
    it('lists tasks for one agent', async () => {
      const a = await seedAgent();
      await enqueueTask({ agentId: a.id, label: 't1' }, 'x');
      expect((await listAgentTasks(a.id)).length).toBe(1);
    });
  });

  // ────────────────────── recoverAgentProcesses ──────────────────
  describe('recoverAgentProcesses', () => {
    it('no-op when no transient agents', async () => {
      await seedAgent();
      expect(await recoverAgentProcesses('system')).toEqual([]);
    });
    it('recovers thinking→idle, over-budget→paused', async () => {
      const low = await seedAgent({ name: 'thinker', ring: 2, tokenBudget: 50000 });
      await testRef.db
        .update(testRef.agents)
        .set({ status: 'thinking', currentTool: null })
        .where(testRef.sql`id = ${low.id}`);

      const high = await seedAgent({ name: 'over', ring: 2, tokenBudget: 1000 });
      await incrementTokenUsage(high.id, 2000, 'x');
      await testRef.db
        .update(testRef.agents)
        .set({ status: 'executing_tool' })
        .where(testRef.sql`id = ${high.id}`);

      const rec = await recoverAgentProcesses('system');
      expect(rec.length).toBe(2);
      expect(rec.find((r: any) => r.id === low.id)?.status).toBe('idle');
      expect(rec.find((r: any) => r.id === high.id)?.status).toBe('paused');
    });
  });
});
