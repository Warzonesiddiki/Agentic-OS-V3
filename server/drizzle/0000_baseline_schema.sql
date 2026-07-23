CREATE TABLE `agent_memory_quotas` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`max_count` integer DEFAULT 1000 NOT NULL,
	`max_tokens` integer DEFAULT 1000000 NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`used_tokens` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_mem_quota_agent_idx` ON `agent_memory_quotas` (`agent_id`);--> statement-breakpoint
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
	`finished_at` text,
	`deadline` text,
	`quantum_ms` integer,
	`checkpoint` text DEFAULT '{}' NOT NULL,
	`gang_id` text,
	`estimated_duration_ms` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_agent_idx` ON `agent_tasks` (`agent_id`);--> statement-breakpoint
CREATE INDEX `task_status_idx` ON `agent_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `task_queue_idx` ON `agent_tasks` (`queue`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_idem_unique` ON `agent_tasks` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `agent_tasks_status_priority_queue_idx` ON `agent_tasks` (`status`,`priority`,`queue`);--> statement-breakpoint
CREATE INDEX `agent_tasks_queued_priority_created_idx` ON `agent_tasks` (`priority`,`created_at`) WHERE status = 'queued';--> statement-breakpoint
CREATE INDEX `agent_tasks_agent_status_idx` ON `agent_tasks` (`agent_id`,`status`);--> statement-breakpoint
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
	`last_heartbeat_at` text,
	`scheduling_mode` text DEFAULT 'preemptive' NOT NULL,
	`cgroup` text DEFAULT '{}' NOT NULL
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
CREATE INDEX `cron_jobs_enabled_next_run_idx` ON `cron_jobs` (`next_run_at`) WHERE enabled = 1;--> statement-breakpoint
CREATE TABLE `cross_org_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`target_org_id` text NOT NULL,
	`resource` text NOT NULL,
	`resource_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cos_org_idx` ON `cross_org_shares` (`org_id`);--> statement-breakpoint
CREATE TABLE `enterprise_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`label` text NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`tier` text DEFAULT 'free' NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`rate_limit_rpm` integer DEFAULT 60 NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enterprise_api_keys_key_hash_unique` ON `enterprise_api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `ekey_org_idx` ON `enterprise_api_keys` (`org_id`);--> statement-breakpoint
CREATE TABLE `enterprise_users` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`roles` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`mfa_enabled` integer DEFAULT false NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entu_org_idx` ON `enterprise_users` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entu_org_email_unique` ON `enterprise_users` (`org_id`,`email`);--> statement-breakpoint
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
	`project_id` text,
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
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`period` text NOT NULL,
	`amount_usd` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`pdf_url` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inv_org_idx` ON `invoices` (`org_id`);--> statement-breakpoint
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
CREATE TABLE `marketplace_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`provider_kind` text NOT NULL,
	`config_schema` text DEFAULT '{}' NOT NULL,
	`author_id` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketplace_integrations_slug_unique` ON `marketplace_integrations` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `mi_slug_idx` ON `marketplace_integrations` (`slug`);--> statement-breakpoint
CREATE INDEX `mi_kind_idx` ON `marketplace_integrations` (`provider_kind`);--> statement-breakpoint
CREATE TABLE `marketplace_plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`kind` text DEFAULT 'plugin' NOT NULL,
	`license` text DEFAULT 'MIT' NOT NULL,
	`homepage` text,
	`repository` text,
	`latest_version` text,
	`latest_version_id` text,
	`avg_rating` real DEFAULT 0 NOT NULL,
	`rating_count` integer DEFAULT 0 NOT NULL,
	`install_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketplace_plugins_slug_unique` ON `marketplace_plugins` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `mp_slug_idx` ON `marketplace_plugins` (`slug`);--> statement-breakpoint
CREATE INDEX `mp_author_idx` ON `marketplace_plugins` (`author_id`);--> statement-breakpoint
CREATE INDEX `mp_category_idx` ON `marketplace_plugins` (`category`);--> statement-breakpoint
CREATE INDEX `mp_status_idx` ON `marketplace_plugins` (`status`);--> statement-breakpoint
CREATE INDEX `mp_kind_idx` ON `marketplace_plugins` (`kind`);--> statement-breakpoint
CREATE TABLE `marketplace_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`version` text NOT NULL,
	`manifest` text DEFAULT '{}' NOT NULL,
	`artifact_sha256` text NOT NULL,
	`artifact_size` integer DEFAULT 0 NOT NULL,
	`artifact_storage_key` text NOT NULL,
	`wasm_entry` text,
	`min_engine_version` text,
	`changelog` text DEFAULT '' NOT NULL,
	`signature` text,
	`signer_pubkey` text,
	`fuel_limit` integer DEFAULT 1000000000 NOT NULL,
	`sandbox_profile` text DEFAULT 'default' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`security_review_id` text,
	`published_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `marketplace_plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mv_plugin_version_idx` ON `marketplace_versions` (`plugin_id`,`version`);--> statement-breakpoint
CREATE INDEX `mv_status_idx` ON `marketplace_versions` (`status`);--> statement-breakpoint
CREATE INDEX `mv_published_idx` ON `marketplace_versions` (`published_at`);--> statement-breakpoint
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
	`language` text,
	`privacy_zone` text,
	`confidence` real,
	`version` integer,
	`tier` text DEFAULT 'stm' NOT NULL,
	`deleted_at` text,
	`superseded_by` text,
	`decay_halflife_hours` real DEFAULT 168 NOT NULL,
	`rehearsal_count` integer DEFAULT 0 NOT NULL,
	`next_review_at` text,
	`cluster_id` text,
	`embedding` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cluster_id`) REFERENCES `memory_clusters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mem_kind_idx` ON `memories` (`kind`);--> statement-breakpoint
CREATE INDEX `mem_importance_idx` ON `memories` (`importance`);--> statement-breakpoint
CREATE INDEX `mem_created_idx` ON `memories` (`created_at`);--> statement-breakpoint
CREATE INDEX `mem_project_idx` ON `memories` (`project_id`);--> statement-breakpoint
CREATE INDEX `memories_kind_importance_idx` ON `memories` (`kind`,`importance`);--> statement-breakpoint
CREATE TABLE `memory_archive` (
	`id` text PRIMARY KEY NOT NULL,
	`original_id` text NOT NULL,
	`kind` text DEFAULT 'fact' NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`importance` real DEFAULT 0.1 NOT NULL,
	`source` text DEFAULT 'archived' NOT NULL,
	`project_id` text,
	`token_cost` integer DEFAULT 0 NOT NULL,
	`archived_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`reason` text
);
--> statement-breakpoint
CREATE INDEX `mem_archive_original_idx` ON `memory_archive` (`original_id`);--> statement-breakpoint
CREATE TABLE `memory_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_id` text NOT NULL,
	`kind` text DEFAULT 'file' NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`mime_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`thumbnail` text,
	`highlighted` text,
	`language` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mem_attach_memory_idx` ON `memory_attachments` (`memory_id`);--> statement-breakpoint
CREATE TABLE `memory_causal_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`from_memory_id` text NOT NULL,
	`to_memory_id` text NOT NULL,
	`relation` text NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mem_causal_from_idx` ON `memory_causal_edges` (`from_memory_id`);--> statement-breakpoint
CREATE INDEX `mem_causal_to_idx` ON `memory_causal_edges` (`to_memory_id`);--> statement-breakpoint
CREATE TABLE `memory_cluster_members` (
	`cluster_id` text NOT NULL,
	`memory_id` text NOT NULL,
	FOREIGN KEY (`cluster_id`) REFERENCES `memory_clusters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mem_cluster_members_pk` ON `memory_cluster_members` (`cluster_id`,`memory_id`);--> statement-breakpoint
CREATE INDEX `mem_cluster_members_mem_idx` ON `memory_cluster_members` (`memory_id`);--> statement-breakpoint
CREATE TABLE `memory_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`label` text NOT NULL,
	`centroid_embedding` text DEFAULT '{}' NOT NULL,
	`singleton_ratio` real DEFAULT 0 NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mem_cluster_size_idx` ON `memory_clusters` (`size`);--> statement-breakpoint
CREATE TABLE `memory_contradictions` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_a` text NOT NULL,
	`memory_b` text NOT NULL,
	`relation` text NOT NULL,
	`resolution_of` text,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mem_contradiction_resolved_idx` ON `memory_contradictions` (`resolved`);--> statement-breakpoint
CREATE TABLE `memory_diff_markers` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_id` text NOT NULL,
	`peer_id` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mem_diff_peer_idx` ON `memory_diff_markers` (`peer_id`);--> statement-breakpoint
CREATE TABLE `memory_emotions` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_id` text NOT NULL,
	`mood` text NOT NULL,
	`valence` real DEFAULT 0 NOT NULL,
	`arousal` real DEFAULT 0 NOT NULL,
	`model` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mem_emotion_mem_idx` ON `memory_emotions` (`memory_id`);--> statement-breakpoint
CREATE TABLE `memory_rehearsal_log` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_id` text NOT NULL,
	`project_id` text,
	`reviewed_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`grade` real NOT NULL,
	`interval_days` real DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mem_rehearsal_mem_idx` ON `memory_rehearsal_log` (`memory_id`);--> statement-breakpoint
CREATE TABLE `memory_tags` (
	`memory_id` text NOT NULL,
	`tag_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_tags_pk` ON `memory_tags` (`memory_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `memory_tags_tag_idx` ON `memory_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `memory_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`spec` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_templates_name_unique` ON `memory_templates` (`name`);--> statement-breakpoint
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
CREATE INDEX `note_indexed_at_idx` ON `notes` (`indexed_at`);--> statement-breakpoint
CREATE TABLE `onboarding_state` (
	`org_id` text PRIMARY KEY NOT NULL,
	`completed_steps` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orgs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`parent_id` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`seats` integer DEFAULT 5 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orgs_slug_unique` ON `orgs` (`slug`);--> statement-breakpoint
CREATE INDEX `org_parent_idx` ON `orgs` (`parent_id`);--> statement-breakpoint
CREATE TABLE `payment_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`last4` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pm_org_idx` ON `payment_methods` (`org_id`);--> statement-breakpoint
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
CREATE INDEX `pipeline_runs_pipeline_status_idx` ON `pipeline_runs` (`pipeline_id`,`status`);--> statement-breakpoint
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
CREATE TABLE `plugin_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`version_id` text NOT NULL,
	`dep_slug` text NOT NULL,
	`dep_version_range` text DEFAULT '*' NOT NULL,
	`kind` text DEFAULT 'runtime' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `marketplace_plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `marketplace_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pd_version_idx` ON `plugin_dependencies` (`version_id`);--> statement-breakpoint
CREATE INDEX `pd_dep_idx` ON `plugin_dependencies` (`dep_slug`);--> statement-breakpoint
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
CREATE TABLE `plugin_installs` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`version_id` text NOT NULL,
	`tenant_id` text DEFAULT 'default' NOT NULL,
	`installed_by` text NOT NULL,
	`install_path` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `marketplace_plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `marketplace_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pin_plugin_idx` ON `plugin_installs` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `pin_tenant_idx` ON `plugin_installs` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pin_plugin_tenant_idx` ON `plugin_installs` (`plugin_id`,`tenant_id`);--> statement-breakpoint
CREATE TABLE `plugin_kv` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_kv_plugin_key_unique` ON `plugin_kv` (`plugin_id`,`key`);--> statement-breakpoint
CREATE INDEX `plugin_kv_plugin_idx` ON `plugin_kv` (`plugin_id`);--> statement-breakpoint
CREATE TABLE `plugin_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`install_id` text,
	`agent_id` text,
	`capability` text NOT NULL,
	`input_sha256` text NOT NULL,
	`output_sha256` text NOT NULL,
	`exit_code` integer DEFAULT 0 NOT NULL,
	`fuel_used` text DEFAULT '0' NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`authorized` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `plugin_receipt_plugin_idx` ON `plugin_receipts` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `plugin_receipt_agent_idx` ON `plugin_receipts` (`agent_id`);--> statement-breakpoint
CREATE INDEX `plugin_receipt_created_idx` ON `plugin_receipts` (`created_at`);--> statement-breakpoint
CREATE TABLE `plugin_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`version_id` text,
	`author_id` text NOT NULL,
	`author_name` text DEFAULT '' NOT NULL,
	`rating` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`helpful_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `marketplace_plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `marketplace_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pr_plugin_idx` ON `plugin_reviews` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `pr_rating_idx` ON `plugin_reviews` (`rating`);--> statement-breakpoint
CREATE TABLE `plugin_security_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`reviewer_id` text,
	`state` text DEFAULT 'queued' NOT NULL,
	`score` integer,
	`findings` text DEFAULT '[]' NOT NULL,
	`scanned_with` text DEFAULT 'static-sandbox' NOT NULL,
	`reviewed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `marketplace_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `psr_version_idx` ON `plugin_security_reviews` (`version_id`);--> statement-breakpoint
CREATE INDEX `psr_state_idx` ON `plugin_security_reviews` (`state`);--> statement-breakpoint
CREATE TABLE `plugin_signing_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`pubkey` text NOT NULL,
	`label` text DEFAULT 'default' NOT NULL,
	`revoked` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `psk_author_idx` ON `plugin_signing_keys` (`author_id`);--> statement-breakpoint
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
CREATE TABLE `rbac_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`is_custom` integer DEFAULT true NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rbac_org_name_unique` ON `rbac_roles` (`org_id`,`name`);--> statement-breakpoint
CREATE TABLE `ring_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`ring` integer NOT NULL,
	`tools` text DEFAULT '[]' NOT NULL,
	`max_concurrency` integer DEFAULT 0 NOT NULL,
	`max_tokens_per_min` integer DEFAULT 0 NOT NULL,
	`max_api_calls_per_min` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ring_policies_ring_unique` ON `ring_policies` (`ring`);--> statement-breakpoint
CREATE INDEX `ring_policy_ring_idx` ON `ring_policies` (`ring`);--> statement-breakpoint
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
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sandbox_agent_idx` ON `sandbox_executions` (`agent_id`);--> statement-breakpoint
CREATE INDEX `sandbox_status_idx` ON `sandbox_executions` (`status`);--> statement-breakpoint
CREATE TABLE `scheduler_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`queue` text NOT NULL,
	`p50` real DEFAULT 0 NOT NULL,
	`p90` real DEFAULT 0 NOT NULL,
	`p99` real DEFAULT 0 NOT NULL,
	`p999` real DEFAULT 0 NOT NULL,
	`sample_count` integer DEFAULT 0 NOT NULL,
	`window_start` text NOT NULL,
	`window_end` text NOT NULL,
	`computed_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scheduler_metrics_queue_idx` ON `scheduler_metrics` (`queue`);--> statement-breakpoint
CREATE TABLE `self_opt_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`tuner_id` text,
	`owner_agent` text,
	`actor` text DEFAULT 'pulse' NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `soe_event_kind_idx` ON `self_opt_events` (`kind`);--> statement-breakpoint
CREATE INDEX `soe_event_tuner_idx` ON `self_opt_events` (`tuner_id`);--> statement-breakpoint
CREATE INDEX `soe_event_created_idx` ON `self_opt_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `self_opt_experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`tuner_id` text NOT NULL,
	`hypothesis` text NOT NULL,
	`metric` text NOT NULL,
	`variant_a` text DEFAULT '{}' NOT NULL,
	`variant_b` text DEFAULT '{}' NOT NULL,
	`min_sample_size` integer DEFAULT 2000 NOT NULL,
	`alpha` real DEFAULT 0.05 NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`winner` text,
	`p_value` real,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `soe_tuner_idx` ON `self_opt_experiments` (`tuner_id`);--> statement-breakpoint
CREATE INDEX `soe_status_idx` ON `self_opt_experiments` (`status`);--> statement-breakpoint
CREATE TABLE `self_opt_knowledge_bus` (
	`id` text PRIMARY KEY NOT NULL,
	`tuner_id` text NOT NULL,
	`owner_agent` text NOT NULL,
	`target_interface` text NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`scope` text DEFAULT 'local' NOT NULL,
	`published_by` text DEFAULT 'pulse' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sokb_tuner_idx` ON `self_opt_knowledge_bus` (`tuner_id`);--> statement-breakpoint
CREATE INDEX `sokb_owner_idx` ON `self_opt_knowledge_bus` (`owner_agent`);--> statement-breakpoint
CREATE INDEX `sokb_scope_idx` ON `self_opt_knowledge_bus` (`scope`);--> statement-breakpoint
CREATE INDEX `sokb_score_idx` ON `self_opt_knowledge_bus` (`score`);--> statement-breakpoint
CREATE TABLE `self_opt_param_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tuner_id` text NOT NULL,
	`owner_agent` text NOT NULL,
	`target_interface` text NOT NULL,
	`experiment_id` text,
	`parent_id` text,
	`before_json` text DEFAULT '{}' NOT NULL,
	`after_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'shadow' NOT NULL,
	`proposed_by` text DEFAULT 'pulse' NOT NULL,
	`p_value` real,
	`metric_delta` real,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`promoted_at` text
);
--> statement-breakpoint
CREATE INDEX `sopv_tuner_idx` ON `self_opt_param_versions` (`tuner_id`);--> statement-breakpoint
CREATE INDEX `sopv_status_idx` ON `self_opt_param_versions` (`status`);--> statement-breakpoint
CREATE INDEX `sopv_owner_idx` ON `self_opt_param_versions` (`owner_agent`);--> statement-breakpoint
CREATE INDEX `sopv_parent_idx` ON `self_opt_param_versions` (`parent_id`);--> statement-breakpoint
CREATE INDEX `sopv_exp_idx` ON `self_opt_param_versions` (`experiment_id`);--> statement-breakpoint
CREATE TABLE `session_links` (
	`from_session` text NOT NULL,
	`to_session` text NOT NULL,
	`strength` real DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_links_pk` ON `session_links` (`from_session`,`to_session`);--> statement-breakpoint
CREATE TABLE `siem_sinks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text DEFAULT 'webhook' NOT NULL,
	`endpoint` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `siem_org_idx` ON `siem_sinks` (`org_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `skill_name_unique` ON `skills` (`name`,COALESCE("project_id", ''));--> statement-breakpoint
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
CREATE INDEX `span_logs_trace_parent_idx` ON `span_logs` (`trace_id`,`parent_id`);--> statement-breakpoint
CREATE TABLE `state_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`saga_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`step_index` integer NOT NULL,
	`step_name` text NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `snap_saga_idx` ON `state_snapshots` (`saga_id`);--> statement-breakpoint
CREATE TABLE `system_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tag_taxonomy` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent` text,
	`parent_id` text,
	`kind` text DEFAULT 'user' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tag_taxonomy_name_idx` ON `tag_taxonomy` (`name`);--> statement-breakpoint
CREATE TABLE `tenant_config` (
	`org_id` text PRIMARY KEY NOT NULL,
	`sso_provider` text DEFAULT 'none' NOT NULL,
	`sso_enabled` integer DEFAULT false NOT NULL,
	`sso_idp_initiated` integer DEFAULT false NOT NULL,
	`sso_entity_id` text DEFAULT '' NOT NULL,
	`sso_acs_url` text DEFAULT '' NOT NULL,
	`sso_sso_url` text DEFAULT '' NOT NULL,
	`sso_cert` text DEFAULT '' NOT NULL,
	`sso_jit_provisioning` integer DEFAULT false NOT NULL,
	`sso_domain_restriction` text DEFAULT '[]' NOT NULL,
	`audit_retention_days` integer DEFAULT 365 NOT NULL,
	`memory_retention_days` integer DEFAULT 365 NOT NULL,
	`backup_pitr` integer DEFAULT false NOT NULL,
	`cmk_enabled` integer DEFAULT false NOT NULL,
	`cmk_key_id` text,
	`theme_primary` text DEFAULT '#06b6d4' NOT NULL,
	`theme_logo_url` text DEFAULT '' NOT NULL,
	`theme_brand_name` text DEFAULT 'NEXUS' NOT NULL,
	`budget_alert_pct` integer DEFAULT 80 NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade
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
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
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
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `traj_audit_idx` ON `trajectory_logs` (`audit_sequence`);--> statement-breakpoint
CREATE INDEX `traj_agent_idx` ON `trajectory_logs` (`agent_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`region` text DEFAULT 'us-east-1' NOT NULL,
	`data_residency` text DEFAULT 'us' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ws_org_idx` ON `workspaces` (`org_id`);