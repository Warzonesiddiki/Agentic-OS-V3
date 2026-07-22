# NEXUS 2.0 / Agentic OS V3 Architecture

> C4 Model: Context → Container → Component → Code. Last reconciled 2026-07-22. Version 3.0.

## C1: Context

NEXUS 2.0 is the **memory, recall, skills, governance, and coordination layer** between AI agents (Claude Code, Codex, Cursor, Gemini CLI, custom) and work.

- **Agents** call REST `/api/v1`, MCP `/api/mcp`, SSE `/api/v1/events`, or CLI `nexus`.
- **Humans** use browser dashboard (React + Vite) or Tauri desktop shell.
- **External systems**: PostgreSQL 17 + pgvector 0.8 (60+ tables), Redis (optional pub/sub), OTLP collector, Ethereum RPC (optional anchoring), Obsidian vault.

## C2: Container

```
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend: React 18 + Vite 5 (src/)                                  │
│ - 21 pages: Dashboard, Memories, MemoryGraph, MemoryHealth, Recall, │
│   Skills, PipelineBuilder, Pipelines, Kernel, LiveAgents, Approvals,│
│   Graph, Safety, Audit, Projects, Vault, Marketplace, Plugins,      │
│   Sessions, Settings, Docs, Federated, Improvement, LLMGateway      │
│ - OS pages (src/pages/os): Analytics, Approvals, Cli, Dream, Evals, │
│   Graph, Kernel, LiveAgents, Reliability, SelfOpt                   │
│ - Admin pages (src/pages/admin): compliance, billing, etc           │
│ - Components: Shell (nav, skip-link, focus main), DataList (generic │
│   CRUD), AgentDrawer, AgentNode, Console, EventTicker, Fluid* etc   │
│ - State: zustand/jotai + tanstack query, osStore, store.ts          │
│ - Build: vite.config.ts (code-splitting manualChunks vendor-react/  │
│   motion/xyflow/tanstack → 51 chunks), vite.config.standalone.ts    │
└────────────────────┬────────────────────────────────────────────────┘
                     │ REST + SSE + MCP (typed fetch via api-client.ts)
┌────────────────────▼────────────────────────────────────────────────┐
│ Backend: Hono 4 + Node 20 (server/src, port 9900)                   │
│ - Perimeter: requestId → W3C traceparent parse/generate + Prometheus│
│   metrics → cors → securityHeaders (CSP nonce, no unsafe-inline) →  │
│   payloadLimit (streaming) → rateLimit (per-IP + per-principal) →  │
│   authBackstop (scrypt + timingSafeEqual) → api router → API 404    │
│   guard (JSON never SPA) → global error boundary → dashboard static │
│ - Routes: 24 sub-routers (see C3)                                   │
│ - Services: 169 files ~40k LOC, kernel, scheduler, recall, LLM      │
│ - DB: Drizzle dual Postgres/SQLite, FTS5 for memories/skills/notes  │
│ - Worker: task-worker system-worker + audit-watchdog + self-opt tick│
│ - Bus: message-bus (memory/redis) + sse-bus + sse-bridge            │
└────────────────────┬────────────────────────────────────────────────┘
                     │ Drizzle ORM
┌────────────────────▼────────────────────────────────────────────────┐
│ Storage: PostgreSQL 17 + pgvector HNSW (vector_cosine_ops m=16 ef=64)│
│ - 60+ tables: memories, memory_clusters, session_links, causal_edges│
│   contradictions, emotions, tag_taxonomy, templates, diff_markers,  │
│   rehearsal_log, attachments, archive, quotas, projects, skills,    │
│   notes, token_ledger, feedback, system_meta, api_keys, agents,     │
│   agent_tasks, ring_policies, state_snapshots, sandbox_executions,  │
│   trajectory_logs, tool_receipts, cron_jobs, pipeline_runs, span_   │
│   logs, metric_snapshots, improvement_proposals, plugins, federated │
│   proofs, llm_provider_health, marketplace, orgs/workspaces, etc    │
│ - Indexes: composite (status,priority,queue) partial where queued,  │
│   cron WHERE enabled, pipeline_runs(pipeline_id,status), span_logs │
│   (trace_id,parent_id), memories(kind,importance), GIN on tags,    │
│   manifest jsonb, audit payload jsonb, HNSW on embeddings           │
│ - Migrations: 0003_task_notify.sql (LISTEN/NOTIFY), 0047_audit_     │
│   log_append_only.sql (prevent UPDATE/DELETE), 0048 HNSW, R1 etc    │
└─────────────────────────────────────────────────────────────────────┘
```

Additional containers: `packages/sdk` (client, acp, webhooks), `packages/a2a-server` (A2AEnvelope), `packages/devtools`, `crates/` (7 preserved: core, config, provider-types, providers, tools, nexus-search, nexus-cli – decoupled per ADR-0007), `nexus-tauri/` (thin Tauri host).

## C3: Component

### 8 Middleware Layers (app.ts order matters)

1. `requestId` – traceId `req_xxx`
2. OTEL W3C traceparent + Prometheus http metrics
3. `cors` – rejects localhost in production
4. `securityHeaders` – CSP nonce `script-src 'self' 'nonce-...'`, HSTS, Permissions-Policy
5. `payloadLimit` – streaming body reader, cancel on >limit, 413
6. `rateLimit` – per-IP + per-principal 5x multiplier, SSE vs REST independent buckets, OOM-safe eviction
7. `authBackstop` – constant-time auth, scoped API keys (9+ scopes, wildcard `admin.*`)
8. API router + 404 guard + error boundary + dashboard static

### 24 Route Modules + Root (routes.ts)

Root `routes.ts` now thin: delegates to `system.service.ts` (no direct `db.`). Mounts:

- `agents.ts` – spawn/list/get/update/pause/resume/terminate/quarantine, enqueue/pick/complete/fail tasks, schedulerStatus
- `agent-lifecycle.ts` – signal hooks, hin
- `automation.ts` – approvals, workspace-sync
- `sse.ts` – SSE client add/remove, broadcast
- `v3-upgrade.ts` – manifest validation
- `kernel.ts` – worker health, enqueue
- `a2a.ts` – A2A bridge, runAgent
- `audit-routes.ts` – verifyAndAutoKill, trajectory/receipt, anchor
- `analytics.ts` – metrics, overhead, health
- `marketplace-routes.ts` – marketplaceService publish/resolve/review/install
- `enterprise.ts` – orgs/workspaces/users/keys/roles/siem/tenant/invoices
- `kernel-introspect.ts` – introspection state
- `memory-graph.ts`, `memory-health.ts`, `memory-nl-query.ts`, `memory-batch.ts`, `memory-search-suggest.ts`, `memory-dedup.ts`, `memory-contradiction.ts`
- `self-opt.ts` – Controller, tuners, telemetry, adapters
- `perf.ts` – stateless pool, replica router, cache
- `r1.ts` – governed R1 project/task API
- Root also: health, metrics, system, memories CRUD, recall, skills CRUD, checkpoint, sessions/capture, projects, brain export/import/compress/embeddings rebuild, vault notes/sync/write-back, ledger, safety kill-switch/heartbeat, feedback, health/detailed, compiled-scripts

### 51 Services (sample 15 core)

- **Kernel** (`kernel.ts` 1456 lines): ring 0-4, cgroup inheritance, token budget auto-pause, `spawnAgent` with privilege escalation guard `callerRing >= requestedRing`, `quarantineAgent` → ring 4, `hotpatchModule` seam for Pulse, message-bus publish `agent.spawned`, SSE `publishKernelEvent`. Companion: `kernel-bootstrap`, `persistence`, `schema`, `panic`, `introspect`, `hotpatch`, `ring-audit` (`RingPolicyStore`, `RingOscillationDetector` – no `RingKernel` class), `resource-quota`, `preemption-leak-guard`, `signal-hooks`.
- **Scheduler** (`scheduler.ts` 1698): MLFQ Q0-Q4 timeslice/boost/starvation-promotion, EDF, FairShare swappable via `setSchedulingPolicy` (Pulse control surface). CronParser, scheduleJob, tick, runWithRetry.
- **Runtime Loop** (`task-worker.ts` 804): poll-and-wake via `task-notifier.ts` LISTEN/NOTIFY + 30s fallback, admission gate through kernel, wave executor `pipeline-executor.ts`.
- **Bus**: `message-bus.ts` (now DI container, not `let _instance`), `sse-bus.ts`, `sse-bridge.ts`, `sse.ts`
- **Recall** (`recall.ts` 498): BM25 lexical (SQLite FTS5) + pgvector cosine → RRF k=60 → importance 0.3 + recency half-life 30d 0.1 + feedback 0.1 → budget pack greedy. Federated-recall (1366) layers across tenant scopes with privacy budget, proof protocol (local only federation).
- **Embeddings** (233): OpenAI-compatible batch 64, dimension 1536 validation.
- **LLM Gateway** (`llm-gateway-v2.ts` 685 ProviderAdapter, `llm-router.ts`, `llm-scheduler.ts` 793, `omniroute.ts`, `portkey-bridge.ts` single traced seam, `vlm.ts`, `brain.ts` 604 secrets-safe export/import)
- **Security** (Sentinel/Aegis): `guardrails` + types/patterns/registry, `safety.service` (kill-switch `FOR UPDATE`), `crypto-suite`, `dlp-scanner`, `secrets-scanner`, `vault`, `rate-limit.service`, `security-posture`, lib `security-headers` nonce, `zero-trust` JWT, `mfa` TOTP, `geo-fence` MaxMind, `jit-elevation`, `hsm-provider`, `env-sanitizer`, `rate-limit`, scrypt N=2^14 r=8 p=1, constant-time.
- **Audit** (`audit-engine.ts`): SHA-256 chain `prevHash|seq|actor|action|payload`, append-only triggers, tamper-evident, auto-kill on 3 fails, `audit-watchdog`, `siem-forwarder`, `anomaly-detector` sliding 1h/24h/7d 3σ, `incident-response` auto-quarantine, `compliance-reporter`.
- **Self-Opt** (Pulse): `self-improvement-harness.ts` (470) allowlist `ENV_OVERRIDE_ALLOWLIST` (CACHE_TTL, RATE_LIMIT, BODY_BYTES, LLM_TEMPERATURE etc) + `ENV_AUDIT_TRAIL`, `self-opt/**` controller/tuners/telemetry/guardrail-guard/gap-items/bootstrap/adapters, control surface = `configureWorker`/`setSchedulingPolicy`/`hotpatchModule`.
- **Metrics** (Metron): `metrics.ts` prom-client, RED, `nexus_recall_latency_seconds`, `memory_writes_total`, etc, `tracing.ts` split into `span-context`, `propagation`, `trace-exporter`, OTEL init.
- **DevEx** (Artisan): `skill.service`, `skill-compiler` neural compile threshold+eval-match + `sanitizeForComment()` RCE fix, `skill-template-engine`, `marketplace.service`, `session-recorder`, `workspace-sync`, `sandbox` Docker+vm.Script isolated (blocks require/process/Buffer/fetch), `wasm-plugin-runtime` allow-listed host imports + integrity gate + resource-fuse quarantine.

### Recall Pipeline Diagram

```
Query → [BM25 FTS5 lexical] ↘
                              → RRF Fusion k=60 → Importance (0.3) → Recency (half-life 30d 0.1) → Feedback bonus (0-0.15) → Budget Pack Greedy → Result {items, tokens, trace}
       → [pgvector HNSW cosine (if embedding provider)] ↗
Fallback: lexical only if no embed provider. Corpus limit 10000, budget 8000 default.
```

### Ring Kernel Flow

```
Caller ring validated → inherit cgroup from parent if no override → DB insert agents → metrics inc → appendAudit agent.spawned → messageBus.publish → SSE publishKernelEvent
Pause/resume/terminate/quarantine transitions: idle/thinking/executing_tool → paused → idle → terminated/quarantined (ring=4)
Token usage inc: tokensUsed += N, if >= budget and not paused/terminated/quarantined → auto-pause + audit budget_exceeded
Task: enqueue → notifyTaskQueued (LISTEN/NOTIFY) → pickNextTask via scheduler policy MLFQ/EDF/FairShare → complete/fail with retry + dead-letter → compensation reverse topo
ACL: checkACL(ring, tool) → authorizeToolCall → 0-4 privilege
```

### Hash-Chained Audit Flow

```
entry_hash = SHA256(prev_hash + "|" + sequence + "|" + action + "|" + actor + "|" + createdAtMs + "|" + stableStringify(payload))
Genesis = 0*64
DB trigger prevent_audit_log_mutation() RAISE on UPDATE/DELETE
Verification walks chain, reports valid/brokenAt. Watchdog periodic + SIEM forwarder. Auto-kill on 3 consecutive fails.
Merkle root every 1000 entries anchored to Ethereum RPC if enabled, else 0xlocal fallback.
```

### MCP and A2A Integration

- **MCP server** (`mcp.ts`, `mcp-http.ts`, `mcp-registry.ts` 938 lines): Streamable HTTP `/api/mcp`, 14 tools (recall, remember, capture, feedback, audit_verify, agents_list, agents_spawn, cron_create/list, scheduler_status, kill_switch, stats, delegate, ambient_ingest, acl_check) – browser tools deleted per 6.2. 4 resources `nexus://memories/{id}`, `?kind=`, `skills/{id}`, `?category=`. Tools filtered env allowlist ONLY PATH/HOME/NODE_ENV/NEXUS_LLM_PROVIDER/NEXUS_LLM_API_KEY, explicit blocklist. JSON-RPC 2.0 boundary parser with Content-Length + newline framing, 10MB buffer limit.
- **A2A**: `packages/a2a-server` – Task lifecycle pending→running→completed→failed, `A2AEnvelope`/`DagEvent`/`AgentCapability` (ADR-0008), signed RPC Ed25519 with nonce+timestamp replay protection (ADR-0013), mesh-edge rejects unsigned, mounted at `/api/v1/a2a`.

## C4: Code

- **Frontend pages (21)**: Dashboard, Memories, Recall, Skills, PipelineBuilder, Pipelines, Kernel, LiveAgents, Approvals, Graph, Safety, Audit, Projects, Vault, Marketplace, Plugins, Sessions, Settings, Docs, Federated, Improvement, LLMGateway – plus os/ and admin/ subdirs.
- **Components (15)**: Shell, DataList (generic CRUD), AgentDrawer, AgentNode, Console, EventTicker, FluidBackground (null when prefers-reduced-motion), FluidPanel, HoldToConfirm, KillSwitchBanner, ToastHost, PageErrorBoundary, SectionErrorBoundary, SkeletonLoader, RefetchIndicator – React.memo on cards, selector hooks via useSyncExternalStore.
- **Middleware (8)**: listed in C2 container.
- **Self-contained verification**: `server/src/index.ts` lazy imports, env validation via Zod + `checkBlockchainKeySecurity()`, DB reachable gate, operator key auto-gen once, boot audit, worker + watchdog start, PID-qualified port file, graceful shutdown 10s drain, close DB, flush OTEL.

## Cross-Language Boundary

Per ADR-0007 FINAL: Rust `crates/` and TS app are **two complete separate systems with no runtime connection** – no FFI, napi-rs, IPC, HTTP bridge. TS provider-adapter gateway (`services/providers/*` + `unified-gateway/portkey`) is single source of truth. Rust providers dormant. CI still validates `cargo check/clippy/test`. Workspace members: core, config, provider-types, providers, tools, nexus-search, nexus-cli (installer/safety/cli/observability decommissioned 2026-07-22). `once_cell::Lazy` → `std::sync::LazyLock`, `anyhow::Result` → `Result<T, ProviderError>`.

## Deployment

- `docker-compose.yml` (postgres pgvector, redis, server, frontend) now uses `${POSTGRES_PASSWORD:?error}` (no hardcoded), lockfile guard `test -f package-lock.json || exit 1; npm ci`, server Dockerfile non-root `node`, healthchecks, resource limits.
- `docker-compose.prod.yml` TLS certs, json-file logging rotation, proxy nginx with 443 ssl.
- `docker-compose.monitoring.yml` Prometheus + Grafana + Loki.
- Nginx: 80→301 HTTPS redirect + 443 ssl http2 with `/etc/nginx/certs/tls.crt/.key`, protocols TLSv1.2/1.3.
- CI: `pnpm -r lint/typecheck/test/build`, server validate, rust check/clippy/test, integration-tests (pgvector service), security-scan (CodeQL), docker-build-push (GHCR sha+latest), CODEOWNERS coverage.
- Husky: pre-commit `npx lint-staged`, pre-push `pnpm run validate`, lintstagedrc `eslint --fix --max-warnings 0`.

## ADRs

0001 initial arch, 0002 DB dual Postgres/SQLite ~60 tables, 0003 MCP 14 tools/4 resources, 0004 A2A v2 envelope, 0005 ring kernel 0-4 RingPolicyStore, 0006 sandbox Docker+WASM, 0007 Rust/TS boundary FINAL, 0008 A2A packaging, 0009 MLFQ scheduler, 0010 FROZEN sign-off, 0011 phantom gate discipline, 0012 federated recall, 0013 signed RPC, 0014 self-improvement harness, 0015 pipeline builder, 0016 voice UI (design ratified), 0017 marketplace, 0018 gateway v2, 0019 WASM runtime, 0020 chaos engineering, 0021 Tauri shell, 0022 skill-compiler capability model, 0023 audit hash-chain, 0024 multi-tenant RLS, 0025 OTel, 0026 SDK, 0027 CI/CD, 0028 devtools, 0029 benchmarking, 0030 future roadmap.

## Verification

- `tsc --noEmit --incremental false` = 0 (settled gate, phantom reads ignored per ADR-0011)
- `grep db. routes.ts` = 0 (moved to system.service.ts)
- `grep process.env mcp-registry.ts` = 1 (filter fn only)
- `grep process.env[ self-improvement-harness` filtered = 0 (allowlist guarded)
- `grep unsafe-inline` security-headers = 0 (nonce based)
- `grep localStorage store.ts store-cache.ts api-client.ts` = 0
- FTS5 for memories/skills/notes in SQLite (client.ts)
- HNSW indexes 3, CHECK 38, FK 6
- Vite build 51 chunks
- Docker secrets via :?error (4), no nexus_password
- `let _instance` in services = 0 (DI container)
- `anyhow::Result` in providers/src = 0, `once_cell` = 0
- Rust crates decommissioned: installer/cli/safety/observability deleted
- Compile gate green per PLAN_TRACKER 2026-07-09.
