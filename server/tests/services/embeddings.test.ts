/**
 * services/embeddings.test.ts — Tests for the pgvector embedding pipeline.
 *
 * Uses a temporary SQLite database with PostgreSQL compatibility
 * patches (::int cast stripping + custom array_to_string function).
 * Mocks only the HTTP layer (safeFetch) so embedding calls never
 * reach a real provider.
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
const mockDbRef = vi.hoisted(() => ({ current: null as any }));

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
    withTransaction: async (fn: (tx: any) => Promise<any>) => fn(mockDbRef.current),
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

vi.mock('../../src/lib/http.js', () => ({ safeFetch: vi.fn() }));
vi.mock('../../src/lib/logging.js', () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ── Module under test ──────────────────────────────────────────────
import { safeFetch } from '../../src/lib/http.js';
import {
  rebuildEmbeddings,
  embedQuery,
  embeddingsAvailable,
} from '../../src/services/embeddings.js';
import { resetEnv } from '../../src/lib/env.js';

// ── Constants ──────────────────────────────────────────────────────
const DIM = 1536;

// ── Test DB factory ────────────────────────────────────────────────
interface DbHandle {
  raw: Database.Database;
  drizzle: ReturnType<typeof drizzle>;
  dbPath: string;
  dir: string;
}

function buildTestDb(): DbHandle {
  const dir = mkdtempSync(join(tmpdir(), 'embed-test-'));
  const dbPath = join(dir, 'test.db');
  const raw = new Database(dbPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');

  // Strip PostgreSQL ::int casts (SQLite rejects them)
  const origPrepare = raw.prepare.bind(raw);
  raw.prepare = ((sql: string) => {
    const fixed = sql.replace(/::int\b/g, '');
    const stmt = origPrepare(fixed);
    // Wrap .run() to serialize array bind params (embedding column stores JSON text)
    const origRun = stmt.run.bind(stmt);
    stmt.run = (...args: any[]) =>
      origRun(...args.map((a) => (Array.isArray(a) ? JSON.stringify(a) : a)));
    return stmt;
  }) as typeof raw.prepare;

  // Register array_to_string (PG function used in notes query)
  raw.function('array_to_string', (arr: any, sep: any) => {
    try {
      return JSON.parse(String(arr)).join(String(sep));
    } catch {
      return '';
    }
  });

  // Run migration
  const migrationPath = join(process.cwd(), 'drizzle', '0000_baseline_schema.sql');
  if (existsSync(migrationPath)) {
    const sql = readFileSync(migrationPath, 'utf-8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
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

// ── Helpers ────────────────────────────────────────────────────────
function embedResp(dim = DIM) {
  return {
    ok: true,
    status: 200,
    body: { data: [{ embedding: Array.from({ length: dim }, (_, i) => (i + 1) / dim) }] },
  };
}
function embedBatchResp(count: number, dim = DIM) {
  return {
    ok: true,
    status: 200,
    body: {
      data: Array.from({ length: count }, (_, j) => ({
        embedding: Array.from({ length: dim }, (_, i) => (j * dim + i + 1) / (count * dim)),
      })),
    },
  };
}

function cfg(): void {
  process.env.NEXUS_LLM_BASE_URL = 'http://x';
  process.env.NEXUS_LLM_API_KEY = 'k';
  process.env.NEXUS_LLM_MODEL = 'm';
  process.env.NEXUS_EMBEDDING_MODEL = 'em';
  resetEnv();
}

// ── Suite ──────────────────────────────────────────────────────────
describe('embeddings service', () => {
  let h: DbHandle;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXUS_LLM_BASE_URL;
    delete process.env.NEXUS_LLM_API_KEY;
    delete process.env.NEXUS_LLM_MODEL;
    delete process.env.NEXUS_EMBEDDING_MODEL;
    resetEnv();
    h = buildTestDb();
    mockDbRef.current = h.drizzle;
  });

  afterEach(() => {
    destroyTestDb(h);
    mockDbRef.current = null;
  });

  // ── embeddingsAvailable() ───────────────────────────────────────

  describe('embeddingsAvailable', () => {
    it('returns false when no LLM provider configured', () => {
      expect(embeddingsAvailable()).toBe(false);
    });

    it('returns false when EMBEDDING_MODEL missing', () => {
      process.env.NEXUS_LLM_BASE_URL = 'http://x';
      process.env.NEXUS_LLM_API_KEY = 'k';
      process.env.NEXUS_LLM_MODEL = 'm';
      resetEnv();
      expect(embeddingsAvailable()).toBe(false);
    });

    it('returns true when fully configured', () => {
      cfg();
      expect(embeddingsAvailable()).toBe(true);
    });
  });

  // ── embedQuery() ────────────────────────────────────────────────

  describe('embedQuery', () => {
    it('returns null when not configured', async () => {
      expect(await embedQuery('test')).toBeNull();
    });

    it('returns vector on success', async () => {
      cfg();
      vi.mocked(safeFetch).mockResolvedValue(embedResp());
      expect(await embedQuery('hello')).toHaveLength(DIM);
    });

    it('returns null when API throws', async () => {
      cfg();
      vi.mocked(safeFetch).mockRejectedValue(new Error('err'));
      expect(await embedQuery('fail')).toBeNull();
    });

    it('returns null when API returns error status', async () => {
      cfg();
      vi.mocked(safeFetch).mockResolvedValue({
        ok: false,
        status: 429,
        body: { error: { message: 'rate' } },
      });
      expect(await embedQuery('limited')).toBeNull();
    });
  });

  // ── rebuildEmbeddings() ─────────────────────────────────────────

  describe('rebuildEmbeddings', () => {
    it('returns lexical when not configured', async () => {
      const r = await rebuildEmbeddings();
      expect(r.mode).toBe('lexical');
      expect(r.reason).toContain('No embedding provider configured');
    });

    it('returns semantic + 0 docs when configured and DB empty', async () => {
      cfg();
      const r = await rebuildEmbeddings();
      expect(r.mode).toBe('semantic');
      expect(r.documents).toBe(0);
      expect(r.embedded).toBe(0);
    });

    it('embeds memories without embeddings', async () => {
      cfg();
      const id = randomUUID();
      h.raw
        .prepare(
          "INSERT INTO memories (id, kind, title, content, tags) VALUES (?, 'fact', ?, ?, '[]')"
        )
        .run(id, 'test memory', 'some content');
      vi.mocked(safeFetch).mockResolvedValue(embedResp());

      const r = await rebuildEmbeddings();
      expect(r.mode).toBe('semantic');
      expect(r.embedded).toBe(1);

      const row = h.raw.prepare('SELECT embedding FROM memories WHERE id = ?').get(id) as any;
      expect(row).toBeDefined();
      expect(row.embedding).not.toBeNull();
      expect(JSON.parse(row.embedding)).toHaveLength(DIM);
    });

    it('embeds skills without embeddings', async () => {
      cfg();
      const id = randomUUID();
      h.raw
        .prepare(
          "INSERT INTO skills (id, name, title, description, content, category, tags) VALUES (?, 'ts', 'TS', 'd', 'c', 'general', '[]')"
        )
        .run(id);
      vi.mocked(safeFetch).mockResolvedValue(embedResp());

      const r = await rebuildEmbeddings();
      expect(r.embedded).toBe(1);

      const row = h.raw.prepare('SELECT embedding FROM skills WHERE id = ?').get(id) as any;
      expect(row.embedding).not.toBeNull();
    });

    it('embeds notes without embeddings', async () => {
      cfg();
      const id = randomUUID();
      h.raw
        .prepare(
          "INSERT INTO notes (id, path, title, content, tags, char_count) VALUES (?, '/n.md', 'N', 'c', '[\"dev\"]', 1)"
        )
        .run(id);
      vi.mocked(safeFetch).mockResolvedValue(embedResp());

      const r = await rebuildEmbeddings();
      expect(r.embedded).toBe(1);

      const row = h.raw.prepare('SELECT embedding FROM notes WHERE id = ?').get(id) as any;
      expect(row.embedding).not.toBeNull();
    });

    it('skips already-embedded documents', async () => {
      cfg();
      const id = randomUUID();
      h.raw
        .prepare(
          "INSERT INTO memories (id, kind, title, content, tags, embedding) VALUES (?, 'fact', 'd', 'e', '[]', ?)"
        )
        .run(id, JSON.stringify(Array.from({ length: DIM }, () => 0.5)));

      const r = await rebuildEmbeddings();
      expect(r.documents).toBe(1);
      expect(r.embedded).toBe(0);
      expect(r.skipped).toBe(1);
      expect(safeFetch).not.toHaveBeenCalled();
    });

    it('handles mixed embedded + unembedded', async () => {
      cfg();
      const id1 = randomUUID(),
        id2 = randomUUID();
      h.raw
        .prepare(
          "INSERT INTO memories (id, kind, title, content, tags, embedding) VALUES (?, 'fact', 'd', 'e', '[]', ?)"
        )
        .run(id1, JSON.stringify(Array.from({ length: DIM }, () => 0.1)));
      h.raw
        .prepare(
          "INSERT INTO memories (id, kind, title, content, tags) VALUES (?, 'fact', 'n', 'embed me', '[]')"
        )
        .run(id2);
      vi.mocked(safeFetch).mockResolvedValue(embedResp());

      const r = await rebuildEmbeddings();
      expect(r.documents).toBe(2);
      expect(r.embedded).toBe(1);
      expect(r.skipped).toBe(1);

      const row = h.raw.prepare('SELECT embedding FROM memories WHERE id = ?').get(id2) as any;
      expect(row.embedding).not.toBeNull();
    });

    it('falls back to lexical on API failure', async () => {
      cfg();
      h.raw
        .prepare(
          "INSERT INTO memories (id, kind, title, content, tags) VALUES (?, 'fact', 'f', 'e', '[]')"
        )
        .run(randomUUID());
      vi.mocked(safeFetch).mockRejectedValue(new Error('server error'));

      const r = await rebuildEmbeddings();
      expect(r.mode).toBe('lexical');
      expect(r.error).toContain('server error');
    });

    it('processes multiple documents in one batch', async () => {
      cfg();
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      for (let i = 0; i < ids.length; i++) {
        h.raw
          .prepare(
            "INSERT INTO memories (id, kind, title, content, tags) VALUES (?, 'fact', ?, ?, '[]')"
          )
          .run(ids[i], `m${i}`, `c${i}`);
      }
      vi.mocked(safeFetch).mockResolvedValue(embedBatchResp(3));

      const r = await rebuildEmbeddings();
      expect(r.embedded).toBe(3);
      for (const id of ids) {
        const row = h.raw.prepare('SELECT embedding FROM memories WHERE id = ?').get(id) as any;
        expect(row.embedding).not.toBeNull();
      }
    });
  });
});
