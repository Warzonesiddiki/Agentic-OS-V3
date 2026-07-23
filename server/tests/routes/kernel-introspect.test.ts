/**
 * routes/kernel-introspect.test.ts — Unit test for the kernel introspection
 * route + service.
 *
 * Follows the embeddings.test.ts pattern: a temporary SQLite database seeded
 * via the real migration SQL, with `../../src/db/client.js` mocked to point
 * at it. The HTTP/LLM/auth boundaries are mocked so the snapshot is computed
 * entirely from the in-memory DB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { mkdtempSync, readFileSync, existsSync, unlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as sqliteSchema from '../../src/db/schema-sqlite.js';

// ── Hoisted db ref for vi.mock ────────────────────────────────────
type MockDb = ReturnType<typeof drizzle>;
const mockDbRef = vi.hoisted<{ current: MockDb | null }>(() => ({ current: null }));

vi.mock('../../src/db/client.js', () => {
  const T = sqliteSchema;
  return {
    get db() {
      return mockDbRef.current;
    },
    get isSqlite() {
      return true;
    },
    getPgClient: () => null,
    getDbLockStatus: async () => ({ isLocked: false, queueLength: 0 }),
    getBackend: () => 'sqlite',
    closeDb: async () => {},
    isPoolInitialized: () => true,
    dbHealthy: async () => true,
    withTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(mockDbRef.current as MockDb),
    get memories() {
      return T.memories;
    },
    get skills() {
      return T.skills;
    },
    get notes() {
      return T.notes;
    },
    get projects() {
      return T.projects;
    },
    get apiKeys() {
      return T.apiKeys;
    },
    get agents() {
      return T.agents;
    },
    get agentTasks() {
      return T.agentTasks;
    },
    get ringPolicies() {
      return T.ringPolicies;
    },
    get auditLog() {
      return T.auditLog;
    },
    get feedback() {
      return T.feedback;
    },
    get systemMeta() {
      return T.systemMeta;
    },
    get tokenLedger() {
      return T.tokenLedger;
    },
    get trajectoryLogs() {
      return T.trajectoryLogs;
    },
    get toolReceipts() {
      return T.toolReceipts;
    },
    get cronJobs() {
      return T.cronJobs;
    },
    get spanLogs() {
      return T.spanLogs;
    },
    get stateSnapshots() {
      return T.stateSnapshots;
    },
    get sandboxExecutions() {
      return T.sandboxExecutions;
    },
    get compiledScripts() {
      return T.compiledScripts;
    },
    get metricSnapshots() {
      return T.metricSnapshots;
    },
    get improvementProposals() {
      return T.improvementProposals;
    },
    get plugins() {
      return T.plugins;
    },
    get pluginInstallations() {
      return T.pluginInstallations;
    },
    get pluginReceipts() {
      return T.pluginReceipts;
    },
    get federatedMemoryProofs() {
      return T.federatedMemoryProofs;
    },
    get llmProviderHealth() {
      return T.llmProviderHealth;
    },
    get llmTokenBudgets() {
      return T.llmTokenBudgets;
    },
    get pipelines() {
      return T.pipelines;
    },
    get pipelineRuns() {
      return T.pipelineRuns;
    },
  };
});

// ── Mock auth boundary: satisfy requireScope(memory:read) ─────────
vi.mock('../../src/lib/auth-context.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/lib/auth-context.js')>();
  return {
    ...orig,
    requireScope: vi.fn().mockResolvedValue({
      id: 'test-user',
      name: 'tester',
      scopes: ['memory:read'],
    }),
  };
});

// ── Module under test ──────────────────────────────────────────────
import { kernelIntrospectRouter } from '../../src/routes/kernel-introspect.js';
import {
  getKernelIntrospection,
  type KernelIntrospection,
} from '../../src/services/kernel-introspect-state.js';

// ── Test DB factory ────────────────────────────────────────────────
interface DbHandle {
  raw: Database.Database;
  drizzle: ReturnType<typeof drizzle>;
  dbPath: string;
  dir: string;
}

function buildTestDb(): DbHandle {
  const dir = mkdtempSync(join(tmpdir(), 'kernel-introspect-test-'));
  const dbPath = join(dir, 'test.db');
  const raw = new Database(dbPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');

  const migrationPath = join(process.cwd(), 'drizzle', '0000_baseline_schema.sql');
  if (existsSync(migrationPath)) {
    const sqlText = readFileSync(migrationPath, 'utf-8');
    for (const stmt of sqlText.split('--> statement-breakpoint')) {
      const t = stmt.trim();
      if (t) {
        try {
          raw.exec(t);
        } catch {
          /* already-exists ok */
        }
      }
    }
  }

  // The committed migration is stale relative to the live schema (it omits
  // `ring_policies` and several `agent_tasks` columns added later). Bring the
  // ephemeral test DB up to match what the introspection service queries.
  // Each statement is idempotent — failures (already present) are ignored.
  const extras = [
    `CREATE TABLE IF NOT EXISTS ring_policies (
      id text PRIMARY KEY NOT NULL,
      ring integer NOT NULL UNIQUE,
      tools text DEFAULT '[]' NOT NULL,
      max_concurrency integer DEFAULT 0 NOT NULL,
      max_tokens_per_min integer DEFAULT 0 NOT NULL,
      max_api_calls_per_min integer DEFAULT 0 NOT NULL,
      updated_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
    )`,
    `ALTER TABLE agent_tasks ADD COLUMN deadline text`,
    `ALTER TABLE agent_tasks ADD COLUMN quantum_ms integer`,
    `ALTER TABLE agent_tasks ADD COLUMN checkpoint text DEFAULT '{}' NOT NULL`,
    `ALTER TABLE agent_tasks ADD COLUMN gang_id text`,
    `ALTER TABLE agent_tasks ADD COLUMN estimated_duration_ms integer`,
  ];
  for (const stmt of extras) {
    try {
      raw.exec(stmt);
    } catch {
      /* column/table already present */
    }
  }

  return { raw, drizzle: drizzle(raw, { schema: sqliteSchema }), dbPath, dir };
}

function destroyTestDb(h: DbHandle): void {
  try {
    h.raw.close();
  } catch {
    /* ok */
  }
  for (const s of ['', '-wal', '-shm']) {
    try {
      if (existsSync(h.dbPath + s)) unlinkSync(h.dbPath + s);
    } catch {
      /* ok */
    }
  }
  try {
    rmSync(h.dir, { recursive: true, force: true });
  } catch {
    /* ok */
  }
}

// ── Suite ──────────────────────────────────────────────────────────
describe('kernel introspection', () => {
  let h: DbHandle;

  beforeEach(() => {
    vi.clearAllMocks();
    h = buildTestDb();
    mockDbRef.current = h.drizzle;
  });

  afterEach(() => {
    destroyTestDb(h);
    mockDbRef.current = null;
  });

  it('returns 200 with the expected snapshot shape', async () => {
    const agentId = `agt_${randomUUID()}`;
    h.raw
      .prepare(
        `INSERT INTO agents (id, name, ring, scopes, status) VALUES (?, 'a', 2, '[]', 'idle')`
      )
      .run(agentId);

    // Seed ring policies for rings 0..4.
    for (let ring = 0; ring < 5; ring++) {
      h.raw
        .prepare(
          `INSERT INTO ring_policies (id, ring, tools, max_concurrency, max_tokens_per_min, max_api_calls_per_min)
           VALUES (?, ?, '[]', ?, 1000, 50)`
        )
        .run(`rp_${ring}`, ring, ring === 2 ? 2 : 0);
    }

    const now = Date.now();
    // Running task in ring 2 (agent ring 2) with a 5000ms quantum.
    h.raw
      .prepare(
        `INSERT INTO agent_tasks (id, agent_id, label, kind, queue, priority, status, started_at, quantum_ms, gang_id)
         VALUES (?, ?, 'run1', 'interactive', 'Q1', 90, 'running', ?, 5000, 'gangA')`
      )
      .run(`tsk_${randomUUID()}`, agentId, new Date(now - 1000).toISOString());
    // Queued task in Q1.
    h.raw
      .prepare(
        `INSERT INTO agent_tasks (id, agent_id, label, kind, queue, priority, status)
         VALUES (?, ?, 'q1', 'interactive', 'Q1', 80, 'queued')`
      )
      .run(`tsk_${randomUUID()}`, agentId);
    // Queued task in Q0 (safety).
    h.raw
      .prepare(
        `INSERT INTO agent_tasks (id, agent_id, label, kind, queue, priority, status)
         VALUES (?, ?, 'q0', 'safety', 'Q0', 99, 'queued')`
      )
      .run(`tsk_${randomUUID()}`, agentId);

    const res = await kernelIntrospectRouter.request('/api/kernel/introspect', {
      method: 'GET',
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean; data: KernelIntrospection };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.queueDepths)).toBe(true);
    expect(body.data.queueDepths).toHaveLength(5);

    const q1 = body.data.queueDepths.find((q) => q.queue === 'Q1');
    expect(q1?.queued).toBe(1);
    expect(q1?.running).toBe(1);

    const q0 = body.data.queueDepths.find((q) => q.queue === 'Q0');
    expect(q0?.queued).toBe(1);
    expect(q0?.running).toBe(0);

    expect(Array.isArray(body.data.runningTasks)).toBe(true);
    expect(body.data.runningTasks).toHaveLength(1);
    const rt = body.data.runningTasks[0]!;
    expect(rt.queue).toBe('Q1');
    expect(rt.gangId).toBe('gangA');
    expect(rt.quantumMs).toBe(5000);
    // Quantum started 1000ms ago with 5000ms slice → ~4000ms remaining.
    expect(rt.quantumRemainingMs).toBeGreaterThan(3000);
    expect(rt.quantumRemainingMs).toBeLessThanOrEqual(5000);

    expect(Array.isArray(body.data.ringBudgets)).toBe(true);
    expect(body.data.ringBudgets).toHaveLength(5);
    const ring2 = body.data.ringBudgets.find((r) => r.ring === 2);
    expect(ring2?.runningTasks).toBe(1);
    expect(ring2?.maxConcurrency).toBe(2);
    expect(ring2?.concurrencyUsedPct).toBeCloseTo(0.5, 5);

    expect(Array.isArray(body.data.gangLocks)).toBe(true);
    expect(body.data.gangLocks).toHaveLength(1);
    expect(body.data.gangLocks[0]!.gangId).toBe('gangA');
    expect(body.data.gangLocks[0]!.runningMembers).toBe(1);

    expect(body.data.barrierWaiters).toEqual([]);
    expect(typeof body.data.generatedAt).toBe('string');
  });

  it('service returns empty structures when DB has no tasks', async () => {
    const snap = await getKernelIntrospection();
    expect(snap.queueDepths).toHaveLength(5);
    expect(snap.queueDepths.every((q) => q.queued === 0 && q.running === 0)).toBe(true);
    expect(snap.runningTasks).toEqual([]);
    expect(snap.ringBudgets).toHaveLength(5);
    expect(snap.gangLocks).toEqual([]);
    expect(snap.barrierWaiters).toEqual([]);
  });
});
