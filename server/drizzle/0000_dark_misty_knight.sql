CREATE TABLE `agent_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`label` text NOT NULL,
	`kind` text DEFAULT 'interactive' NOT NULL,
	`queue` text DEFAULT 'Q1' NOT NULL,
	`priority` integer DEFAULT 80 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`input` text DEFAULT '{}' NOT NULL,
	`output` text,
	`error` text,
	`idempotency_key` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 3 NOT NULL,
	`trace_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`started_at` text,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `task_agent_idx` ON `agent_tasks` (`agent_id`);--> statement-breakpoint
CREATE INDEX `task_status_idx` ON `agent_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `task_queue_idx` ON `agent_tasks` (`queue`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_idem_unique` ON `agent_tasks` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'sub-agent' NOT NULL,
	`parent_id` text,
	`ring` integer DEFAULT 1 NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`current_tool` text,
	`llm_model` text,
	`token_budget` integer DEFAULT 100000 NOT NULL,
	`tokens_used` integer DEFAULT 0 NOT NULL,
	`timeout_ms` integer DEFAULT 120000 NOT NULL,
	`max_retries` integer DEFAULT 3 NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_heartbeat_at` text
);
--> statement-breakpoint
CREATE INDEX `agent_parent_idx` ON `agents` (`parent_id`);--> statement-breakpoint
CREATE INDEX `agent_status_idx` ON `agents` (`status`);--> statement-breakpoint
CREATE TABLE `anchored_roots` (
	`id` text PRIMARY KEY NOT NULL,
	`checkpoint_id` text NOT NULL,
	`merkle_root` text NOT NULL,
	`chain_id` integer NOT NULL,
	`tx_hash` text NOT NULL,
	`block_number` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`confirmed_at` text,
	FOREIGN KEY (`checkpoint_id`) REFERENCES `merkle_checkpoints`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `anchor_checkpoint_idx` ON `anchored_roots` (`checkpoint_id`);--> statement-breakpoint
CREATE INDEX `anchor_root_idx` ON `anchored_roots` (`merkle_root`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apikey_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`sequence` integer PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`prev_hash` text NOT NULL,
	`entry_hash` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_id_unique` ON `audit_log` (`id`);--> statement-breakpoint
CREATE INDEX `audit_seq_idx` ON `audit_log` (`sequence`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `compiled_scripts` (
	`id` text PRIMARY KEY NOT NULL,
	`pattern_signature` text NOT NULL,
	`task_label` text NOT NULL,
	`trigger_pattern` text DEFAULT '{}' NOT NULL,
	`script` text NOT NULL,
	`language` text DEFAULT 'javascript' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`eval_results` text DEFAULT '{}' NOT NULL,
	`times_executed` integer DEFAULT 0 NOT NULL,
	`tokens_saved` integer DEFAULT 0 NOT NULL,
	`detected_count` integer DEFAULT 0 NOT NULL,
	`avg_latency_ms` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`activated_at` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `script_sig_unique` ON `compiled_scripts` (`pattern_signature`);--> statement-breakpoint
CREATE INDEX `script_status_idx` ON `compiled_scripts` (`status`);--> statement-breakpoint
CREATE TABLE `cron_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cron` text NOT NULL,
	`agent_kind` text DEFAULT 'daemon' NOT NULL,
	`task_label` text NOT NULL,
	`task_input` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`run_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cron_enabled_idx` ON `cron_jobs` (`enabled`);--> statement-breakpoint
CREATE INDEX `cron_nextrun_idx` ON `cron_jobs` (`next_run_at`);--> statement-breakpoint
CREATE TABLE `federated_memory_proofs` (
	`id` text PRIMARY KEY NOT NULL,
	`origin_peer_id` text NOT NULL,
	`origin_pubkey` text NOT NULL,
	`signature` text NOT NULL,
	`content_sha256` text NOT NULL,
	`embedding` text DEFAULT '[]' NOT NULL,
	`topic_tags` text DEFAULT '[]' NOT NULL,
	`importance` real DEFAULT 0.5 NOT NULL,
	`privacy_class` text DEFAULT 'public' NOT NULL,
	`materialized` integer DEFAULT false NOT NULL,
	`reject_reason` text,
	`received_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`expires_at` text
);
--> statement-breakpoint
CREATE INDEX `fed_proof_origin_idx` ON `federated_memory_proofs` (`origin_peer_id`);--> statement-breakpoint
CREATE INDEX `fed_proof_materialized_idx` ON `federated_memory_proofs` (`materialized`);--> statement-breakpoint
CREATE INDEX `fed_proof_received_idx` ON `federated_memory_proofs` (`received_at`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`item_id` text NOT NULL,
	`item_type` text NOT NULL,
	`helpful` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_item_idx` ON `feedback` (`item_id`);--> statement-breakpoint
CREATE TABLE `improvement_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`hypothesis` text NOT NULL,
	`target_metric` text NOT NULL,
	`baseline_value` real NOT NULL,
	`expected_delta` real NOT NULL,
	`risk_class` text DEFAULT 'ADVISORY' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`patch` text DEFAULT '{}' NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`author` text DEFAULT 'harness' NOT NULL,
	`reviewer` text,
	`rollout_pct` integer DEFAULT 0 NOT NULL,
	`measured_delta` real,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`decided_at` text
);
--> statement-breakpoint
CREATE INDEX `imp_prop_status_idx` ON `improvement_proposals` (`status`);--> statement-breakpoint
CREATE INDEX `imp_prop_metric_idx` ON `improvement_proposals` (`target_metric`);--> statement-breakpoint
CREATE INDEX `imp_prop_risk_idx` ON `improvement_proposals` (`risk_class`);--> statement-breakpoint
CREATE INDEX `imp_prop_created_idx` ON `improvement_proposals` (`created_at`);--> statement-breakpoint
CREATE TABLE `llm_provider_health` (
	`provider` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'closed' NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`p95_ms` real DEFAULT 0 NOT NULL,
	`last_failure_at` text,
	`last_success_at` text,
	`opened_at` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `llm_prov_state_idx` ON `llm_provider_health` (`state`);--> statement-breakpoint
CREATE TABLE `llm_token_budgets` (
	`session_id` text PRIMARY KEY NOT NULL,
	`budget` integer DEFAULT 100000 NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`hard_kill` integer DEFAULT false NOT NULL,
	`reason` text,
	`expires_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `llm_budget_expires_idx` ON `llm_token_budgets` (`expires_at`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`importance` real DEFAULT 0.5 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`project_id` text,
	`token_cost` integer DEFAULT 0 NOT NULL,
	`recall_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_recalled_at` text,
	`embedding` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mem_kind_idx` ON `memories` (`kind`);--> statement-breakpoint
CREATE INDEX `mem_importance_idx` ON `memories` (`importance`);--> statement-breakpoint
CREATE INDEX `mem_created_idx` ON `memories` (`created_at`);--> statement-breakpoint
CREATE INDEX `mem_project_idx` ON `memories` (`project_id`);--> statement-breakpoint
CREATE TABLE `merkle_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`chunk_start_seq` integer NOT NULL,
	`chunk_end_seq` integer NOT NULL,
	`merkle_root` text NOT NULL,
	`prev_checkpoint_hash` text NOT NULL,
	`entry_count` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metric_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`window_start` text NOT NULL,
	`window_end` text NOT NULL,
	`tags` text DEFAULT '{}' NOT NULL,
	`captured_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `metric_snap_metric_captured_idx` ON `metric_snapshots` (`metric`,`captured_at`);--> statement-breakpoint
CREATE INDEX `metric_snap_window_idx` ON `metric_snapshots` (`window_start`,`window_end`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`frontmatter` text DEFAULT '{}' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`wikilinks` text DEFAULT '[]' NOT NULL,
	`char_count` integer DEFAULT 0 NOT NULL,
	`mtime` text,
	`indexed_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`embedding` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_path_unique` ON `notes` (`path`);--> statement-breakpoint
CREATE TABLE `pipeline_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`pipeline_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` text,
	`finished_at` text,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`node_results` text DEFAULT '{}' NOT NULL,
	`error` text,
	`triggered_by` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pipeline_run_pipeline_idx` ON `pipeline_runs` (`pipeline_id`);--> statement-breakpoint
CREATE INDEX `pipeline_run_status_idx` ON `pipeline_runs` (`status`);--> statement-breakpoint
CREATE INDEX `pipeline_run_created_idx` ON `pipeline_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `pipelines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`dag` text NOT NULL,
	`trigger` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`author` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pipeline_enabled_idx` ON `pipelines` (`enabled`);--> statement-breakpoint
CREATE TABLE `plugin_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`ring_override` integer,
	`config` text DEFAULT '{}' NOT NULL,
	`installed_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plugin_install_plugin_idx` ON `plugin_installations` (`plugin_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_install_unique` ON `plugin_installations` (`plugin_id`);--> statement-breakpoint
CREATE TABLE `plugin_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`install_id` text,
	`agent_id` text NOT NULL,
	`capability` text NOT NULL,
	`input_sha256` text NOT NULL,
	`output_sha256` text NOT NULL,
	`exit_code` integer DEFAULT 0 NOT NULL,
	`fuel_used` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`authorized` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plugin_receipt_plugin_idx` ON `plugin_receipts` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `plugin_receipt_agent_idx` ON `plugin_receipts` (`agent_id`);--> statement-breakpoint
CREATE INDEX `plugin_receipt_created_idx` ON `plugin_receipts` (`created_at`);--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`author_pubkey` text NOT NULL,
	`signature` text NOT NULL,
	`content_sha256` text NOT NULL,
	`manifest` text NOT NULL,
	`wasm_bytes` text,
	`source` text DEFAULT 'local' NOT NULL,
	`homepage` text,
	`license` text,
	`rating_avg` real DEFAULT 0 NOT NULL,
	`rating_count` integer DEFAULT 0 NOT NULL,
	`install_count` integer DEFAULT 0 NOT NULL,
	`trust_state` text DEFAULT 'untrusted' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_name_version_unique` ON `plugins` (`name`,`version`);--> statement-breakpoint
CREATE INDEX `plugin_name_idx` ON `plugins` (`name`);--> statement-breakpoint
CREATE INDEX `plugin_sha_idx` ON `plugins` (`content_sha256`);--> statement-breakpoint
CREATE INDEX `plugin_trust_idx` ON `plugins` (`trust_state`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`memory_count` integer DEFAULT 0 NOT NULL,
	`skill_count` integer DEFAULT 0 NOT NULL,
	`token_footprint` integer DEFAULT 0 NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_name_unique` ON `projects` (`name`);--> statement-breakpoint
CREATE TABLE `sandbox_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`type` text DEFAULT 'docker' NOT NULL,
	`code` text NOT NULL,
	`language` text DEFAULT 'javascript' NOT NULL,
	`exit_code` integer,
	`stdout` text DEFAULT '' NOT NULL,
	`stderr` text DEFAULT '' NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sandbox_agent_idx` ON `sandbox_executions` (`agent_id`);--> statement-breakpoint
CREATE INDEX `sandbox_status_idx` ON `sandbox_executions` (`status`);--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`content` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`trigger` text,
	`rating` real DEFAULT 0 NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`project_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`embedding` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_name_project_unique` ON `skills` (`name`,`project_id`);--> statement-breakpoint
CREATE INDEX `skill_category_idx` ON `skills` (`category`);--> statement-breakpoint
CREATE INDEX `skill_rating_idx` ON `skills` (`rating`);--> statement-breakpoint
CREATE TABLE `span_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`start_time_ms` integer NOT NULL,
	`end_time_ms` integer,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`attributes` text DEFAULT '{}' NOT NULL,
	`events` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `span_trace_idx` ON `span_logs` (`trace_id`);--> statement-breakpoint
CREATE INDEX `span_type_idx` ON `span_logs` (`type`);--> statement-breakpoint
CREATE INDEX `span_created_idx` ON `span_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `span_parent_idx` ON `span_logs` (`parent_id`);--> statement-breakpoint
CREATE TABLE `state_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`saga_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`step_index` integer NOT NULL,
	`step_name` text NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `snap_saga_idx` ON `state_snapshots` (`saga_id`);--> statement-breakpoint
CREATE TABLE `system_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `token_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`tokens_injected` integer DEFAULT 0 NOT NULL,
	`tokens_reused` integer DEFAULT 0 NOT NULL,
	`tokens_saved` integer DEFAULT 0 NOT NULL,
	`items_returned` integer DEFAULT 0 NOT NULL,
	`real` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tool_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_sequence` integer NOT NULL,
	`agent_id` text NOT NULL,
	`tool` text NOT NULL,
	`target` text,
	`pre_hash` text,
	`post_hash` text,
	`exit_code` integer,
	`authorized` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `receipt_audit_idx` ON `tool_receipts` (`audit_sequence`);--> statement-breakpoint
CREATE INDEX `receipt_agent_idx` ON `tool_receipts` (`agent_id`);--> statement-breakpoint
CREATE TABLE `trajectory_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_sequence` integer NOT NULL,
	`agent_id` text NOT NULL,
	`model` text NOT NULL,
	`prompt_sent` text NOT NULL,
	`response_received` text DEFAULT '' NOT NULL,
	`token_usage` text DEFAULT '{}' NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `traj_audit_idx` ON `trajectory_logs` (`audit_sequence`);--> statement-breakpoint
CREATE INDEX `traj_agent_idx` ON `trajectory_logs` (`agent_id`);