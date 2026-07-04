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
 *
 * PHASE 4 ENHANCEMENTS:
 * - async-mutex for write serialization (replaces hand-rolled queue)
 * - Transaction execution timeout (30s auto-rollback)
 * - Exponential backoff retry for SQLITE_BUSY errors
 * - dbHealthy() connection health check
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { Mutex, MutexInterface } from 'async-mutex';
import * as sqliteSchema from './schema-sqlite.js';
import * as pgSchema from './schema.js';
import { getEnv } from '../lib/env.js';

const rawUrl = (getEnv().DATABASE_URL || '').trim();
const isSqlite = !(rawUrl.startsWith('postgres://') || rawUrl.startsWith('postgresql://'));

let _sqlite: any = null;
let _pgClient: any = null;

/** Maximum time (ms) a single transaction may hold the mutex before forced rollback. */
const TX_TIMEOUT_MS = 30_000;

/** Maximum number of retry attempts for SQLITE_BUSY errors. */
const MAX_RETRIES = 5;

/** Base delay (ms) for exponential backoff. */
const RETRY_BASE_DELAY_MS = 100;

// ── SQLite Write Mutex ──────────────────────────────────────
// Replaces the hand-rolled queue with a proper async-mutex.
// Serializes SQLite write operations to prevent transaction interleaving.
// SQLite only supports one writer at a time; with an async callback in
// withTransaction, the event loop could schedule a second BEGIN before
// the first COMMIT, causing "cannot start a transaction within a transaction".
const _writeMutex = new Mutex();

function isSqliteBusyError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const msg = String((err as any).message || '');
    return msg.includes('SQLITE_BUSY') || msg.includes('database is locked');
  }
  return false;
}

/**
 * Sleep for `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSqliteDb() {
  const Database = require('better-sqlite3');
  const conn = new Database('./agentic-os.db');
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.pragma('busy_timeout = 5000');
  conn.pragma('synchronous = NORMAL');
  // Enable FTS5 if available
  try {
    conn.pragma('compile_options');
  } catch {
    // FTS5 may not be compiled in; ignore.
  }
  _sqlite = conn;

  // Use require for drizzle-orm/better-sqlite3 — drizzle-orm v0.45 ships CJS
  const { drizzle } = require('drizzle-orm/better-sqlite3') as {
    drizzle: (client: any, opts?: { schema?: Record<string, any> }) => any;
  };
  return drizzle(conn, { schema: sqliteSchema });
}

function createPgDb() {
  const postgres = require('postgres');
  const { drizzle } = require('drizzle-orm/postgres-js') as {
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
export const getBackend = (): string => (isSqlite ? 'sqlite' : 'postgresql');

/** Clean shutdown — safe to call multiple times. */
export async function closeDb(): Promise<void> {
  if (_sqlite) {
    try {
      _sqlite.close();
    } catch {
      // Already closed.
    }
  }
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

/**
 * Check if the database is reachable.
 * For SQLite: performs a `SELECT 1`.
 * For PostgreSQL: performs `SELECT 1`.
 * Returns `true` if the database responds, `false` otherwise.
 */
export async function dbHealthy(): Promise<boolean> {
  try {
    if (isSqlite && _sqlite) {
      _sqlite.exec('SELECT 1');
      return true;
    }
    if (_pgClient) {
      await _pgClient`SELECT 1`;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export { db };
export { isSqlite };

/**
 * Cross-backend async transaction helper.
 *
 * PostgreSQL: uses `db.transaction()`, which natively accepts async callbacks.
 * SQLite: uses a mutex to serialize write access + manual BEGIN/COMMIT/ROLLBACK.
 *
 * SAFETY FEATURES:
 * - 30-second transaction timeout: if the callback does not resolve within
 *   TX_TIMEOUT_MS, the transaction is automatically rolled back.
 * - Exponential backoff retry: if a SQLITE_BUSY error is caught, the
 *   transaction is retried up to MAX_RETRIES times with increasing delay.
 *
 * IMPORTANT: Do NOT perform network calls (LLM requests, embedding generation)
 * inside the transaction callback — hold the mutex for the minimum time possible.
 */
export async function withTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  if (isSqlite) {
    return await withTransactionSqlite(fn);
  } else {
    return await withTransactionPg(fn);
  }
}

async function withTransactionSqlite<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, ...
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);
    }

    const release = await _writeMutex.acquire();
    try {
      _sqlite.exec('BEGIN');
      try {
        const result = await withTimeout(
          fn(db),
          TX_TIMEOUT_MS,
          'Transaction timed out after 30s — rolling back.'
        );
        _sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        _sqlite.exec('ROLLBACK');
        if (isSqliteBusyError(e) && attempt < MAX_RETRIES - 1) {
          lastError = e;
          continue; // Retry
        }
        throw e;
      }
    } finally {
      release();
    }
  }

  throw lastError ?? new Error('withTransaction: exhausted retries');
}

async function withTransactionPg<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return await db.transaction(async (tx: any) => {
    return await withTimeout(
      fn(tx),
      TX_TIMEOUT_MS,
      'Postgres transaction timed out after 30s — rolling back.'
    );
  });
}

/**
 * Wraps a promise with a timeout.
 * If the promise does not settle within `ms`, the timeout error is thrown.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
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
