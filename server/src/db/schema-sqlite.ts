/**
 * schema-sqlite.ts — SQLite schema (Drizzle ORM, sqlite-core).
 *
 * Mirrors schema.ts but uses sqliteTable instead of pgTable and maps
 * PostgreSQL-specific types to SQLite-compatible types:
 *   - jsonb        → text (stores JSON string)
 *   - boolean      → integer (0/1, with {mode:'boolean'})
 *   - bigint       → integer
 *   - timestamp    → text (ISO 8601 string)
 *   - real[]       → text (stores JSON array string)
 *   - text[]       → text (stores JSON array string)
 *
 * Foreign keys, indexes, and unique constraints are preserved.
 */
import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Embedding column — stored as TEXT containing a JSON-encoded float array.
 * In PostgreSQL mode this is real[] with pgvector support; in SQLite mode
 * semantic recall degrades to BM25 lexical fallback.
 */
const embeddingCol = () => text('embedding');

export const memories = sqliteTable(
  'memories',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    tags: text('tags').notNull().default('[]'),
    importance: real('importance').notNull().default(0.5),
    source: text('source').notNull().default('manual'),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    tokenCost: integer('token_cost').notNull().default(0),
    recallCount: integer('recall_count').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    lastRecalledAt: text('last_recalled_at'),
    embedding: embeddingCol(),
  },
  (t) => ({
    kindIdx: index('mem_kind_idx').on(t.kind),
    importanceIdx: index('mem_importance_idx').on(t.importance),
    createdIdx: index('mem_created_idx').on(t.createdAt),
    projectIdx: index('mem_project_idx').on(t.projectId),
  })
);

export const memoriesFts = sqliteTable('memories_fts', {
  id: text('id'),
  title: text('title'),
  content: text('content'),
  tags: text('tags'),
});

export const skills = sqliteTable(
  'skills',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    content: text('content').notNull(),
    category: text('category').notNull().default('general'),
    tags: text('tags').notNull().default('[]'),
    trigger: text('trigger'),
    rating: real('rating').notNull().default(0),
    useCount: integer('use_count').notNull().default(0),
    successCount: integer('success_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    source: text('source').notNull().default('manual'),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    embedding: embeddingCol(),
  },
  (t) => ({
    nameProjectIdx: uniqueIndex('skill_name_project_unique').on(t.name, t.projectId),
    categoryIdx: index('skill_category_idx').on(t.category),
    ratingIdx: index('skill_rating_idx').on(t.rating),
  })
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    source: text('source').notNull().default('manual'),
    status: text('status').notNull().default('active'),
    memoryCount: integer('memory_count').notNull().default(0),
    skillCount: integer('skill_count').notNull().default(0),
    tokenFootprint: integer('token_footprint').notNull().default(0),
    metadata: text('metadata').notNull().default('{}'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    nameUnique: uniqueIndex('project_name_unique').on(t.name),
  })
);

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    path: text('path').notNull(),
    title: text('title').notNull().default(''),
    content: text('content').notNull(),
    frontmatter: text('frontmatter').notNull().default('{}'),
    tags: text('tags').notNull().default('[]'),
    wikilinks: text('wikilinks').notNull().default('[]'),
    charCount: integer('char_count').notNull().default(0),
    mtime: text('mtime'),
    indexedAt: text('indexed_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    embedding: embeddingCol(),
  },
  (t) => ({
    pathUnique: uniqueIndex('note_path_unique').on(t.path),
    indexedAtIdx: index('note_indexed_at_idx').on(t.indexedAt),
  })
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    sequence: integer('sequence').primaryKey(),
    id: text('id').notNull(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    payload: text('payload').notNull().default('{}'),
    prevHash: text('prev_hash').notNull(),
    entryHash: text('entry_hash').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    idUnique: uniqueIndex('audit_id_unique').on(t.id),
    seqIdx: index('audit_seq_idx').on(t.sequence),
    createdAtIdx: index('audit_created_idx').on(t.createdAt),
  })
);

export const merkleCheckpoints = sqliteTable('merkle_checkpoints', {
  id: text('id').primaryKey(),
  chunkStartSeq: integer('chunk_start_seq').notNull(),
  chunkEndSeq: integer('chunk_end_seq').notNull(),
  merkleRoot: text('merkle_root').notNull(),
  prevCheckpointHash: text('prev_checkpoint_hash').notNull(),
  entryCount: integer('entry_count').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const anchoredRoots = sqliteTable(
  'anchored_roots',
  {
    id: text('id').primaryKey(),
    checkpointId: text('checkpoint_id')
      .notNull()
      .references(() => merkleCheckpoints.id),
    merkleRoot: text('merkle_root').notNull(),
    chainId: integer('chain_id').notNull(),
    txHash: text('tx_hash').notNull(),
    blockNumber: integer('block_number'),
    status: text('status').notNull().default('pending'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    confirmedAt: text('confirmed_at'),
  },
  (t) => ({
    cpIdx: index('anchor_checkpoint_idx').on(t.checkpointId),
    rootIdx: index('anchor_root_idx').on(t.merkleRoot),
  })
);

export const tokenLedger = sqliteTable('token_ledger', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  query: text('query').notNull().default(''),
  tokensInjected: integer('tokens_injected').notNull().default(0),
  tokensReused: integer('tokens_reused').notNull().default(0),
  tokensSaved: integer('tokens_saved').notNull().default(0),
  itemsReturned: integer('items_returned').notNull().default(0),
  real: integer('real', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const feedback = sqliteTable(
  'feedback',
  {
    id: text('id').primaryKey(),
    query: text('query').notNull(),
    itemId: text('item_id').notNull(),
    itemType: text('item_type').notNull(),
    helpful: integer('helpful', { mode: 'boolean' }).notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    itemIdx: index('feedback_item_idx').on(t.itemId),
  })
);

export const systemMeta = sqliteTable('system_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: text('scopes').notNull().default('[]'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    lastUsedAt: text('last_used_at'),
  },
  (t) => ({
    hashUnique: uniqueIndex('apikey_hash_unique').on(t.keyHash),
  })
);

/* ─── PHASE 1.5: Advanced Audit Engine ───────────────────────────── */

export const trajectoryLogs = sqliteTable(
  'trajectory_logs',
  {
    id: text('id').primaryKey(),
    auditSequence: integer('audit_sequence').notNull(),
    agentId: text('agent_id').notNull(),
    model: text('model').notNull(),
    promptSent: text('prompt_sent').notNull(),
    responseReceived: text('response_received').notNull().default(''),
    tokenUsage: text('token_usage').notNull().default('{}'),
    latencyMs: integer('latency_ms').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    auditIdx: index('traj_audit_idx').on(t.auditSequence),
    agentIdx: index('traj_agent_idx').on(t.agentId),
  })
);

export const toolReceipts = sqliteTable(
  'tool_receipts',
  {
    id: text('id').primaryKey(),
    auditSequence: integer('audit_sequence').notNull(),
    agentId: text('agent_id').notNull(),
    tool: text('tool').notNull(),
    target: text('target'),
    preHash: text('pre_hash'),
    postHash: text('post_hash'),
    exitCode: integer('exit_code'),
    authorized: integer('authorized', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    auditIdx: index('receipt_audit_idx').on(t.auditSequence),
    agentIdx: index('receipt_agent_idx').on(t.agentId),
  })
);

/* ─── PHASE 3: Multi-Agent Microkernel ───────────────────────────── */

export const agents = sqliteTable(
  'agents',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('sub-agent'),
    parentId: text('parent_id'),
    ring: integer('ring').notNull().default(1),
    scopes: text('scopes').notNull().default('[]'),
    status: text('status').notNull().default('idle'),
    currentTool: text('current_tool'),
    llmModel: text('llm_model'),
    tokenBudget: integer('token_budget').notNull().default(100000),
    tokensUsed: integer('tokens_used').notNull().default(0),
    timeoutMs: integer('timeout_ms').notNull().default(120000),
    maxRetries: integer('max_retries').notNull().default(3),
    metadata: text('metadata').notNull().default('{}'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    lastHeartbeatAt: text('last_heartbeat_at'),
  },
  (t) => ({
    parentIdx: index('agent_parent_idx').on(t.parentId),
    statusIdx: index('agent_status_idx').on(t.status),
  })
);

export const agentTasks = sqliteTable(
  'agent_tasks',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id').notNull(),
    label: text('label').notNull(),
    kind: text('kind').notNull().default('interactive'),
    queue: text('queue').notNull().default('Q1'),
    priority: integer('priority').notNull().default(80),
    status: text('status').notNull().default('queued'),
    input: text('input').notNull().default('{}'),
    output: text('output'),
    error: text('error'),
    idempotencyKey: text('idempotency_key'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    traceId: text('trace_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
  },
  (t) => ({
    agentIdx: index('task_agent_idx').on(t.agentId),
    statusIdx: index('task_status_idx').on(t.status),
    queueIdx: index('task_queue_idx').on(t.queue),
    idemUnique: uniqueIndex('task_idem_unique').on(t.idempotencyKey),
  })
);

export const cronJobs = sqliteTable(
  'cron_jobs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    cron: text('cron').notNull(),
    agentKind: text('agent_kind').notNull().default('daemon'),
    taskLabel: text('task_label').notNull(),
    taskInput: text('task_input').notNull().default('{}'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastRunAt: text('last_run_at'),
    nextRunAt: text('next_run_at'),
    runCount: integer('run_count').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    enabledIdx: index('cron_enabled_idx').on(t.enabled),
    nextRunIdx: index('cron_nextrun_idx').on(t.nextRunAt),
  })
);

/* ─── PHASE 5: Execution & Safety — Sandboxing + Snapshots ──────── */

/* ─── PHASE 5a: Trace/Telemetry ──────────────────────────────────── */

export const spanLogs = sqliteTable(
  'span_logs',
  {
    id: text('id').primaryKey(),
    traceId: text('trace_id').notNull(),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull().default('ok'),
    startTimeMs: integer('start_time_ms').notNull(),
    endTimeMs: integer('end_time_ms'),
    durationMs: integer('duration_ms').notNull().default(0),
    attributes: text('attributes').notNull().default('{}'),
    events: text('events').notNull().default('[]'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    traceIdx: index('span_trace_idx').on(t.traceId),
    typeIdx: index('span_type_idx').on(t.type),
    createdIdx: index('span_created_idx').on(t.createdAt),
    parentIdx: index('span_parent_idx').on(t.parentId),
  })
);

export const sandboxExecutions = sqliteTable(
  'sandbox_executions',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id').notNull(),
    type: text('type').notNull().default('docker'),
    code: text('code').notNull(),
    language: text('language').notNull().default('javascript'),
    exitCode: integer('exit_code'),
    stdout: text('stdout').notNull().default(''),
    stderr: text('stderr').notNull().default(''),
    durationMs: integer('duration_ms').notNull().default(0),
    status: text('status').notNull().default('pending'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    agentIdx: index('sandbox_agent_idx').on(t.agentId),
    statusIdx: index('sandbox_status_idx').on(t.status),
  })
);

export const stateSnapshots = sqliteTable(
  'state_snapshots',
  {
    id: text('id').primaryKey(),
    sagaId: text('saga_id').notNull(),
    agentId: text('agent_id').notNull(),
    stepIndex: integer('step_index').notNull(),
    stepName: text('step_name').notNull(),
    context: text('context').notNull().default('{}'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    sagaIdx: index('snap_saga_idx').on(t.sagaId),
  })
);

/* ─── NEURAL SKILL COMPILATION ───────────────────────────────────── */

export const compiledScripts = sqliteTable(
  'compiled_scripts',
  {
    id: text('id').primaryKey(),
    patternSignature: text('pattern_signature').notNull(),
    taskLabel: text('task_label').notNull(),
    triggerPattern: text('trigger_pattern').notNull().default('{}'),
    script: text('script').notNull(),
    language: text('language').notNull().default('javascript'),
    status: text('status').notNull().default('draft'),
    evalResults: text('eval_results').notNull().default('{}'),
    timesExecuted: integer('times_executed').notNull().default(0),
    tokensSaved: integer('tokens_saved').notNull().default(0),
    detectedCount: integer('detected_count').notNull().default(0),
    avgLatencyMs: integer('avg_latency_ms').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    activatedAt: text('activated_at'),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    sigUnique: uniqueIndex('script_sig_unique').on(t.patternSignature),
    statusIdx: index('script_status_idx').on(t.status),
  })
);

/* ─── V3 100x UPGRADE — PILLAR I: Self-Improvement Harness ──────── */

export const metricSnapshots = sqliteTable(
  'metric_snapshots',
  {
    id: text('id').primaryKey(),
    metric: text('metric').notNull(),
    value: real('value').notNull(),
    windowStart: text('window_start').notNull(),
    windowEnd: text('window_end').notNull(),
    tags: text('tags').notNull().default('{}'),
    capturedAt: text('captured_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    metricCapturedIdx: index('metric_snap_metric_captured_idx').on(t.metric, t.capturedAt),
    windowIdx: index('metric_snap_window_idx').on(t.windowStart, t.windowEnd),
  })
);

export const improvementProposals = sqliteTable(
  'improvement_proposals',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    hypothesis: text('hypothesis').notNull(),
    targetMetric: text('target_metric').notNull(),
    baselineValue: real('baseline_value').notNull(),
    expectedDelta: real('expected_delta').notNull(),
    riskClass: text('risk_class').notNull().default('ADVISORY'),
    status: text('status').notNull().default('draft'),
    patch: text('patch').notNull().default('{}'),
    rationale: text('rationale').notNull().default(''),
    author: text('author').notNull().default('harness'),
    reviewer: text('reviewer'),
    rolloutPct: integer('rollout_pct').notNull().default(0),
    measuredDelta: real('measured_delta'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    decidedAt: text('decided_at'),
  },
  (t) => ({
    statusIdx: index('imp_prop_status_idx').on(t.status),
    metricIdx: index('imp_prop_metric_idx').on(t.targetMetric),
    riskIdx: index('imp_prop_risk_idx').on(t.riskClass),
    createdIdx: index('imp_prop_created_idx').on(t.createdAt),
  })
);

/* ─── V3 100x UPGRADE — PILLAR II: WASM Plugin Runtime ──────────── */

export const plugins = sqliteTable(
  'plugins',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    version: text('version').notNull(),
    description: text('description').notNull().default(''),
    authorPubkey: text('author_pubkey').notNull(),
    signature: text('signature').notNull(),
    contentSha256: text('content_sha256').notNull(),
    manifest: text('manifest').notNull(),
    wasmBytes: text('wasm_bytes'),
    source: text('source').notNull().default('local'),
    homepage: text('homepage'),
    license: text('license'),
    ratingAvg: real('rating_avg').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    installCount: integer('install_count').notNull().default(0),
    trustState: text('trust_state').notNull().default('untrusted'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    nameVersionUnique: uniqueIndex('plugin_name_version_unique').on(t.name, t.version),
    nameIdx: index('plugin_name_idx').on(t.name),
    shaIdx: index('plugin_sha_idx').on(t.contentSha256),
    trustIdx: index('plugin_trust_idx').on(t.trustState),
  })
);

export const pluginInstallations = sqliteTable(
  'plugin_installations',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    ringOverride: integer('ring_override'),
    config: text('config').notNull().default('{}'),
    installedAt: text('installed_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    pluginIdx: index('plugin_install_plugin_idx').on(t.pluginId),
    installUnique: uniqueIndex('plugin_install_unique').on(t.pluginId),
  })
);

export const pluginReceipts = sqliteTable(
  'plugin_receipts',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id').notNull(),
    installId: text('install_id'),
    agentId: text('agent_id').notNull(),
    capability: text('capability').notNull(),
    inputSha256: text('input_sha256').notNull(),
    outputSha256: text('output_sha256').notNull(),
    exitCode: integer('exit_code').notNull().default(0),
    fuelUsed: integer('fuel_used').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    authorized: integer('authorized', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    pluginIdx: index('plugin_receipt_plugin_idx').on(t.pluginId),
    agentIdx: index('plugin_receipt_agent_idx').on(t.agentId),
    createdIdx: index('plugin_receipt_created_idx').on(t.createdAt),
  })
);

/* ─── V3 100x UPGRADE — PILLAR III: Federated Recall ────────────── */

export const federatedMemoryProofs = sqliteTable(
  'federated_memory_proofs',
  {
    id: text('id').primaryKey(),
    originPeerId: text('origin_peer_id').notNull(),
    originPubkey: text('origin_pubkey').notNull(),
    signature: text('signature').notNull(),
    contentSha256: text('content_sha256').notNull(),
    embedding: text('embedding').notNull().default('[]'),
    topicTags: text('topic_tags').notNull().default('[]'),
    importance: real('importance').notNull().default(0.5),
    privacyClass: text('privacy_class').notNull().default('public'),
    materialized: integer('materialized', { mode: 'boolean' }).notNull().default(false),
    rejectReason: text('reject_reason'),
    receivedAt: text('received_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    expiresAt: text('expires_at'),
  },
  (t) => ({
    originIdx: index('fed_proof_origin_idx').on(t.originPeerId),
    materializedIdx: index('fed_proof_materialized_idx').on(t.materialized),
    receivedIdx: index('fed_proof_received_idx').on(t.receivedAt),
  })
);

/* ─── V3 100x UPGRADE — PILLAR IV: LLM Gateway v2 ───────────────── */

export const llmProviderHealth = sqliteTable(
  'llm_provider_health',
  {
    provider: text('provider').primaryKey(),
    state: text('state').notNull().default('closed'),
    failureCount: integer('failure_count').notNull().default(0),
    successCount: integer('success_count').notNull().default(0),
    p95Ms: real('p95_ms').notNull().default(0),
    lastFailureAt: text('last_failure_at'),
    lastSuccessAt: text('last_success_at'),
    openedAt: text('opened_at'),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    stateIdx: index('llm_prov_state_idx').on(t.state),
  })
);

export const llmTokenBudgets = sqliteTable(
  'llm_token_budgets',
  {
    sessionId: text('session_id').primaryKey(),
    budget: integer('budget').notNull().default(100000),
    used: integer('used').notNull().default(0),
    hardKill: integer('hard_kill', { mode: 'boolean' }).notNull().default(false),
    reason: text('reason'),
    expiresAt: text('expires_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    expiresIdx: index('llm_budget_expires_idx').on(t.expiresAt),
  })
);

/* ─── V3 100x UPGRADE — PILLAR V: Pipeline Builder ──────────────── */

export const pipelines = sqliteTable(
  'pipelines',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    dag: text('dag').notNull(),
    trigger: text('trigger').notNull().default('{}'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    author: text('author').notNull().default('user'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    enabledIdx: index('pipeline_enabled_idx').on(t.enabled),
  })
);

export const pipelineRuns = sqliteTable(
  'pipeline_runs',
  {
    id: text('id').primaryKey(),
    pipelineId: text('pipeline_id').notNull(),
    status: text('status').notNull().default('pending'),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    durationMs: integer('duration_ms').notNull().default(0),
    nodeResults: text('node_results').notNull().default('{}'),
    error: text('error'),
    triggeredBy: text('triggered_by').notNull().default('manual'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    pipelineIdx: index('pipeline_run_pipeline_idx').on(t.pipelineId),
    statusIdx: index('pipeline_run_status_idx').on(t.status),
    createdIdx: index('pipeline_run_created_idx').on(t.createdAt),
  })
);
