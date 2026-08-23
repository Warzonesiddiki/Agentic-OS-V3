-- 0054 DOWN (SQLite): roll back r1_effect_claims to the 0053 state.
-- Reverses server/src/db/migrations/0054_r1_effect_claims.sqlite.sql exactly.

DROP INDEX IF EXISTS r1_effect_claims_reconciliation_idx;
DROP TABLE IF EXISTS r1_effect_claims;
