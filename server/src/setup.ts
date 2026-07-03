/**
 * setup.ts — schema presence verification (NOT a second schema definition).
 *
 * AUTO-DETECTS database backend:
 *   - If DATABASE_URL begins with postgres:// or postgresql:// → uses PostgreSQL
 *   - Otherwise → uses SQLite (default, no external DB needed)
 *
 * Single source of truth: Drizzle schema in db/schema.ts / db/schema-sqlite.ts.
 * This module only verifies the schema is present at boot.
 */

import { getEnv } from "./lib/env.js";
import { sql } from "drizzle-orm";
import { log, fatal } from "./lib/logging.js";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Determine which backend to use.
const rawUrl = (getEnv().DATABASE_URL || "").trim();
export const isSqlite = !(rawUrl.startsWith("postgres://") || rawUrl.startsWith("postgresql://"));

let db: any;

if (isSqlite) {
  const sqliteModule = await import("./db/client.js");
  db = sqliteModule.db;
  log.info("db_backend", { backend: "sqlite", path: "./agentic-os.db" });
} else {
  const pgModule = await import("./db/client.js");
  db = pgModule.db;
  log.info("db_backend", { backend: "postgresql" });
}

export { db };

// Tables the server depends on at boot. Must match the active schema.
const REQUIRED_TABLES = [
  "memories", "skills", "projects", "notes", "audit_log",
  "token_ledger", "feedback", "system_meta", "api_keys",
  // Phase 1.5: Advanced Audit
  "trajectory_logs", "tool_receipts",
  // Phase 3: Multi-Agent Kernel
  "agents", "agent_tasks", "cron_jobs",
  // Phase 5: Execution & Safety
  "sandbox_executions", "state_snapshots",
  // Neural Skill Compilation
  "compiled_scripts",
];

export interface SetupResult {
  ok: boolean;
  present: number;
  missing: string[];
  error?: string;
}

/** Verify all required tables exist. Does NOT create or alter anything. */
export async function ensureSchema(): Promise<SetupResult> {
  try {
    let presentTables: string[];

    if (isSqlite) {
      // SQLite: query sqlite_master
      const stmt = db.values(sql`SELECT name FROM sqlite_master WHERE type='table'`);
      presentTables = (Array.isArray(stmt) ? stmt : (await stmt) || [])
        .flat()
        .filter(Boolean)
        .map(String);
    } else {
      // PostgreSQL: query information_schema
      const rows: any = await db.execute(sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
      `);
      presentTables = (Array.isArray(rows) ? rows : []).map((r: unknown) => {
        const row = r as Record<string, unknown>;
        return String(row.table_name ?? row["table_name"] ?? "");
      }).filter(Boolean);
    }

    const present = new Set(presentTables);
    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
    if (missing.length) {
      log.error("schema_missing", { missing });
      return { ok: false, present: REQUIRED_TABLES.length - missing.length, missing };
    }
    log.info("schema_ready", { tables: REQUIRED_TABLES.length });
    return { ok: true, present: REQUIRED_TABLES.length, missing: [] };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error("schema_check_failed", { error });
    return { ok: false, present: 0, missing: REQUIRED_TABLES, error };
  }
}

/**
 * Auto-create SQLite tables using Drizzle's push mechanism.
 * This is only called when in SQLite mode and tables are missing.
 */
async function autoCreateTables(): Promise<void> {
  log.info("auto_create_tables", { note: "Pushing SQLite schema via drizzle-kit..." });
  try {
    const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    execSync("npx drizzle-kit push --config=drizzle.config.sqlite.ts --force", {
      cwd,
      stdio: "inherit",
      timeout: 60_000,
    });
    log.info("tables_created", { note: "SQLite tables created via drizzle-kit push" });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error("auto_create_failed", { error });
    throw e;
  }
}

/** Fail the process if the schema isn't ready, with actionable guidance. */
export async function ensureSchemaOrDie(): Promise<void> {
  const result = await ensureSchema();
  if (!result.ok) {
    if (isSqlite) {
      // Auto-create tables for zero-hassle SQLite mode
      log.info("auto_creating_tables", { note: "SQLite mode — auto-creating missing tables" });
      try {
        await autoCreateTables();
        // Re-check
        const recheck = await ensureSchema();
        if (!recheck.ok) {
          fatal(
            `SQLite tables could not be created. ` +
            `Missing tables: ${recheck.missing.join(", ")}.`,
            new Error(recheck.error || "Unknown error")
          );
        }
        log.info("schema_ready_after_auto_create", { tables: recheck.present });
      } catch (e) {
        fatal(
          `Failed to auto-create SQLite tables: ${e instanceof Error ? e.message : String(e)}. ` +
          `Try deleting agentic-os.db and restarting.`,
          e instanceof Error ? e : undefined
        );
      }
    } else {
      fatal(
        `Database schema is not ready. Run \`npm run db:push\` (or \`db:migrate\`) ` +
          `against DATABASE_URL first. Missing tables: ${result.missing.join(", ")}.`,
        result.error ? new Error(result.error) : undefined
      );
    }
  }

  if (!isSqlite) {
    // Verify pgvector extension is installed (required for semantic recall).
    const pgvectorOk = await isPgvectorInstalled();
    if (!pgvectorOk) {
      log.warn("pgvector_missing", {
        note: "pgvector extension not found. Semantic recall (RRF) is disabled; using BM25 lexical fallback.",
        fix: "Run: CREATE EXTENSION IF NOT EXISTS vector; in Postgres, then re-run db:push.",
      });
    } else {
      log.info("pgvector_ready", { note: "Semantic recall (RRF) enabled." });
    }
  } else {
    log.info("sqlite_recall", { note: "SQLite mode — using BM25 lexical recall (no pgvector)." });
  }
}

/** Check whether the pgvector extension is installed (PostgreSQL only). */
export async function isPgvectorInstalled(): Promise<boolean> {
  if (isSqlite) return false;
  try {
    const rows: any = await db.execute(sql`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `);
    return (Array.isArray(rows) ? rows : []).some((r: unknown) => {
      const row = r as Record<string, unknown>;
      return row.extname === "vector" || row["extname"] === "vector";
    });
  } catch {
    return false;
  }
}

/** Lightweight DB reachability check for the health endpoint. */
export async function dbReachable(): Promise<boolean> {
  try {
    if (isSqlite) {
      db.values(sql`SELECT 1`);
    } else {
      await db.execute(sql`SELECT 1`);
    }
    return true;
  } catch {
    return false;
  }
}
