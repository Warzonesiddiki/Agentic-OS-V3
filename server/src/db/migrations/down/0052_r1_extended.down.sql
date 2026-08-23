-- 0052 DOWN (PostgreSQL): roll back r1_extended to the 0051_r1_capability_governance state.
-- Reverses server/src/db/migrations/0052_r1_extended.sql exactly.
-- Convention (WS3, ADR-0031 era): child tables first, then indexes (dropped with tables),
-- then ALTER-column reversals. Idempotent via IF EXISTS. Data is NOT preserved by design:
-- rollback of an additive R1 slice discards R1-only rows; take a backup before running
-- (see docs/bmad/releases/evidence/ drill procedure, Gate-0 blocker B3).

ALTER TABLE r1_tasks DROP COLUMN IF EXISTS lease_owner;
ALTER TABLE r1_tasks DROP COLUMN IF EXISTS lease_expires_at;
ALTER TABLE r1_tasks DROP COLUMN IF EXISTS retry_attempts;

DROP TABLE IF EXISTS r1_telemetry_spans;
DROP TABLE IF EXISTS r1_durable_approvals;
DROP TABLE IF EXISTS r1_quarantine;
DROP TABLE IF EXISTS r1_kill_switch;
DROP TABLE IF EXISTS r1_contradictions;
DROP TABLE IF EXISTS r1_feedback;
DROP TABLE IF EXISTS r1_compensations;
DROP TABLE IF EXISTS r1_leases;
DROP TABLE IF EXISTS r1_checkpoints;
