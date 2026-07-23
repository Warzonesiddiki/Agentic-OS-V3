-- E10-R1: atomic pre-effect claim. A claimed row blocks concurrent workers from
-- repeating a non-transactional tool side effect; reconciliation is required
-- after a crash that occurs after the side effect and before receipt completion.
CREATE TABLE IF NOT EXISTS r1_effect_claims (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  correlation_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('claimed', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (project_id, task_id, correlation_id, operation)
);
CREATE INDEX IF NOT EXISTS r1_effect_claims_reconciliation_idx
  ON r1_effect_claims(project_id, state, created_at);
