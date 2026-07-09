-- PHASE 18 — AI-Native Self-Optimization control surface tables.
-- Mirrors selfOptParamVersions / selfOptExperiments / selfOptKnowledgeBus / selfOptEvents
-- in src/db/schema-sqlite.ts. Append-only + immutable.

CREATE TABLE IF NOT EXISTS "self_opt_param_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "tuner_id" text NOT NULL,
  "owner_agent" text NOT NULL,
  "target_interface" text NOT NULL,
  "experiment_id" text,
  "parent_id" text,
  "before_json" text DEFAULT '{}' NOT NULL,
  "after_json" text DEFAULT '{}' NOT NULL,
  "status" text DEFAULT 'shadow' NOT NULL,
  "proposed_by" text DEFAULT 'pulse' NOT NULL,
  "p_value" real,
  "metric_delta" real,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  "promoted_at" text,
  CONSTRAINT "self_opt_param_versions_status_check" CHECK ("status" IN ('shadow', 'promoted', 'rolled_back', 'rejected'))
);

CREATE INDEX IF NOT EXISTS "sopv_tuner_idx" ON "self_opt_param_versions" ("tuner_id");
CREATE INDEX IF NOT EXISTS "sopv_status_idx" ON "self_opt_param_versions" ("status");
CREATE INDEX IF NOT EXISTS "sopv_owner_idx" ON "self_opt_param_versions" ("owner_agent");
CREATE INDEX IF NOT EXISTS "sopv_parent_idx" ON "self_opt_param_versions" ("parent_id");
CREATE INDEX IF NOT EXISTS "sopv_exp_idx" ON "self_opt_param_versions" ("experiment_id");

CREATE TABLE IF NOT EXISTS "self_opt_experiments" (
  "id" text PRIMARY KEY NOT NULL,
  "tuner_id" text NOT NULL,
  "hypothesis" text NOT NULL,
  "metric" text NOT NULL,
  "variant_a" text DEFAULT '{}' NOT NULL,
  "variant_b" text DEFAULT '{}' NOT NULL,
  "min_sample_size" integer DEFAULT 2000 NOT NULL,
  "alpha" real DEFAULT 0.05 NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "winner" text,
  "p_value" real,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  "finished_at" text,
  CONSTRAINT "self_opt_experiments_status_check" CHECK ("status" IN ('running', 'completed', 'stopped'))
);

CREATE INDEX IF NOT EXISTS "soe_tuner_idx" ON "self_opt_experiments" ("tuner_id");
CREATE INDEX IF NOT EXISTS "soe_status_idx" ON "self_opt_experiments" ("status");

CREATE TABLE IF NOT EXISTS "self_opt_knowledge_bus" (
  "id" text PRIMARY KEY NOT NULL,
  "tuner_id" text NOT NULL,
  "owner_agent" text NOT NULL,
  "target_interface" text NOT NULL,
  "config_json" text DEFAULT '{}' NOT NULL,
  "score" real DEFAULT 0 NOT NULL,
  "scope" text DEFAULT 'local' NOT NULL,
  "published_by" text DEFAULT 'pulse' NOT NULL,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

CREATE INDEX IF NOT EXISTS "sokb_tuner_idx" ON "self_opt_knowledge_bus" ("tuner_id");
CREATE INDEX IF NOT EXISTS "sokb_owner_idx" ON "self_opt_knowledge_bus" ("owner_agent");
CREATE INDEX IF NOT EXISTS "sokb_scope_idx" ON "self_opt_knowledge_bus" ("scope");
CREATE INDEX IF NOT EXISTS "sokb_score_idx" ON "self_opt_knowledge_bus" ("score");

CREATE TABLE IF NOT EXISTS "self_opt_events" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "tuner_id" text,
  "owner_agent" text,
  "actor" text DEFAULT 'pulse' NOT NULL,
  "detail_json" text DEFAULT '{}' NOT NULL,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  CONSTRAINT "self_opt_events_kind_check" CHECK ("kind" IN ('propose', 'commit', 'rollback', 'trip', 'reject', 'pause', 'sim'))
);

CREATE INDEX IF NOT EXISTS "soe_event_kind_idx" ON "self_opt_events" ("kind");
CREATE INDEX IF NOT EXISTS "soe_event_tuner_idx" ON "self_opt_events" ("tuner_id");
CREATE INDEX IF NOT EXISTS "soe_event_created_idx" ON "self_opt_events" ("created_at");
