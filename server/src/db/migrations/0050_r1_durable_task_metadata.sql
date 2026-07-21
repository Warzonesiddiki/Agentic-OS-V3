-- E3-S1 durable task submission metadata and committed creation events.
-- This is deliberately additive so installations that already ran 0049 can
-- migrate without rewriting existing R1 task rows.

ALTER TABLE r1_tasks ADD COLUMN IF NOT EXISTS principal_id TEXT NOT NULL DEFAULT 'system';
ALTER TABLE r1_tasks ADD COLUMN IF NOT EXISTS agent_id TEXT NOT NULL DEFAULT 'unassigned';
ALTER TABLE r1_tasks ADD COLUMN IF NOT EXISTS goal TEXT NOT NULL DEFAULT '';
ALTER TABLE r1_tasks ADD COLUMN IF NOT EXISTS capability_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE r1_tasks ADD COLUMN IF NOT EXISTS policy_version TEXT NOT NULL DEFAULT 'unversioned';
ALTER TABLE r1_tasks ADD COLUMN IF NOT EXISTS input_reference TEXT NOT NULL DEFAULT 'none';
ALTER TABLE r1_tasks ADD COLUMN IF NOT EXISTS current_step_id TEXT;

CREATE TABLE IF NOT EXISTS r1_task_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('created', 'admit', 'require_approval', 'approve', 'deny', 'complete', 'fail', 'cancel')),
  state TEXT NOT NULL CHECK (state IN ('queued', 'waiting_approval', 'running', 'completed', 'failed', 'cancelled')),
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (task_id, sequence)
);
CREATE INDEX IF NOT EXISTS r1_task_events_project_task_sequence_idx
  ON r1_task_events(project_id, task_id, sequence);

CREATE OR REPLACE FUNCTION append_r1_task_created_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO r1_task_events (id, project_id, task_id, event, state, sequence, created_at)
  VALUES (NEW.id || ':created', NEW.project_id, NEW.id, 'created', NEW.state, 0, NEW.created_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS r1_task_created_event ON r1_tasks;
CREATE TRIGGER r1_task_created_event
AFTER INSERT ON r1_tasks
FOR EACH ROW EXECUTE FUNCTION append_r1_task_created_event();
