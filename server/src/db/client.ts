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

/* eslint-disable @typescript-eslint/no-require-imports */

function createSqliteDb() {
  const Database = require("better-sqlite3");
  const conn = new Database("./agentic-os.db");
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
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
