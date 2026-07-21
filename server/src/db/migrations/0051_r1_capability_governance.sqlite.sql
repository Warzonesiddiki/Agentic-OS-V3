-- SQLite/local equivalent of 0051_r1_capability_governance.sql.
CREATE TABLE IF NOT EXISTS r1_governed_capabilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('native', 'mcp', 'a2a', 'provider', 'skill')),
  version TEXT NOT NULL,
  owner TEXT NOT NULL,
  input_schema TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
  scope TEXT NOT NULL,
  health TEXT NOT NULL CHECK (health IN ('healthy', 'degraded', 'unavailable')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1))
);
CREATE TABLE IF NOT EXISTS r1_capability_policies (
  id TEXT PRIMARY KEY CHECK (id = 'active'),
  version TEXT NOT NULL,
  rules TEXT NOT NULL
);
