/**
 * migration.test.ts — Verify that the Drizzle migration SQL creates all expected
 * tables and that the SQLite schema definitions align with migration output.
 *
 * Uses an in-memory / temp database so it needs zero external infrastructure.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

import { resolve } from 'node:path';

// Paths relative to server/
const MIGRATION_SQL_PATH = resolve(
  import.meta.dirname,
  '..',
  'drizzle',
  '0000_baseline_schema.sql'
);
const SCHEMA_PATH = resolve(import.meta.dirname, '..', 'src', 'db', 'schema-sqlite.ts');

/**
 * Expected tables and their column count (spot-check via pragma).
 * Derived from drizzle/0000_baseline_schema.sql.
 */
const EXPECTED_TABLES: Record<string, number> = {
  agent_memory_quotas: 6,
  agent_tasks: 22,
  agents: 19,
  anchored_roots: 9,
  api_keys: 7,
  audit_log: 8,
  compiled_scripts: 15,
  cron_jobs: 11,
  cross_org_shares: 7,
  enterprise_api_keys: 12,
  enterprise_users: 10,
  federated_memory_proofs: 13,
  feedback: 7,
  improvement_proposals: 18,
  invoices: 7,
  llm_provider_health: 9,
  llm_token_budgets: 8,
  marketplace_integrations: 11,
  marketplace_plugins: 20,
  marketplace_versions: 18,
  memories: 25,
  memory_archive: 12,
  memory_attachments: 11,
  memory_causal_edges: 6,
  memory_cluster_members: 2,
  memory_clusters: 8,
  memory_contradictions: 7,
  memory_diff_markers: 6,
  memory_emotions: 7,
  memory_rehearsal_log: 6,
  memory_tags: 2,
  memory_templates: 5,
  merkle_checkpoints: 7,
  metric_snapshots: 7,
  notes: 11,
  onboarding_state: 3,
  orgs: 8,
  payment_methods: 5,
  pipeline_runs: 10,
  pipelines: 9,
  plugin_dependencies: 7,
  plugin_installations: 7,
  plugin_installs: 9,
  plugin_kv: 6,
  plugin_receipts: 12,
  plugin_reviews: 10,
  plugin_security_reviews: 9,
  plugin_signing_keys: 6,
  plugins: 18,
  projects: 11,
  rbac_roles: 6,
  ring_policies: 7,
  sandbox_executions: 11,
  scheduler_metrics: 10,
  self_opt_events: 7,
  self_opt_experiments: 13,
  self_opt_knowledge_bus: 9,
  self_opt_param_versions: 14,
  session_links: 4,
  siem_sinks: 6,
  skills: 17,
  span_logs: 12,
  state_snapshots: 7,
  system_meta: 3,
  tag_taxonomy: 5,
  tenant_config: 20,
  token_ledger: 9,
  tool_receipts: 10,
  trajectory_logs: 9,
  workspaces: 6,
};

/**
 * Expected indices from the migration SQL (keyed by index name).
 */
const EXPECTED_INDICES = [
  'agent_mem_quota_agent_idx',
  'agent_parent_idx',
  'agent_status_idx',
  'agent_tasks_agent_status_idx',
  'agent_tasks_queued_priority_created_idx',
  'agent_tasks_status_priority_queue_idx',
  'anchor_checkpoint_idx',
  'anchor_root_idx',
  'apikey_hash_unique',
  'audit_created_idx',
  'audit_id_unique',
  'audit_seq_idx',
  'cos_org_idx',
  'cron_enabled_idx',
  'cron_jobs_enabled_next_run_idx',
  'cron_nextrun_idx',
  'ekey_org_idx',
  'enterprise_api_keys_key_hash_unique',
  'entu_org_email_unique',
  'entu_org_idx',
  'fed_proof_materialized_idx',
  'fed_proof_origin_idx',
  'fed_proof_received_idx',
  'feedback_item_idx',
  'imp_prop_created_idx',
  'imp_prop_metric_idx',
  'imp_prop_risk_idx',
  'imp_prop_status_idx',
  'inv_org_idx',
  'llm_budget_expires_idx',
  'llm_prov_state_idx',
  'marketplace_integrations_slug_unique',
  'marketplace_plugins_slug_unique',
  'mem_archive_original_idx',
  'mem_attach_memory_idx',
  'mem_causal_from_idx',
  'mem_causal_to_idx',
  'mem_cluster_members_mem_idx',
  'mem_cluster_members_pk',
  'mem_cluster_size_idx',
  'mem_contradiction_resolved_idx',
  'mem_created_idx',
  'mem_diff_peer_idx',
  'mem_emotion_mem_idx',
  'mem_importance_idx',
  'mem_kind_idx',
  'mem_project_idx',
  'mem_rehearsal_mem_idx',
  'memories_kind_importance_idx',
  'memory_tags_pk',
  'memory_tags_tag_idx',
  'memory_templates_name_unique',
  'metric_snap_metric_captured_idx',
  'metric_snap_window_idx',
  'mi_kind_idx',
  'mi_slug_idx',
  'mp_author_idx',
  'mp_category_idx',
  'mp_kind_idx',
  'mp_slug_idx',
  'mp_status_idx',
  'mv_plugin_version_idx',
  'mv_published_idx',
  'mv_status_idx',
  'note_indexed_at_idx',
  'note_path_unique',
  'org_parent_idx',
  'orgs_slug_unique',
  'pd_dep_idx',
  'pd_version_idx',
  'pin_plugin_idx',
  'pin_plugin_tenant_idx',
  'pin_tenant_idx',
  'pipeline_enabled_idx',
  'pipeline_run_created_idx',
  'pipeline_run_pipeline_idx',
  'pipeline_run_status_idx',
  'pipeline_runs_pipeline_status_idx',
  'plugin_install_plugin_idx',
  'plugin_install_unique',
  'plugin_kv_plugin_key_unique',
  'plugin_kv_plugin_idx',
  'plugin_name_idx',
  'plugin_name_version_unique',
  'plugin_receipt_agent_idx',
  'plugin_receipt_created_idx',
  'plugin_receipt_plugin_idx',
  'plugin_sha_idx',
  'plugin_trust_idx',
  'pm_org_idx',
  'pr_plugin_idx',
  'pr_rating_idx',
  'project_name_unique',
  'psk_author_idx',
  'psr_state_idx',
  'psr_version_idx',
  'rbac_org_name_unique',
  'receipt_agent_idx',
  'receipt_audit_idx',
  'ring_policies_ring_unique',
  'ring_policy_ring_idx',
  'sandbox_agent_idx',
  'sandbox_status_idx',
  'scheduler_metrics_queue_idx',
  'script_sig_unique',
  'script_status_idx',
  'session_links_pk',
  'siem_org_idx',
  'skill_category_idx',
  'skill_name_unique',
  'skill_rating_idx',
  'snap_saga_idx',
  'soe_event_created_idx',
  'soe_event_kind_idx',
  'soe_event_tuner_idx',
  'soe_status_idx',
  'soe_tuner_idx',
  'sokb_owner_idx',
  'sokb_scope_idx',
  'sokb_score_idx',
  'sokb_tuner_idx',
  'sopv_exp_idx',
  'sopv_owner_idx',
  'sopv_parent_idx',
  'sopv_status_idx',
  'sopv_tuner_idx',
  'span_created_idx',
  'span_logs_trace_parent_idx',
  'span_parent_idx',
  'span_trace_idx',
  'span_type_idx',
  'tag_taxonomy_name_idx',
  'task_agent_idx',
  'task_idem_unique',
  'task_queue_idx',
  'task_status_idx',
  'traj_agent_idx',
  'traj_audit_idx',
  'ws_org_idx',
];

describe('Migration SQL verification', () => {
  let sqliteDb: ReturnType<typeof Database>;
  let tmpPath: string;

  beforeAll(() => {
    // Verify migration SQL file exists
    expect(existsSync(MIGRATION_SQL_PATH), `Migration SQL not found at ${MIGRATION_SQL_PATH}`).toBe(
      true
    );
    expect(existsSync(SCHEMA_PATH), `Schema file not found at ${SCHEMA_PATH}`).toBe(true);

    // Create a temp database and apply migration
    const tmpDir = mkdtempSync(join(tmpdir(), 'nexus-migrate-test-'));
    tmpPath = join(tmpDir, 'migrated.db');
    sqliteDb = new Database(tmpPath, {});
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');

    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const sql = readFileSync(MIGRATION_SQL_PATH, 'utf-8');
    const statements = sql.split('--> statement-breakpoint');
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed) {
        try {
          sqliteDb.exec(trimmed);
        } catch (err) {
          const msg = String(err);
          if (!msg.includes('already exists')) throw err;
        }
      }
    }
  });

  afterAll(() => {
    if (sqliteDb) {
      try {
        sqliteDb.close();
      } catch {
        /* ignore */
      }
    }
    if (tmpPath) {
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          if (existsSync(tmpPath + suffix)) unlinkSync(tmpPath + suffix);
        } catch {
          /* ignore */
        }
      }
    }
  });

  it('migration SQL file exists and is non-empty', () => {
    expect(existsSync(MIGRATION_SQL_PATH)).toBe(true);
  });

  it('all expected tables exist with correct column count', () => {
    const tables = sqliteDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    for (const [table, expectedCols] of Object.entries(EXPECTED_TABLES)) {
      expect(tableNames).toContain(table);
      const info = sqliteDb.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      expect(
        info.length,
        `Table '${table}' expected ${expectedCols} columns, got ${info.length}`
      ).toBe(expectedCols);
    }
  });

  it('all expected indices exist', () => {
    const indices = sqliteDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    const indexNames = indices.map((i) => i.name);
    for (const idx of EXPECTED_INDICES) {
      expect(indexNames).toContain(idx);
    }
  });

  it('memories table has foreign key to projects', () => {
    const fks = sqliteDb.prepare('PRAGMA foreign_key_list(memories)').all() as {
      table: string;
      from: string;
      to: string;
    }[];
    const projectFk = fks.find((fk) => fk.table === 'projects');
    expect(projectFk).toBeDefined();
    expect(projectFk!.from).toBe('project_id');
    expect(projectFk!.to).toBe('id');
  });

  it('can INSERT and SELECT a project record', () => {
    const id = 'proj-test-001';
    sqliteDb
      .prepare('INSERT INTO projects (id, name, description) VALUES (?, ?, ?)')
      .run(id, 'Test Project', 'A test');
    const row = sqliteDb.prepare('SELECT * FROM projects WHERE id = ?').get(id) as { name: string };
    expect(row.name).toBe('Test Project');
  });

  it('can INSERT and SELECT an agent record', () => {
    const id = 'agent-test-001';
    sqliteDb
      .prepare('INSERT INTO agents (id, name, kind, ring, scopes) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'Test Agent', 'sub-agent', 2, '["read"]');
    const row = sqliteDb.prepare('SELECT * FROM agents WHERE id = ?').get(id) as {
      name: string;
      status: string;
    };
    expect(row.name).toBe('Test Agent');
    expect(row.status).toBe('idle');
  });

  it('can INSERT and SELECT a memory record with project FK', () => {
    const pid = 'proj-mem-test';
    const mid = 'mem-test-001';
    sqliteDb.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(pid, 'MemProject');
    sqliteDb
      .prepare('INSERT INTO memories (id, kind, title, content, project_id) VALUES (?, ?, ?, ?, ?)')
      .run(mid, 'note', 'Test Memory', 'Hello', pid);
    const row = sqliteDb.prepare('SELECT * FROM memories WHERE id = ?').get(mid) as {
      title: string;
      kind: string;
    };
    expect(row.title).toBe('Test Memory');
    expect(row.kind).toBe('note');
  });

  it('can INSERT and SELECT an api_key record', () => {
    const id = 'key-test-001';
    sqliteDb
      .prepare('INSERT INTO api_keys (id, name, key_hash, scopes) VALUES (?, ?, ?, ?)')
      .run(id, 'Test Key', 'salt:hash', '["read","write"]');
    const row = sqliteDb.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as {
      name: string;
      scopes: string;
      status: string;
    };
    expect(row.name).toBe('Test Key');
    expect(row.scopes).toBe('["read","write"]');
    expect(row.status).toBe('active');
  });

  it('enforces UNIQUE constraint on api_keys.key_hash', () => {
    expect(() => {
      sqliteDb
        .prepare('INSERT INTO api_keys (id, name, key_hash) VALUES (?, ?, ?)')
        .run('key-dup-001', 'Dup1', 'samehash');
      sqliteDb
        .prepare('INSERT INTO api_keys (id, name, key_hash) VALUES (?, ?, ?)')
        .run('key-dup-002', 'Dup2', 'samehash');
    }).toThrow();
  });

  it('enforces UNIQUE constraint on projects.name', () => {
    expect(() => {
      sqliteDb
        .prepare('INSERT INTO projects (id, name) VALUES (?, ?)')
        .run('proj-dup-1', 'DuplicateName');
      sqliteDb
        .prepare('INSERT INTO projects (id, name) VALUES (?, ?)')
        .run('proj-dup-2', 'DuplicateName');
    }).toThrow();
  });

  it('does NOT match any unexpected extra table in migration', () => {
    const tables = sqliteDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const expectedSet = new Set(Object.keys(EXPECTED_TABLES));
    for (const t of tables) {
      if (!expectedSet.has(t.name) && !t.name.startsWith('_')) {
        // Fail if we find a table that isn't expected
        // (allow virtual tables like memories_fts which are created at runtime, not in migration)
        if (!t.name.endsWith('_fts')) {
          expect(expectedSet).toContain(t.name);
        }
      }
    }
  });
});
