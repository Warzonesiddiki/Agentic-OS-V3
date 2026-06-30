/**
 * setup.ts — schema presence verification (NOT a second schema definition).
 *
 * Previously this file hand-wrote CREATE TABLE DDL that drifted from the Drizzle
 * schema (bigserial vs bigint, different unique-index semantics, missing FKs) —
 * two sources of truth that disagreed. That is removed. The Drizzle schema in
 * db/schema.ts is now the SINGLE source of truth, created via `npm run db:push`
 * (or `db:migrate`). This module only verifies the schema is present at boot and
 * fails loud with instructions if it isn't, so the operator is never silently
 * running against a missing or partial schema.
 */
import { db } from "./db/client.js";
import { sql } from "drizzle-orm";
import { log, fatal } from "./lib/logging.js";

// Tables the server depends on at boot. Must match db/schema.ts.
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
    const rows = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const present = new Set((Array.isArray(rows) ? rows : []).map((r: unknown) => {
      const row = r as Record<string, unknown>;
      return String(row.table_name ?? row["table_name"] ?? "");
    }));
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

/** Fail the process if the schema isn't ready, with actionable guidance. */
export async function ensureSchemaOrDie(): Promise<void> {
  const result = await ensureSchema();
  if (!result.ok) {
    fatal(
      `Database schema is not ready. Run \`npm run db:push\` (or \`db:migrate\`) ` +
        `against DATABASE_URL first. Missing tables: ${result.missing.join(", ")}.`,
      result.error ? new Error(result.error) : undefined
    );
  }

  // Verify pgvector extension is installed (required for semantic recall).
  // If missing, warn but don't abort — the system degrades to BM25 lexical.
  const pgvectorOk = await isPgvectorInstalled();
  if (!pgvectorOk) {
    log.warn("pgvector_missing", {
      note: "pgvector extension not found. Semantic recall (RRF) is disabled; using BM25 lexical fallback.",
      fix: "Run: CREATE EXTENSION IF NOT EXISTS vector; in Postgres, then re-run db:push.",
    });
  } else {
    log.info("pgvector_ready", { note: "Semantic recall (RRF) enabled." });
  }
}

/** Check whether the pgvector extension is installed. */
export async function isPgvectorInstalled(): Promise<boolean> {
  try {
    const rows = await db.execute<{ extname: string }>(sql`
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
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
