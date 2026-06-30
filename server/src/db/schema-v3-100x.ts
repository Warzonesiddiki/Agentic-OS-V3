/**
 * schema/v3_100x.ts — Drizzle table definitions for the 100x upgrade.
 *
 * This file declares the 6 new tables introduced by migration 0046_v3_100x.sql.
 * It follows the existing schema.ts conventions (text PKs, jsonb payloads,
 * timezone-aware timestamps, explicit indexes, unique natural keys) so the
 * new tables slot into the ORM without surprise.
 *
 * The migration runner (`drizzle-kit push` or the existing setup.ts) is the
 * single source of truth for CREATE TABLE statements; this file is the
 * type-safe surface that application code uses.
 */
import { pgTable, text, timestamp, integer, real, jsonb, boolean, uniqueIndex, index, bigint } from "drizzle-orm/pg-core";

/* ════════════════════════════════════════════════════════════════════════════
 * PILLAR I — Self-Improvement Harness
 * ════════════════════════════════════════════��═══════════════════════════════ */

export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: text("id").primaryKey(),
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    tags: jsonb("tags").notNull().default({}),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    metricCapturedIdx: index("metric_snap_metric_captured_idx").on(t.metric, t.capturedAt),
    windowIdx: index("metric_snap_window_idx").on(t.windowStart, t.windowEnd),
  })
);

export const improvementProposals = pgTable(
  "improvement_proposals",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    hypothesis: text("hypothesis").notNull(),
    targetMetric: text("target_metric").notNull(),
    baselineValue: real("baseline_value").notNull(),
    expectedDelta: real("expected_delta").notNull(),
    riskClass: text("risk_class").notNull().default("ADVISORY"), // ADVISORY | BLOCKING | SAFETY
    status: text("status").notNull().default("draft"), // draft | testing | canary | rolled_out | reverted | rejected
    patch: jsonb("patch").notNull().default({}),
    rationale: text("rationale").notNull().default(""),
    author: text("author").notNull().default("harness"),
    reviewer: text("reviewer"),
    rolloutPct: integer("rollout_pct").notNull().default(0),
    measuredDelta: real("measured_delta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("imp_prop_status_idx").on(t.status),
    metricIdx: index("imp_prop_metric_idx").on(t.targetMetric),
    riskIdx: index("imp_prop_risk_idx").on(t.riskClass),
    createdIdx: index("imp_prop_created_idx").on(t.createdAt),
  })
);

/* ════════════════════════════════════════════════════════════════════════════
 * PILLAR II — WASM Plugin Runtime
 * ════════════════════════════════════════════════════════════════════════════ */

export const plugins = pgTable(
  "plugins",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    description: text("description").notNull().default(""),
    authorPubkey: text("author_pubkey").notNull(),
    signature: text("signature").notNull(),
    contentSha256: text("content_sha256").notNull(),
    manifest: jsonb("manifest").notNull(),
    wasmBytes: text("wasm_bytes"), // base64 — actual BYTEA decoded at read time
    source: text("source").notNull().default("local"),
    homepage: text("homepage"),
    license: text("license"),
    ratingAvg: real("rating_avg").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    installCount: integer("install_count").notNull().default(0),
    trustState: text("trust_state").notNull().default("untrusted"), // untrusted | trusted | revoked
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameVersionUnique: uniqueIndex("plugin_name_version_unique").on(t.name, t.version),
    nameIdx: index("plugin_name_idx").on(t.name),
    shaIdx: index("plugin_sha_idx").on(t.contentSha256),
    trustIdx: index("plugin_trust_idx").on(t.trustState),
  })
);

export const pluginInstallations = pgTable(
  "plugin_installations",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    ringOverride: integer("ring_override"),
    config: jsonb("config").notNull().default({}),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pluginIdx: index("plugin_install_plugin_idx").on(t.pluginId),
    installUnique: uniqueIndex("plugin_install_unique").on(t.pluginId),
  })
);

export const pluginReceipts = pgTable(
  "plugin_receipts",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id").notNull(),
    installId: text("install_id"),
    agentId: text("agent_id").notNull(),
    capability: text("capability").notNull(),
    inputSha256: text("input_sha256").notNull(),
    outputSha256: text("output_sha256").notNull(),
    exitCode: integer("exit_code").notNull().default(0),
    fuelUsed: bigint("fuel_used", { mode: "number" }).notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    authorized: boolean("authorized").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pluginIdx: index("plugin_receipt_plugin_idx").on(t.pluginId),
    agentIdx: index("plugin_receipt_agent_idx").on(t.agentId),
    createdIdx: index("plugin_receipt_created_idx").on(t.createdAt),
  })
);

/* ════════════════════════════════════════════════════════════════════════════
 * PILLAR III — Federated Recall
 * ════════════════════════════════════════════════════════════════════════════ */

export const federatedMemoryProofs = pgTable(
  "federated_memory_proofs",
  {
    id: text("id").primaryKey(),
    originPeerId: text("origin_peer_id").notNull(),
    originPubkey: text("origin_pubkey").notNull(),
    signature: text("signature").notNull(),
    contentSha256: text("content_sha256").notNull(),
    embedding: jsonb("embedding").notNull().default([]),
    topicTags: text("topic_tags").array().notNull().default([]),
    importance: real("importance").notNull().default(0.5),
    privacyClass: text("privacy_class").notNull().default("public"), // public | team | private
    materialized: boolean("materialized").notNull().default(false),
    rejectReason: text("reject_reason"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => ({
    originIdx: index("fed_proof_origin_idx").on(t.originPeerId),
    // GIN on tags array is added by raw SQL in the migration; Drizzle infers it via .array()
    materializedIdx: index("fed_proof_materialized_idx").on(t.materialized),
    receivedIdx: index("fed_proof_received_idx").on(t.receivedAt),
  })
);

/* ════════════════════════════════════════════════════════════════════════════
 * PILLAR IV — LLM Gateway v2
 * ════════════════════════════════════════════════════════════════════════════ */

export const llmProviderHealth = pgTable(
  "llm_provider_health",
  {
    provider: text("provider").primaryKey(), // openai | anthropic | google | ollama | vllm | m3
    state: text("state").notNull().default("closed"), // closed | open | half_open
    failureCount: integer("failure_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    p95Ms: real("p95_ms").notNull().default(0),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    stateIdx: index("llm_prov_state_idx").on(t.state),
  })
);

export const llmTokenBudgets = pgTable(
  "llm_token_budgets",
  {
    sessionId: text("session_id").primaryKey(),
    budget: integer("budget").notNull().default(100000),
    used: integer("used").notNull().default(0),
    hardKill: boolean("hard_kill").notNull().default(false),
    reason: text("reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    expiresIdx: index("llm_budget_expires_idx").on(t.expiresAt),
  })
);

/* ════════════════════════════════════════════════════════════════════════════
 * PILLAR V — Pipeline Builder
 * ════════════════════════════════════════════════════════════════════════════ */

export const pipelines = pgTable(
  "pipelines",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    dag: jsonb("dag").notNull(), // { nodes: [...], edges: [...] }
    trigger: jsonb("trigger").notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    author: text("author").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    enabledIdx: index("pipeline_enabled_idx").on(t.enabled),
  })
);

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: text("id").primaryKey(),
    pipelineId: text("pipeline_id").notNull(),
    status: text("status").notNull().default("pending"), // pending | running | succeeded | failed | cancelled
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms").notNull().default(0),
    nodeResults: jsonb("node_results").notNull().default({}),
    error: text("error"),
    triggeredBy: text("triggered_by").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pipelineIdx: index("pipeline_run_pipeline_idx").on(t.pipelineId),
    statusIdx: index("pipeline_run_status_idx").on(t.status),
    createdIdx: index("pipeline_run_created_idx").on(t.createdAt),
  })
);

/* ════════════════════════════════════════════════════════════════════════════
 * CONVENIENCE EXPORTS — list of all v3 100x tables for bulk queries
 * ═══════════════════════���════════════════════════════════════════════════════ */

export const v3_100x_tables = {
  metricSnapshots,
  improvementProposals,
  plugins,
  pluginInstallations,
  pluginReceipts,
  federatedMemoryProofs,
  llmProviderHealth,
  llmTokenBudgets,
  pipelines,
  pipelineRuns,
} as const;

export type V3_100x_TableName = keyof typeof v3_100x_tables;