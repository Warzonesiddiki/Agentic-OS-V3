-- E10-R1 SQLite equivalent of the atomic pre-effect claim ledger.
CREATE TABLE IF NOT EXISTS r1_effect_claims (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES r1_tasks(id) ON DELETE CASCADE,
  correlation_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('claimed', 'completed')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (project_id, task_id, correlation_id, operation)
);
CREATE INDEX IF NOT EXISTS r1_effect_claims_reconciliation_idx
  ON r1_effect_claims(project_id, state, created_at);
