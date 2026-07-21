/**
 * setup.ts — schema presence verification (NOT a second schema definition).
 *
 * AUTO-DETECTS database backend:
 *   - If DATABASE_URL begins with postgres:// or postgresql:// → uses PostgreSQL
 *   - Otherwise → uses SQLite (default, no external DB needed)
 *
 * Single source of truth: Drizzle schema in db/schema.ts / db/schema-sqlite.ts.
 * This module only verifies the schema is present at boot.
 *
 * PHASE 4: Adds auto-migration via drizzle-orm/migrator on startup.
 * Also exports dbReachable() for the health endpoint.
 */

import { getEnv } from './lib/env.js';
import { db } from './db/client.js';
import { sql } from 'drizzle-orm';
import { log, fatal } from './lib/logging.js';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Determine which backend to use.
const rawUrl = (getEnv().DATABASE_URL || '').trim();
export const isSqlite = !(rawUrl.startsWith('postgres://') || rawUrl.startsWith('postgresql://'));

if (isSqlite) {
  log.info('db_backend', { backend: 'sqlite', path: './agentic-os.db' });
} else {
  log.info('db_backend', { backend: 'postgresql', url: rawUrl.replace(/\/\/.*@/, '//***@') });
}

/**
 * Check whether a list of required tables exist in the current database.
 * Returns `{ ok: true, present: string[] }` or `{ ok: false, missing: string[], error?: string }`.
 */
export async function ensureSchema(): Promise<
  { ok: true; present: string[] } | { ok: false; missing: string[]; error?: string }
> {
  try {
    const requiredTables = [
      'api_keys',
      'agents',
      'agent_tasks',
      'audit_log',
      'merkle_checkpoints',
      'anchored_roots',
      'memories',
      'skills',
      'notes',
      'projects',
      'feedback',
      'system_meta',
      'token_ledger',
      'trajectory_logs',
      'tool_receipts',
      'cron_jobs',
      'state_snapshots',
      'span_logs',
      'sandbox_executions',
      'compiled_scripts',
      'metric_snapshots',
      'improvement_proposals',
      'plugins',
      'plugin_installations',
      'plugin_receipts',
      'federated_memory_proofs',
      'llm_provider_health',
      'llm_token_budgets',
      'pipelines',
      'pipeline_runs',
    ];

    let present: string[];
    if (isSqlite) {
      const rows = await db.execute(sql`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_%'
      `);
      const existing = new Set(
        (Array.isArray(rows) ? rows : []).map((r: unknown) => {
          const row = r as Record<string, unknown>;
          return (row.name || row['name']) as string;
        })
      );
      present = requiredTables.filter((t) => existing.has(t));
    } else {
      const rows = await db.execute(sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      const existing = new Set(
        (Array.isArray(rows) ? rows : []).map((r: unknown) => {
          const row = r as Record<string, unknown>;
          return (row.table_name || row['table_name']) as string;
        })
      );
      present = requiredTables.filter((t) => existing.has(t));
    }

    if (present.length === requiredTables.length) {
      return { ok: true, present };
    }
    const missing = requiredTables.filter((t) => !present.includes(t));
    log.warn('schema_incomplete', {
      present: present.length,
      required: requiredTables.length,
      missing: missing.join(', '),
    });
    return { ok: false, missing, error: undefined };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error('schema_check_failed', { error });
    return { ok: false, missing: [], error };
  }
}

/**
 * Run Drizzle migrations on startup for both SQLite and PostgreSQL.
 * Uses the generated migration files in `server/drizzle/`.
 */
async function runMigrations(): Promise<void> {
  const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (isSqlite) {
    log.info('db_migrate_sqlite', { note: 'Running SQLite migrations...' });
    try {
      execSync('npx drizzle-kit migrate --config=drizzle.config.ts', {
        cwd,
        stdio: 'inherit',
        timeout: 30_000,
      });
      log.info('db_migrate_sqlite_ok', { note: 'SQLite migrations applied.' });
    } catch (e) {
      log.error('db_migrate_sqlite_failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  } else {
    log.info('db_migrate_pg', { note: 'Running PostgreSQL migrations...' });
    try {
      execSync('npx drizzle-kit migrate --config=drizzle.config.ts --dialect=postgresql', {
        cwd,
        stdio: 'inherit',
        timeout: 30_000,
      });
      log.info('db_migrate_pg_ok', { note: 'PostgreSQL migrations applied.' });
    } catch (e) {
      log.error('db_migrate_pg_failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }
}

/**
 * Auto-create SQLite tables using Drizzle's push mechanism.
 * This is only called when in SQLite mode and tables are missing.
 */
async function autoCreateTables(): Promise<void> {
  log.info('auto_create_tables', { note: 'Pushing SQLite schema via drizzle-kit...' });
  try {
    const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    execSync('npx drizzle-kit push --config=drizzle.config.ts --force', {
      cwd,
      stdio: 'inherit',
      timeout: 60_000,
    });
    log.info('tables_created', { note: 'SQLite tables created via drizzle-kit push' });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error('auto_create_failed', { error });
    throw e;
  }
}

/** Fail the process if the schema isn't ready, with actionable guidance. */
export async function ensureSchemaOrDie(): Promise<void> {
  // First, try running migrations (safe even if already applied)
  try {
    await runMigrations();
    log.info('migrations_applied', { note: 'Drizzle migrations applied successfully.' });
    return; // Migrations succeeded — schema is ready
  } catch {
    log.warn('migrations_failed', { note: 'Falling back to auto-create tables.' });
  }

  const result = await ensureSchema();
  if (!result.ok) {
    if (isSqlite) {
      // Auto-create tables for zero-hassle SQLite mode
      log.info('auto_creating_tables', { note: 'SQLite mode — auto-creating missing tables' });
      try {
        await autoCreateTables();
        // Re-check
        const recheck = await ensureSchema();
        if (!recheck.ok) {
          fatal(
            `SQLite tables could not be created. ` +
              `Missing tables: ${recheck.missing.join(', ')}.`,
            new Error(recheck.error || 'Unknown error')
          );
        }
        log.info('schema_ready_after_auto_create', { tables: recheck.present });
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
          `against DATABASE_URL first. Missing tables: ${result.missing.join(', ')}.`,
        result.error ? new Error(result.error) : undefined
      );
    }
  }

  if (!isSqlite) {
    // Verify pgvector extension is installed (required for semantic recall).
    const pgvectorOk = await isPgvectorInstalled();
    if (!pgvectorOk) {
      log.warn('pgvector_missing', {
        note: 'pgvector extension not found. Semantic recall (RRF) is disabled; using BM25 lexical fallback.',
        fix: 'Run: CREATE EXTENSION IF NOT EXISTS vector; in Postgres, then re-run db:push.',
      });
    } else {
      log.info('pgvector_ready', { note: 'Semantic recall (RRF) enabled.' });
    }
  } else {
    log.info('sqlite_recall', { note: 'SQLite mode — using BM25 lexical recall (no pgvector).' });
  }
}

/** Check whether the pgvector extension is installed (PostgreSQL only). */
export async function isPgvectorInstalled(): Promise<boolean> {
  if (isSqlite) return false;
  try {
    const rows = await db.execute(sql`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `);
    return (Array.isArray(rows) ? rows : []).some((r: unknown) => {
      const row = r as Record<string, unknown>;
      return row.extname === 'vector' || row['extname'] === 'vector';
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
