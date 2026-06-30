-- 0046_v3_100x.sql — Phase 9 schema additions for the 100x upgrade.
-- Adds 10 new tables backing the flagship 100x features.
-- All tables follow project conventions with indexes on every hot query path.
-- Migrations are idempotent: each CREATE uses IF NOT EXISTS.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. SELF-IMPROVEMENT HARNESS  (Pillar I)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id            TEXT PRIMARY KEY,
  metric        TEXT NOT NULL,
  value         REAL NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  window_end    TIMESTAMPTZ NOT NULL,
  tags          JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS metric_snap_metric_captured_idx
  ON metric_snapshots (metric, captured_at DESC);
CREATE INDEX IF NOT EXISTS metric_snap_window_idx
  ON metric_snapshots (window_start, window_end);

CREATE TABLE IF NOT EXISTS improvement_proposals (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  hypothesis      TEXT NOT NULL,
  target_metric   TEXT NOT NULL,
  baseline_value  REAL NOT NULL,
  expected_delta  REAL NOT NULL,
  risk_class      TEXT NOT NULL DEFAULT 'ADVISORY',
  status          TEXT NOT NULL DEFAULT 'draft',
  patch           JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale       TEXT NOT NULL DEFAULT '',
  author          TEXT NOT NULL DEFAULT 'harness',
  reviewer        TEXT,
  rollout_pct     INTEGER NOT NULL DEFAULT 0,
  measured_delta  REAL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS imp_prop_status_idx ON improvement_proposals (status);
CREATE INDEX IF NOT EXISTS imp_prop_metric_idx ON improvement_proposals (target_metric);
CREATE INDEX IF NOT EXISTS imp_prop_risk_idx ON improvement_proposals (risk_class);
CREATE INDEX IF NOT EXISTS imp_prop_created_idx ON improvement_proposals (created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. WASM PLUGIN RUNTIME  (Pillar II)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS plugins (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  version         TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  author_pubkey   TEXT NOT NULL,
  signature       TEXT NOT NULL,
  content_sha256  TEXT NOT NULL,
  manifest        JSONB NOT NULL,
  wasm_bytes      TEXT,
  source          TEXT NOT NULL DEFAULT 'local',
  homepage        TEXT,
  license         TEXT,
  rating_avg      REAL NOT NULL DEFAULT 0,
  rating_count    INTEGER NOT NULL DEFAULT 0,
  install_count   INTEGER NOT NULL DEFAULT 0,
  trust_state     TEXT NOT NULL DEFAULT 'untrusted',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS plugin_name_version_unique ON plugins (name, version);
CREATE INDEX IF NOT EXISTS plugin_name_idx ON plugins (name);
CREATE INDEX IF NOT EXISTS plugin_sha_idx ON plugins (content_sha256);
CREATE INDEX IF NOT EXISTS plugin_trust_idx ON plugins (trust_state);

CREATE TABLE IF NOT EXISTS plugin_installations (
  id              TEXT PRIMARY KEY,
  plugin_id       TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  ring_override   INTEGER,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  installed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plugin_install_plugin_idx ON plugin_installations (plugin_id);
CREATE UNIQUE INDEX IF NOT EXISTS plugin_install_unique ON plugin_installations (plugin_id);

CREATE TABLE IF NOT EXISTS plugin_receipts (
  id              TEXT PRIMARY KEY,
  plugin_id       TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  install_id      TEXT REFERENCES plugin_installations(id) ON DELETE SET NULL,
  agent_id        TEXT NOT NULL,
  capability      TEXT NOT NULL,
  input_sha256    TEXT NOT NULL,
  output_sha256   TEXT NOT NULL,
  exit_code       INTEGER NOT NULL DEFAULT 0,
  fuel_used       BIGINT NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  authorized      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plugin_receipt_plugin_idx ON plugin_receipts (plugin_id);
CREATE INDEX IF NOT EXISTS plugin_receipt_agent_idx ON plugin_receipts (agent_id);
CREATE INDEX IF NOT EXISTS plugin_receipt_created_idx ON plugin_receipts (created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. FEDERATED RECALL  (Pillar III)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS federated_memory_proofs (
  id              TEXT PRIMARY KEY,
  origin_peer_id  TEXT NOT NULL,
  origin_pubkey   TEXT NOT NULL,
  signature       TEXT NOT NULL,
  content_sha256  TEXT NOT NULL,
  embedding       JSONB NOT NULL DEFAULT '[]'::jsonb,
  topic_tags      TEXT[] NOT NULL DEFAULT '{}',
  importance      REAL NOT NULL DEFAULT 0.5,
  privacy_class   TEXT NOT NULL DEFAULT 'public',
  materialized    BOOLEAN NOT NULL DEFAULT FALSE,
  reject_reason   TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS fed_proof_origin_idx ON federated_memory_proofs (origin_peer_id);
CREATE INDEX IF NOT EXISTS fed_proof_topic_idx ON federated_memory_proofs USING GIN (topic_tags);
CREATE INDEX IF NOT EXISTS fed_proof_received_idx ON federated_memory_proofs (received_at DESC);
CREATE INDEX IF NOT EXISTS fed_proof_materialized_idx ON federated_memory_proofs (materialized);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. LLM GATEWAY v2  (Pillar IV)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS llm_provider_health (
  provider        TEXT PRIMARY KEY,
  state           TEXT NOT NULL DEFAULT 'closed',
  failure_count   INTEGER NOT NULL DEFAULT 0,
  success_count   INTEGER NOT NULL DEFAULT 0,
  p95_ms          REAL NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS llm_prov_state_idx ON llm_provider_health (state);

CREATE TABLE IF NOT EXISTS llm_token_budgets (
  session_id      TEXT PRIMARY KEY,
  budget          INTEGER NOT NULL DEFAULT 100000,
  used            INTEGER NOT NULL DEFAULT 0,
  hard_kill       BOOLEAN NOT NULL DEFAULT FALSE,
  reason          TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS llm_budget_expires_idx ON llm_token_budgets (expires_at);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. PIPELINE BUILDER  (Pillar V)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pipelines (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  dag             JSONB NOT NULL,
  trigger         JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  author          TEXT NOT NULL DEFAULT 'user',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pipeline_enabled_idx ON pipelines (enabled);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              TEXT PRIMARY KEY,
  pipeline_id     TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending',
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  node_results    JSONB NOT NULL DEFAULT '{}'::jsonb,
  error           TEXT,
  triggered_by    TEXT NOT NULL DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pipeline_run_pipeline_idx ON pipeline_runs (pipeline_id);
CREATE INDEX IF NOT EXISTS pipeline_run_status_idx ON pipeline_runs (status);
CREATE INDEX IF NOT EXISTS pipeline_run_created_idx ON pipeline_runs (created_at DESC);
