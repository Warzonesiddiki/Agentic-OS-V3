-- SQLite equivalent of 0053_r1_sync.sql

CREATE TABLE IF NOT EXISTS r1_sync_revisions (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  cursor TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS r1_sync_changes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('memory','evidence','task','taskEvent','receipt','approval')),
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create','update','delete','tombstone')),
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  origin TEXT NOT NULL CHECK (origin IN ('local','remote')),
  created_at TEXT NOT NULL,
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
  local_change TEXT NOT NULL,
  remote_change TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','resolved_local','resolved_remote','resolved_merge')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS r1_sync_conflicts_project_status_idx ON r1_sync_conflicts(project_id, status);

CREATE TABLE IF NOT EXISTS r1_sync_states (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('idle','syncing','offline','conflicted','disabled')),
  last_cursor TEXT,
  last_sync_at TEXT,
  pending_changes INTEGER NOT NULL DEFAULT 0 CHECK (pending_changes >= 0),
  conflicts INTEGER NOT NULL DEFAULT 0 CHECK (conflicts >= 0)
);

CREATE TABLE IF NOT EXISTS r1_mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL CHECK (version IN ('2024-11-05','2024-10-07','2025-03-26')),
  transport TEXT NOT NULL CHECK (transport IN ('stdio','http','sse')),
  endpoint TEXT,
  command TEXT,
  env TEXT NOT NULL DEFAULT '{}',
  owner TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  auth TEXT NOT NULL DEFAULT '{"type":"none","timeoutMs":5000}'
);
CREATE INDEX IF NOT EXISTS r1_mcp_servers_owner_idx ON r1_mcp_servers(owner);

CREATE TABLE IF NOT EXISTS r1_a2a_cards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL CHECK (version IN ('1.0','0.9','1.0-proto')),
  endpoint TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  auth TEXT NOT NULL,
  identity TEXT NOT NULL,
  extensions TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS r1_a2a_tasks (
  id TEXT PRIMARY KEY,
  context_id TEXT NOT NULL,
  local_task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  local_step_id TEXT,
  agent_card_id TEXT NOT NULL REFERENCES r1_a2a_cards(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('submitted','running','completed','failed','unknown')),
  artifacts TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS r1_a2a_tasks_local_task_idx ON r1_a2a_tasks(local_task_id);
