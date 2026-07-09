# Phase 4 (Database) Enhancements Plan

Let's plan out the changes required for Phase 4:

## 1. Schema index additions (`server/src/db/schema.ts` & `server/src/db/schema-sqlite.ts` & `server/src/db/dev-schema.ts`)

Add the following composite, partial, and GIN indexes in `schema.ts`:

- `agent_tasks (status, priority, queue)`:
  - Drizzle PG: `index('agent_tasks_status_priority_queue_idx').on(t.status, t.priority, t.queue)`
  - Drizzle SQLite: `index('agent_tasks_status_priority_queue_idx').on(t.status, t.priority, t.queue)`
  - Drizzle Dev: `index('agent_tasks_status_priority_queue_idx').on(t.status, t.priority, t.queue)`
- `agent_tasks WHERE status = 'queued' ON (priority, created_at)`:
  - Drizzle PG: `index('agent_tasks_queued_priority_created_idx').on(t.priority, t.createdAt).where(sql\`status = 'queued'\`)`
  - Drizzle SQLite: SQLite indexes also support partial indexes with `.where(sql\`status = 'queued'\`)`.
  - Drizzle Dev: `index('agent_tasks_queued_priority_created_idx').on(t.priority, t.createdAt).where(sql\`status = 'queued'\`)`
- `cron_jobs WHERE enabled = true ON (next_run_at)`:
  - Drizzle PG: `index('cron_jobs_enabled_next_run_idx').on(t.nextRunAt).where(sql\`enabled = true\`)`
  - Drizzle SQLite: `index('cron_jobs_enabled_next_run_idx').on(t.nextRunAt).where(sql\`enabled = 1\`)`
  - Drizzle Dev: `index('cron_jobs_enabled_next_run_idx').on(t.nextRunAt).where(sql\`enabled = true\`)`
- `pipeline_runs (pipeline_id, status)`:
  - Drizzle PG/SQLite/Dev: `index('pipeline_runs_pipeline_status_idx').on(t.pipelineId, t.status)`
- `span_logs (trace_id, parent_id)`:
  - Drizzle PG/SQLite/Dev: `index('span_logs_trace_parent_idx').on(t.traceId, t.parentId)`
- `memories (kind, importance)`:
  - Drizzle PG/SQLite/Dev: `index('memories_kind_importance_idx').on(t.kind, t.importance)`
- `agent_tasks (agent_id, status)`:
  - Drizzle PG/SQLite/Dev: `index('agent_tasks_agent_status_idx').on(t.agentId, t.status)`
- `memories.tags` GIN Index:
  - Drizzle PG/Dev: `index('mem_tags_gin_idx').using('gin', t.tags)`
- `plugins.manifest` GIN Index:
  - Drizzle PG/Dev: `index('plugin_manifest_gin_idx').using('gin', t.manifest)`
- `audit_log.payload` GIN Index:
  - Drizzle PG/Dev: `index('audit_payload_gin_idx').using('gin', t.payload)`

## 2. Check Constraints (`server/src/db/schema.ts`)

Add check constraints where appropriate:

- In drizzle-orm, we can import `check` from `drizzle-orm/pg-core` and add it to the table helpers or custom sql.
- For SQLite, we can import `check` from `drizzle-orm/sqlite-core`.
- Wait, where are enums/checks defined? Let's check schema.ts enum columns:
  - `memories.kind`: episodic | semantic | preference | reflexion | fact
  - `agents.kind`: master | sub-agent | daemon
  - `agents.status`: idle | thinking | executing_tool | errored | quarantined | completed
  - `agent_tasks.kind`: interactive | background | maintenance | safety | self_improvement
  - `agent_tasks.queue`: Q0-Q4
  - `agent_tasks.status`: queued | running | succeeded | failed | cancelled | dead_letter
  - `span_logs.type`: agent_span | tool_span | llm_span | handoff_span
  - `span_logs.status`: ok | error | cancelled
  - `sandbox_executions.type`: docker | wasm | browser
  - `sandbox_executions.status`: pending | running | completed | failed | timeout
  - `improvement_proposals.risk_class`: ADVISORY | BLOCKING | SAFETY
  - `improvement_proposals.status`: draft | testing | canary | rolled_out | reverted | rejected
  - `plugins.source`: local | marketplace | signed-url
  - `plugins.trust_state`: untrusted | trusted | revoked
  - `federated_memory_proofs.privacy_class`: public | private | protected
  - `federated_memory_proofs.materialized`: boolean/integer
  - `llm_provider_health.state`: closed | half-open | open
  - `pipeline_runs.status`: pending | running | succeeded | failed | cancelled

Let's define check constraints on these tables using `check('name', sql\`column IN (...)\`)`. We'll write them inside the table's third argument callbacks (where indexes/constraints are declared).

## 3. Foreign Key Constraints (`server/src/db/schema.ts`, `server/src/db/schema-sqlite.ts`, `server/src/db/dev-schema.ts`)

Ensure the following references are present (or added) with the correct onDelete behaviors:

- `agent_tasks.agent_id -> agents.id ON DELETE CASCADE`:
  - Drizzle: `agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' })`
- `sandbox_executions.agent_id -> agents.id ON DELETE CASCADE`:
  - Drizzle: `agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' })`
- `trajectory_logs.agent_id -> agents.id ON DELETE CASCADE`:
  - Drizzle: `agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' })`
- `tool_receipts.agent_id -> agents.id ON DELETE CASCADE`:
  - Drizzle: `agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' })`
- `plugin_receipts.agent_id -> agents.id ON DELETE SET NULL`:
  - Drizzle: `agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' })`
  - Wait, currently it is `notNull()`. If onDelete is 'set null', it must be nullable (i.e. remove `.notNull()` from `agent_id` or check if schema-sqlite.ts matches).
  - Let's check if `agentId` can be nullable. Yes, if onDelete is 'set null', it must be nullable. So `agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' })`.
- `state_snapshots.agent_id -> agents.id ON DELETE CASCADE`:
  - Drizzle: `agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' })`

We will update `schema.ts`, `schema-sqlite.ts`, and `dev-schema.ts` to have these references.

## 4. Type Mismatches

- `plugin_receipts.fuel_used`: change from `integer`/`bigint` to `text` in `schema.ts`, `schema-sqlite.ts`, and `dev-schema.ts`.
- `federated_memory_proofs.embedding`: change from `jsonb` or `text` to `real('embedding').array()` or similar in `schema.ts` / `dev-schema.ts`.
  - Let's double check what `federated_memory_proofs.embedding` is in SQLite. SQLite does not have real[] so text is fine (storing JSON string).
- `dev-schema.ts apiKeys.scopes`: add `.default([])` or ensure default is set.

## 5. Client FTS5 Virtual Tables and Triggers (`server/src/db/client.ts`)

In `server/src/db/client.ts`, add FTS5 virtual tables and triggers for `skills` and `notes`.

- `skills` fields: id, name, title, description, content.
- `notes` fields: id, path, title, content.
  Create the triggers:
- `skills_ai`, `skills_ad`, `skills_au` for insert, delete, update on `skills`.
- `notes_ai`, `notes_ad`, `notes_au` for insert, delete, update on `notes`.

## 6. Migration SQL File

Create `server/src/db/migrations/0048_phase_4_db_enhancements.sql` containing the PostgreSQL migrations representing these changes.
Wait, the prompt says "0047_vector_hnsw_indexes.sql" - wait, let's verify what the prompt actually says:
"7. Create migration sql files under `server/src/db/migrations/` (specifically `0047_vector_hnsw_indexes.sql`) mapping these changes."
Oh, wait! Let's check if `0047_audit_log_append_only.sql` exists. Yes, it does.
Wait, let's check the files in `server/src/db/migrations/`.
There is `0047_audit_log_append_only.sql`.
So maybe the prompt meant `0048_vector_hnsw_indexes.sql` or we can rename/create `0047_vector_hnsw_indexes.sql` if we want to follow numbering. Wait, if `0047_audit_log_append_only.sql` already exists, then the next should be `0048_vector_hnsw_indexes.sql` or similar. Let's inspect the migration files.
Let's list all migration files first to see their exact names.
