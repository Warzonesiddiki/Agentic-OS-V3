-- 0051 DOWN (PostgreSQL): roll back r1_capability_governance to the 0050 state.
-- Reverses server/src/db/migrations/0051_r1_capability_governance.sql exactly.

DROP TABLE IF EXISTS r1_capability_policies;
DROP TABLE IF EXISTS r1_governed_capabilities;
