# MASTER MISSION BRIEF — NEXUS 2.0 Agentic OS

## Zero Compromise. Full Autonomy. Complete Ownership.

**Target:** `C:\Users\Tahir\OneDrive\Desktop\nexus-20-ai-agent-os (7)\Agentic OS V3`
**Date:** 2026-07-07
**Command to execute:** Paste this entire file into your agentic AI of choice (Claude Code, Codex, etc.). Say: "EXECUTE MASTER_MISSION_BRIEF.md"

---

## HOW TO USE THIS BRIEF

This is a **self-contained mission brief** for an autonomous AI agent. You are that agent. Read this entire document once, then execute EVERY instruction below in ORDER. Do not skip, defer, or "investigate" any item. Each instruction is independently verifiable. You have full read/write access to the target directory.

**Core invariants (never violated):**

1. No `: any` in TypeScript (no file-level `@typescript-eslint/no-explicit-any` disables)
2. No `anyhow::Result` in public Rust APIs
3. No inline `db.query.*` in route handlers — all DB calls go through services
4. No hardcoded secrets in docker-compose, env files, or source
5. No stubs in production — every feature either works or is removed
6. Every mutation is audited (hash-chained SHA-256, append-only)
7. Every agent action is scoped by ring + scope
8. Coverage thresholds enforced before merge: 60% branches, 60% functions, 60% lines
9. No `any` type `Tx` in audit.ts — use proper Drizzle transaction types
10. No dead code — commented-out imports, stub functions, and unused variables are deleted

**Execution order (DO NOT REORDER):**

---

## PHASE 1: SECURITY (Critical — do first)

### 1.1 Stop env mutation

**File:** `server/src/services/self-improvement-harness.ts:318`
Replace `process.env[p.patch.key] = String(p.patch.value)` with a whitelisted config store.
Create `ENV_OVERRIDE_ALLOWLIST` containing ONLY: `NEXUS_CACHE_TTL_MS`, `NEXUS_RATE_LIMIT_PER_MINUTE`, `NEXUS_RATE_LIMIT_SSE_PER_MINUTE`, `NEXUS_MAX_BODY_BYTES`, `NEXUS_LLM_TEMPERATURE`, `NEXUS_LLM_MAX_TOKENS`, `NEXUS_LOG_LEVEL`, `NEXUS_AUTONOMOUS_MODE`, `NEXUS_MEMORY_RECALL_K`, `NEXUS_MEMORY_IMPORTANCE_THRESHOLD`.
Create `ENV_AUDIT_TRAIL` array that records every change. Log all mutations via `appendAudit`.
**Verify:** `grep -n 'process.env\[' server/src/services/self-improvement-harness.ts` returns only whitelisted keys.

### 1.2 Blockchain key warning

**File:** `server/src/lib/env.ts` (after line 95)
Add `NEXUS_BLOCKCHAIN_ENCRYPTION_KEY: z.string().default('')`.
Add startup detection: if `NEXUS_BLOCKCHAIN_PRIVATE_KEY` looks like a raw 64-hex-char key and `NEXUS_BLOCKCHAIN_ENCRYPTION_KEY` is empty, print a WARNING.
**File:** `.env.example:64`
Add `NEXUS_BLOCKCHAIN_ENCRYPTION_KEY=` with comment: "Must be set if NEXUS_BLOCKCHAIN_PRIVATE_KEY is a raw (unencrypted) private key."

### 1.3 MCP subprocess env filter

**File:** `server/src/services/mcp-registry.ts:209`
Replace `{ ...process.env, ...this.config.env }` with a filtered object containing ONLY: `PATH`, `HOME`, `NODE_ENV`, `NEXUS_LLM_PROVIDER`, `NEXUS_LLM_API_KEY`. Explicitly BLOCK: `NEXUS_API_KEY`, `NEXUS_BLOCKCHAIN_PRIVATE_KEY`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, all provider keys, `NEXUS_OTEL_API_KEY`.
**Verify:** `grep -n 'process.env' server/src/services/mcp-registry.ts` — only the filter function.

### 1.4 CSP nonce-based (no unsafe-inline)

**File:** `server/src/lib/security-headers.ts`
Replace entire file. Remove `unsafe-inline` and `unsafe-eval` from CSP. Generate a crypto-random 16-byte nonce per request via `randomBytes(16).toString('hex')`. CSP must use `script-src 'self' 'nonce-<value>'` and `style-src 'self' 'nonce-<value>'`.
**Verify:** `grep -c 'unsafe-inline\|unsafe-eval' server/src/lib/security-headers.ts` = 0.

### 1.5 Audit table append-only trigger

**Create:** `server/src/db/migrations/0047_audit_log_append_only.sql`
PostgreSQL trigger function `prevent_audit_log_mutation()` that RAISES EXCEPTION on UPDATE and DELETE of `audit_log` table.
**Verify:** After deployment, `SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_log'::regclass` shows both triggers.

### 1.6 Fix ALL_SCOPES array

**File:** `server/src/lib/security.ts:87-104`
Add ALL missing scopes: `brain:admin`, `vault:read`, `vault:write`, `safety:write`, `llm:chat`, `llm:admin`, `plugin:admin`, `plugin:invoke`, `federated:read`, `federated:write`, `pipeline:admin`, `pipeline:execute`. Use `as const satisfies Scope[]` for compile-time enforcement.
**Verify:** `npx tsc --noEmit` in server/ passes.

### 1.7 Kill switch race condition

**File:** `server/src/services/services.ts:17-25` (or equivalent after split)
Modify `isKillSwitchOn()` to accept optional `tx` parameter. When inside a transaction, use `SELECT ... FOR UPDATE`. Add `assertOperational(tx)` call inside every transaction callback.
**Verify:** Every mutation function calls `assertOperational()` twice — once before `db.transaction()`, once inside with `tx`.

### 1.8 Per-key rate limiting

**File:** `server/src/lib/rate-limit.ts`
Add second tier of rate limiting keyed by `principal.id`. Authenticated principals get `PRINCIPAL_LIMIT_MULTIPLIER * baseLimit` tokens. Same cleanup/staleness protection as per-IP buckets.
**Verify:** `consumePrincipal('test-user')` returns different limit than unauthenticated `consume()`.

### 1.9 Streaming body size enforcement

**File:** `server/src/lib/payload-limit.ts`
Replace Content-Length header check with streaming body size enforcement. Read body in chunks via `c.req.raw.body?.getReader()`, enforce limit as bytes arrive. Cancel stream on violation.
**Verify:** `curl -X POST -H "Transfer-Encoding: chunked" -d "$(python3 -c 'print("x"*6000000)')" http://localhost:9900/api/v1/memories` returns 413.

---

## PHASE 2: ARCHITECTURE

### 2.1 Split `services.ts` into per-domain modules

**Action:** DELETE `server/src/services.ts` (505 lines). CREATE:

- `server/src/services/memory.service.ts` — `createMemory`, `updateMemory`, `deleteMemory`, `checkpoint`, `captureSession`, `MemoryRow`, `CaptureReport`
- `server/src/services/skill.service.ts` — `createSkill`, `updateSkill`, `deleteSkill`, `recordOutcome`, `SkillRow`
- `server/src/services/project.service.ts` — `transferProject`, `ensureProject`
- `server/src/services/feedback.service.ts` — `recordFeedback`
- `server/src/services/safety.service.ts` — `isKillSwitchOn`, `assertOperational`
- `server/src/services/session.service.ts` — `setKillSwitch`

**Update ALL imports** in:

- `server/src/routes.ts` — replace barrel import with individual service imports
- `server/src/mcp.ts` — same
- `server/src/services/agent-runtime.ts` — same
- All 31 test files that reference `services.js`

**Verify:** `grep -rn "from './services.js'\|from '../services.js'" server/src/` returns 0.

### 2.2 Remove inline DB queries from routes

**File:** `server/src/routes.ts`
Move EVERY `db.query.*` call to a service function. Exact inventory:

- Lines 117-122 (`db.select({ n: count })` ... 4 tables) → `getSystemCounts()` in system service
- Lines 149-154 (`db.query.memories.findMany`) → `listMemories()` in memory.service
- Line 181 (`db.query.memories.findFirst`) → `getMemoryById()` in memory.service
- Line 220 (`db.query.skills.findMany`) → `listSkills()` in skill.service
- Line 233 (`db.query.skills.findFirst`) → `getSkillById()` in skill.service
- Line 299 (`db.query.projects.findMany`) → `listProjects()` in project.service
- Line 372 (`db.query.notes.findMany`) → `listVaultNotes()` in vault.service
- Lines 405-411 → `listLedgerEntries()`, `getLedgerTotals()` in new ledger service
- Line 424 → `getSystemMetaMap()` in system service
- Lines 451-457 → `recordHeartbeat()` in system service
- Lines 633-666 → `getAnalyticsData()`, `getAnalyticsTotals()` in system service

**Verify:** `grep -n 'db\.' server/src/routes.ts` returns 0.

### 2.3 Delete dead code

- **DELETE** `server/src/lib/protocol-integration.ts` (142 lines — dead code)
- **DELETE** ALL commented-out imports: `grep -rn '^// import' server/src/` — delete every match
- **REMOVE** dead variables in `server/src/services/guardrails.ts:681-684` — `blocked`, `warned`, `modified`, `loggedOnly` are always 0. Either implement real tracking or remove from `GuardrailReport` interface.

### 2.4 Integrate or remove MessageBus

**Decision:** Wire into kernel. (The code is 602 lines of robust IPC — don't waste it.)

- Inject bus into `kernel.ts`: publish `agent.spawned`, `task.enqueued` events
- Create `server/src/services/sse-bridge.ts` — subscribes to bus events, forwards to `broadcastSSE()`
- Wire into `task-worker.ts` — replace direct SSE broadcasts with bus events

### 2.5 Split large files

- `server/src/routes.ts` (720 lines) — extract analytics endpoints into `server/src/routes/analytics.ts`, audit endpoints into `server/src/routes/audit-routes.ts`
- `server/src/services/guardrails.ts` (735 lines) — split into `guardrail-types.ts`, `guardrail-patterns.ts`, `guardrail-registry.ts`
- `server/src/services/agent-runtime.ts` (1054 lines) — split into `action-registry.ts`, `agent-loop.ts`, `agent-persistence.ts`
- `server/src/services/tracing.ts` (1062 lines) — split into `span-context.ts`, `propagation.ts`, `trace-exporter.ts`

---

## PHASE 3: CODE QUALITY

### 3.1 Eliminate ALL `: any` annotations

Primary targets (ordered by impact):

1. `server/src/db/client.ts:33-34` (`_sqlite: any`, `_pgClient: any`) → type as `BetterSQLite3Database<typeof sqliteSchema> | PostgresJsDatabase<typeof pgSchema>`
2. `server/src/lib/audit.ts:28` (`export type Tx = any`) → `BetterSQLite3Transaction<typeof sqliteSchema> | PostgresJsTransaction<typeof pgSchema>`
3. `server/src/lib/security.ts` (6 `db: any` params) → import `db` type from client
4. `server/src/setup.ts:27` (`let db: any`) → type from client module
5. All 20 file-level `/* eslint-disable @typescript-eslint/no-explicit-any */` — remove every one. Replace with per-line disables only, each with a justification comment.

**Verify:** `grep -rn 'eslint-disable @typescript-eslint/no-explicit-any' server/src/ | grep -v 'eslint-disable-next-line'` returns 0.

### 3.2 Standardize catch-block error handling

**Create:** `server/src/lib/format-error.ts` — a `formatError(err: unknown): string` utility.
Replace ALL 56+ `catch (e)` blocks. Remove unsafe `e.message` and `String(e)` patterns.
**Verify:** `grep -rn '\.message' server/src/ | grep -E 'catch|error' | grep -v 'formatError'` returns 0.

### 3.3 Fix missing await

**File:** `server/src/setup.ts:263` — `db.values(sql`SELECT 1`)` → `await db.values(sql`SELECT 1`)`.

### 3.4 Extend ApiError

**File:** `server/src/lib/errors.ts`
Add optional `cause?: unknown` and `metadata?: Record<string, unknown>` fields. Pass `cause` to `super(message, { cause: opts?.cause })`.

### 3.5 Rust: remove anyhow::Result from public APIs

**Files:** `crates/providers/src/anthropic.rs:6`, `crates/providers/src/openai.rs:21`
Replace `use anyhow::Result;` with `use crate::errors::ProviderError;`. Change all public function return types.
**Verify:** `grep -rn 'use anyhow::Result' crates/providers/src/` returns 0.

### 3.6 Split openai.rs (1187 lines)

Split into `crates/providers/src/openai/chat.rs`, `openai/responses.rs`, `openai/streaming.rs`.
**Verify:** `cargo check -p nexus-providers` passes.

### 3.7 Implement or remove safety checker

**File:** `crates/safety/src/checker.rs` — The `check_content()` method is a no-op. Either implement real regex-based PII (email, phone, SSN, credit card), jailbreak, and injection detection, or remove the file entirely.

### 3.8 Add noUncheckedIndexedAccess to root tsconfig.json

**File:** `tsconfig.json` — add `"noUncheckedIndexedAccess": true`.

### 3.9 Replace once_cell::Lazy with std::sync::LazyLock

Rust 1.80 stabilized LazyLock. Replace in `crates/provider-types/src/canonical/registry.rs`, `name_builder.rs`, `catalog.rs`.
**Verify:** `grep -rn 'use once_cell' crates/` returns 0.

---

## PHASE 4: DATABASE

### 4.1 Add pgvector HNSW indexes

**File:** `server/src/db/schema.ts`
Change `embeddingCol()` from `real('embedding').array()` to `vector('embedding', { dimensions: 1536 })`.
Add HNSW indexes on `memories.embedding`, `skills.embedding`, `notes.embedding` using `vector_cosine_ops` with `m=16, ef_construction=64`.
**Create:** `server/src/db/migrations/0047_vector_hnsw_indexes.sql`
**Verify:** Vector search is no longer O(n) full scan.

### 4.2 Add composite indexes for common queries

- `agent_tasks (status, priority, queue)` — worker poll query
- `agent_tasks WHERE status = 'queued' ON (priority, created_at)` — partial index
- `cron_jobs WHERE enabled = true ON (next_run_at)` — partial index
- `pipeline_runs (pipeline_id, status)`
- `span_logs (trace_id, parent_id)` — replace separate trace/parent indexes
- `memories (kind, importance)` — replace separate kind/importance indexes
- `agent_tasks (agent_id, status)`

### 4.3 Add CHECK constraints

Add to ALL enum-like columns. Minimum: `memories.kind`, `agents.kind`, `agents.status`, `agent_tasks.queue`, `agent_tasks.status`, `agent_tasks.kind`, `sandbox_executions.status`, `pipeline_runs.status`, `federated_memory_proofs.privacy_class`, `compiled_scripts.status`, `plugins.trust_state`, `api_keys.status`, `improvement_proposals.risk_class`, `improvement_proposals.status`, `span_logs.type`, `span_logs.status`, `llm_provider_health.state`.

### 4.4 Add missing foreign keys

- `agent_tasks.agent_id → agents.id ON DELETE CASCADE`
- `sandbox_executions.agent_id → agents.id ON DELETE CASCADE`
- `trajectory_logs.agent_id → agents.id ON DELETE CASCADE`
- `tool_receipts.agent_id → agents.id ON DELETE CASCADE`
- `plugin_receipts.agent_id → agents.id ON DELETE SET NULL`
- `state_snapshots.agent_id → agents.id ON DELETE CASCADE`

### 4.5 Fix type mismatches

- `plugins.wasm_bytes`: PG migration `BYTEA` vs Drizzle `text` — add comment acknowledging
- `plugin_receipts.fuel_used`: SQLite schema uses `integer` (32-bit) — change to `text` for 64-bit WASM fuel
- `federated_memory_proofs.embedding`: uses `jsonb`/`text` — change to `real('embedding').array()` to match other tables
- `dev-schema.ts apiKeys.scopes`: missing `.default([])` — add it

### 4.6 Add GIN indexes

- `memories.tags` (text array)
- `plugins.manifest` (jsonb)
- `audit_log.payload` (jsonb)

### 4.7 Add FTS5 for skills and notes in SQLite

**File:** `server/src/db/client.ts` — currently creates FTS5 only for `memories`. Add equivalent virtual tables and triggers for `skills` and `notes`.

### 4.8 Unify migration systems

Generate a Drizzle migration for V3 tables. Create `server/src/db/migrations/README.md` documenting the two-track strategy.

---

## PHASE 5: FRONTEND

### 5.1 Gate vite-plugin-singlefile

**CREATE** `vite.config.standalone.ts` — normal build without singlefile (code splitting enabled, separate vendor chunks for react, motion, xyflow, tanstack).
**MODIFY** `vite.config.ts` — keep as-is but REMOVE the singlefile plugin import.
**MODIFY** `package.json` — add `"build:standalone": "vite build --config vite.config.standalone.ts"`.
**Verify:** `npx vite build` produces 5+ chunk files in `dist/assets/`.

### 5.2 Connect frontend to backend API

**CREATE** `src/lib/api-client.ts` — typed fetch wrapper for all Hono REST endpoints.
**CREATE** `src/lib/store-cache.ts` — observable in-memory cache populated via API calls.
**MODIFY** `src/store.ts` — delegate to `api-client.ts` instead of localStorage + `engine.ts`.
**Export:** `hydrateFromApi()` called on app mount; every CRUD operation calls API then updates local cache.
**Verify:** `grep -rn 'localStorage' src/store.ts src/lib/store-cache.ts src/lib/api-client.ts` returns 0.

### 5.3 Add React Router with lazy routes

**Install:** `react-router-dom`.
**CREATE** `src/router.tsx` — `createBrowserRouter` with paths for ALL 21+ pages, each wrapped in `<ErrorBoundary><Suspense>`.
**MODIFY** `src/main.tsx` — replace `<App>` with `<RouterProvider router={router} />`.
**MODIFY** `src/components/Shell.tsx` — use `useLocation()`, `useNavigate()`, `<Outlet>` instead of `useState<PageId>`. Add `aria-current="page"` to active nav items. Add skip-to-content link.
**Verify:** `curl -s http://localhost:1422/memories` returns the Memories page (not 404).

### 5.4 Add React.memo to card components

Wrap: `MemoryCard` (Memories.tsx), `SkillCard` (Skills.tsx), agent entries (Kernel.tsx), `CardMini` (Graph.tsx), audit rows (Audit.tsx).

### 5.5 Create selector hooks

Add `useMemories()`, `useSkills()`, `useProjects()`, `useAudit()` that subscribe to specific slices via `useSyncExternalStore`.

### 5.6 Extract DataList shared component

**CREATE** `src/components/DataList.tsx` — generic CRUD list with search, filter, card grid, modal form. Refactor Memories.tsx (140→60 lines) and Skills.tsx (121→50 lines) to use it.

### 5.7 Per-page error boundaries

Each `<Route>` already wraps in `<ErrorBoundary>` from step 5.3. Verify that a crash in any page doesn't break the Shell navigation.

### 5.8 Focus management + reduced motion

- `Shell.tsx`: skip-to-content link, focus `<main>` on page change, `aria-current="page"`
- `index.css`: `@media (prefers-reduced-motion: reduce)` — disable all animations
- `FluidBackground.tsx`: return null when reduced motion
- `EventTicker.tsx`: disable scroll animation

---

## PHASE 6: BACKEND SERVICES

### 6.1 Introduce DI container

**CREATE** `server/src/lib/container.ts` — zero-dependency Container class with `register<T>()`, `resolve<T>()`, `reset()`. Singleton lazily instantiated.
Register at bootstrap in `server/src/index.ts`: `db`, `messageBus`, `scheduler`, `traceProvider`, `metricsRegistry`, `desktopActuator`, `mcpRegistry`.
Migrate each singleton from `let _instance` + `getX()` pattern to `container.resolve<T>('token')`.
**Verify:** `grep -rn 'let _instance' server/src/services/` returns 0.

### 6.2 Remove stub MCP tools

**DELETE** 3 browser tools from `server/src/mcp.ts` (lines 334-384): `browser_navigate`, `browser_extract`, `browser_screenshot`.
**DELETE** corresponding browser actions from `agent-runtime.ts` `createDefaultActions()`, and `task-worker.ts` dispatch handler.

### 6.3 Replace poll-based task worker

**CREATE** `server/src/services/task-notifier.ts` — Postgres `LISTEN/NOTIFY` based wake mechanism.
**CREATE** `server/src/db/migrations/0003_task_notify.sql` — DB trigger `notify_task_queued()` on `agent_tasks` INSERT.
**MODIFY** `task-worker.ts` — replace `setInterval` poll with notification-driven wake. Keep a 30s fallback poll as safety net.
**Wire** into `kernel.ts` — call `notifyTaskQueued(task.id)` in `enqueueTask()`.

### 6.4 Implement proper Saga Orchestrator

**MODIFY** `server/src/services/agent-dag.ts` — replace compensation section with proper saga state machine.
States: `pending → active → compensating → completed | failed`.
Execute compensations in REVERSE topological order.
Replace generic `runAgent()` compensation with targeted service-layer rollback functions.

### 6.5 Add business operation metrics

**File:** `server/src/services/metrics.ts` — add 6 new Prometheus metrics:

- `nexus_recall_latency_seconds` (histogram, labels: mode, status)
- `nexus_recall_result_count` (histogram, labels: mode)
- `nexus_memory_writes_total` (counter, labels: kind, source)
- `nexus_audit_chain_verifications_total` (counter, labels: result)
- `nexus_skill_compilations_total` (counter, labels: result)
- `nexus_agent_spawns_total` / `nexus_agent_terminations_total` (counters)
  **Wire** into domain services at each injection point.

---

## PHASE 7: RUST WORKSPACE

**DECISION: DECOMMISSION.** Remove 4 stub crates. Preserve 5 real ones.

### 7.1 Delete stub crates

**File:** `Cargo.toml` — remove `installer`, `safety`, `cli`, `observability` from `members`.
**Disk:** `Remove-Item -Recurse -Force crates/installer crates/safety crates/cli crates/observability`
**Verify:** `cargo check --workspace` compiles clean.

### 7.2 Remove orphaned workspace dependencies

Remove from `Cargo.toml` `[workspace.dependencies]`: `ratatui`, `crossterm`, `rusqlite`, `sqlx`, `deadpool-redis`, `dialoguer`, `indicatif`, `console`, `axum`, `tower`, `tower-http`, `hyper`, `hyper-util`, `flate2`, `sha2`, `which`, `dirs`, `assert_cmd`, `predicates`, `mockall`, `toml_edit`, `unicode-segmentation`.
**Verify:** `cargo check --workspace` still compiles clean.

### 7.3 Create workspace README

**CREATE** `crates/README.md` — document status, preserved crates, deleted crates, future integration path.

### 7.4 Fix ts-rs codegen

**File:** `crates/core/src/types.rs` — add `#[derive(TS)]` to `ProviderKind`, `ModelId`, `Message`, `MessageRole`, `Session`, `ProviderConfig`.
**Verify:** `cargo build -p agentic-os-core --features ts-rs` generates TS bindings.

### 7.5 Update docs

- `CLAUDE.md` — update Rust section to say "5 crates preserved after P1-02 decommissioning"
- `README.md` — update Phase 9 reference
- `TASKBOARD.md` — mark P1-02 as completed `[x]`

---

## PHASE 8: TESTS

Write hard minimums. Test files are new unless marked EXISTING.

### 8.1 Kernel tests (NEW — 40+ cases)

**File:** `server/tests/services/kernel.test.ts`
Cover: spawnAgent with ring enforcement, privilege escalation denial, getAgent, listAgents, updateAgentState, pause/resume/terminate/quarantine, incrementTokenUsage, enqueueTask with idempotency, pickNextTask with starvation, failTask with retry + dead-letter, completeTask, checkACL at all rings, authorizeToolCall (allowed/denied/quarantined), recoverAgentProcesses, schedulerStatus.
Use `createTestDb` from helpers. Mock `appendAudit` with `vi.fn()`.

### 8.2 LLM Gateway tests (NEW — 20+ cases)

**File:** `server/tests/services/llm-gateway-v2.test.ts`
Cover: pickProvider (force/preferred/fallback/none), canCallProvider (closed/open/half_open states), recordSuccess (threshold to closed), recordFailure (threshold to open), chargeBudget (within/exceeded/expired/hard_kill), setBudget, killSession, estimateTokens, callLLMGateway with OmniRoute fallback.
Mock all provider adapters. Do NOT make real HTTP calls.

### 8.3 Agent Runtime tests (NEW — 20+ cases)

**File:** `server/tests/services/agent-runtime.test.ts`
Cover: ActionRegistry register/unregister/find/fuzzyFind/execute, schema validation, timeout, AgentRuntime constructor (default actions), validateAction, getAvailableActions, buildSystemPrompt, saveAgentProcessState, loadAgentProcessState, runAgent with finish tool.
Use `mock-llm.ts` helper.

### 8.4 Recall tests (NEW — 12+ cases)

**File:** `server/tests/services/recall.test.ts`
Cover: empty corpus, BM25-only, semantic mode, RRF fusion boost, importance weighting, recency weighting, feedback bonus, token budget packing, cursor pagination, FTS5 SQLite fallback, corpus proportional limits, token ledger side effects.
Create inline test data via `createTestDb`.

### 8.5 Embeddings tests (NEW — 10+ cases)

**File:** `server/tests/services/embeddings.test.ts`
Cover: available check (no provider/with provider), rebuildEmbeddings (no provider/when done/dimension mismatch/API error/success), embedQuery (no provider/success/failure).

### 8.6 Brain tests (NEW — 10+ cases)

**File:** `server/tests/services/brain.test.ts`
Cover: exportBrain, importBrain (valid/duplicate/invalid schema/empty arrays), compressBrain (prunable/non-prunable).

### 8.7 Scheduler tests (NEW — 20+ cases)

**File:** `server/tests/services/scheduler.test.ts`
Cover: CronParser (valid/invalid/multiple/matches), scheduleJob (valid/invalid cron), cancelJob (existing/nonexistent), tick (no due/one due), runWithRetry (success/exhausted), triggerEvent (matching/no matching), stop/start idempotency, singleton pattern.
Use `vi.useFakeTimers()`.

### 8.8 SSE Bus tests (NEW — 6+ cases)

**File:** `server/tests/services/sse-bus.test.ts`
Cover: add/remove client, broadcast to all, writer removal on error, empty set, message format.

### 8.9 Lib tests (NEW)

**File:** `server/tests/lib/errors.test.ts` (10+ cases) — ApiError construction, statusForCode for ALL codes.
**File:** `server/tests/lib/auth-context.test.ts` (10+ cases) — parse, safeJson, fail, resolvePrincipal, requireScope.
**File:** `server/tests/lib/envelope.test.ts` (14+ cases) — ok, err, statusForCode for ALL codes.
**File:** `server/tests/lib/security-headers.test.ts` (8+ cases) — dev vs production HSTS, CSP structure, all required headers.

### 8.10 Route tests (NEW)

**File:** `server/tests/routes/agents.test.ts` (8+ cases)
**File:** `server/tests/routes/automation.test.ts` (5+ cases)
**File:** `server/tests/routes/sse.test.ts` (5+ cases)
**File:** `server/tests/routes/v3-upgrade.test.ts` (4+ cases)
**File:** `server/tests/routes/agent-lifecycle.test.ts` (8+ cases)
Each covers: auth enforcement, payload validation, happy path, error path.

### 8.11 Fix E2E stubs

**File:** `server/tests/e2e/system.e2e.test.ts`
Scenarios 4, 6, 10 are trivial string/boolean assertions. Either implement real tests or DELETE them entirely. No stub assertions.

### 8.12 Enable coverage

**File:** `server/vitest.config.ts` — add:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],
  thresholds: { branches: 60, functions: 60, lines: 60, statements: 60 },
},
```

**Add script:** `"test:coverage": "vitest run --coverage"` to `server/package.json`.

### 8.13 Fix health.test.ts

Remove ALL `try/catch` silent swallowing in `server/tests/health.test.ts`. Use `it.skipIf()` if needed.

### 8.14 Add migration tests

**File:** `server/tests/migration.test.ts` — verify SQL migration creates all expected tables.

### 8.15 Add test:rust script

**File:** root `package.json` — add `"test:rust": "cargo test --workspace"`.

---

## PHASE 9: DEVOPS

### 9.1 Fix lockfile guards in Dockerfiles

**Files:** `Dockerfile:11`, `Dockerfile.standalone:10`, `server/Dockerfile:8`
Replace `npm ci || npm install` with `test -f package-lock.json || (echo "FATAL: lockfile missing" && exit 1); npm ci`.

### 9.2 Add HTTPS to nginx.conf

**File:** `nginx.conf` — add `listen 443 ssl`, self-signed or env-var-based cert paths, HTTP→HTTPS redirect.

### 9.3 Add Docker build+push to CI

**File:** `.github/workflows/ci.yml` — append `docker-build-push` job. Push to GHCR with `git sha` and `latest` tags.

### 9.4 Add integration tests to CI

**File:** `.github/workflows/ci.yml` — add `integration-tests` job with pgvector/pgvector:pg16 service container.

### 9.5 Fix Husky hooks

- **CREATE** `.husky/pre-push` — run `pnpm run validate`
- **VERIFY** `.husky/pre-commit` — run `npx lint-staged`
- **MODIFY** `.lintstagedrc` — add `eslint --fix --max-warnings 0` before `prettier --write` for `*.{ts,tsx}`.

### 9.6 Remove hardcoded secrets

**Files:** `docker-compose.yml:10,65`, `docker-compose.dev.yml:9,44`
Replace hardcoded `POSTGRES_PASSWORD: nexus_password` with `${POSTGRES_PASSWORD:?error}`.

### 9.7 Add deployment workflow

**CREATE** `.github/workflows/deploy.yml` — on tag push `v*`, build and push to GHCR, deploy via SSH.

### 9.8 Add production compose overrides

**CREATE** `docker-compose.prod.yml` — TLS certs, json-file logging with rotation, resource limits, health checks, restart policies.

### 9.9 Fix format script

**File:** `package.json:17` — change to `"format": "prettier --write '**/*.{ts,tsx,json,yaml,yml,md,css}'"`.

### 9.10 Add clean script

**File:** `package.json` — add `"clean": "pnpm -r exec -- rm -rf dist coverage *.tsbuildinfo"`.

### 9.11 Fix .gitignore

**File:** `.gitignore:84` — remove `Dockerfile.frontend` entry (it's a tracked file).

### 9.12 Add security scanning

**File:** `.github/workflows/ci.yml` — add `security-scan` job with `github/codeql-action`.

### 9.13 Add monitoring stack

**CREATE** `docker-compose.monitoring.yml` — Prometheus + Grafana + Loki.
**CREATE** `docs/monitoring/prometheus.yml` — scrape config for nexus server.
**CREATE** `docs/monitoring/grafana-dashboard.json` — RED metrics for HTTP, LLM, DB, Cache (12 panels).

### 9.14 Pin Dependabot

**File:** `.github/dependabot.yml` — increase `open-pull-requests-limit` to 10, add `groups` for `@opentelemetry/*` and `eslint-*`.

---

## PHASE 10: DOCUMENTATION

### 10.1 Rewrite ARCHITECTURE.md

**File:** `docs/ARCHITECTURE.md` — complete replacement. Use C4 model (Context → Container → Component). List ALL 19 pages, 15 components, 51 services, 6 route modules, 8 middleware layers. Include recall pipeline diagram, ring kernel flow, hash-chained audit flow, MCP and A2A integration points.

### 10.2 Rewrite TESTING.md

**File:** `docs/TESTING.md` — complete replacement. Remove "no test runner" lie. Document Vitest config, directory structure, naming conventions, mocking strategy, SQLite isolation, integration prerequisites, CI pipeline, coverage thresholds, test coverage map.

### 10.3 Create ADRs

**CREATE** directory `docs/adr/` with files:

- `0002-database-choice.md` — PostgreSQL + SQLite dual support
- `0003-mcp-protocol-integration.md` — MCP Streamable HTTP
- `0004-a2a-protocol.md` — Google A2A protocol
- `0005-ring-based-kernel.md` — Ring 0–4 privilege model
- `0006-sandbox-architecture.md` — Worker threads + Docker dual path
- `0007-rust-typescript-boundary.md` — Current decoupled state

### 10.4 Create docs

- `docs/PRODUCTION_CHECKLIST.md` — secrets, TLS, proxy, backend, DB, networking, Docker, monitoring, backup, security, DNS
- `docs/OBSERVABILITY_GUIDE.md` — OTel, Prometheus metrics, Grafana, logging
- `docs/CONTRIBUTING.md` — verify exists and is accurate

### 10.5 Fix remaining docs

- Separate OmniRoute docs from NEXUS docs clearly
- Add `docs/README.md` index file
- Remove "V4" references (project is V3)
- Update all feature maturity badges in README to match reality

---

## FINAL VERIFICATION

Run this complete validation script. **Every check must pass before declaring mission complete.**

```bash
echo "=== PHASE 1: SECURITY ==="
grep -rn 'process.env\[' server/src/services/self-improvement-harness.ts | grep -v 'ENV_OVERRIDE_ALLOWLIST\|ENV_AUDIT_TRAIL'
# Expected: only whitelisted keys

grep -c 'unsafe-inline\|unsafe-eval' server/src/lib/security-headers.ts
# Expected: 0

grep -c 'blockchain_private_key' server/src/lib/env.ts
# Expected: 1 (the env var def + comment)

echo "=== PHASE 2: ARCHITECTURE ==="
grep -rn "from './services.js'\|from '../services.js'" server/src/ | grep -v 'node_modules'
# Expected: 0

grep -c 'db\.' server/src/routes.ts
# Expected: 0 (all DB calls moved to services)

Test-Path "server/src/lib/protocol-integration.ts"
# Expected: False

echo "=== PHASE 3: CODE QUALITY ==="
grep -rn 'eslint-disable @typescript-eslint/no-explicit-any' server/src/ server/tests/ | grep -v 'eslint-disable-next-line' | wc -l
# Expected: 0

grep -rn 'use anyhow::Result' crates/providers/src/ | wc -l
# Expected: 0

grep -rn 'use once_cell' crates/ | wc -l
# Expected: 0

echo "=== PHASE 4: DATABASE ==="
grep -c 'hnsw' server/src/db/schema.ts
# Expected: 3

grep -c 'check(' server/src/db/schema.ts
# Expected: 17+

grep -c 'references.*agents\.id' server/src/db/schema.ts
# Expected: 6+

echo "=== PHASE 5: FRONTEND ==="
ls -la vite.config.standalone.ts
# Expected: exists

grep -rn 'localStorage' src/store.ts src/lib/store-cache.ts src/lib/api-client.ts | wc -l
# Expected: 0

curl -s -o /dev/null -w '%{http_code}' http://localhost:1422/memories
# Expected: 200

echo "=== PHASE 6: BACKEND ==="
grep -rn 'let _instance' server/src/services/ | wc -l
# Expected: 0

grep -c 'browser.*not available\|Browser automation' server/src/mcp.ts
# Expected: 0

echo "=== PHASE 7: RUST ==="
Test-Path "crates/installer"
# Expected: False

Test-Path "crates/cli"
# Expected: False

echo "=== PHASE 8: TESTS ==="
cd server && npx vitest run --coverage 2>&1 | tail -5
# Expected: all thresholds met (60+)

echo "=== PHASE 9: DEVOPS ==="
grep -c ':?error}' docker-compose.yml docker-compose.dev.yml
# Expected: 4 (2 per file)

grep -c 'nexus_password' docker-compose.yml docker-compose.dev.yml
# Expected: 0

ls -la .husky/pre-push
# Expected: exists

echo "=== PHASE 10: DOCS ==="
grep -c 'V4' docs/ARCHITECTURE.md
# Expected: 0

ls docs/adr/0002-database-choice.md docs/adr/0003-mcp-protocol-integration.md docs/adr/0004-a2a-protocol.md docs/adr/0005-ring-based-kernel.md docs/adr/0006-sandbox-architecture.md docs/adr/0007-rust-typescript-boundary.md
# Expected: 6 files

echo "=== ALL VALIDATIONS PASSED ==="
```

---

## APPENDIX: FILE CREATION/DELETION SUMMARY

### Files to CREATE

- `server/src/lib/container.ts` — DI container
- `server/src/lib/format-error.ts` — error formatting utility
- `server/src/services/memory.service.ts` — memory domain service
- `server/src/services/skill.service.ts` — skill domain service
- `server/src/services/project.service.ts` — project domain service
- `server/src/services/feedback.service.ts` — feedback domain service
- `server/src/services/safety.service.ts` — kill switch + assertOperational
- `server/src/services/session.service.ts` — session + kill switch setter
- `server/src/services/task-notifier.ts` — LISTEN/NOTIFY task wake
- `server/src/services/sse-bridge.ts` — MessageBus → SSE bridge
- `server/src/services/action-registry.ts` — from agent-runtime.ts split
- `server/src/services/agent-loop.ts` — from agent-runtime.ts split
- `server/src/services/agent-persistence.ts` — from agent-runtime.ts split
- `server/src/services/span-context.ts` — from tracing.ts split
- `server/src/services/propagation.ts` — from tracing.ts split
- `server/src/services/trace-exporter.ts` — from tracing.ts split
- `server/src/services/sampling.ts` — from tracing.ts split
- `server/src/db/migrations/0047_audit_log_append_only.sql` — audit trigger
- `server/src/db/migrations/0047_vector_hnsw_indexes.sql` — HNSW + composite indexes
- `vite.config.standalone.ts` — standalone build config
- `src/lib/api-client.ts` — typed REST API client
- `src/lib/store-cache.ts` — observable API cache
- `src/router.tsx` — React Router definition
- `src/components/DataList.tsx` — shared CRUD list
- `.husky/pre-push` — pre-push validation hook
- `.github/workflows/deploy.yml` — deployment pipeline
- `docker-compose.prod.yml` — production overrides
- `docker-compose.monitoring.yml` — monitoring stack
- `docs/monitoring/prometheus.yml` — Prometheus scrape config
- `docs/monitoring/grafana-dashboard.json` — RED metrics dashboard
- `docs/PRODUCTION_CHECKLIST.md` — production readiness checklist
- `docs/OBSERVABILITY_GUIDE.md` — monitoring configuration guide
- `docs/adr/0002-database-choice.md` through `0007-rust-typescript-boundary.md` — 6 ADRs
- `crates/README.md` — Rust workspace documentation
- All 15+ test files listed in Phase 8

### Files to DELETE

- `server/src/lib/protocol-integration.ts` (142 lines of dead code)
- `server/src/services.ts` (505 lines — replaced by domain modules)
- `crates/installer/` (entire directory — 5 stub files)
- `crates/safety/` (entire directory — 4 stub files)
- `crates/cli/` (entire directory — 6 stub files)
- `crates/observability/` (entire directory — 1 stub file)

---

**END OF MISSION BRIEF. EXECUTE NOW.**
