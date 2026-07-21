-- SQLite/local equivalent of 0049_r1_contracts.sql.
-- Kept separate because SQLite does not support PostgreSQL JSONB/TIMESTAMPTZ
-- syntax or PL/pgSQL triggers.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'local' CHECK (mode IN ('local', 'shared')),
  scope TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS r1_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','waiting_approval','running','completed','failed','cancelled')),
  title TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS r1_tasks_project_state_idx ON r1_tasks(project_id, state, updated_at);

CREATE TABLE IF NOT EXISTS r1_task_steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','completed','failed','skipped')),
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  capability_id TEXT,
  UNIQUE (task_id, sequence)
);

CREATE TABLE IF NOT EXISTS r1_approvals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','denied')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS r1_memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS r1_capabilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  version TEXT NOT NULL,
  owner TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '{}',
  risk TEXT NOT NULL CHECK (risk IN ('low','medium','high')),
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS r1_evidence (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES r1_tasks(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('provenance', 'trace', 'receipt', 'approval', 'source')),
  source TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS r1_action_receipts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  correlation_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tool_call', 'file_write', 'db_write', 'approval', 'external_request')),
  actor TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'require_approval')),
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS r1_evidence_no_update
BEFORE UPDATE ON r1_evidence BEGIN SELECT RAISE(ABORT, 'R1 evidence is append-only'); END;
CREATE TRIGGER IF NOT EXISTS r1_evidence_no_delete
BEFORE DELETE ON r1_evidence BEGIN SELECT RAISE(ABORT, 'R1 evidence is append-only'); END;
CREATE TRIGGER IF NOT EXISTS r1_receipts_no_update
BEFORE UPDATE ON r1_action_receipts BEGIN SELECT RAISE(ABORT, 'R1 receipts are append-only'); END;
CREATE TRIGGER IF NOT EXISTS r1_receipts_no_delete
BEFORE DELETE ON r1_action_receipts BEGIN SELECT RAISE(ABORT, 'R1 receipts are append-only'); END;
