-- 0053 R1 sync - explicit one-project sync with revision/cursor, conflicts

CREATE TABLE IF NOT EXISTS r1_sync_revisions (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  cursor TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS r1_sync_changes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('memory','evidence','task','taskEvent','receipt','approval')),
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create','update','delete','tombstone')),
  payload JSONB NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  origin TEXT NOT NULL CHECK (origin IN ('local','remote')),
  created_at TIMESTAMPTZ NOT NULL,
  hash TEXT NOT NULL,
  UNIQUE (project_id, record_id, revision)
);
CREATE INDEX IF NOT EXISTS r1_sync_changes_project_revision_idx ON r1_sync_changes(project_id, revision);
CREATE INDEX IF NOT EXISTS r1_sync_changes_record_idx ON r1_sync_changes(record_id);

CREATE TABLE IF NOT EXISTS r1_sync_conflicts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  local_change JSONB NOT NULL,
  remote_change JSONB NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','resolved_local','resolved_remote','resolved_merge')),
  created_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS r1_sync_conflicts_project_status_idx ON r1_sync_conflicts(project_id, status);

CREATE TABLE IF NOT EXISTS r1_sync_states (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('idle','syncing','offline','conflicted','disabled')),
  last_cursor TEXT,
  last_sync_at TIMESTAMPTZ,
  pending_changes INTEGER NOT NULL DEFAULT 0 CHECK (pending_changes >= 0),
  conflicts INTEGER NOT NULL DEFAULT 0 CHECK (conflicts >= 0)
);

-- MCP servers for E7-S1
CREATE TABLE IF NOT EXISTS r1_mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL CHECK (version IN ('2024-11-05','2024-10-07','2025-03-26')),
  transport TEXT NOT NULL CHECK (transport IN ('stdio','http','sse')),
  endpoint TEXT,
  command TEXT,
  env JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auth JSONB NOT NULL DEFAULT '{"type":"none","timeoutMs":5000}'::jsonb
);
CREATE INDEX IF NOT EXISTS r1_mcp_servers_owner_idx ON r1_mcp_servers(owner);

-- A2A agent cards + tasks for E7-S2
CREATE TABLE IF NOT EXISTS r1_a2a_cards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL CHECK (version IN ('1.0','0.9','1.0-proto')),
  endpoint TEXT NOT NULL,
  capabilities JSONB NOT NULL,
  auth JSONB NOT NULL,
  identity JSONB NOT NULL,
  extensions JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS r1_a2a_tasks (
  id TEXT PRIMARY KEY,
  context_id TEXT NOT NULL,
  local_task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  local_step_id TEXT,
  agent_card_id TEXT NOT NULL REFERENCES r1_a2a_cards(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('submitted','running','completed','failed','unknown')),
  artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS r1_a2a_tasks_local_task_idx ON r1_a2a_tasks(local_task_id);
