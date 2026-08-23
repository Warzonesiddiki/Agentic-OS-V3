-- 0053 DOWN (SQLite): roll back r1_sync to the 0052_r1_extended state.
-- Reverses server/src/db/migrations/0053_r1_sync.sqlite.sql exactly.
-- Index/table names match the PostgreSQL down; SQLite DROP syntax is identical.

DROP INDEX IF EXISTS r1_a2a_tasks_local_task_idx;
DROP TABLE IF EXISTS r1_a2a_tasks;
DROP TABLE IF EXISTS r1_a2a_cards;

DROP INDEX IF EXISTS r1_mcp_servers_owner_idx;
DROP TABLE IF EXISTS r1_mcp_servers;

DROP TABLE IF EXISTS r1_sync_states;
DROP INDEX IF EXISTS r1_sync_conflicts_project_status_idx;
DROP TABLE IF EXISTS r1_sync_conflicts;
DROP INDEX IF EXISTS r1_sync_changes_project_revision_idx;
DROP INDEX IF EXISTS r1_sync_changes_record_idx;
DROP TABLE IF EXISTS r1_sync_changes;
DROP TABLE IF EXISTS r1_sync_revisions;
