-- 0048_vector_hnsw_indexes.sql
-- Migration mapping index updates, check constraints, foreign keys, and type changes from Phase 4.

-- Upgrading plugin_receipts.fuel_used to text type
ALTER TABLE plugin_receipts ALTER COLUMN fuel_used TYPE TEXT USING fuel_used::TEXT;
ALTER TABLE plugin_receipts ALTER COLUMN fuel_used SET DEFAULT '0';

-- Upgrading federated_memory_proofs.embedding to real[] type
ALTER TABLE federated_memory_proofs ALTER COLUMN embedding TYPE REAL[] USING NULL;

-- Make plugin_receipts.agent_id nullable (for ON DELETE SET NULL)
ALTER TABLE plugin_receipts ALTER COLUMN agent_id DROP NOT NULL;

-- 1. Composite and Partial Indexes on agent_tasks
CREATE INDEX IF NOT EXISTS agent_tasks_status_priority_queue_idx ON agent_tasks (status, priority, queue);
CREATE INDEX IF NOT EXISTS agent_tasks_queued_priority_created_idx ON agent_tasks (priority, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS agent_tasks_agent_status_idx ON agent_tasks (agent_id, status);

-- 2. Partial Index on cron_jobs
CREATE INDEX IF NOT EXISTS cron_jobs_enabled_next_run_idx ON cron_jobs (next_run_at) WHERE enabled = true;

-- 3. Composite Index on pipeline_runs
CREATE INDEX IF NOT EXISTS pipeline_runs_pipeline_status_idx ON pipeline_runs (pipeline_id, status);

-- 4. Composite Index on span_logs
CREATE INDEX IF NOT EXISTS span_logs_trace_parent_idx ON span_logs (trace_id, parent_id);

-- 5. Composite Index on memories
CREATE INDEX IF NOT EXISTS memories_kind_importance_idx ON memories (kind, importance);

-- 6. GIN Indexes
CREATE INDEX IF NOT EXISTS mem_tags_gin_idx ON memories USING GIN (tags);
CREATE INDEX IF NOT EXISTS plugin_manifest_gin_idx ON plugins USING GIN (manifest);
CREATE INDEX IF NOT EXISTS audit_payload_gin_idx ON audit_log USING GIN (payload);

-- 7. Add Foreign Key constraints with cascades
ALTER TABLE agent_tasks DROP CONSTRAINT IF EXISTS agent_tasks_agent_id_fkey;
ALTER TABLE agent_tasks ADD CONSTRAINT agent_tasks_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE;

ALTER TABLE sandbox_executions DROP CONSTRAINT IF EXISTS sandbox_executions_agent_id_fkey;
ALTER TABLE sandbox_executions ADD CONSTRAINT sandbox_executions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE;

ALTER TABLE trajectory_logs DROP CONSTRAINT IF EXISTS trajectory_logs_agent_id_fkey;
ALTER TABLE trajectory_logs ADD CONSTRAINT trajectory_logs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE;

ALTER TABLE tool_receipts DROP CONSTRAINT IF EXISTS tool_receipts_agent_id_fkey;
ALTER TABLE tool_receipts ADD CONSTRAINT tool_receipts_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE;

ALTER TABLE plugin_receipts DROP CONSTRAINT IF EXISTS plugin_receipts_agent_id_fkey;
ALTER TABLE plugin_receipts ADD CONSTRAINT plugin_receipts_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE SET NULL;

ALTER TABLE state_snapshots DROP CONSTRAINT IF EXISTS state_snapshots_agent_id_fkey;
ALTER TABLE state_snapshots ADD CONSTRAINT state_snapshots_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE;

-- 8. Add check constraints
ALTER TABLE memories ADD CONSTRAINT mem_kind_check CHECK (kind IN ('episodic', 'semantic', 'preference', 'reflexion', 'fact'));
ALTER TABLE projects ADD CONSTRAINT project_status_check CHECK (status IN ('active', 'archived', 'paused'));
ALTER TABLE anchored_roots ADD CONSTRAINT anchor_status_check CHECK (status IN ('pending', 'confirmed', 'failed'));
ALTER TABLE agents ADD CONSTRAINT agent_kind_check CHECK (kind IN ('master', 'sub-agent', 'daemon'));
ALTER TABLE agents ADD CONSTRAINT agent_status_check CHECK (status IN ('idle', 'thinking', 'executing_tool', 'errored', 'quarantined', 'completed'));
ALTER TABLE agent_tasks ADD CONSTRAINT task_kind_check CHECK (kind IN ('interactive', 'background', 'maintenance', 'safety', 'self_improvement'));
ALTER TABLE agent_tasks ADD CONSTRAINT task_queue_check CHECK (queue IN ('Q0', 'Q1', 'Q2', 'Q3', 'Q4'));
ALTER TABLE agent_tasks ADD CONSTRAINT task_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'dead_letter'));
ALTER TABLE span_logs ADD CONSTRAINT span_type_check CHECK (type IN ('agent_span', 'tool_span', 'llm_span', 'handoff_span'));
ALTER TABLE span_logs ADD CONSTRAINT span_status_check CHECK (status IN ('ok', 'error', 'cancelled'));
ALTER TABLE sandbox_executions ADD CONSTRAINT sandbox_type_check CHECK (type IN ('docker', 'wasm', 'browser'));
ALTER TABLE sandbox_executions ADD CONSTRAINT sandbox_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'timeout'));
ALTER TABLE compiled_scripts ADD CONSTRAINT compiled_script_status_check CHECK (status IN ('draft', 'testing', 'active', 'deprecated'));
ALTER TABLE improvement_proposals ADD CONSTRAINT imp_prop_risk_check CHECK (risk_class IN ('ADVISORY', 'BLOCKING', 'SAFETY'));
ALTER TABLE improvement_proposals ADD CONSTRAINT imp_prop_status_check CHECK (status IN ('draft', 'testing', 'canary', 'rolled_out', 'reverted', 'rejected'));
ALTER TABLE plugins ADD CONSTRAINT plugin_source_check CHECK (source IN ('local', 'marketplace', 'signed-url'));
ALTER TABLE plugins ADD CONSTRAINT plugin_trust_check CHECK (trust_state IN ('untrusted', 'trusted', 'revoked'));
ALTER TABLE federated_memory_proofs ADD CONSTRAINT fed_proof_privacy_check CHECK (privacy_class IN ('public', 'private', 'protected'));
ALTER TABLE llm_provider_health ADD CONSTRAINT llm_prov_state_check CHECK (state IN ('closed', 'half-open', 'open'));
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_run_status_check CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled'));
