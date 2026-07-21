-- R1 governed runtime persistence (E0-S3).
-- Deliberately uses text identifiers so existing local/legacy project ids can be
-- migrated without lossy casts. API boundaries still validate UUID contracts
-- where required by the R1 schemas.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'local';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS projects_r1_idempotency_key_idx
  ON projects(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS r1_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'waiting_approval', 'running', 'completed', 'failed', 'cancelled')),
  title TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS r1_tasks_project_state_idx
  ON r1_tasks(project_id, state, updated_at);

CREATE TABLE IF NOT EXISTS r1_task_steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  capability_id TEXT,
  UNIQUE (task_id, sequence)
);

CREATE TABLE IF NOT EXISTS r1_memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS r1_memories_project_idx ON r1_memories(project_id, updated_at);

CREATE TABLE IF NOT EXISTS r1_capabilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('native', 'mcp', 'a2a', 'provider', 'skill')),
  version TEXT NOT NULL,
  owner TEXT NOT NULL,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS r1_approvals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'approved', 'denied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS r1_approvals_pending_idx
  ON r1_approvals(project_id, state, updated_at);

CREATE TABLE IF NOT EXISTS r1_evidence (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES r1_tasks(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('provenance', 'trace', 'receipt', 'approval', 'source')),
  source TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-fA-F]{64}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS r1_evidence_project_created_idx
  ON r1_evidence(project_id, created_at);

CREATE TABLE IF NOT EXISTS r1_action_receipts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  correlation_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tool_call', 'file_write', 'db_write', 'approval', 'external_request')),
  actor TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'require_approval')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS r1_receipts_project_created_idx
  ON r1_action_receipts(project_id, created_at);

-- Receipts and evidence are append-only. The database must reject destructive
-- mutations even if a caller bypasses the application service.
CREATE OR REPLACE FUNCTION prevent_r1_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'R1 evidence/receipts are append-only. Mutation not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS r1_evidence_no_update ON r1_evidence;
CREATE TRIGGER r1_evidence_no_update
BEFORE UPDATE OR DELETE ON r1_evidence
FOR EACH ROW EXECUTE FUNCTION prevent_r1_append_only_mutation();

DROP TRIGGER IF EXISTS r1_receipts_no_update ON r1_action_receipts;
CREATE TRIGGER r1_receipts_no_update
BEFORE UPDATE OR DELETE ON r1_action_receipts
FOR EACH ROW EXECUTE FUNCTION prevent_r1_append_only_mutation();
