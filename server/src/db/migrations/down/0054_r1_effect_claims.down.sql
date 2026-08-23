-- 0054 DOWN (PostgreSQL): roll back r1_effect_claims to the 0053_r1_sync state.
-- Reverses server/src/db/migrations/0054_r1_effect_claims.sql exactly.

DROP INDEX IF EXISTS r1_effect_claims_reconciliation_idx;
DROP TABLE IF EXISTS r1_effect_claims;
