# Project Analysis — NEXUS 2.0 / Agentic OS V3

Generated: 2026-07-22 — branch `arena/019f8af9-agentic-os-v3` (base `23a5ffa`)

---

## 1. Executive Summary

**NEXUS 2.0** is positioned as a **Universal AI Agent Operating System**: persistent memory, recall, skills, governance, and coordination layer for AI agents. It's a **pnpm monorepo** with 5 top-level deliverables:

| Deliverable | Path | Stack | Purpose |
|-------------|------|-------|---------|
| Browser Dashboard | `src/` | React 18 + Vite 5 + tanstack/query + zustand/jotai + @xyflow/react | Agent control plane SPA (agent tree, console, recall, pipeline builder, kernel views) |
| Backend Server | `server/` | Hono 4 + Node 20 + Drizzle ORM + TypeScript | REST API `/api/v1`, MCP endpoint `/api/mcp`, SSE, background worker, 190+ service modules |
| Shared Packages | `packages/` | TS libs: `sdk`, `a2a-server`, `devtools` | Consumed via tsconfig path aliases `@agentic-os/*` |
| Rust Crates | `crates/` | Cargo workspace 11 members + standalone `nexus-cli` | Provider types, LLM clients (Goose-ported), safety, tools, search — **decoupled, no runtime link** (ADR-0007) |
| Desktop Shell | `nexus-tauri/` | Tauri | Thin native wrapper reusing web dashboard |

**Core thesis:** Recall pipeline (BM25 + pgvector HNSW → RRF fusion k=60 → importance/recency/feedback weighting → token-budget packing). Plus Agentic OS kernel (Ring 0-4 privilege, saga orchestration, IPC bus, VFS, approval gates, daemon supervisor). Plus MCP server (14 tools), hash-chained audit (SHA-256), kill-switch (HTTP 423), self-optimizing tuners.

Vision = ambitious. Implementation = ~80% real server-side, UI wiring is the main lag (Phase 5 gap).

---

## 2. Monorepo Mechanics

- **Root:** `package.json` `"type": "module"`, version 2.1.0, scripts delegate to server (`dev`, `build`, `test`). `pnpm-workspace.yaml` defines `packages/*`, `server`, `nexus-tauri`.
- **Root build config:** `vite.config.ts` (dashboard) + `vite.config.standalone.ts` (gated singlefile). `tsconfig.json` strict true + `noUncheckedIndexedAccess: true`.
- **Lint/format:** `eslint.config.mjs` 9.x, prettier 3.3, husky + lint-staged. Commit-msg hook present.
- **Env:** `.env.example` has ~70 vars (see section 9).
- **Docker:** `Dockerfile` (server), `Dockerfile.frontend`, `Dockerfile.standalone`, `docker-compose.yml` / `dev.yml` / `prod.yml` / `monitoring.yml`. Compose provides `nexus` (9900), `postgres` (5432, pgvector), `redis` optional, `sandbox` DinD. Nginx configs present.
- **CI:** `.github/workflows/` = `ci.yml` (tsc, lint, vitest, cargo), `deploy.yml`, `validate.yml`, dependabot pinned.
- **Gitignore:** ignores `dist/`, `coverage/`, `*.tsbuildinfo`, `*.db`, `agentic-os.db`, `server/data/*.sqlite*`.

**Size:** `server/src/services/` alone is ~40k LOC (169 files). Largest: `scheduler.ts` 1698 lines (MLFQ Q0-Q4, EDF, FairShare), `kernel.ts` 1456, `federated-recall.ts` 1366, `agent-runtime.ts` 1063.

---

## 3. Backend Server Deep Dive (`server/`)

### 3.1 Bootstrap & Perimeter (`src/index.ts`, `app.ts`, `proxy.ts`, `routes.ts`)

- `index.ts`: boots Hono on `0.0.0.0` in production, `127.0.0.1` dev. DB reachability gate, auto-generates operator API key if none active (logs once). Appends `system.booted` audit, starts `task-worker` system-worker and `audit-watchdog`. Writes PID-qualified port file to `/tmp/nexus-port-<pid>.txt`. Graceful shutdown: flush audit, stop worker/watchdog, drain HTTP 10s, close DB pool, cleanup port file, shutdown OTEL.
- `app.ts`: `createApp()` — perimeter middleware order: `requestId` → OTEL W3C traceparent parse/generate + Prometheus http metrics → CORS → `securityHeaders` (CSP nonce-based, no unsafe-inline/eval per mission brief) → `payloadLimit` (streaming enforcement) → `rateLimit` (per-IP + per-principal two-tier) → `authBackstop`. Then mounts `api` router, API 404 guard (JSON never SPA), global error boundary, optional dashboard static HTML.
- `proxy.ts`: implements securityHeaders, cors, payloadLimit, rateLimit, authBackstop.
- `env.ts`: Zod schema for 70+ env vars, cached via Proxy over `getEnv()`, resetEnv() for tests. Helpers `llmConfigured()`, `embeddingsConfigured()`.

### 3.2 Routes (`src/routes.ts` + `src/routes/*.ts` 24 modules)

Root `routes.ts` (v1 REST, ~720 lines originally, now split per 2.5):

- Public: `/api/v1/health`, `/metrics`, `/api/metrics`, `/api/v1/system`
- Memories: CRUD + list with cursor pagination
- Recall: `GET /api/v1/recall?q=&budget=` and `POST /api/v1/recall/conversation`
- Skills, Projects, Vault (Obsidian), Sessions/capture, Brain export/import/compress/embeddings rebuild, Audit/ledger, Safety kill-switch/heartbeat, Feedback, Admin keys, compiled-scripts, analytics
- SSE: `/api/v1/events`
- MCP: `/api/mcp` (GET/POST)
- Mounts sub-routers: `agents`, `automation`, `sse`, `v3-upgrade`, `agent-lifecycle`, `kernel`, `a2a`, `audit-routes`, `analytics`, `marketplace`, `enterprise`, `kernel-introspect`, `memory-graph`, `memory-health`, `memory-nl-query`, `memory-batch`, `memory-search-suggest`, `memory-dedup`, `memory-contradiction`, `self-opt`, `perf`, `r1` (governed).

Each handler: `requireScope(c, 'scope')` → Zod parse → service call → `ok()/err()` envelope with traceId. Middlewares enforce kill-switch via `assertOperational()`.

Gap noted in TASKBOARD P0: inline `db.query.*` still in routes.ts list endpoints (117-122 system counts etc) — should move to services per mission brief 2.2. Partially addressed but not fully.

### 3.3 Database (`src/db/`)

- Dual backend: `client-postgres.ts` (production, `postgres` driver 3.4.5 + pgvector `vector` column 1536d), `client-sqlite.ts` (dev, `better-sqlite3` 11.10 + FTS5 for memories; brief says also need FTS5 for skills/notes). `client.ts` selects based on `DATABASE_URL`. `schema.ts` PG, `schema-sqlite.ts` SQLite, `dev-schema.ts` dev overlay.
- Tables: counted ~60+ in PG schema. Categories:
  - Memory: `memories`, `memory_clusters`, `memory_cluster_members`, `session_links`, `memory_causal_edges`, `memory_contradictions`, `memory_emotions`, `tag_taxonomy`, `memory_tags`, `memory_templates`, `memory_diff_markers`, `memory_rehearsal_log`, `memory_attachments`, `memory_archive`, `agent_memory_quotas`, etc (12.3-12.33 features).
  - Core: `projects`, `skills`, `notes`, `token_ledger`, `feedback`, `vault`, `system_meta`
  - Kernel/agents: `agents`, `agent_tasks`, `ring_policies`, `state_snapshots`, `sandbox_executions`, `trajectory_logs`, `tool_receipts`, `plugin_receipts`, `cron_jobs`, `pipeline_runs`
  - Governance: `audit_log` (hash-chained, append-only trigger prevents UPDATE/DELETE), `api_keys` (scrypt hash, scopes JSON), `compiled_scripts`, `plugins`, `marketplace`
  - Observability/self-opt: `span_logs`, `metrics`, `improvement_proposals`, `llm_provider_health`, `federated_memory_proofs`, `enterprise orgs/workspaces` etc.
- Indexes: composite indexes for hot paths: `agent_tasks(status,priority,queue)`, partial `WHERE status='queued'`, `cron_jobs WHERE enabled`, `pipeline_runs(pipeline_id,status)`, `span_logs(trace_id,parent_id)`, `memories(kind,importance)` etc (per Phase 4). GIN indexes on `tags` array, `manifest` jsonb, `audit_log.payload` jsonb.
- Vector: `vector('embedding', {dimensions:1536})` with HNSW `vector_cosine_ops m=16 ef=64` on memories/skills/notes.
- Migrations: `drizzle/` dir, plus custom SQL like `0003_task_notify.sql` (LISTEN/NOTIFY), `0047_audit_log_append_only.sql`, `0047_vector_hnsw_indexes.sql`.

### 3.4 Core Services — The Agentic OS Kernel

**`kernel.ts` (1456 lines):**

- Ring-based privilege (0-4): 0 kernel, 1 interactive, 2 sub-agent default, 3 user, 4 quarantined/no-mutations. `SpawnAgentInput` validates `callerRing >= requestedRing` prevents escalation.
- Cgroup parsing/inheritance from parent.
- Agent registry: spawnAgent → DB insert `agents`, metrics inc, `appendAudit('agent.spawned')`, publish `message-bus` + SSE `publishKernelEvent`.
- State machine: getAgent, listAgents, updateAgentState (thinking/executing_tool etc → SSE Live Kanban), pause/resume/terminate/quarantine (ring→4), getAgentState (+alive), listAgentTasks, incrementTokenUsage (auto-pause on budget exceeded).
- Task scheduling: `QUEUE_PRIORITY` Q0-4 (100/80/60/40/20), enqueueTask (idempotency key, ring ACL, `notifyTaskQueued`), pickNextTask via scheduler policy, failTask with retry + dead-letter, completeTask, checkACL at all rings, authorizeToolCall (allowed/denied/quarantined).
- Seams for Pulse self-opt: `hotpatchModule` delegates to `kernel-hotpatch.ts`.
- Companion files: `kernel-bootstrap.ts`, `kernel-persistence.ts`, `kernel-schema.ts`, `kernel-panic.ts` (panic handler), `kernel-introspect.ts` + `kernel-introspect-state.ts` (introspection API), `kernel-hotpatch.ts` (HotPatchRegistry), `ring-audit.ts` (`RingPolicyStore`, `RingOscillationDetector` — NOT `RingKernel` class), `resource-quota.ts`, `preemption-leak-guard.ts`, `signal-hooks.ts`.

**`scheduler.ts` (1698 lines)** — MLFQ design ratified ADR-0009:

- `MLFQPolicy` Q0-Q4 timeslice/boost/starvation promotion, `EDFPolicy`, `FairSharePolicy`. Swappable via `setSchedulingPolicy` (Pulse tuner). API: `pickByPolicy`, `recordQueueLatency`, `checkDeadlineAdmission`, `riskLevelForTask`, `applyMlfqAgingPass`, `getSlotManager`.
- CronParser, scheduleJob, cancelJob, tick, runWithRetry, triggerEvent, stop/start idempotent.

**Runtime loop (`task-worker.ts` 804 lines):**

- Poll-and-wake dispatch through kernel admission gate, consumes `agent_tasks`. Replaced setInterval poll with notification-driven wake via `task-notifier.ts` (Postgres LISTEN/NOTIFY + 30s fallback). Wire into kernel.enqueueTask → notifyTaskQueued.
- Dispatch to `agent-runtime`, `pipeline-executor` waves, `dag-executor`, handles compensation.
- `message-bus.ts` (618 lines): in-memory or Redis pub/sub (bus backend env). Publishes `agent.spawned`, `task.enqueued`.
- `sse-bus.ts`, `sse-bridge.ts`, `sse.ts`: SSE client set, broadcast, writer removal on error, bridge bus→SSE.
- `pipeline-executor.ts` (415 lines): DAG wave executor with compensation/rollback reverse topological.
- `scheduler.ts` worker knobs configurable via env: `NEXUS_WORKER_POLL_MS` 2000, `MAX_CONCURRENCY` 3, TIMEOUT 120s, etc — Pulse control surface.

**Orchestration (Atlas namespace):**

- `orchestrator.ts`, `blackboard.ts`, `dag-executor.ts`, `planner.ts`, `agent-dag.ts` (825 lines saga orchestrator pending→active→compensating→completed/failed), `agent-runtime.ts` (1063 lines ActionRegistry, system prompt builder, process state), `agent-loop.ts`, `agent-persistence.ts`, `agent-permissions.ts`, `consensus.ts` (majority/weighted/Borda/approval), `deadlock-detector.ts`, `workflow-dsl.ts`, `conditional-router.ts`, `merge-strategies.ts`, `specialization-registry.ts`, `action-registry.ts` (559 lines), `propagation.ts`, `graph-engine.ts`, `pipeline-io.ts`, `performance/`, `reliability/`, `r1-runtime.ts`.

### 3.5 Recall Stack (Mnemosyne/Lethe)

**`recall.ts` (498 lines central):**

```
Query → BM25 lexical (SQLite FTS5 or PG) + pgvector cosine (if embeddings configured) → RRF fusion k=60 → importance 0.3 + recency 0.1 (half-life 30d configurable) + feedback 0.1 → budget pack greedy → results {items, totalTokens, trace}
```

- Falls back to BM25-only if no embedding provider.
- Supports corpus proportional limits, cursor pagination, token ledger side effect (`tokenLedger` table tracks reuse/savings).
- Feedback: `feedback.service.ts` records helpful/not-helpful, bonus 0-0.15 per item.
- `federated-recall.ts` (1366 lines): layers RRF across agent/project/tenant/blackboard scopes, local/mesh modes, privacy budget, cryptographic proof protocol — BUT TASKBOARD says actual federation vaporization: only localhost; honest local logic but 0 real remote nodes.
- `embeddings.ts` (233 lines): OpenAI-compatible via `safeFetch`, batch `NEXUS_EMBEDDING_BATCH_SIZE` 64, dimension validation 1536, DB updates. Rebuild on demand.
- Advanced memory tables: `memory-decay.ts` (importance half-life), `memory-forget.ts`, `memory-hierarchy.ts`, `memory-templates.ts`, `memory-quota.ts`, `memory-fragmentation.ts`, `memory-cold-storage.ts`, `memory-backup.ts`, `memory-anomaly.ts`, `memory-stitcher.ts`, `memory-consolidation.ts` + `consolidation.ts` + budget, `memory-priming.ts`, `memory-rehearsal.ts` (SM-2 spaced), `memory-emotion.ts`, `memory-export-v3.ts`, `memory-diff-sync.ts`, `memory-graph-browser.ts`, `memory-attachments.ts` (multimodal), `memory-batch.ts`, `memory-tag-taxonomy.ts`, `memory-clustering.ts` (HDBSCAN+LLM), `memory-causal-chains.ts`, `memory-contradiction.ts` + conflict resolver, `memory-provenance.ts`, `memory-dedup.ts`, `memory-privacy-zones.ts`, `memory-multilingual.ts`, `memory-multimodal.ts`, `memory-nl-query.ts`, `memory-search-*`, `dedup-engine.ts`, `memory-trainer.ts` ranking trainer.

### 3.6 LLM Gateway (Cerebrum)

- `llm-router.ts`, `llm-gateway-v2.ts` (685 lines ProviderAdapter interface), `llm-client.ts`, `llm-scheduler.ts` (793 lines concurrency/starvation + `llm.ts` unified), `omniroute.ts` + `omniroute-bridge.ts` (complexity classification → model tier), `portkey-bridge.ts` (Portkey unified gateway, single traced seam `startLLMSpan`), `vlm.ts`, `brain.ts` (604 lines export/import/compress secrets-safe, idempotent, schema-validated).
- `services/providers/*`: openai, anthropic, google, ollama, vllm, m3 implementing `ProviderAdapter`. **NOT npm `openai` SDK** — adapter is custom fetch. Tier routing: `NEXUS_LLM_SIMPLE_MODEL`, `_MEDIUM`, `_COMPLEX` fallback to `NEXUS_LLM_MODEL`.
- Circuit breaker: `NEXUS_CB_THRESHOLD` 3, reset 30s.
- Multi-tenant budget: `chargeBudget`, `setBudget`, `killSession`, token accounting via Metron metrics.

### 3.7 Security & Governance (Sentinel/Aegis)

**Sentinel namespace:**
- `guardrails.ts` + `guardrail-types.ts` + `guardrail-registry.ts` + `guardrail-patterns.ts`: SQLi, PII, prompt injection, jailbreak regex.
- `safety.service.ts`: `isKillSwitchOn()`, `assertOperational(tx)` with SELECT FOR UPDATE race fix.
- `runtime-security.ts`, `network-policy.ts`, `crypto-suite.ts`, `db-encryption.ts`, `memory-encryption.ts`, `file-watcher.ts`, `data-classification.ts`, `dlp-scanner.ts`, `secrets-scanner.ts`, `secret-rotator.ts`, `cert-manager.ts`, `vault.ts`, `rate-limit.service.ts`, `security-posture.ts`
- Lib: `lib/security.ts` (ALL_SCOPES 9+ scopes: memory:read/write, skill:read/write, brain:admin, vault:read/write, safety:write, audit:read, llm:chat/admin, plugin:admin/invoke, federated:read/write, pipeline:admin/execute — with `as const satisfies Scope[]`), `lib/security-headers.ts` CSP nonce, HSTS, `lib/zero-trust.ts` attestation JWT, `lib/mfa.ts` TOTP, `lib/geo-fence.ts` MaxMind, `lib/jit-elevation.ts` temporary elevation, `lib/hsm-provider.ts` Vault/AWS KMS/Azure KV, `lib/crypto-sign.ts`, `lib/env-sanitizer.ts` boot secret scan, `lib/verify.ts`, `lib/auth-context.ts` parse/safeJson/fail/resolvePrincipal/requireScope, constant-time auth `crypto.timingSafeEqual`, scrypt N=2^14 r=8 p=1.
- `lib/rate-limit.ts`: per-IP + per-principal two-tier, per-endpoint multi-dimensional token bucket.

**Aegis namespace:**
- `audit-engine.ts`: hash-chain `prevHash = SHA256(prev_hash + seq + actor + action + payload)`, append-only, tamper-evident, auto-kill on 3 consecutive fails, `appendAudit` atomic.
- `audit-worker.ts`, `audit-watchdog.ts` (periodic integrity check), `audit-analytics.ts`, `audit-drift.ts`
- `incident-response.ts` (auto-quarantine on 3 auth fails/scan), `breach-notifier.ts`, `anomaly-detector.ts` (sliding window 1h/24h/7d, >3σ), `ransomware-detector.ts`, `insider-threat.ts`, `compliance-reporter.ts` (SOC2/HIPAA/GDPR PDF), `fairness-corrector.ts`, `evidence-collector.ts`, `cspm.ts`, `supply-chain.ts`, `vendor-assessor.ts`, `vdp.ts`, `siem-forwarder.ts` (Splunk/ELK/Datadog), `blockchain.ts` (545 lines Merkle tree, RLP, EVM tx encoder, JSON-RPC; 0xlocal fallback if not configured).

**Safety:**
- Kill-switch: HTTP 423 Locked on all mutations, persisted in DB (survives restart), auto-engages on audit corruption.

### 3.8 Self-Optimization (Pulse)

- `self-improvement-harness.ts` (470 lines): metric tracking, regression detection, proposal lifecycle, Sentinel gate. Patch application originally `process.env[key]=value` → now whitelisted `ENV_OVERRIDE_ALLOWLIST` (CACHE_TTL, RATE_LIMIT, BODY_BYTES, LLM_TEMPERATURE, ...), `ENV_AUDIT_TRAIL` logs mutations via appendAudit.
- `services/self-opt/**`: `index.ts`, `types.ts`, `tuners.ts`, `telemetry.ts`, `guardrail-guard.ts`, `gap-items.ts`, `controller.ts`, `bootstrap.ts` (safe-exploration tick idempotent dry-run advisory), `adapters.ts`. Control surface = `configureWorker` + `setSchedulingPolicy` + `hotpatchModule` (no kernel edits). Metrics: `self-opt.ts` route.
- `ranking-trainer.ts`: learns from `(state,change,outcome)` feedback.

### 3.9 Performance & Observability (Metron)

- `metrics.ts` + `metrics-validation.ts`: Prometheus `prom-client` 15.1, RED metrics: `http_requests_total`, `http_request_duration_seconds`, `nexus_recall_latency_seconds`, `nexus_recall_result_count`, `nexus_memory_writes_total`, `nexus_audit_chain_verifications_total`, `nexus_skill_compilations_total`, `nexus_agent_spawns_total/terminations_total`, etc typed by labels.
- `tracing.ts` (split into `span-context.ts`, `propagation.ts`, `trace-exporter.ts`): OpenTelemetry-compatible, `span_logs` table, W3C traceparent. `lib/otel.ts` init, `isOtelEnabled`, `shutdownOtel`. Env `NEXUS_OTEL_ENDPOINT`, `NEXUS_OTEL_API_KEY`.
- `trace-exporter.ts`, `span-context.ts`, `overhead-accounting.ts`, `probe-harness.ts`, `health-monitor.ts`, `shadow-daemon.ts` (metrics analytics).

### 3.10 DevEx, Skills, Marketplace, Plugins (Artisan)

- `skill.service.ts`, `skill-compiler.ts` (633 lines neural compile: pattern detection, label normalization, threshold+eval-match, generates reusable scripts in `node:vm` + `checkCapability` deny, sanitized via `sanitizeForComment()` closing RCE), `skill-template-engine.ts` (603 lines), `plugin-manifest.ts`, `marketplace.service.ts` (504 lines publish/resolveDependencyClosure/review/install, integrity crypto-suite + supply-chain scan → quarantine), `session.service.ts` + `session-recorder.ts` (full event stream per session, deterministic replay), `feedback.service.ts`, `project.service.ts`, `workspace-sync.ts` (top 20 memories → `.cursorrules`, `CLAUDE.md`, `AGENTS.md` .bak backup), `sandbox.ts` + `sandbox-worker.ts` (Docker ephemeral containers with timeout auto-removal, plus `vm.Script` isolated in-process fallback blocking `require, process, Buffer, setTimeout, fetch`), `wasm-plugin-runtime.ts` (667 lines: allow-listed host imports, integrity gate, resource-fuse quarantine, fail-closed capability deny, kernel enqueueTask seam; persistence was in-memory Map — P2-02 tracks DB persistence), `packages/sdk` types+client+bindings, `packages/devtools` wrappers.

### 3.11 Enterprise & Mesh (Helix)

- `enterprise.service.ts` (854 lines): OIDC/SAML, RBAC, multi-tenant RLS injection tenantId, billing.
- `p2p-swarm.ts`: libp2p peer discovery, mesh-edge.
- `a2a-server` package: Task lifecycle pending→running→completed→failed, A2AEnvelope/DagEvent/AgentCapability per ADR-0008, signed RPC Ed25519 envelopes with nonce+timestamp replay protection (ADR-0013).

### 3.12 MCP & Connectors (Aeon)

- `mcp.ts` + `mcp-http.ts` + `services/mcp-registry.ts` (938 lines): Streamable HTTP MCP server, 14 tools: `nexus_recall`, `nexus_remember`, `nexus_capture`, `nexus_feedback`, `nexus_audit_verify`, `nexus_agents_list`, `nexus_agents_spawn`, `nexus_browser_navigate/extract/screenshot` (stub removed per 6.2), `nexus_cron_create/list`, `nexus_scheduler_status`, `nexus_kill_switch`. Tool filters env: only PATH/HOME/NODE_ENV/LLM vars, blocks API keys. 4 resource URI patterns: `nexus://memories/{id}`, `?kind=`, `nexus://skills/{id}`, `?category=`.
- `connectors/`: external integrations.
- `packages/sdk/src/acp.ts`, `webhooks.ts`: ACP types, webhook verification.
- `src/lib/mcp.ts`: frontend MCP client.

---

## 4. Frontend — Browser Dashboard (`src/`)

### 4.1 Boot & Routing

- `main.tsx`: `createRoot` → `<StrictMode><ErrorBoundary><QueryClientProvider><RouterProvider router/></></>`. Calls `startRemoteSync()` on mount: opens SSE subscription, hydrates in-memory cache from Hono backend — NO localStorage persistence of business data after Phase 5 fix (TASKBOARD P1-01 was partially fixed; grep indicates localStorage may still exist in store.ts — verify).
- `router.tsx`: `createBrowserRouter` with paths for 21+ pages, each `<ErrorBoundary><Suspense>` lazy.
- `lib/query-client.ts`: tanstack query client.
- `lib/remote.ts`, `store.ts`, `osStore.ts`: zustand/jotai state, observable cache populated via API calls, `hydrateFromApi()`.

### 4.2 Pages (`src/pages/` 21 files)

Dashboard, Memories, MemoryGraph, MemoryHealth, Recall, Skills, PipelineBuilder, Pipelines, Kernel, LiveAgents, Approvals, Graph, Safety, Audit, Projects, Vault, Marketplace, Plugins, Sessions, Settings, Docs, Federated, Improvement, LLMGateway. Plus `admin/` and `os/` subdirs: Analytics, CLI, Dream, Evals, etc (Prism=primary dashboard, Halcyon=OS admin). Each page per TASKBOARD 85% real UI but frontend-only store until API wiring completed.

### 4.3 Components (`src/components/`)

Shell.tsx: uses `useLocation`, `useNavigate`, `<Outlet>`, `aria-current="page"`, skip-to-content link, focus `<main>` on page change, prefers-reduced-motion. DataList.tsx generic CRUD list with search/filter/card grid/modal form — refactors Memories/Skills from 140→60 lines per mission brief. AgentDrawer, AgentNode, Console, EventTicker (scroll animation disabled when reduced motion), FluidBackground (null when reduced motion), HoldToConfirm, KillSwitchBanner, ToastHost, skeletons, error boundaries per page (PageErrorBoundary, SectionErrorBoundary), React.memo on MemoryCard, SkillCard, agent entries, CardMini.

### 4.4 Styles & Build

- `index.css`: Tailwind 4 (`@tailwindcss/vite` 4.3.2) + custom CSS system dark mode gradients micro-animations, `@media (prefers-reduced-motion: reduce)` disables animations.
- `vite.config.ts` previously bundled singlefile; new `vite.config.standalone.ts` normal build with code splitting (react vendor chunk, motion, xyflow, tanstack). `dist/` served by server at `NEXUS_DASHBOARD_DIR`.

---

## 5. Rust Workspace (`crates/`) — Decoupled per ADR-0007

**Workspace members (10):** core, config, installer, safety, cli, provider-types, providers, tools, observability, nexus-search. Plus standalone `nexus-cli` excluded from workspace per root Cargo.toml `exclude = ["nexus-tauri/src-tauri"]` actually tauri excluded, but nexus-cli is member? Root lists 11 in members incl nexus-cli. Conflict: Cargo.toml members includes 11 but README says standalone. Wiring ambiguous.

- `core`: error.rs `AgenticError` enum (thiserror), types.rs shared types, lib.rs.
- `config`: config.rs TOML-first, engine.rs, provider.rs, skill.rs, validated via JsonSchema from Rust types.
- `provider-types`: canonical registry, name_builder, catalog, conversation, model, permission, request_log, retry, thinking, images, formats, mcp_utils, base — extensive Block adaptation from Goose. Uses `once_cell::Lazy` → should be `std::sync::LazyLock` per brief 3.9.
- `providers`: openai.rs 1187 lines (to be split into chat/responses/streaming), anthropic.rs, ollama.rs, openai_compatible, api_client, tokens, declarative, http_status, streaming. Public APIs used `anyhow::Result` → should be `ProviderError` per brief 3.5.
- `tools`: builtin, lifecycle, registry (DashMap), tool.rs async_trait.
- `safety`: pii, injection, jailbreak, profanity, safety_checker — checker `check_content()` was no-op per TASKBOARD, needs real regex PII (email/phone/SSN/CC).
- `installer`: download, extract, installer, self_update, verify, completions — stub per Phase 7 decommission decision (installer, safety, cli, observability to be removed, preserve 5 real ones: core/config/provider-types/providers/tools).
- `cli`: bin clap, stub.
- `observability`: lib.rs tracing wrapper.
- `nexus-search`: minimal stub; full napi-rs bindings pending.
- `nexus-cli`: TUI (ratatui, crossterm), api, completion, marketplace browse/install, agents, webhook verify.

**Critical architectural decision:** Rust crates produce zero runtime value today. TS `services/providers/*` + `unified-gateway/portkey` is single source of truth. CI still runs `cargo build/check/clippy/test` so not rotted. Agent Ferric owns core/config/provider-types/providers; Rusty owns tools/safety/installer/observability/search/cli/nexus-cli.

---

## 6. Tauri Desktop (`nexus-tauri/`)

- `src-tauri/`: Rust host lib.rs, main.rs, build.rs. Thin `invoke` commands.
- `src/`: App.tsx reuses web dashboard.
- No FFI into `crates/` per ADR-0007.
- Owner: Tess.

---

## 7. Packages

- `@agentic-os/sdk` (`packages/sdk/src/` types, index, errors, client, bindings, acp, webhooks): OpenAPI-derived bindings, barrel export, consumed via path alias, not ts-rs.
- `@agentic-os/a2a-server`: A2A package spec ADR-0008, extension seam A2AEnvelope/DagEvent/AgentCapability.
- `@agentic-os/devtools`: scaffold, inspect, replay on session-recorder, dev-only.

---

## 8. Tests & Quality Gate

- `server/tests/` 120+ files incl helpers: unit, service, route, bench-*, e2e/system.e2e.test.ts (Scenarios 4,6,10 were trivial string/boolean asserts → stub to be deleted per 8.11), integration folder, lib/, migration.test.ts, consensus-perf, guards-extended, etc. Uses Vitest 3.2.6, globals, node env, `vitest.config.ts` with coverage provider v8 thresholds should be 60% branches/functions/lines/statements per brief 8.12.
- `tests/` root: additional.
- `src/store.test.ts`, `components/*.test.tsx`: React Testing Library + jsdom.
- Current gate: `cd server && npm run validate` = lint + typecheck `tsc --noEmit --incremental false` =0 + `vitest run` + integration gate + build. Quill owns merge gate, blocks regression.
- Known env issue: `better-sqlite3` Node-ABI mismatch blocks `pnpm run validate` in some shells → not code defect.

---

## 9. Configuration — Env Vars (from `lib/env.ts` + `.env.example`)

~80 vars, categorized:

- Server: PORT 9900, NODE_ENV, NEXUS_DB_POOL_MAX 20, QUERY_TIMEOUT 15000, DASHBOARD_DIR.
- Security: NEXUS_API_KEY auto-gen, ALLOWED_ORIGINS, RATE_LIMIT_PER_MINUTE 120 / SSE 60, MAX_BODY_BYTES 5MB, LOG_LEVEL, TRUST_PROXY, AUTH principal/result TTL/cap, ZERO_TRUST_SECRET, GEOFENCE co/asn lists, TIME_GATE hours/days, HSM backend local/vault/aws-kms/azure-kv.
- DB: DATABASE_URL PG, NEXUS_SQLITE_PATH ./agentic-os.db, BUS_BACKEND memory/redis, REDIS_URL.
- LLM: NEXUS_LLM_BASE_URL optional, API_KEY, MODEL, plus OPENAI/ANTHROPIC/GOOGLE/GROQ/MISTRAL/AZURE/VLLM/M3/PORTKEY keys, PORTKEY_BASE_URL, SIMPLE/MEDIUM/COMPLEX tier models, MAX_CONNS 16, CACHE_MAX 1000 TTL 30s, CB_THRESHOLD 3 RESET 30s.
- Embeddings/Recall: EMBEDDING_MODEL optional, DIM 1536, BATCH 64, RRF_K 60, SEMANTIC_THRESHOLD 0.8, RECENCY_HALFLIFE 30d, RECALL_WEIGHT_RRF 0.5 IMPORTANCE 0.3 RECENCY 0.1 FEEDBACK 0.1, RECALL_BUDGET 8000, MAX_RECALL_CORPUS 10000.
- Worker/Scheduler: WORKER_POLL 2000 MAX_CONCURRENCY 3 TIMEOUT 120s MAINTENANCE 60s STALE 300s HEARTBEAT 120s AUTO_KILL false, AGENT_CONCURRENCY 3, SCHEDULER_TICK 60s MAX_CONCURRENT 10 BACKPRESSURE 1000 POLICY mlfq/edf/fairshare DRY_RUN false MLFQ_BOOST 30s, COMPILATION_THRESHOLD 5 EVAL_MATCH_THRESHOLD 1.
- Sandbox: SANDBOX_ENABLED false IMAGE node:20-alpine TIMEOUT 30s.
- OTEL: ENDPOINT optional, API_KEY.
- Blockchain: ENABLED false RPC_URL PRIVATE_KEY CHAIN_ID 1 ANCHOR_INTERVAL 10 MAX_AGE 300s — note PRIVATE_KEY raw 64-hex detection should warn if ENCRYPTION_KEY empty (Phase 1.2 missing? env schema lacks NEXUS_BLOCKCHAIN_ENCRYPTION_KEY).
- Others: OBSIDIAN_VAULT optional, SELF_OPT_LIVE_WRITE false.

**Gaps from Master Mission Brief Phase 1-10 still open:** TASKBOARD says P0 fixed but P1-P2 still open (Frontend API wiring, CI, Prod Docker, OmniRoute real logic, ErrorBoundaries, any elimination (88 any), distributed locking, blockchain RPC, WASM host funcs, etc). PHases 11-30 Master Plan (71671 lines) defines 400 subphases.

---

## 10. Docs & Governance

- `docs/` ~50 files: ARCHITECTURE.md (needs C4 rewrite per 10.1), DEPLOYMENT.md, SECURITY.md (defense-in-depth, hardening steps, skill-compiler RCE fix), TESTING.md, MCP.md, AGENTIC_OS.md, HERMES.md, A2A_PROTOCOL.md, CONTROL_PLANE_UX_SPEC.md, CONFIG_REFERENCE.md, OBSERVABILITY_GUIDE.md, PRODUCTION_CHECKLIST.md, DR_RUNBOOK.md, ERROR_CODES.md, etc.
- `docs/adr/` 0001-0030 all exist per README index reconciled 2026-07-09: 0001 initial arch, 0002 DB choice dual, 0003 MCP, 0004 A2A v2 envelope, 0005 ring kernel, 0006 sandbox, 0007 Rust/TS boundary FINAL, 0008 A2A packaging, 0009 MLFQ scheduler, 0010 FROZEN sign-off, 0011 phantom gate discipline, 0012 federated recall, 0013 signed RPC, 0014 self-improvement harness, 0015 pipeline builder, 0016 voice UI (design ratified impl pending), 0017 plugin marketplace, 0018 multi-provider gateway v2, 0019 WASM runtime, 0020 chaos eng, 0021 tauri shell, 0022 skill-compiler capability model, 0023 audit hash-chain, 0024 multi-tenant RLS, 0025 observability OTel, 0026 SDK design, 0027 CI/CD, 0028 devtools, 0029 benchmarking harness, 0030 future roadmap.
- `AGENTS.md` fleet of 20 agents (Forge, Atlas, Mnemosyne, Lethe, Cerebrum, Sentinel, Aegis, Pulse, Metron, Artisan, Helix, Prism, Halcyon, Ferric, Rusty, Tess, Aeon, Lorekeeper, Quill, Bastion) each exclusive file namespace + frozen common infra Leader-owned. Nonstop loop protocol Pull→Implement→Local gate (tsc 0 + vitest) → PR → Merge gate (Quill). Perfection Bar: tsc 0, tests pass, c.json(ok/err) correct arity, no stubs/TODOs, coverage ≥80% for new agents.
- `CLAUDE.md`, `MASTER_MISSION_BRIEF.md` (security first, arch, code quality, DB, frontend, backend services, Rust decommission, tests, devops, docs — with final verification bash script), `PHASES_11_30_MASTER_PLAN.md` + GAP_UPDATE, `REDEMPTION_PLAN.md`, `TASKBOARD.md` brutal audit, `PLAN_TRACKER.md`.

---

## 11. Security Posture

**Strong:**
- Scoped API keys (9+ scopes now rozszerzone), scrypt + timingSafeEqual, rate limiting per-ip + per-principal, payload streaming limit, CORS strict in prod (rejects localhost), audit hash-chained SHA-256 append-only with triggers, kill-switch persisted + auto on audit corruption, CSP nonce, secrets leak scan (`docs/omniroute/security/` deleted per Sentinel verdict REMOVE — 13 third-party sec-circumvention files), bloom of hardening files (zero-trust, geo-fence, mfa, jit-elevation, hsm, dlp, secrets-scanner, time-gate, env-sanitizer).

**Concerns / Open:**
- `NEXUS_BLOCKCHAIN_ENCRYPTION_KEY` not in env schema yet (brief 1.2) → raw private key warning missing.
- MCP subprocess env filter (brief 1.3) should block API keys/DATABASE_URL — current code still spreads `process.env`?
- `NEXUS_API_KEY` in `.env.example` placeholder `nk_live_change_me_in_prod` but compose still uses `${POSTGRES_PASSWORD:?error}` pattern — need verify no hardcoded `nexus_password`.
- `any` types: `db/client.ts` `_sqlite: any, _pgClient: any`, `audit.ts` `Tx = any`, `security.ts` `db: any` params, `setup.ts` `let db: any` — 20 file-level `eslint-disable @typescript-eslint/no-explicit-any` to remove.
- `process.env[patch.key] = ...` self-opt path still exists unless allowlist enforced.
- Frontend localStorage lingering per TASKBOARD P1-01.
- Distributed locking missing for multi-instance scheduler.
- WASM plugin runtime persistence in-memory Map → restart loses data.

---

## 12. Strengths

- **Kernel real:** ring model with escalation guard, cgroup inheritance, token budget auto-pause, message bus (memory/redis), SSE bridge, hot-patch seam for live auto-tuner.
- **Scheduler:** MLFQ Q0-Q4 + aging, EDF, FairShare swappable via setter without touching loop code — Pulse control surface well designed.
- **Recall:** legitimate RRF fusion, importance decay, feedback bonus, token ledger, embeddings batch with dimension validation, pgvector HNSW + FTS5 fallback.
- **MCP:** 14 tools, 4 resources, Zod validation, scoped, constant-time auth, kill-switch aware.
- **Audit:** hash chain with verification, watchdog, SIEM forwarder, compliance reporter, anomaly detection.
- **Sandbox:** dual Docker+vm.Script with isolation (blocks require/process/Buffer/setTimeout/fetch).
- **Observability:** OTel W3C traceparent prop, Prometheus metrics, overhead accounting.
- **ADRs:** 30 ratified, reconciliation rule, frozen core sign-off protocol, phantom gate discipline — mature governance vs typical projects.
- **Tests:** 120+ server tests, bench suites, e2e, helpers, coverage thresholds.

---

## 13. Weaknesses / Risks

1. **Rust orphan:** 15k lines zero runtime impact — confusing for contributors. Decommission decision not fully executed (installer/safety/cli/observability still present). Cargo workspace includes them; `once_cell` still used.
2. **Frontend-backend gap:** Dashboard uses in-memory store + SSE remote sync, but some pages still rely on localStorage/ `engine.ts` per TASKBOARD. P1-01 not fully closed.
3. **Large files:** `agent-runtime.ts` 1063, `federated-recall.ts` 1366, `kernel.ts` 1456, `scheduler.ts` 1698 — need splits per brief 2.5/3.6 (action-registry, agent-loop, persistence extracted but file still large).
4. **`any` debt:** 88 `any` warnings, file-level disables, `Tx=any` — breaks strict TS goal.
5. **Over-marketing vs reality:** names like Shadow Daemon (error counter), Neural Skill Compilation (template interpolation), Federated Recall (localhost only), WASM Runtime (registry no execution), 160+ Provider Routing stub — honesty improved but still tracked in TASKBOARD P1-10.
6. **DB migration duality:** Drizzle push + raw SQL triggers + README NOTES_FALLBACK duplication — `client.ts` FTS5 only for memories not skills/notes.
7. **Blockchain:** impressive Merkle/RLP/EVM encoder but falls back to `0xlocal_` unless RPC configured — risk of false security claim.
8. **Scale:** single-instance scheduler lacks advisory locks; bus backend memory default → no horizontal scale unless Redis.
9. **Phases 11-20 IN_PROGRESS under compile gate =0 per PLAN_TRACKER 2026-07-09, but frontend↔backend wiring still pending (Prism/Halcyon owners). Phase 11 Sentinel audit, Phase 18 self-opt dry-run only, Phase 19 WASM real host funcs missing, Phase 16 voice UI not implemented.

---

## 14. Recommendations (Priority Ordered)

**Immediate (Security/Compile):**
- Add `NEXUS_BLOCKCHAIN_ENCRYPTION_KEY` to env schema + warning on raw 64-hex private key (MMB 1.2).
- Enforce MCP env filter (PATH/HOME/NODE_ENV/LLM only) block API keys (1.3).
- CSP nonce verification 0 unsafe-inline/eval (1.4).
- Append-only audit triggers migration exists? verify `pg_trigger` shows both UPDATE/DELETE prevention (1.5).
- Fix ALL_SCOPES with `as const satisfies Scope[]` (1.6).
- Kill-switch `SELECT ... FOR UPDATE` + double assertOperational (1.7).
- Per-principal rate limiting second tier (1.8).
- Streaming body size enforcement cancel stream on violation (1.9).
- Eliminate all `: any` — type client with `BetterSQLite3Database<typeof sqliteSchema> | PostgresJsDatabase<typeof pgSchema>` and proper Tx union (3.1).
- `formatError` util for catch blocks (3.2), missing await fix (3.3).
- Rust: replace anyhow::Result with ProviderError, split openai.rs, implement safety checker regex PII, replace once_cell with LazyLock (3.5-3.9).

**Architecture:**
- Split `services.ts` legacy 505 lines into per-domain modules and delete barrel — verify `grep from './services.js'` 0 (2.1).
- Move all `db.query.*` from routes.ts into services (getSystemCounts etc) (2.2).
- Delete dead protocol-integration.ts, commented imports, fix guardrails blocked/warned 0 counters (2.3).
- Wire MessageBus into kernel + create sse-bridge → replace direct SSE broadcasts (2.4).
- Split large files per 2.5.
- Introduce DI container `lib/container.ts` replace `let _instance` singletons (6.1).
- Remove stub browser MCP tools (6.2).
- LISTEN/NOTIFY task-notifier + trigger migration (6.3).
- Proper Saga orchestrator reverse topo compensation (6.4).
- Add 6 Prometheus business metrics + wire (6.5).

**Frontend:**
- Gate vite-plugin-singlefile into standalone config, ensure 5+ chunks (5.1).
- api-client.ts + store-cache.ts + hydrateFromApi() + no localStorage grep 0 (5.2).
- React Router lazy routes + ErrorBoundary + Suspense + Shell useLocation/useNavigate/Outlet + aria-current + skip link (5.3-5.8).
- React.memo card components, selector hooks useSyncExternalStore, DataList generic.

**Rust:**
- Decommission stub crates (installer/safety/cli/observability) per 7.1, remove orphan deps, create README, add TS TS derive if needed, update docs (7.2-7.5).

**Testing:**
- Write kernel (40+ cases), llm-gateway-v2 (20+), agent-runtime (20+), recall (12+), embeddings (10+), brain (10+), scheduler (20+), sse-bus (6+), lib errors/auth/envelope/security-headers, routes agents/automation/sse/v3-upgrade/agent-lifecycle, fix e2e stubs, enable coverage thresholds 60%, migration.test, test:rust script (Phase 8).

**DevOps:**
- Fix lockfile guards `test -f package-lock.json` else fail (9.1), HTTPS nginx 443 + redirect (9.2), docker-build-push GHCR + integration-tests pgvector service job + security-scan codeql (9.3/9.4/9.12), husky pre-push validate (9.5), remove hardcoded secrets `${POSTGRES_PASSWORD:?error}` (9.6), deploy workflow on v* tag (9.7), prod compose TLS/logging/rotation/resource/health/restart (9.8), format/clean scripts (9.9/9.10), .gitignore remove Dockerfile.frontend (9.11), monitoring stack prometheus+grafana+loki + 12 panel dashboard (9.13), dependabot groups (9.14).

**Docs:**
- Rewrite ARCHITECTURE.md C4 model 19 pages 15 components 51 services etc (10.1), rewrite TESTING.md real Vitest (10.2), creation ADR 0002-0007 etc already done but verify, PRODUCTION_CHECKLIST, OBSERVABILITY_GUIDE etc (10.3/10.4), fix V4 refs, honest maturity badges (10.5).

---

## 15. Roadmap Context

From `PHASES_11_30_MASTER_PLAN.md`:

- Phase 11: Agent Runtime Execution Engine & Kernel Syscall System (MLFQ, rings, cgroups, ACL, gang scheduling) — mostly done, worklist PHASE11_WORKLIST.md.
- Phase 12: MCP Registry, OAuth & Subprocess Transport.
- Phase 13: A2A Inter-Agent Protocol.
- Phase 14: Security Hardening & Compliance (SIEM, anomaly, incident response, HSM, zero-trust, session replay, DLP, secrets scan, time-gate, geo-fence, MFA, JIT).
- Phase 15: Cross-platform Desktop Actuator + Performance (perf pools, replica router, cache).
- Phase 16: Multi-stage Docker, Orchestration & Hardening + Voice UI partial.
- Phase 17: Observability, OTel, Prometheus.
- Phase 18: Frontend React Control Plane + Pipeline Builder + Terminal + Self-Opt (Pulse) dry-run→live.
- Phase 19: Ecosystem & Marketplace + WASM Runtime + Self-healing.
- Phase 20: Full E2E Integration + Chaos Engineering.
- Phases 21-30 post-20 roadmap (Voice impl, edge runtime, federated learning, ACTIVE self-opt, marketplace GA) per ADR-0030.

Current state per PLAN_TRACKER 2026-07-09: settled `tsc --noEmit --incremental false` =0 (GO protocol), phantom reads during parallel editing (ADR-0011). Full `pnpm run validate` blocked by better-sqlite3 ABI mismatch; backend real, frontend wiring continues.

---

## 16. File Map Quick Reference

```
/
├─ src/ (dashboard)
│  ├─ main.tsx → starts remote sync + RouterProvider
│  ├─ router.tsx → 21+ lazy routes
│  ├─ pages/*.tsx Dashboard, Memories, Skills, Kernel, etc
│  ├─ pages/os/, admin/
│  ├─ components/Shell.tsx (nav, skip link, focus main)
│  ├─ components/DataList.tsx (generic CRUD)
│  ├─ store.ts, osStore.ts, skill-registry.ts, lib/*
│  └─ services/ frontend service stubs
├─ server/
│  ├─ src/index.ts bootstrap + worker + watchdog
│  ├─ src/app.ts perimeter guard
│  ├─ src/routes.ts + routes/*.ts 24 modules
│  ├─ src/db/schema.ts (~60 tables) + client-*.ts
│  ├─ src/lib/* env, auth, envelope, errors, security, audit, etc
│  ├─ src/services/* 169 files kernel, scheduler, recall, llm, bus, etc
│  ├─ src/mcp.ts + mcp-http.ts
│  └─ tests/ 120+ vitest
├─ packages/
│  ├─ sdk (client, types, acp, webhooks)
│  ├─ a2a-server (A2AEnvelope)
│  └─ devtools
├─ crates/ 11 crates core/config/... (decoupled)
├─ nexus-tauri/ Tauri shell
├─ docs/ 50 + adr/ 30 ADRs
├─ .github/workflows/ ci, deploy, validate
├─ docker-compose.yml + prod/monitoring/dev/nginx
├─ vite.config.ts + standalone.ts
├─ package.json root pnpm workspace
└─ Cargo.toml rust workspace
```

---

## 17. Conclusion

Agentic OS V3 is **not a toy scaffold**: kernel, scheduler, recall RRF, audit hash-chain, sandbox dual-mode, marketplace, A2A signed RPC, MCP server — all real production-grade modules with tests and Prometheus metrics. The Rust side is intentionally decoupled but confusingly still present. Biggest gap is **frontend-backend contract** (localStorage ghost) and `any` debt + some stubbed vision pieces marketed as finished (federation, WASM, 160 providers). Security posture is strong with defense-in-depth but has open TODOs (env filter, encryption key warning, any). With MMB Phase 1-10 fixes + Fleet of 20 namespace ownership + compile gate 0 protocol, project can reach Zero-Compromise production-ready if P1-P2 backlog is closed.

---

## Appendix: Key Metrics

- TS backend services: 169 files, ~40k LOC, largest scheduler 1698 lines.
- DB tables: ~60 PG Drizzle, indexes HNSW + composite + GIN.
- Routes: 24 sub-routers + root, 60+ endpoints including MCP/SSE/R1.
- Tests: 120+ server test files, bench suites, e2e.
- Rust crates: 11 members, ~15k lines, 0 runtime callers in TS.
- Frontend pages: 21 + os/ + admin/, components ~20, custom CSS dark theme.
- Env vars: ~80 validated via Zod.
- ADRs: 30 ratified.
- Agents: 20 exclusive namespaces, FROZEN core, Perfection Bar.

End of analysis.
