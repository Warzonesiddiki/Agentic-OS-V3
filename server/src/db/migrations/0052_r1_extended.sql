-- 0052 R1 extended: recall feedback, contradiction, checkpoints, leases, compensations, kill switch, quarantine, durable approvals, telemetry

-- Checkpoints for E3-S2
CREATE TABLE IF NOT EXISTS r1_checkpoints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  step_id TEXT,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  state_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (task_id, sequence)
);
CREATE INDEX IF NOT EXISTS r1_checkpoints_task_sequence_idx ON r1_checkpoints(task_id, sequence);

-- Leases for worker claim/heartbeat
CREATE TABLE IF NOT EXISTS r1_leases (
  task_id TEXT PRIMARY KEY REFERENCES r1_tasks(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  heartbeat_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS r1_leases_expires_idx ON r1_leases(expires_at);

-- Compensations for E3-S3
CREATE TABLE IF NOT EXISTS r1_compensations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  target_step_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','running','completed','failed')),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS r1_compensations_task_idx ON r1_compensations(task_id);

-- Feedback for E2-S3
CREATE TABLE IF NOT EXISTS r1_feedback (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  result_id TEXT NOT NULL REFERENCES r1_memories(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  helpful BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS r1_feedback_project_result_idx ON r1_feedback(project_id, result_id);

-- Contradictions
CREATE TABLE IF NOT EXISTS r1_contradictions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  memory_a_id TEXT NOT NULL REFERENCES r1_memories(id) ON DELETE CASCADE,
  memory_b_id TEXT NOT NULL REFERENCES r1_memories(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_ids JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('candidate','confirmed','dismissed')) DEFAULT 'candidate',
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS r1_contradictions_project_idx ON r1_contradictions(project_id);

-- Kill switch
CREATE TABLE IF NOT EXISTS r1_kill_switch (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  enabled BOOLEAN NOT NULL,
  reason TEXT NOT NULL,
  scope JSONB NOT NULL,
  enabled_by TEXT NOT NULL,
  enabled_at TIMESTAMPTZ NOT NULL,
  disabled_by TEXT,
  disabled_at TIMESTAMPTZ
);

-- Quarantine
CREATE TABLE IF NOT EXISTS r1_quarantine (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  quarantined_at TIMESTAMPTZ NOT NULL,
  quarantined_by TEXT NOT NULL,
  PRIMARY KEY (project_id, task_id)
);

-- Durable approvals (rich)
CREATE TABLE IF NOT EXISTS r1_durable_approvals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','approved','denied','expired')),
  action JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  decision_actor_id TEXT,
  decision_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS r1_durable_approvals_project_state_idx ON r1_durable_approvals(project_id, state);

-- Telemetry spans (append-only, but not protected by trigger for low cardinality)
CREATE TABLE IF NOT EXISTS r1_telemetry_spans (
  span_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  parent_span_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('task','agent','recall','model','approval_wait','tool','outcome','checkpoint')),
  name TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('ok','error','unset')),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  task_id TEXT REFERENCES r1_tasks(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  approval_id TEXT,
  receipt_id TEXT
);
CREATE INDEX IF NOT EXISTS r1_telemetry_spans_trace_idx ON r1_telemetry_spans(trace_id);
CREATE INDEX IF NOT EXISTS r1_telemetry_spans_task_idx ON r1_telemetry_spans(task_id);

-- Add lease columns to r1_tasks if not exists (worker restart recovery)
ALTER TABLE r1_tasks ADD COLUMN IF NOT EXISTS lease_owner TEXT;
ALTER TABLE r1_tasks ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE r1_tasks ADD COLUMN IF NOT EXISTS retry_attempts INTEGER NOT NULL DEFAULT 0;
