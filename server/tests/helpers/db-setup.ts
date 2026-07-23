/**
 * tests/helpers/db-setup.ts — Clean temporary SQLite test database fixture.
 *
 * Creates a fresh SQLite database in a temp directory, applies the full
 * schema from the drizzle migration, and returns db + table references.
 *
 * Usage:
 * ```ts
 * import { createTestDb, closeTestDb } from './helpers/db-setup.js';
 *
 * const { db, memories } = await createTestDb();
 * await db.insert(memories).values({ id: crypto.randomUUID(), ... });
 * // ... run tests ...
 * await closeTestDb();
 * ```
 */

import { createRequire } from 'node:module';
import { existsSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

let _sqliteDb: ReturnType<typeof Database> | null = null;
let _testDbPath: string | null = null;

export interface TestDbFixtures {
  db: any;
  apiKeys: any;
  memories: any;
  agents: any;
  projects: any;
  skills: any;
  compiledScripts: any;
  notes: any;
  conversations: any;
  messages: any;
  agentTasks: any;
  trajectoryLogs: any;
  auditLog: any;
  mcpServers: any;
  pipelines: any;
  pipelineSteps: any;
  vaultEntries: any;
  metricSnapshots: any;
  improvementProposals: any;
  performanceReports: any;
  userFeedback: any;
  feedbackTags: any;
  guardianRules: any;
  sessions: any;
  events: any;
  subscriptions: any;
  apiKeyUsage: any;
}

/**
 * Create a fresh temporary SQLite test database with full schema.
 */
export async function createTestDb(migrationSqlPath?: string): Promise<TestDbFixtures> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'nexus-test-'));
  _testDbPath = join(tmpDir, 'test.db');

  _sqliteDb = new Database(_testDbPath, {});
  _sqliteDb.pragma('journal_mode = WAL');
  _sqliteDb.pragma('busy_timeout = 5000');
  _sqliteDb.pragma('synchronous = NORMAL');

  // Load the schema module to get table references
  const schema = await import('../../src/db/schema-sqlite.js');
  const { drizzle } = await import('drizzle-orm/better-sqlite3');

  // Run the migration SQL to create all tables
  const migrationPath =
    migrationSqlPath ?? join(process.cwd(), 'drizzle', '0000_baseline_schema.sql');
  if (existsSync(migrationPath)) {
    const sql = readFileSync(migrationPath, 'utf-8');
    // Split on statement-breakpoint comments and execute each
    const statements = sql.split('--> statement-breakpoint');
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed) {
        try {
          _sqliteDb.exec(trimmed);
        } catch (err) {
          // Ignore "already exists" errors in case of idempotent runs
          const msg = String(err);
          if (!msg.includes('already exists')) throw err;
        }
      }
    }
  }

  const db = drizzle(_sqliteDb, { schema });

  return {
    db,
    apiKeys: schema.apiKeys,
    memories: schema.memories,
    agents: schema.agents,
    projects: schema.projects,
    skills: schema.skills,
    compiledScripts: schema.compiledScripts,
    notes: schema.notes,
    conversations: (schema as any).conversations ?? {},
    messages: (schema as any).messages ?? {},
    agentTasks: schema.agentTasks,
    trajectoryLogs: schema.trajectoryLogs,
    auditLog: schema.auditLog,
    mcpServers: (schema as any).mcpServers ?? {},
    pipelines: schema.pipelines,
    pipelineSteps: (schema as any).pipelineSteps ?? {},
    vaultEntries: (schema as any).vaultEntries ?? {},
    metricSnapshots: schema.metricSnapshots,
    improvementProposals: schema.improvementProposals,
    performanceReports: (schema as any).performanceReports ?? {},
    userFeedback: schema.feedback,
    feedbackTags: (schema as any).feedbackTags ?? {},
    guardianRules: (schema as any).guardianRules ?? {},
    sessions: (schema as any).sessions ?? {},
    events: (schema as any).events ?? {},
    subscriptions: (schema as any).subscriptions ?? {},
    apiKeyUsage: (schema as any).apiKeyUsage ?? {},
  };
}

/**
 * Close and remove the test database.
 */
export async function closeTestDb(): Promise<void> {
  if (_sqliteDb) {
    try {
      _sqliteDb.close();
    } catch {
      /* ignore */
    }
    _sqliteDb = null;
  }
  if (_testDbPath) {
    for (const suffix of ['', '-wal', '-shm']) {
      const p = _testDbPath + suffix;
      try {
        if (existsSync(p)) unlinkSync(p);
      } catch {
        /* best-effort */
      }
    }
    _testDbPath = null;
  }
}
