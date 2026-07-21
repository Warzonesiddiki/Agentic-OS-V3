-- E4-S1 governed capability inventory and active deterministic policy.
CREATE TABLE IF NOT EXISTS r1_governed_capabilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('native', 'mcp', 'a2a', 'provider', 'skill')),
  version TEXT NOT NULL,
  owner TEXT NOT NULL,
  input_schema JSONB NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
  scope JSONB NOT NULL,
  health TEXT NOT NULL CHECK (health IN ('healthy', 'degraded', 'unavailable')),
  enabled BOOLEAN NOT NULL
);
CREATE TABLE IF NOT EXISTS r1_capability_policies (
  id TEXT PRIMARY KEY CHECK (id = 'active'),
  version TEXT NOT NULL,
  rules JSONB NOT NULL
);
