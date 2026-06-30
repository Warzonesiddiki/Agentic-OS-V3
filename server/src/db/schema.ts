/**
 * schema.ts — normalized PostgreSQL schema (Drizzle ORM).
 * Matches the NEXUS 2.0 spec: NOT NULL columns, unique constraints, and
 * indexes on every hot query path. Audit log is append-only + hash-chained.
 */
import { pgTable, text, timestamp, integer, real, jsonb, boolean, uniqueIndex, index, bigint } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Embedding column — real[] for pgvector compatibility; falls back to jsonb in dev mode via dev-schema.ts. */
const embeddingCol = () => real("embedding").array();

export const memories = pgTable(
  "memories",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(), // episodic | semantic | preference | reflexion | fact
    title: text("title").notNull(),
    content: text("content").notNull(),
    tags: text("tags").array().notNull().default([]),
    importance: real("importance").notNull().default(0.5),
    source: text("source").notNull().default("manual"),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    tokenCost: integer("token_cost").notNull().default(0),
    recallCount: integer("recall_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastRecalledAt: timestamp("last_recalled_at", { withTimezone: true }),
    embedding: embeddingCol(),
  },
  (t) => ({
    kindIdx: index("mem_kind_idx").on(t.kind),
    importanceIdx: index("mem_importance_idx").on(t.importance),
    createdIdx: index("mem_created_idx").on(t.createdAt),
    projectIdx: index("mem_project_idx").on(t.projectId),
  })
);

export const skills = pgTable(
  "skills",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    content: text("content").notNull(),
    category: text("category").notNull().default("general"),
    tags: text("tags").array().notNull().default([]),
    trigger: text("trigger"),
    rating: real("rating").notNull().default(0),
    useCount: integer("use_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    source: text("source").notNull().default("manual"),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    embedding: embeddingCol(),
  },
  (t) => ({
    // Skill name is unique within a project (or globally when project is null).
    // COALESCE makes NULLs behave as '' so the unique constraint actually holds
    // (otherwise Postgres treats each NULL project_id as distinct).
    nameUnique: uniqueIndex("skill_name_unique").on(t.name, sql`COALESCE(${t.projectId}, '')`),
    categoryIdx: index("skill_category_idx").on(t.category),
    ratingIdx: index("skill_rating_idx").on(t.rating),
  })
);

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  source: text("source").notNull().default("manual"),
  status: text("status").notNull().default("active"),
  memoryCount: integer("memory_count").notNull().default(0),
  skillCount: integer("skill_count").notNull().default(0),
  tokenFootprint: integer("token_footprint").notNull().default(0),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameUnique: uniqueIndex("project_name_unique").on(t.name),
}));

export const notes = pgTable("notes", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
  title: text("title").notNull().default(""),
  content: text("content").notNull(),
  frontmatter: jsonb("frontmatter").notNull().default({}),
  tags: text("tags").array().notNull().default([]),
  wikilinks: text("wikilinks").array().notNull().default([]),
  charCount: integer("char_count").notNull().default(0),
  mtime: timestamp("mtime", { withTimezone: true }),
  indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  embedding: embeddingCol(),
}, (t) => ({
  pathUnique: uniqueIndex("note_path_unique").on(t.path),
}));

export const auditLog = pgTable(
  "audit_log",
  {
    // Monotonic sequence is the single primary key (and the chain ordering key).
    // The text `id` is a unique secondary identifier, NOT a second primary key.
    sequence: bigint("sequence", { mode: "number" }).primaryKey(),
    id: text("id").notNull().unique(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    payload: jsonb("payload").notNull().default({}),
    prevHash: text("prev_hash").notNull(),
    entryHash: text("entry_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    seqIdx: index("audit_seq_idx").on(t.sequence),
    createdAtIdx: index("audit_created_idx").on(t.createdAt),
  })
);

export const merkleCheckpoints = pgTable("merkle_checkpoints", {
  id: text("id").primaryKey(),
  chunkStartSeq: bigint("chunk_start_seq", { mode: "number" }).notNull(),
  chunkEndSeq: bigint("chunk_end_seq", { mode: "number" }).notNull(),
  merkleRoot: text("merkle_root").notNull(),
  prevCheckpointHash: text("prev_checkpoint_hash").notNull(),
  entryCount: integer("entry_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const anchoredRoots = pgTable("anchored_roots", {
  id: text("id").primaryKey(),
  checkpointId: text("checkpoint_id").notNull().references(() => merkleCheckpoints.id),
  merkleRoot: text("merkle_root").notNull(),
  chainId: integer("chain_id").notNull(),
  txHash: text("tx_hash").notNull(),
  blockNumber: bigint("block_number", { mode: "number" }),
  status: text("status").notNull().default("pending"), // pending | confirmed | failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, (t) => ({
  cpIdx: index("anchor_checkpoint_idx").on(t.checkpointId),
  rootIdx: index("anchor_root_idx").on(t.merkleRoot),
}));

export const tokenLedger = pgTable("token_ledger", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  query: text("query").notNull().default(""),
  tokensInjected: integer("tokens_injected").notNull().default(0),
  tokensReused: integer("tokens_reused").notNull().default(0),
  tokensSaved: integer("tokens_saved").notNull().default(0),
  itemsReturned: integer("items_returned").notNull().default(0),
  real: boolean("real").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const feedback = pgTable("feedback", {
  id: text("id").primaryKey(),
  query: text("query").notNull(),
  itemId: text("item_id").notNull(),
  itemType: text("item_type").notNull(),
  helpful: boolean("helpful").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  itemIdx: index("feedback_item_idx").on(t.itemId),
}));

export const systemMeta = pgTable("system_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  scopes: text("scopes").array().notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, (t) => ({
  // A key hash must be unique — prevents duplicate keys and enables fast lookup.
  hashUnique: uniqueIndex("apikey_hash_unique").on(t.keyHash),
}));

/* ════════════════════════════════════════════════════════════════ *
 * PHASE 1.5: Advanced Audit Engine
 *   - trajectory_logs: LLM reasoning traces linked to audit chain
 *   - tool_receipts: cryptographic pre/post-mutation hashes
 * ════════════════════════════════════════════════════════════════ */

export const trajectoryLogs = pgTable(
  "trajectory_logs",
  {
    id: text("id").primaryKey(),
    auditSequence: bigint("audit_sequence", { mode: "number" }).notNull(),
    agentId: text("agent_id").notNull(),
    model: text("model").notNull(),
    promptSent: text("prompt_sent").notNull(),
    responseReceived: text("response_received").notNull().default(""),
    tokenUsage: jsonb("token_usage").notNull().default({}),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    auditIdx: index("traj_audit_idx").on(t.auditSequence),
    agentIdx: index("traj_agent_idx").on(t.agentId),
  })
);

export const toolReceipts = pgTable(
  "tool_receipts",
  {
    id: text("id").primaryKey(),
    auditSequence: bigint("audit_sequence", { mode: "number" }).notNull(),
    agentId: text("agent_id").notNull(),
    tool: text("tool").notNull(),
    target: text("target"), // file path, command, URL, etc.
    preHash: text("pre_hash"), // hash of state before mutation
    postHash: text("post_hash"), // hash of state after mutation
    exitCode: integer("exit_code"),
    authorized: boolean("authorized").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    auditIdx: index("receipt_audit_idx").on(t.auditSequence),
    agentIdx: index("receipt_agent_idx").on(t.agentId),
  })
);

/* ════════════════════════════════════════════════════════════════ *
 * PHASE 3: Multi-Agent Microkernel
 *   - agents: registry of all master + sub-agents
 *   - agent_tasks: scheduled/running/completed work items
 *   - cron_jobs: 24/7 autonomous waking daemons
 * ════════════════════════════════════════════════════════════════ */

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("sub-agent"), // master | sub-agent | daemon
    parentId: text("parent_id"), // master agent that spawned this one
    ring: integer("ring").notNull().default(1), // 0-4 execution ring
    scopes: text("scopes").array().notNull().default([]),
    status: text("status").notNull().default("idle"), // idle | thinking | executing_tool | errored | quarantined | completed
    currentTool: text("current_tool"),
    llmModel: text("llm_model"),
    tokenBudget: integer("token_budget").notNull().default(100000),
    tokensUsed: integer("tokens_used").notNull().default(0),
    timeoutMs: integer("timeout_ms").notNull().default(120000),
    maxRetries: integer("max_retries").notNull().default(3),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  },
  (t) => ({
    parentIdx: index("agent_parent_idx").on(t.parentId),
    statusIdx: index("agent_status_idx").on(t.status),
  })
);

export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    label: text("label").notNull(),
    kind: text("kind").notNull().default("interactive"), // interactive | background | maintenance | safety | self_improvement
    queue: text("queue").notNull().default("Q1"), // Q0-Q4
    priority: integer("priority").notNull().default(80),
    status: text("status").notNull().default("queued"), // queued | running | succeeded | failed | cancelled | dead_letter
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    error: text("error"),
    idempotencyKey: text("idempotency_key"),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    agentIdx: index("task_agent_idx").on(t.agentId),
    statusIdx: index("task_status_idx").on(t.status),
    queueIdx: index("task_queue_idx").on(t.queue),
    idemUnique: uniqueIndex("task_idem_unique").on(t.idempotencyKey),
  })
);

export const cronJobs = pgTable(
  "cron_jobs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    cron: text("cron").notNull(), // cron expression, e.g. "0 9 * * *"
    agentKind: text("agent_kind").notNull().default("daemon"),
    taskLabel: text("task_label").notNull(),
    taskInput: jsonb("task_input").notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    runCount: integer("run_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    enabledIdx: index("cron_enabled_idx").on(t.enabled),
    nextRunIdx: index("cron_nextrun_idx").on(t.nextRunAt),
  })
);

/* ════════════════════════════════════════════════════════════════ *
 * PHASE 5: Execution & Safety — Sandboxing + Snapshots
 * ════════════════════════════════════════════════════════════════ */

/* ─── PHASE 5a: Trace/Telemetry ─────────────────────────────────── */

export const spanLogs = pgTable(
  "span_logs",
  {
    id: text("id").primaryKey(),
    traceId: text("trace_id").notNull(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    type: text("type").notNull(), // agent_span | tool_span | llm_span | handoff_span
    status: text("status").notNull().default("ok"), // ok | error | cancelled
    startTimeMs: bigint("start_time_ms", { mode: "number" }).notNull(),
    endTimeMs: bigint("end_time_ms", { mode: "number" }),
    durationMs: integer("duration_ms").notNull().default(0),
    attributes: jsonb("attributes").notNull().default({}),
    events: jsonb("events").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    traceIdx: index("span_trace_idx").on(t.traceId),
    typeIdx: index("span_type_idx").on(t.type),
    createdIdx: index("span_created_idx").on(t.createdAt),
    parentIdx: index("span_parent_idx").on(t.parentId),
  })
);

export const sandboxExecutions = pgTable(
  "sandbox_executions",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    type: text("type").notNull().default("docker"), // docker | wasm | browser
    code: text("code").notNull(),
    language: text("language").notNull().default("javascript"),
    exitCode: integer("exit_code"),
    stdout: text("stdout").notNull().default(""),
    stderr: text("stderr").notNull().default(""),
    durationMs: integer("duration_ms").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending | running | completed | failed | timeout
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agentIdx: index("sandbox_agent_idx").on(t.agentId),
    statusIdx: index("sandbox_status_idx").on(t.status),
  })
);

export const stateSnapshots = pgTable(
  "state_snapshots",
  {
    id: text("id").primaryKey(),
    sagaId: text("saga_id").notNull(),
    agentId: text("agent_id").notNull(),
    stepIndex: integer("step_index").notNull(),
    stepName: text("step_name").notNull(),
    context: jsonb("context").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sagaIdx: index("snap_saga_idx").on(t.sagaId),
  })
);

/* ════════════════════════════════════════════════════════════════ *
 * NEURAL SKILL COMPILATION — JIT code generation for repetitive tasks
 * ════════════════════════════════════════════════════════════════ */

export const compiledScripts = pgTable(
  "compiled_scripts",
  {
    id: text("id").primaryKey(),
    patternSignature: text("pattern_signature").notNull(), // hash of the task pattern
    taskLabel: text("task_label").notNull(), // human-readable description
    triggerPattern: jsonb("trigger_pattern").notNull().default({}), // input shape that triggers this script
    script: text("script").notNull(), // the actual JS/Python code
    language: text("language").notNull().default("javascript"),
    status: text("status").notNull().default("draft"), // draft | testing | active | deprecated
    evalResults: jsonb("eval_results").notNull().default({}), // last eval run results
    timesExecuted: integer("times_executed").notNull().default(0),
    tokensSaved: integer("tokens_saved").notNull().default(0),
    detectedCount: integer("detected_count").notNull().default(0), // how many times the pattern was seen before compilation
    avgLatencyMs: integer("avg_latency_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sigUnique: uniqueIndex("script_sig_unique").on(t.patternSignature),
    statusIdx: index("script_status_idx").on(t.status),
  })
);

/* ════════════════════════════════════════════════════════════════ *
 * V3 100x UPGRADE — Re-export all V3 tables from schema-v3-100x
 * ════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════════
 * V3 100x UPGRADE tables — defined inline so drizzle-kit CJS loader resolves
 * them (re-exports from schema-v3-100x.js fail in CJS).
 * ════════════════════════════════════════════════════════════════════════════ */

/* ─── PILLAR I — Self-Improvement Harness ─────────────────────────── */

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
    riskClass: text("risk_class").notNull().default("ADVISORY"),
    status: text("status").notNull().default("draft"),
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

/* ─── PILLAR II — WASM Plugin Runtime ─────────────────────────────── */

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
    wasmBytes: text("wasm_bytes"),
    source: text("source").notNull().default("local"),
    homepage: text("homepage"),
    license: text("license"),
    ratingAvg: real("rating_avg").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    installCount: integer("install_count").notNull().default(0),
    trustState: text("trust_state").notNull().default("untrusted"),
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

/* ─── PILLAR III — Federated Recall ───────────────────────────────── */

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
    privacyClass: text("privacy_class").notNull().default("public"),
    materialized: boolean("materialized").notNull().default(false),
    rejectReason: text("reject_reason"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => ({
    originIdx: index("fed_proof_origin_idx").on(t.originPeerId),
    materializedIdx: index("fed_proof_materialized_idx").on(t.materialized),
    receivedIdx: index("fed_proof_received_idx").on(t.receivedAt),
  })
);

/* ─── PILLAR IV — LLM Gateway v2 ──────────────────────────────────── */

export const llmProviderHealth = pgTable(
  "llm_provider_health",
  {
    provider: text("provider").primaryKey(),
    state: text("state").notNull().default("closed"),
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

/* ─── PILLAR V — Pipeline Builder ─────────────────────────────────── */

export const pipelines = pgTable(
  "pipelines",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    dag: jsonb("dag").notNull(),
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
    status: text("status").notNull().default("pending"),
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
