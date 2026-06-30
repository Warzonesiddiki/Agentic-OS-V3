/**
 * schema.ts — normalized PostgreSQL schema (Drizzle ORM).
 * Matches the NEXUS 2.0 spec: NOT NULL columns, unique constraints, and
 * indexes on every hot query path. Audit log is append-only + hash-chained.
 */
import { pgTable, text, timestamp, integer, real, jsonb, boolean, uniqueIndex, index, bigint, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

function embeddingDimension(): number {
  const parsed = Number(process.env.NEXUS_EMBEDDING_DIM ?? 1536);
  return Number.isInteger(parsed) && parsed >= 64 && parsed <= 8192 ? parsed : 1536;
}

/**
 * pgvector column type (vector(NEXUS_EMBEDDING_DIM)).
 * Non-destructive: the column is nullable. Existing rows keep working;
 * embeddings are populated by the rebuild job. If pgvector is not installed,
 * queries referencing this column fall back to lexical-only recall.
 */
export const vector = (dimension?: number) =>
  customType<{ data: number[]; driverData: string; config: { dimension: number } }>({
    dataType(config) {
      const dim = config?.dimension ?? embeddingDimension();
      return `vector(${dim})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
    fromDriver(value: string): number[] {
      // pgvector returns "[0.1,0.2,...]" — parse to number[]
      return value
        .replace(/[[\]"]/g, "")
        .split(",")
        .filter((s) => s.trim() !== "")
        .map((s) => Number(s));
    },
  })(`embedding`, { dimension: dimension ?? embeddingDimension() });

/** The HNSW index for fast ANN (approximate nearest neighbor) search. */
const vectorIndex = (column: object, table: string) =>
  index(`${table}_embedding_hnsw`).using("hnsw", sql`${column} vector_cosine_ops`);

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
    // pgvector column — nullable for non-destructive migration
    embedding: vector(),
  },
  (t) => ({
    kindIdx: index("mem_kind_idx").on(t.kind),
    importanceIdx: index("mem_importance_idx").on(t.importance),
    createdIdx: index("mem_created_idx").on(t.createdAt),
    projectIdx: index("mem_project_idx").on(t.projectId),
    embeddingIdx: vectorIndex(t.embedding, "memories"),
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
    // pgvector column — nullable for non-destructive migration
    embedding: vector(),
  },
  (t) => ({
    // Skill name is unique within a project (or globally when project is null).
    // COALESCE makes NULLs behave as '' so the unique constraint actually holds
    // (otherwise Postgres treats each NULL project_id as distinct).
    nameUnique: uniqueIndex("skill_name_unique").on(t.name, sql`COALESCE(${t.projectId}, '')`),
    categoryIdx: index("skill_category_idx").on(t.category),
    ratingIdx: index("skill_rating_idx").on(t.rating),
    embeddingIdx: vectorIndex(t.embedding, "skills"),
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
  embedding: vector(),
}, (t) => ({
  pathUnique: uniqueIndex("note_path_unique").on(t.path),
  embeddingIdx: vectorIndex(t.embedding, "notes"),
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
