-- Nexus-20 schema with pgvector support
-- Run against PostgreSQL 16+ with pgvector extension installed
-- This replaces the real[] fallback in the original migrations

-- Ensure vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Core tables (from 0000_naive_franklin_richards.sql)
CREATE TABLE IF NOT EXISTS "agent_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'interactive' NOT NULL,
	"queue" text DEFAULT 'Q1' NOT NULL,
	"priority" integer DEFAULT 80 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"idempotency_key" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'sub-agent' NOT NULL,
	"parent_id" text,
	"ring" integer DEFAULT 1 NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"current_tool" text,
	"llm_model" text,
	"token_budget" integer DEFAULT 100000 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"timeout_ms" integer DEFAULT 120000 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "audit_log" (
	"sequence" bigint PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"entry_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_id_unique" UNIQUE("id")
);

CREATE TABLE IF NOT EXISTS "compiled_scripts" (
	"id" text PRIMARY KEY NOT NULL,
	"pattern_signature" text NOT NULL,
	"task_label" text NOT NULL,
	"trigger_pattern" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"script" text NOT NULL,
	"language" text DEFAULT 'javascript' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"eval_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"times_executed" integer DEFAULT 0 NOT NULL,
	"tokens_saved" integer DEFAULT 0 NOT NULL,
	"detected_count" integer DEFAULT 0 NOT NULL,
	"avg_latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "cron_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cron" text NOT NULL,
	"agent_kind" text DEFAULT 'daemon' NOT NULL,
	"task_label" text NOT NULL,
	"task_input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"item_id" text NOT NULL,
	"item_type" text NOT NULL,
	"helpful" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Memories with vector(1536) instead of real[]
CREATE TABLE IF NOT EXISTS "memories" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"importance" real DEFAULT 0.5 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"project_id" text,
	"token_cost" integer DEFAULT 0 NOT NULL,
	"recall_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_recalled_at" timestamp with time zone,
	"embedding" vector(1536)
);

CREATE TABLE IF NOT EXISTS "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"frontmatter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"wikilinks" text[] DEFAULT '{}' NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"mtime" timestamp with time zone,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"memory_count" integer DEFAULT 0 NOT NULL,
	"skill_count" integer DEFAULT 0 NOT NULL,
	"token_footprint" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sandbox_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"type" text DEFAULT 'docker' NOT NULL,
	"code" text NOT NULL,
	"language" text DEFAULT 'javascript' NOT NULL,
	"exit_code" integer,
	"stdout" text DEFAULT '' NOT NULL,
	"stderr" text DEFAULT '' NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Skills with vector(1536) instead of real[]
CREATE TABLE IF NOT EXISTS "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"trigger" text,
	"rating" real DEFAULT 0 NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"project_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding" vector(1536)
);

CREATE TABLE IF NOT EXISTS "state_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"saga_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"step_index" integer NOT NULL,
	"step_name" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "system_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "token_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"tokens_injected" integer DEFAULT 0 NOT NULL,
	"tokens_reused" integer DEFAULT 0 NOT NULL,
	"tokens_saved" integer DEFAULT 0 NOT NULL,
	"items_returned" integer DEFAULT 0 NOT NULL,
	"real" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tool_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"audit_sequence" bigint NOT NULL,
	"agent_id" text NOT NULL,
	"tool" text NOT NULL,
	"target" text,
	"pre_hash" text,
	"post_hash" text,
	"exit_code" integer,
	"authorized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "trajectory_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"audit_sequence" bigint NOT NULL,
	"agent_id" text NOT NULL,
	"model" text NOT NULL,
	"prompt_sent" text NOT NULL,
	"response_received" text DEFAULT '' NOT NULL,
	"token_usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Merkle chain tables (from 0002_smooth_tony_stark.sql)
CREATE TABLE IF NOT EXISTS "merkle_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"chunk_start_seq" bigint NOT NULL,
	"chunk_end_seq" bigint NOT NULL,
	"merkle_root" text NOT NULL,
	"prev_checkpoint_hash" text NOT NULL,
	"entry_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "anchored_roots" (
	"id" text PRIMARY KEY NOT NULL,
	"checkpoint_id" text NOT NULL,
	"merkle_root" text NOT NULL,
	"chain_id" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"block_number" bigint,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);

-- Foreign keys
DO $$ BEGIN
 ALTER TABLE "memories" ADD CONSTRAINT "memories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "skills" ADD CONSTRAINT "skills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "task_agent_idx" ON "agent_tasks" USING btree ("agent_id");
CREATE INDEX IF NOT EXISTS "task_status_idx" ON "agent_tasks" USING btree ("status");
CREATE INDEX IF NOT EXISTS "task_queue_idx" ON "agent_tasks" USING btree ("queue");
CREATE UNIQUE INDEX IF NOT EXISTS "task_idem_unique" ON "agent_tasks" USING btree ("idempotency_key");
CREATE INDEX IF NOT EXISTS "agent_parent_idx" ON "agents" USING btree ("parent_id");
CREATE INDEX IF NOT EXISTS "agent_status_idx" ON "agents" USING btree ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "apikey_hash_unique" ON "api_keys" USING btree ("key_hash");
CREATE INDEX IF NOT EXISTS "audit_seq_idx" ON "audit_log" USING btree ("sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "script_sig_unique" ON "compiled_scripts" USING btree ("pattern_signature");
CREATE INDEX IF NOT EXISTS "script_status_idx" ON "compiled_scripts" USING btree ("status");
CREATE INDEX IF NOT EXISTS "cron_enabled_idx" ON "cron_jobs" USING btree ("enabled");
CREATE INDEX IF NOT EXISTS "cron_nextrun_idx" ON "cron_jobs" USING btree ("next_run_at");
CREATE INDEX IF NOT EXISTS "feedback_item_idx" ON "feedback" USING btree ("item_id");
CREATE INDEX IF NOT EXISTS "mem_kind_idx" ON "memories" USING btree ("kind");
CREATE INDEX IF NOT EXISTS "mem_importance_idx" ON "memories" USING btree ("importance");
CREATE INDEX IF NOT EXISTS "mem_created_idx" ON "memories" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "mem_project_idx" ON "memories" USING btree ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "note_path_unique" ON "notes" USING btree ("path");
CREATE UNIQUE INDEX IF NOT EXISTS "project_name_unique" ON "projects" USING btree ("name");
CREATE INDEX IF NOT EXISTS "sandbox_agent_idx" ON "sandbox_executions" USING btree ("agent_id");
CREATE INDEX IF NOT EXISTS "sandbox_status_idx" ON "sandbox_executions" USING btree ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "skill_name_unique" ON "skills" USING btree ("name",COALESCE("project_id", ''));
CREATE INDEX IF NOT EXISTS "skill_category_idx" ON "skills" USING btree ("category");
CREATE INDEX IF NOT EXISTS "skill_rating_idx" ON "skills" USING btree ("rating");
CREATE INDEX IF NOT EXISTS "snap_saga_idx" ON "state_snapshots" USING btree ("saga_id");
CREATE INDEX IF NOT EXISTS "receipt_audit_idx" ON "tool_receipts" USING btree ("audit_sequence");
CREATE INDEX IF NOT EXISTS "receipt_agent_idx" ON "tool_receipts" USING btree ("agent_id");
CREATE INDEX IF NOT EXISTS "traj_audit_idx" ON "trajectory_logs" USING btree ("audit_sequence");

-- HNSW indexes for vector similarity search (now with pgvector!)
CREATE INDEX IF NOT EXISTS "memories_embedding_hnsw" ON "memories" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "skills_embedding_hnsw" ON "skills" USING hnsw ("embedding" vector_cosine_ops);

-- Notes embedding column (from 0001_stormy_omega_red.sql)
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
CREATE INDEX IF NOT EXISTS "notes_embedding_hnsw" ON "notes" USING hnsw ("embedding" vector_cosine_ops);
