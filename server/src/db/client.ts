/**
 * client.ts — Unified SQLite (default) / PostgreSQL client with auto-detection.
 *
 * Connection is eagerly created at module load time (fail-fast).
 * ESM-compatible: uses createRequire for better-sqlite3 (CJS native),
 * but uses import() for drizzle-orm (ESM) so the relational query API works.
 *
 * Additionally re-exports the correct schema tables for the active backend
 * so application code can `import { db, apiKeys } from "./db/client.js";`
 * without worrying about which schema file is active.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

import * as sqliteSchema from "./schema-sqlite.js";
import * as pgSchema from "./schema.js";
import { getEnv } from "../lib/env.js";

const rawUrl = (getEnv().DATABASE_URL || "").trim();
const isSqlite = !(rawUrl.startsWith("postgres://") || rawUrl.startsWith("postgresql://"));

let _sqlite: any = null;
let _pgClient: any = null;

// ── SQLite Write Mutex ──────────────────────────────────────
// Serializes SQLite write operations to prevent transaction interleaving.
// SQLite only supports one writer at a time; with an async callback in
// withTransaction, the event loop could schedule a second BEGIN before
// the first COMMIT, causing "cannot start a transaction within a transaction".
const _writeQueue: Array<() => void> = [];
let _writing = false;

function acquireWriteLock(): Promise<void> {
  return new Promise((resolve) => {
    _writeQueue.push(resolve);
    if (!_writing) drainWriteQueue();
  });
}

function drainWriteQueue(): void {
  if (_writeQueue.length === 0) {
    _writing = false;
    return;
  }
  _writing = true;
  const next = _writeQueue.shift();
  next!();
}

function releaseWriteLock(): void {
  drainWriteQueue();
}

function createSqliteDb() {
  const Database = require("better-sqlite3");
  const conn = new Database("./agentic-os.db");
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.pragma("busy_timeout = 5000");
  conn.pragma("synchronous = NORMAL");
  _sqlite = conn;

  // Use require for drizzle-orm/better-sqlite3 — drizzle-orm v0.45 ships CJS
  const { drizzle } = require("drizzle-orm/better-sqlite3") as {
    drizzle: (client: any, opts?: { schema?: Record<string, any> }) => any;
  };
  return drizzle(conn, { schema: sqliteSchema });
}

function createPgDb() {
  const postgres = require("postgres");
  const { drizzle } = require("drizzle-orm/postgres-js") as {
    drizzle: (client: any, opts?: { schema?: Record<string, any> }) => any;
  };
  const client = postgres(rawUrl, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
  });
  _pgClient = client;
  return drizzle(client, { schema: pgSchema });
}

const db: any = isSqlite ? createSqliteDb() : createPgDb();

/** Human-readable backend label. */
export const getBackend = (): string => (isSqlite ? "sqlite" : "postgresql");

/** Clean shutdown — safe to call multiple times. */
export async function closeDb(): Promise<void> {
  if (_sqlite) _sqlite.close();
  if (_pgClient) {
    try {
      await _pgClient.end();
    } catch {
      // Already closed.
    }
  }
}

/** True if the pool is currently connected. */
export function isPoolInitialized(): boolean {
  return Boolean(_sqlite || _pgClient);
}

export { db };
export { isSqlite };

/**
 * Cross-backend async transaction helper.
 *
 * PostgreSQL: uses `db.transaction()`, which natively accepts async callbacks.
 * SQLite: uses a mutex to serialize write access + manual BEGIN/COMMIT/ROLLBACK.
 *
 * IMPORTANT: Do NOT perform network calls (LLM requests, embedding generation)
 * inside the transaction callback — hold the mutex for the minimum time possible.
 */
export async function withTransaction<T>(
  fn: (tx: any) => Promise<T>
): Promise<T> {
  if (isSqlite) {
    await acquireWriteLock();
    try {
      _sqlite.exec("BEGIN");
      try {
        const result = await fn(db);
        _sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        _sqlite.exec("ROLLBACK");
        throw e;
      }
    } finally {
      releaseWriteLock();
    }
  } else {
    return await db.transaction(fn);
  }
}

/* ── Re-export the correct schema tables for the active backend ── */
export const {
  apiKeys,
  agents,
  agentTasks,
  auditLog,
  merkleCheckpoints,
  anchoredRoots,
  memories,
  skills,
  notes,
  projects,
  feedback,
  systemMeta,
  tokenLedger,
  trajectoryLogs,
  toolReceipts,
  cronJobs,
  stateSnapshots,
  spanLogs,
  sandboxExecutions,
  compiledScripts,
  metricSnapshots,
  improvementProposals,
  plugins,
  pluginInstallations,
  pluginReceipts,
  federatedMemoryProofs,
  llmProviderHealth,
  llmTokenBudgets,
  pipelines,
  pipelineRuns,
} = isSqlite ? sqliteSchema : pgSchema;
