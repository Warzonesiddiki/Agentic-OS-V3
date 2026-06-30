-- 0004_performance_indexes.sql
-- Performance indexes for hot NEXUS query paths.
-- Safe to run repeatedly. Use CONCURRENTLY manually in production if tables are large.

CREATE INDEX IF NOT EXISTS memories_created_id_idx ON memories (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS memories_updated_id_idx ON memories (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS memories_kind_created_idx ON memories (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_project_created_idx ON memories (project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memories_tags_gin_idx ON memories USING gin (tags);

CREATE INDEX IF NOT EXISTS skills_created_id_idx ON skills (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS skills_category_rating_idx ON skills (category, rating DESC);
CREATE INDEX IF NOT EXISTS skills_tags_gin_idx ON skills USING gin (tags);

CREATE INDEX IF NOT EXISTS notes_indexed_id_idx ON notes (indexed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notes_tags_gin_idx ON notes USING gin (tags);
CREATE INDEX IF NOT EXISTS notes_wikilinks_gin_idx ON notes USING gin (wikilinks);

CREATE INDEX IF NOT EXISTS audit_log_created_seq_idx ON audit_log (created_at DESC, sequence DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_created_idx ON audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_created_idx ON audit_log (actor, created_at DESC);

CREATE INDEX IF NOT EXISTS token_ledger_created_idx ON token_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_item_helpful_idx ON feedback (item_id, helpful);

CREATE INDEX IF NOT EXISTS agents_status_updated_idx ON agents (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_tasks_status_priority_created_idx ON agent_tasks (status, priority ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_tasks_agent_status_idx ON agent_tasks (agent_id, status);
CREATE INDEX IF NOT EXISTS agent_tasks_trace_idx ON agent_tasks (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cron_jobs_enabled_next_idx ON cron_jobs (enabled, next_run_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS trajectory_logs_agent_created_idx ON trajectory_logs (agent_id, created_at DESC);
