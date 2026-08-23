-- 0050 DOWN (PostgreSQL): roll back r1_durable_task_metadata to the 0049 state.
-- Reverses server/src/db/migrations/0050_r1_durable_task_metadata.sql exactly.
-- Trigger/function first, then the events table, then the additive columns.

DROP TRIGGER IF EXISTS r1_task_created_event ON r1_tasks;
DROP FUNCTION IF EXISTS append_r1_task_created_event();
DROP INDEX IF EXISTS r1_task_events_project_task_sequence_idx;
DROP TABLE IF EXISTS r1_task_events;

ALTER TABLE r1_tasks DROP COLUMN IF EXISTS current_step_id;
ALTER TABLE r1_tasks DROP COLUMN IF EXISTS input_reference;
ALTER TABLE r1_tasks DROP COLUMN IF EXISTS policy_version;
ALTER TABLE r1_tasks DROP COLUMN IF EXISTS capability_ids;
ALTER TABLE r1_tasks DROP COLUMN IF EXISTS goal;
ALTER TABLE r1_tasks DROP COLUMN IF EXISTS agent_id;
ALTER TABLE r1_tasks DROP COLUMN IF EXISTS principal_id;
