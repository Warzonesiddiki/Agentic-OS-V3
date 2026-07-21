-- SQLite/local equivalent of 0050_r1_durable_task_metadata.sql.
-- SQLite has no ADD COLUMN IF NOT EXISTS. The application migration runner must
-- apply this once to databases that already contain 0049.

ALTER TABLE r1_tasks ADD COLUMN principal_id TEXT NOT NULL DEFAULT 'system';
ALTER TABLE r1_tasks ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'unassigned';
ALTER TABLE r1_tasks ADD COLUMN goal TEXT NOT NULL DEFAULT '';
ALTER TABLE r1_tasks ADD COLUMN capability_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE r1_tasks ADD COLUMN policy_version TEXT NOT NULL DEFAULT 'unversioned';
ALTER TABLE r1_tasks ADD COLUMN input_reference TEXT NOT NULL DEFAULT 'none';
ALTER TABLE r1_tasks ADD COLUMN current_step_id TEXT;

CREATE TABLE IF NOT EXISTS r1_task_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('created', 'admit', 'require_approval', 'approve', 'deny', 'complete', 'fail', 'cancel')),
  state TEXT NOT NULL CHECK (state IN ('queued', 'waiting_approval', 'running', 'completed', 'failed', 'cancelled')),
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (task_id, sequence)
);
CREATE INDEX IF NOT EXISTS r1_task_events_project_task_sequence_idx
  ON r1_task_events(project_id, task_id, sequence);

CREATE TRIGGER IF NOT EXISTS r1_task_created_event
AFTER INSERT ON r1_tasks
BEGIN
  INSERT INTO r1_task_events (id, project_id, task_id, event, state, sequence, created_at)
  VALUES (NEW.id || ':created', NEW.project_id, NEW.id, 'created', NEW.state, 0, NEW.created_at);
END;
