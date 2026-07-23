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
import { sqliteTable, text, integer, real, uniqueIndex, index, customType } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Timestamp column — stored as TEXT (ISO 8601 string) for SQLite, matching the
 * PostgreSQL `timestamp` column's Date-in/Date-out contract used throughout
 * services (e.g. `row.createdAt.getTime()`, `new Date()` inserts).
 *
 * better-sqlite3 can only bind numbers/strings/bigints/buffers/null — passing
 * a raw `Date` object throws `TypeError: SQLite3 can only bind numbers,
 * strings, bigints, buffers, and null`. This customType serializes Date
 * objects to ISO strings on write and parses ISO strings back to Date objects
 * on read, so application code can treat `_at` columns identically across
 * both SQLite and PostgreSQL backends (Dual Database Engine Parity).
 */
const timestampText = customType<{ data: Date; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value: Date): string {
    return value instanceof Date ? value.toISOString() : new Date(value as unknown as string).toISOString();
  },
  fromDriver(value: unknown): Date {
    return new Date(value as string);
  },
});


/**
 * Embedding column — stored as TEXT containing a JSON-encoded float array.
 * In PostgreSQL mode this is real[] with pgvector support; in SQLite mode
 * semantic recall degrades to BM25 lexical fallback.
 */
const embeddingCol = () => text('embedding');

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12 — Advanced Memory Systems support tables
// ─────────────────────────────────────────────────────────────────────────────

/** Topic clusters produced by HDBSCAN + LLM clustering (12.3). */
export const memoryClusters = sqliteTable(
  'memory_clusters',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id'),
    label: text('label').notNull(),
    centroidEmbedding: text('centroid_embedding').notNull().default('{}'),
    singletonRatio: real('singleton_ratio').notNull().default(0),
    size: integer('size').notNull().default(0),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ sizeIdx: index('mem_cluster_size_idx').on(t.size) })
);

/** Membership of memories within a cluster (12.3, 12.29). */
export const memoryClusterMembers = sqliteTable(
  'memory_cluster_members',
  {
    clusterId: text('cluster_id')
      .notNull()
      .references(() => memoryClusters.id, { onDelete: 'cascade' }),
    memoryId: text('memory_id').notNull(),
  },
  (t) => ({
    pk: uniqueIndex('mem_cluster_members_pk').on(t.clusterId, t.memoryId),
    memIdx: index('mem_cluster_members_mem_idx').on(t.memoryId),
  })
);

/** Cross-session linkage edges used by the stitcher (12.4). */
export const sessionLinks = sqliteTable(
  'session_links',
  {
    fromSession: text('from_session').notNull(),
    toSession: text('to_session').notNull(),
    strength: real('strength').notNull().default(1),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    pk: uniqueIndex('session_links_pk').on(t.fromSession, t.toSession),
  })
);

/** Temporal causal chains between memories (12.13). */
export const memoryCausalEdges = sqliteTable(
  'memory_causal_edges',
  {
    id: text('id').primaryKey(),
    fromMemoryId: text('from_memory_id').notNull(),
    toMemoryId: text('to_memory_id').notNull(),
    relation: text('relation').notNull(),
    confidence: real('confidence').notNull().default(1),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    fromIdx: index('mem_causal_from_idx').on(t.fromMemoryId),
    toIdx: index('mem_causal_to_idx').on(t.toMemoryId),
  })
);

/** Detected contradictions between memories (12.6). */
export const memoryContradictions = sqliteTable(
  'memory_contradictions',
  {
    id: text('id').primaryKey(),
    memoryA: text('memory_a').notNull(),
    memoryB: text('memory_b').notNull(),
    relation: text('relation').notNull(),
    resolutionOf: text('resolution_of'),
    resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ resolvedIdx: index('mem_contradiction_resolved_idx').on(t.resolved) })
);

/** Emotional / mood tagging of memories (12.11). */
export const memoryEmotions = sqliteTable(
  'memory_emotions',
  {
    id: text('id').primaryKey(),
    memoryId: text('memory_id').notNull(),
    mood: text('mood').notNull(),
    valence: real('valence').notNull().default(0),
    arousal: real('arousal').notNull().default(0),
    model: text('model'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ memIdx: index('mem_emotion_mem_idx').on(t.memoryId) })
);

/** Tag taxonomy (12.30). */
export const tagTaxonomy = sqliteTable(
  'tag_taxonomy',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    parent: text('parent'),
    parentId: text('parent_id'),
    kind: text('kind').notNull().default('user'),
  },
  (t) => ({ nameIdx: index('tag_taxonomy_name_idx').on(t.name) })
);

/** Memory → tag taxonomy associations (12.30). */
export const memoryTags = sqliteTable(
  'memory_tags',
  {
    memoryId: text('memory_id').notNull(),
    tagId: text('tag_id').notNull(),
  },
  (t) => ({
    pk: uniqueIndex('memory_tags_pk').on(t.memoryId, t.tagId),
    tagIdx: index('memory_tags_tag_idx').on(t.tagId),
  })
);

/** Memory templates (12.33). */
export const memoryTemplates = sqliteTable('memory_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  spec: text('spec').notNull().default('{}'),
  createdAt: timestampText('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: timestampText('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

/** Diff-sync markers for multi-brain export (12.22). */
export const memoryDiffMarkers = sqliteTable(
  'memory_diff_markers',
  {
    id: text('id').primaryKey(),
    memoryId: text('memory_id').notNull(),
    peerId: text('peer_id').notNull(),
    hash: text('hash').notNull(),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ peerIdx: index('mem_diff_peer_idx').on(t.peerId) })
);

/** SM-2 rehearsal log for spaced repetition (12.9). */
export const memoryRehearsalLog = sqliteTable(
  'memory_rehearsal_log',
  {
    id: text('id').primaryKey(),
    memoryId: text('memory_id').notNull(),
    projectId: text('project_id'),
    reviewedAt: timestampText('reviewed_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    grade: real('grade').notNull(),
    intervalDays: real('interval_days').notNull().default(1),
  },
  (t) => ({ memIdx: index('mem_rehearsal_mem_idx').on(t.memoryId) })
);

/** Multi-modal attachments store (12.14). */
export const memoryAttachments = sqliteTable(
  'memory_attachments',
  {
    id: text('id').primaryKey(),
    memoryId: text('memory_id').notNull(),
    kind: text('kind').notNull().default('file'),
    fileName: text('file_name').notNull().default(''),
    mimeType: text('mime_type').notNull().default('application/octet-stream'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    content: text('content').notNull().default(''),
    thumbnail: text('thumbnail'),
    highlighted: text('highlighted'),
    language: text('language'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ memIdx: index('mem_attach_memory_idx').on(t.memoryId) })
);

/** Cold-storage tier archive (12.26). */
export const memoryArchive = sqliteTable(
  'memory_archive',
  {
    id: text('id').primaryKey(),
    originalId: text('original_id').notNull(),
    kind: text('kind').notNull().default('fact'),
    title: text('title').notNull(),
    content: text('content').notNull(),
    tags: text('tags').notNull().default('[]'),
    importance: real('importance').notNull().default(0.1),
    source: text('source').notNull().default('archived'),
    projectId: text('project_id'),
    tokenCost: integer('token_cost').notNull().default(0),
    archivedAt: timestampText('archived_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    reason: text('reason'),
  },
  (t) => ({ originalIdx: index('mem_archive_original_idx').on(t.originalId) })
);

/** Per-agent / per-project memory quotas (12.25). */
export const agentMemoryQuotas = sqliteTable(
  'agent_memory_quotas',
  {
    agentId: text('agent_id').primaryKey(),
    maxCount: integer('max_count').notNull().default(1000),
    maxTokens: integer('max_tokens').notNull().default(1000000),
    usedCount: integer('used_count').notNull().default(0),
    usedTokens: integer('used_tokens').notNull().default(0),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ agentIdx: index('agent_mem_quota_agent_idx').on(t.agentId) })
);

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
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    lastRecalledAt: timestampText('last_recalled_at'),
    language: text('language'),
    privacyZone: text('privacy_zone'),
    confidence: real('confidence'),
    version: integer('version'),
    tier: text('tier').notNull().default('stm'),
    deletedAt: timestampText('deleted_at'),
    supersededBy: text('superseded_by'),
    decayHalflifeHours: real('decay_halflife_hours').notNull().default(168),
    rehearsalCount: integer('rehearsal_count').notNull().default(0),
    nextReviewAt: timestampText('next_review_at'),
    clusterId: text('cluster_id').references(() => memoryClusters.id, { onDelete: 'set null' }),
    embedding: embeddingCol(),
  },
  (t) => ({
    kindIdx: index('mem_kind_idx').on(t.kind),
    importanceIdx: index('mem_importance_idx').on(t.importance),
    createdIdx: index('mem_created_idx').on(t.createdAt),
    projectIdx: index('mem_project_idx').on(t.projectId),
    kindImportanceIdx: index('memories_kind_importance_idx').on(t.kind, t.importance),
  })
);

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
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    embedding: embeddingCol(),
  },
  (t) => ({
    // Aligned with PG schema: COALESCE makes NULL project_id behave as ''
    // so the unique constraint holds (otherwise SQLite treats each NULL as distinct).
    nameUnique: uniqueIndex('skill_name_unique').on(t.name, sql`COALESCE(${t.projectId}, '')`),
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
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
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
    indexedAt: timestampText('indexed_at')
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
    createdAt: timestampText('created_at')
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
  createdAt: timestampText('created_at')
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
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    confirmedAt: timestampText('confirmed_at'),
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
  createdAt: timestampText('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const feedback = sqliteTable(
  'feedback',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id'),
    query: text('query').notNull(),
    itemId: text('item_id').notNull(),
    itemType: text('item_type').notNull(),
    helpful: integer('helpful', { mode: 'boolean' }).notNull(),
    createdAt: timestampText('created_at')
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
  updatedAt: timestampText('updated_at')
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
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    lastUsedAt: timestampText('last_used_at'),
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
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    model: text('model').notNull(),
    promptSent: text('prompt_sent').notNull(),
    responseReceived: text('response_received').notNull().default(''),
    tokenUsage: text('token_usage').notNull().default('{}'),
    latencyMs: integer('latency_ms').notNull().default(0),
    createdAt: timestampText('created_at')
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
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    tool: text('tool').notNull(),
    target: text('target'),
    preHash: text('pre_hash'),
    postHash: text('post_hash'),
    exitCode: integer('exit_code'),
    authorized: integer('authorized', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestampText('created_at')
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
    metadata: text('metadata', { mode: 'json' }).notNull().default('{}'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    lastHeartbeatAt: timestampText('last_heartbeat_at'),
    schedulingMode: text('scheduling_mode').notNull().default('preemptive'),
    cgroup: text('cgroup').notNull().default('{}'),
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
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
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
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    startedAt: timestampText('started_at'),
    finishedAt: timestampText('finished_at'),
    deadline: text('deadline'),
    quantumMs: integer('quantum_ms'),
    checkpoint: text('checkpoint').notNull().default('{}'),
    gangId: text('gang_id'),
    estimatedDurationMs: integer('estimated_duration_ms'),
  },
  (t) => ({
    agentIdx: index('task_agent_idx').on(t.agentId),
    statusIdx: index('task_status_idx').on(t.status),
    queueIdx: index('task_queue_idx').on(t.queue),
    idemUnique: uniqueIndex('task_idem_unique').on(t.idempotencyKey),
    statusPriorityQueueIdx: index('agent_tasks_status_priority_queue_idx').on(
      t.status,
      t.priority,
      t.queue
    ),
    queuedPriorityCreatedIdx: index('agent_tasks_queued_priority_created_idx')
      .on(t.priority, t.createdAt)
      .where(sql`status = 'queued'`),
    agentStatusIdx: index('agent_tasks_agent_status_idx').on(t.agentId, t.status),
  })
);
export const ringPolicies = sqliteTable(
  'ring_policies',
  {
    id: text('id').primaryKey(),
    ring: integer('ring').notNull().unique(),
    tools: text('tools').notNull().default('[]'),
    maxConcurrency: integer('max_concurrency').notNull().default(0),
    maxTokensPerMin: integer('max_tokens_per_min').notNull().default(0),
    maxApiCallsPerMin: integer('max_api_calls_per_min').notNull().default(0),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    ringIdx: index('ring_policy_ring_idx').on(t.ring),
  })
);

export const schedulerMetrics = sqliteTable(
  'scheduler_metrics',
  {
    id: text('id').primaryKey(),
    queue: text('queue').notNull(),
    p50: real('p50').notNull().default(0),
    p90: real('p90').notNull().default(0),
    p99: real('p99').notNull().default(0),
    p999: real('p999').notNull().default(0),
    sampleCount: integer('sample_count').notNull().default(0),
    windowStart: text('window_start').notNull(),
    windowEnd: text('window_end').notNull(),
    computedAt: timestampText('computed_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    queueIdx: index('scheduler_metrics_queue_idx').on(t.queue),
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
    lastRunAt: timestampText('last_run_at'),
    nextRunAt: timestampText('next_run_at'),
    runCount: integer('run_count').notNull().default(0),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    enabledIdx: index('cron_enabled_idx').on(t.enabled),
    nextRunIdx: index('cron_nextrun_idx').on(t.nextRunAt),
    enabledNextRunIdx: index('cron_jobs_enabled_next_run_idx')
      .on(t.nextRunAt)
      .where(sql`enabled = 1`),
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
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    traceIdx: index('span_trace_idx').on(t.traceId),
    typeIdx: index('span_type_idx').on(t.type),
    createdIdx: index('span_created_idx').on(t.createdAt),
    parentIdx: index('span_parent_idx').on(t.parentId),
    traceParentIdx: index('span_logs_trace_parent_idx').on(t.traceId, t.parentId),
  })
);

export const sandboxExecutions = sqliteTable(
  'sandbox_executions',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    type: text('type').notNull().default('docker'),
    code: text('code').notNull(),
    language: text('language').notNull().default('javascript'),
    exitCode: integer('exit_code'),
    stdout: text('stdout').notNull().default(''),
    stderr: text('stderr').notNull().default(''),
    durationMs: integer('duration_ms').notNull().default(0),
    status: text('status').notNull().default('pending'),
    createdAt: timestampText('created_at')
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
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),
    stepName: text('step_name').notNull(),
    context: text('context').notNull().default('{}'),
    createdAt: timestampText('created_at')
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
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    activatedAt: timestampText('activated_at'),
    updatedAt: timestampText('updated_at')
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
    capturedAt: timestampText('captured_at')
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
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    decidedAt: timestampText('decided_at'),
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
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
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
    installedAt: timestampText('installed_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    pluginIdx: index('plugin_install_plugin_idx').on(t.pluginId),
    installUnique: uniqueIndex('plugin_install_unique').on(t.pluginId),
  })
);

export const pluginKv = sqliteTable(
  'plugin_kv',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    pluginKeyUnique: uniqueIndex('plugin_kv_plugin_key_unique').on(t.pluginId, t.key),
    pluginIdx: index('plugin_kv_plugin_idx').on(t.pluginId),
  })
);

export const pluginReceipts = sqliteTable(
  'plugin_receipts',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id').notNull(),
    installId: text('install_id'),
    agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    capability: text('capability').notNull(),
    inputSha256: text('input_sha256').notNull(),
    outputSha256: text('output_sha256').notNull(),
    exitCode: integer('exit_code').notNull().default(0),
    fuelUsed: text('fuel_used').notNull().default('0'),
    durationMs: integer('duration_ms').notNull().default(0),
    authorized: integer('authorized', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestampText('created_at')
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
    receivedAt: timestampText('received_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    expiresAt: timestampText('expires_at'),
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
    lastFailureAt: timestampText('last_failure_at'),
    lastSuccessAt: timestampText('last_success_at'),
    openedAt: timestampText('opened_at'),
    updatedAt: timestampText('updated_at')
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
    expiresAt: timestampText('expires_at'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
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
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
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
    startedAt: timestampText('started_at'),
    finishedAt: timestampText('finished_at'),
    durationMs: integer('duration_ms').notNull().default(0),
    nodeResults: text('node_results').notNull().default('{}'),
    error: text('error'),
    triggeredBy: text('triggered_by').notNull().default('manual'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    pipelineIdx: index('pipeline_run_pipeline_idx').on(t.pipelineId),
    statusIdx: index('pipeline_run_status_idx').on(t.status),
    createdIdx: index('pipeline_run_created_idx').on(t.createdAt),
    pipelineStatusIdx: index('pipeline_runs_pipeline_status_idx').on(t.pipelineId, t.status),
  })
);

/* ─── PHASE 19 — Ecosystem & Marketplace ─────────────────────────���───── */

export const marketplacePlugins = sqliteTable(
  'marketplace_plugins',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    authorId: text('author_id').notNull(),
    authorName: text('author_name').notNull().default(''),
    category: text('category').notNull().default('general'),
    kind: text('kind').notNull().default('plugin'), // plugin | agent | memory | widget | tool | integration
    license: text('license').notNull().default('MIT'),
    homepage: text('homepage'),
    repository: text('repository'),
    latestVersion: text('latest_version'),
    latestVersionId: text('latest_version_id'),
    avgRating: real('avg_rating').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    installCount: integer('install_count').notNull().default(0),
    status: text('status').notNull().default('draft'), // draft | published | deprecated | quarantined
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    slugIdx: uniqueIndex('mp_slug_idx').on(t.slug),
    authorIdx: index('mp_author_idx').on(t.authorId),
    categoryIdx: index('mp_category_idx').on(t.category),
    statusIdx: index('mp_status_idx').on(t.status),
    kindIdx: index('mp_kind_idx').on(t.kind),
  })
);

export const marketplaceVersions = sqliteTable(
  'marketplace_versions',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id')
      .notNull()
      .references(() => marketplacePlugins.id, { onDelete: 'cascade' }),
    version: text('version').notNull(), // semver
    manifest: text('manifest').notNull().default('{}'), // JSON
    artifactSha256: text('artifact_sha256').notNull(),
    artifactSize: integer('artifact_size').notNull().default(0),
    artifactStorageKey: text('artifact_storage_key').notNull(),
    wasmEntry: text('wasm_entry'), // path to .wasm entry inside bundle
    minEngineVersion: text('min_engine_version'),
    changelog: text('changelog').notNull().default(''),
    signature: text('signature'), // base64 ed25519 over artifactSha256
    signerPubkey: text('signer_pubkey'),
    fuelLimit: integer('fuel_limit').notNull().default(1_000_000_000),
    sandboxProfile: text('sandbox_profile').notNull().default('default'),
    status: text('status').notNull().default('pending'), // pending | approved | rejected
    securityReviewId: text('security_review_id'),
    publishedAt: timestampText('published_at'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    pluginVersionIdx: uniqueIndex('mv_plugin_version_idx').on(t.pluginId, t.version),
    statusIdx: index('mv_status_idx').on(t.status),
    publishedIdx: index('mv_published_idx').on(t.publishedAt),
  })
);

export const pluginReviews = sqliteTable(
  'plugin_reviews',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id')
      .notNull()
      .references(() => marketplacePlugins.id, { onDelete: 'cascade' }),
    versionId: text('version_id').references(() => marketplaceVersions.id, {
      onDelete: 'set null',
    }),
    authorId: text('author_id').notNull(),
    authorName: text('author_name').notNull().default(''),
    rating: integer('rating').notNull(), // 1..5
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    helpfulCount: integer('helpful_count').notNull().default(0),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    pluginIdx: index('pr_plugin_idx').on(t.pluginId),
    ratingIdx: index('pr_rating_idx').on(t.rating),
  })
);

export const pluginDependencies = sqliteTable(
  'plugin_dependencies',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id')
      .notNull()
      .references(() => marketplacePlugins.id, { onDelete: 'cascade' }),
    versionId: text('version_id')
      .notNull()
      .references(() => marketplaceVersions.id, { onDelete: 'cascade' }),
    depSlug: text('dep_slug').notNull(),
    depVersionRange: text('dep_version_range').notNull().default('*'),
    kind: text('kind').notNull().default('runtime'), // runtime | peer | dev
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    versionIdx: index('pd_version_idx').on(t.versionId),
    depIdx: index('pd_dep_idx').on(t.depSlug),
  })
);

export const pluginInstalls = sqliteTable(
  'plugin_installs',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id')
      .notNull()
      .references(() => marketplacePlugins.id, { onDelete: 'cascade' }),
    versionId: text('version_id')
      .notNull()
      .references(() => marketplaceVersions.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull().default('default'),
    installedBy: text('installed_by').notNull(),
    installPath: text('install_path'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    pluginIdx: index('pin_plugin_idx').on(t.pluginId),
    tenantIdx: index('pin_tenant_idx').on(t.tenantId),
    uniqueIdx: uniqueIndex('pin_plugin_tenant_idx').on(t.pluginId, t.tenantId),
  })
);

export const pluginSecurityReviews = sqliteTable(
  'plugin_security_reviews',
  {
    id: text('id').primaryKey(),
    versionId: text('version_id')
      .notNull()
      .references(() => marketplaceVersions.id, { onDelete: 'cascade' }),
    reviewerId: text('reviewer_id'),
    state: text('state').notNull().default('queued'), // queued | scanning | approved | rejected
    score: integer('score'), // 0..100
    findings: text('findings').notNull().default('[]'), // JSON array
    scannedWith: text('scanned_with').notNull().default('static-sandbox'),
    reviewedAt: timestampText('reviewed_at'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    versionIdx: index('psr_version_idx').on(t.versionId),
    stateIdx: index('psr_state_idx').on(t.state),
  })
);

export const marketplaceIntegrations = sqliteTable(
  'marketplace_integrations',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    providerKind: text('provider_kind').notNull(), // webhook | oauth | api-key | mcp
    configSchema: text('config_schema').notNull().default('{}'), // JSON schema
    authorId: text('author_id').notNull(),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    status: text('status').notNull().default('published'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    slugIdx: uniqueIndex('mi_slug_idx').on(t.slug),
    kindIdx: index('mi_kind_idx').on(t.providerKind),
  })
);

export const pluginSigningKeys = sqliteTable(
  'plugin_signing_keys',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id').notNull(),
    pubkey: text('pubkey').notNull(), // base64 ed25519 public key
    label: text('label').notNull().default('default'),
    revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    authorIdx: index('psk_author_idx').on(t.authorId),
  })
);

/* ─── PHASE 18 — AI-Native Self-Optimization (safe-exploration control surface) ───
 * Mirror of selfOptParamVersions / selfOptExperiments / selfOptKnowledgeBus /
 * selfOptEvents in schema.ts. Append-only + immutable. See
 * docs/self-optimization-control-surface.md.
 */

export const selfOptParamVersions = sqliteTable(
  'self_opt_param_versions',
  {
    id: text('id').primaryKey(),
    tunerId: text('tuner_id').notNull(),
    ownerAgent: text('owner_agent').notNull(),
    targetInterface: text('target_interface').notNull(),
    experimentId: text('experiment_id'),
    parentId: text('parent_id'),
    beforeJson: text('before_json', { mode: 'json' }).notNull().default({}),
    afterJson: text('after_json', { mode: 'json' }).notNull().default({}),
    status: text('status').notNull().default('shadow'),
    proposedBy: text('proposed_by').notNull().default('pulse'),
    pValue: real('p_value'),
    metricDelta: real('metric_delta'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    promotedAt: timestampText('promoted_at'),
  },
  (t) => ({
    tunerIdx: index('sopv_tuner_idx').on(t.tunerId),
    statusIdx: index('sopv_status_idx').on(t.status),
    ownerIdx: index('sopv_owner_idx').on(t.ownerAgent),
    parentIdx: index('sopv_parent_idx').on(t.parentId),
    expIdx: index('sopv_exp_idx').on(t.experimentId),
  })
);

export const selfOptExperiments = sqliteTable(
  'self_opt_experiments',
  {
    id: text('id').primaryKey(),
    tunerId: text('tuner_id').notNull(),
    hypothesis: text('hypothesis').notNull(),
    metric: text('metric').notNull(),
    variantA: text('variant_a', { mode: 'json' }).notNull().default({}),
    variantB: text('variant_b', { mode: 'json' }).notNull().default({}),
    minSampleSize: integer('min_sample_size').notNull().default(2000),
    alpha: real('alpha').notNull().default(0.05),
    status: text('status').notNull().default('running'),
    winner: text('winner'),
    pValue: real('p_value'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    finishedAt: timestampText('finished_at'),
  },
  (t) => ({
    tunerIdx: index('soe_tuner_idx').on(t.tunerId),
    statusIdx: index('soe_status_idx').on(t.status),
  })
);

export const selfOptKnowledgeBus = sqliteTable(
  'self_opt_knowledge_bus',
  {
    id: text('id').primaryKey(),
    tunerId: text('tuner_id').notNull(),
    ownerAgent: text('owner_agent').notNull(),
    targetInterface: text('target_interface').notNull(),
    configJson: text('config_json', { mode: 'json' }).notNull().default({}),
    score: real('score').notNull().default(0),
    scope: text('scope').notNull().default('local'),
    publishedBy: text('published_by').notNull().default('pulse'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    tunerIdx: index('sokb_tuner_idx').on(t.tunerId),
    ownerIdx: index('sokb_owner_idx').on(t.ownerAgent),
    scopeIdx: index('sokb_scope_idx').on(t.scope),
    scoreIdx: index('sokb_score_idx').on(t.score),
  })
);

export const selfOptEvents = sqliteTable(
  'self_opt_events',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    tunerId: text('tuner_id'),
    ownerAgent: text('owner_agent'),
    actor: text('actor').notNull().default('pulse'),
    detailJson: text('detail_json', { mode: 'json' }).notNull().default({}),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    kindIdx: index('soe_event_kind_idx').on(t.kind),
    tunerIdx: index('soe_event_tuner_idx').on(t.tunerId),
    createdIdx: index('soe_event_created_idx').on(t.createdAt),
  })
);

/* ── PHASE 17 — Enterprise Features (SQLite mirror of schema.ts) ── */

export const orgs = sqliteTable(
  'orgs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    parentId: text('parent_id'),
    plan: text('plan').notNull().default('free'),
    seats: integer('seats').notNull().default(5),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ parentIdx: index('org_parent_idx').on(t.parentId) })
);

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    region: text('region').notNull().default('us-east-1'),
    dataResidency: text('data_residency').notNull().default('us'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ orgIdx: index('ws_org_idx').on(t.orgId) })
);

export const enterpriseUsers = sqliteTable(
  'enterprise_users',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    roles: text('roles', { mode: 'json' }).notNull().default([]),
    status: text('status').notNull().default('active'),
    mfaEnabled: integer('mfa_enabled', { mode: 'boolean' }).notNull().default(false),
    lastLoginAt: timestampText('last_login_at'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: timestampText('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    orgIdx: index('entu_org_idx').on(t.orgId),
    emailIdx: uniqueIndex('entu_org_email_unique').on(t.orgId, t.email),
  })
);

export const enterpriseApiKeys = sqliteTable(
  'enterprise_api_keys',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    tier: text('tier').notNull().default('free'),
    scopes: text('scopes', { mode: 'json' }).notNull().default([]),
    rateLimitRpm: integer('rate_limit_rpm').notNull().default(60),
    lastUsedAt: timestampText('last_used_at'),
    expiresAt: timestampText('expires_at'),
    status: text('status').notNull().default('active'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ orgIdx: index('ekey_org_idx').on(t.orgId) })
);

export const rbacRoles = sqliteTable(
  'rbac_roles',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(true),
    permissions: text('permissions', { mode: 'json' }).notNull().default([]),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ orgIdx: uniqueIndex('rbac_org_name_unique').on(t.orgId, t.name) })
);

export const siemSinks = sqliteTable(
  'siem_sinks',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('webhook'),
    endpoint: text('endpoint').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ orgIdx: index('siem_org_idx').on(t.orgId) })
);

export const tenantConfig = sqliteTable('tenant_config', {
  orgId: text('org_id')
    .primaryKey()
    .references(() => orgs.id, { onDelete: 'cascade' }),
  ssoProvider: text('sso_provider').notNull().default('none'),
  ssoEnabled: integer('sso_enabled', { mode: 'boolean' }).notNull().default(false),
  ssoIdpInitiated: integer('sso_idp_initiated', { mode: 'boolean' }).notNull().default(false),
  ssoEntityId: text('sso_entity_id').notNull().default(''),
  ssoAcsUrl: text('sso_acs_url').notNull().default(''),
  ssoSsoUrl: text('sso_sso_url').notNull().default(''),
  ssoCert: text('sso_cert').notNull().default(''),
  ssoJitProvisioning: integer('sso_jit_provisioning', { mode: 'boolean' }).notNull().default(false),
  ssoDomainRestriction: text('sso_domain_restriction', { mode: 'json' }).notNull().default([]),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  memoryRetentionDays: integer('memory_retention_days').notNull().default(365),
  backupPitr: integer('backup_pitr', { mode: 'boolean' }).notNull().default(false),
  cmkEnabled: integer('cmk_enabled', { mode: 'boolean' }).notNull().default(false),
  cmkKeyId: text('cmk_key_id'),
  themePrimary: text('theme_primary').notNull().default('#06b6d4'),
  themeLogoUrl: text('theme_logo_url').notNull().default(''),
  themeBrandName: text('theme_brand_name').notNull().default('NEXUS'),
  budgetAlertPct: integer('budget_alert_pct').notNull().default(80),
  updatedAt: timestampText('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    amountUsd: integer('amount_usd').notNull().default(0),
    status: text('status').notNull().default('open'),
    pdfUrl: text('pdf_url').notNull().default(''),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ orgIdx: index('inv_org_idx').on(t.orgId) })
);

export const paymentMethods = sqliteTable(
  'payment_methods',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    brand: text('brand').notNull().default(''),
    last4: text('last4').notNull().default(''),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ orgIdx: index('pm_org_idx').on(t.orgId) })
);

export const crossOrgShares = sqliteTable(
  'cross_org_shares',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    targetOrgId: text('target_org_id').notNull(),
    resource: text('resource').notNull(),
    resourceId: text('resource_id').notNull(),
    role: text('role').notNull().default('viewer'),
    createdAt: timestampText('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({ orgIdx: index('cos_org_idx').on(t.orgId) })
);

export const onboardingState = sqliteTable('onboarding_state', {
  orgId: text('org_id').primaryKey(),
  completedSteps: text('completed_steps', { mode: 'json' }).notNull().default([]),
  updatedAt: timestampText('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});
