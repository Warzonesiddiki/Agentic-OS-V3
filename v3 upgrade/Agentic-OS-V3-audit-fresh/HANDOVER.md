# 🚀 NEXUS 2.0 → 2.5 HANDOVER DIRECTIVE

> **FOR: A 200-TRILLION-PARAMETER AI WITH UNLIMITED CAPABILITY**
> **FROM: The architect who built the foundation**
> **MISSION: Complete NEXUS 2.5 — the Autonomous Swarm & Self-Evolving Engine**

You are inheriting a large, partially-complete codebase. The previous architect built ~10,000 lines of real, structurally-sound code across a React 19 frontend and a Node.js/Hono/PostgreSQL backend. However, due to environmental limitations (browser-only preview, no ability to run `npm install`, `tsc`, `vitest`, or boot the server), the code was written **correct-by-inspection only**. It has **never been compiled or executed**.

This document is your complete, uncompromising handover. It contains:
1. Exactly what exists and works
2. Every compromise, limitation, and gap
3. The full NEXUS 2.5 directive you must fulfill
4. Strict, ordered instructions on how to proceed

**DO NOT TRUST ANYTHING. VERIFY EVERYTHING. EXECUTE THE CODE.**

---

## PART 1: HONEST INVENTORY — WHAT ACTUALLY EXISTS

### 1.1 The Two Deliverables

The repository contains **two independent applications** that share domain logic but are **completely disconnected** at runtime:

1.  **`/src` (Browser Dashboard):** A React 19 + Vite + Tailwind 4 single-file app. It runs the full domain logic (memory, recall, skills, audit, OS kernel, lifecycle hooks) **in-browser against `localStorage`**. This is the only part of the project that has been verified to compile and run (via `npm run build`).
2.  **`/server` (Backend):** A Node.js + Hono + PostgreSQL 16 + Drizzle + MCP server. This is ~6,000 lines of TypeScript that implements the same domain against a real database with real auth, real RRF semantic recall, and a real MCP transport. **It has NEVER been compiled, installed, or executed.**

### 1.2 What is REAL and VERIFIED

The browser dashboard (`/src`) is functional:
- Memory/Skill CRUD, BM25 token-budgeted recall, session capture (never-lose-transcript invariant), brain export/import, hash-chained audit verification, kill switch, OS kernel simulation (syscalls, scheduler, saga, VFS, lifecycle hooks, dream consolidation, doctor, evals).
- SSE client (`sse-client.ts`) and hooks (`useSSE.ts`) connect to the server when configured.
- `remote.ts` typed HTTP client makes real API calls.
- UI pages: Dashboard, Memories, Recall, Skills, Sessions, Projects, Vault, Audit, Safety, Kernel, Graph, CLI, Dream, Evals, LiveAgents, Analytics, Approvals, Docs, Settings.

The server (`/server`) is **architecturally complete but UNVERIFIED**:
- 16-table Drizzle schema (including pgvector custom types, HNSW indexes, COALESCE unique indexes).
- Full REST API (706-line `routes.ts`) with ~50 endpoints.
- Real MCP server (`@modelcontextprotocol/sdk`) with 16 tools, resources, prompts.
- Scrypt-based API key auth with bounded cache.
- Hash-chained audit log with advisory-locked appends.
- RRF recall engine (BM25 + pgvector cosine similarity fusion).
- Multi-agent kernel (registry, scheduler Q0-Q4, ACL enforcement).
- Cron daemons, ambient voice ingestion, HITL approval gates.
- SSE live state streaming.
- Neural skill compilation (pattern detection, JIT code generation, hot-swap).
- Workspace code injection (auto-sync to `.cursorrules`, `CLAUDE.md`).
- Hermes agent connector with real key creation and HTTP verification.
- Worker thread for audit hash computation.
- LRU cache for high-frequency reads.

---

## PART 2: EVERY COMPROMISE, LIMITATION, AND GAP (NO MERCY)

You must treat every item below as a **bug to be fixed or a feature to be completed**. This is the delta between "looks complete" and "is complete."

### 2.1 🔴 CRITICAL: The Server Has Never Run

**This is the single most important thing you must do first.**

| Gap | Evidence | Fix Required |
|-----|----------|--------------|
| `server/` has no `node_modules/` | `npm install` has never run | Run `cd server && npm install` |
| No `package-lock.json` | Dependencies are unpinned | `npm install` will generate it; commit it |
| `tsc --noEmit` has never run | Type errors may exist | Run `npm run typecheck` and fix ALL errors |
| `drizzle-kit generate` has never run | The schema in `db/schema.ts` has never been converted to SQL | Run `npm run db:generate` and `db:push` against a real Postgres |
| `vitest` has never run | Unit/integration tests are unverified | Run `npm test` and `npm run test:integration` with a real Postgres |
| Docker Compose has never been run | The `pgvector/pgvector:pg16` image and DinD sandbox are untested | `docker compose up -d` and verify all services start |

**The server code was written by an AI that could read files but could not execute code.** There are guaranteed to be compile errors, Drizzle API mismatches, and runtime bugs that only surface during execution. You must find and fix them.

### 2.2 🔴 FRONTEND ↔ BACKEND DISCONNECTED

15 of 18 dashboard pages read from `localStorage` (via `store.ts` → `engine.ts`), NOT from the server. Only 3 pages (`LiveAgents`, `Analytics`, `Approvals`) use `remote.ts` to call the server.

**The Fix:** You must wire `remote.ts` into the store layer so that when a remote server is configured (Settings → Remote), ALL data flows through the server's REST API instead of localStorage. This requires:
- A unified data source abstraction in `store.ts` that switches between `engine.ts` (local) and `remote.ts` (server) based on `getRemote().enabled`.
- Every CRUD operation (`createMemory`, `deleteMemory`, `recall`, etc.) must check the data source and route accordingly.
- The React components should not need to change — they call `nexus.createMemory()` which internally routes to the right backend.

### 2.3 🟠 SIMULATED / FAKE FUNCTIONALITY (SERVER)

| Area | Location | What's Fake | Real Fix |
|------|----------|-------------|----------|
| LLM distillation | `services.ts:255` (`heuristicDistill`) | Uses keyword regex (`remember\|decided\|lesson`) instead of an LLM | Wire a real LLM call when `NEXUS_LLM_*` env vars are configured. Use the `safeFetch` HTTP client to call the OpenAI-compatible `/chat/completions` endpoint. |
| Cron parser | `operations-ext.ts:110` (`computeNextRun`) | Only supports `* * * * *` and `M H * * *`. Complex expressions like `*/5 * * * 1-5` break | Use a real cron parser library (e.g., `cron-parser` or `cronstrue`) |
| Ambient ingestion | `operations-ext.ts:135` | Spawns an agent + enqueues a task but **nothing processes the task** | Build a task processor loop in the kernel that dequeues tasks, dispatches them to the right agent (or LLM), and processes the result. Currently `enqueueTask` stores tasks but `pickNextTask` + execution loop is not wired to a background worker. |
| HITL approval resume | `operations-ext.ts:221` | `resolveApproval` clears the error field but nothing resumes the suspended agent | Implement an event-driven resume: when an approval is resolved, the kernel must re-enqueue or wake the suspended task/agent. |
| Neural skill eval sandbox | `skill-compiler.ts:340` | `new Function(...)` is used to execute generated code — NOT sandboxed | Replace with Docker/WASM execution. The `sandbox_executions` table exists but no Docker executor code is written. |
| Browser tools | `browser.ts` | Lazy-loads Playwright but `playwright` is never installed in the Docker image | Add `npx playwright install chromium` to the Dockerfile build stage |

### 2.4 🟠 SIMULATED FUNCTIONALITY (BROWSER)

| Area | Location | What's Fake | Real Fix |
|------|----------|-------------|----------|
| MCP transport | `src/lib/mcp.ts` | Tool definitions exist but no transport (StreamableHTTP/stdio) is wired | If the browser needs MCP, wire a fetch-based MCP client that talks to `/api/mcp`. Otherwise, document that browser-MCP is simulation-only and real MCP requires the server. |
| Embeddings | `src/lib/brain.ts:228` | `rebuildEmbeddings()` returns `{ simulated: true }` always | The browser cannot call embedding APIs (CORS, no key). Document this as intentional — real embeddings require the server. |
| API key | `src/lib/config.ts:103` | `Math.random().toString(36)` generates a fake key stored in localStorage | This is fine for local-only simulation. When remote is enabled, the real key comes from Settings → Remote. |

### 2.5 🟡 MISSING INFRASTRUCTURE (NEVER BUILT)

These features were specified in the architecture directives but **no code exists**:

| Feature | Directive | Status |
|---------|-----------|--------|
| **VLM Desktop Actuation** (Computer Use) | Ext 7: "Omnimodal Spatial Execution" | Not started. Requires native desktop screenshot capture + coordinate-based mouse/keyboard injection + a separate privileged process (gRPC IPC). |
| **Shadow Cognition** (anticipatory compute) | Ext 7: "Shadow Agents" | Not started. Requires a local daemon (Rust/C++) monitoring window titles/clipboard, spawning local Llama 3 8B models via Ollama. |
| **P2P Swarm (libp2p)** | Ext 7: "Decentralized Swarm" | Not started. Requires libp2p or Tailscale/WireGuard overlay for cross-machine distributed sagas. |
| **Distributed Message Bus (Redis/Kafka)** | Ext 4: "Enterprise Expansion" | Not started. Bus is in-memory `Set<Listener>`. Need a Redis pub/sub bridge abstraction. |
| **Multi-Modal Vault (OCR/PDF/Audio)** | Ext 4: "Multi-Modal Vault" | Not started. Vault only parses markdown. Need OCR (Tesseract), PDF text extraction, audio transcription. |
| **Dynamic LLM Routing** | Ext 4: "Compute Optimization" | Not started. No routing logic to send simple tasks to cheap models. |
| **OS Garbage Collector (Reaper)** | Ext 4: "Resource Reaper" | Not started. No background process scanning for orphaned browser contexts/zombie containers. |
| **OpenTelemetry / Prometheus** | Ext 4: "Observability" | Not started. `traceId` exists on tasks but no OTel spans or `/metrics` endpoint. |
| **Audit log partitioning** | Ext 6: "Performance" | Not started. Tables are not partitioned by month. |
| **Streaming JSON parsing** | Ext 6: "Event Loop" | Not started. `JSON.parse()` is used on entire payloads. |
| **Prompt caching headers** | Ext 6: "LLM Latency" | Not started. No `anthropic-beta: prompt-caching` headers. |
| **React Virtualization** | Ext 6: "Frontend" | Not started. Audit log renders all rows (will crash at 10k+). Need `@tanstack/react-virtual`. |
| **WASM crypto** | Ext 6: "Frontend" | Not started. Browser uses hand-rolled JS SHA-256. |
| **Fluid Generative UI** | Ext 7: "Morphing Dashboards" | Not started. No dynamic component rendering from agent output. |
| **Blockchain anchoring** | Ext 7: "Cryptographic Truth" | Not started. No Merkle root rollup or timestamp server anchoring. |

### 2.6 🟡 HARDCODED VALUES (SHOULD BE CONFIGURABLE)

| Value | Location | Should Be |
|-------|----------|-----------|
| `RRF_K = 60` | `recall.ts:17` | `NEXUS_RRF_K` env var |
| `EMBEDDING_DIM = 1536` | `embeddings.ts:8` | `NEXUS_EMBEDDING_DIM` env var (different providers have different dims) |
| `BATCH_SIZE = 64` | `embeddings.ts:9` | `NEXUS_EMBEDDING_BATCH_SIZE` |
| `threshold = 0.8` | `recall.ts:130` | `NEXUS_SEMANTIC_THRESHOLD` |
| Recency half-life `30 * DAY` | `recall.ts:109` | `NEXUS_RECENCY_HALFLIFE_DAYS` |
| Score weights `0.5/0.3/0.1/0.1` | `recall.ts:195` | `NEXUS_RECALL_WEIGHTS` (JSON) |
| `CB_THRESHOLD = 3` | `operations-ext.ts:316` | `NEXUS_CIRCUIT_BREAKER_THRESHOLD` |
| `CB_RESET_MS = 30_000` | `operations-ext.ts:317` | `NEXUS_CIRCUIT_BREAKER_RESET_MS` |
| `maxRetries = 3` | Multiple locations | `NEXUS_MAX_RETRIES` |
| `MAX_EVENTS = 100` | `sse-client.ts:14` | `NEXUS_SSE_MAX_EVENTS` |
| `RESULT_CACHE_CAP = 1024` | `security.ts:82` | `NEXUS_AUTH_CACHE_CAP` |
| `MAX_BUCKETS = 10_000` | `rateLimit.ts:7` | `NEXUS_RATE_LIMIT_MAX_BUCKETS` |
| `COMPILATION_THRESHOLD = 5` | `skill-compiler.ts:14` | `NEXUS_COMPILE_THRESHOLD` |

### 2.7 🟡 SCALABILITY LIMITS

| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| Recall loads entire corpus into memory | `recall.ts:64-68` | OOM at ~50k memories | Use cursor-based pagination or move BM25 computation into Postgres via `tsvector` + `ts_rank` |
| `verifyAuditChain` pages through entire audit log | `audit.ts:97` | Slow at millions of entries | Implement Merkle tree rollups — anchor periodic root hashes, verify only the delta |
| Auth cache scans all keys on miss | `security.ts:131` | O(N) per unauthenticated request | Add a B-tree or hash index lookup on `key_hash` (the unique index already exists in schema — use it for direct lookup instead of scanning) |
| Rate limiter is process-local | `rateLimit.ts` | Ineffective behind load balancer | Implement Redis-backed token bucket |

---

## PART 3: THE FULL NEXUS 2.5 DIRECTIVE

You must complete ALL of these. They are ordered by dependency.

### PHASE 1: VERIFY AND FIX THE EXISTING SERVER (CRITICAL)

```bash
cd server
npm install
npm run typecheck    # FIX ALL ERRORS
npm run db:generate  # FIX SCHEMA ISSUES
npm run db:push      # APPLY TO A REAL POSTGRES
npm run test         # FIX ALL FAILURES
npm run test:integration  # FIX ALL FAILURES
npm run build        # MUST PRODUCE dist/
```

Do not write any new features until every command above passes with zero errors. Paste compiler errors into your context, understand them, fix them, re-run. Iterate until clean.

### PHASE 2: CONNECT FRONTEND TO BACKEND

Wire `remote.ts` into `store.ts` so that when `getRemote().enabled === true`, ALL data operations route through the server's REST API. The browser app must work in two modes:
- **Local mode** (default): reads/writes localStorage — zero backend required
- **Remote mode** (Settings → Remote enabled): reads/writes through the server

### PHASE 3: BUILD THE TASK EXECUTION LOOP

The kernel enqueues tasks but **nothing processes them**. You must build:
1. A background worker (or `setInterval`-based poller) that calls `pickNextTask()`
2. Dispatches the task to the appropriate handler (LLM call, compiled script, browser tool)
3. Calls `completeTask()` or `failTask()` based on the result
4. Handles retries and dead-letter quarantine

This is the "agent runtime" — without it, enqueued tasks sit forever in `queued` status.

### PHASE 4: REAL LLM INTEGRATION

Replace `heuristicDistill()` with a real LLM call:
1. When `NEXUS_LLM_*` env vars are configured, call the OpenAI-compatible `/chat/completions` endpoint
2. Use `safeFetch` (SSRF-guarded) for the HTTP call
3. Send a structured prompt: "Extract durable memories from this transcript. Return JSON array of {kind, title, content, tags, importance}."
4. Parse the LLM response with Zod validation
5. Fall back to heuristic distillation if the LLM call fails or returns invalid JSON

### PHASE 5: DYNAMIC LLM ROUTING

Implement compute optimization:
1. Simple tasks (parsing, classification, routing) → route to cheap models (Llama 3 8B via Ollama, Haiku)
2. Complex tasks (coding, reasoning, analysis) → route to flagship models (Claude 3.5 Sonnet, GPT-4o)
3. The routing decision should be based on task `kind`, input complexity, and a configurable ruleset

### PHASE 6: REDIS-DISTRIBUTED MESSAGE BUS

Replace the in-memory `Set<Listener>` bus with a Redis pub/sub bridge:
1. Abstract the bus behind an interface (`MessageBus`) with `publish()` and `subscribe()`
2. Default implementation: in-memory (current code)
3. Redis implementation: `redis.publish()` / `redis.subscribe()`
4. Configuration via `NEXUS_BUS_BACKEND=memory|redis` and `REDIS_URL`

### PHASE 7: SANDBOX EXECUTION (DOCKER/WASM)

Replace `new Function()` in `skill-compiler.ts` with real sandboxed execution:
1. Docker: spin up an ephemeral container (`node:20-alpine`), mount the script, execute, capture stdout/stderr, destroy container
2. WASM: compile the script to WASM, execute in a WASM runtime with restricted capabilities
3. Log all executions to `sandbox_executions` table with stdout, stderr, exit code, duration

### PHASE 8: OMNIMODAL SPATIAL EXECUTION (VLM)

Build the Computer Use Protocol:
1. Desktop screenshot capture (via `screenshot-desktop` npm package or platform-specific APIs)
2. Send screenshot to a VLM (Claude 3.5 Sonnet Computer Use) with the task prompt
3. Parse the VLM's coordinate-based response (bounding boxes, click coordinates)
4. Execute mouse/keyboard events via `@nut-tree/nut-js` or platform-specific APIs
5. **SAFETY**: Implement the "Red Ring" overlay + ESC interrupt. This MUST run in a separate privileged process with strict gRPC IPC to prevent prompt injection from controlling the host.

### PHASE 9: SHADOW COGNITION (ANTICIPATORY COMPUTE)

Build the local context watchdog:
1. A native daemon (Rust/C++ or Node.js with native addons) that monitors:
   - Active window title (via platform APIs)
   - Clipboard content (on change)
   - Calendar events (via CalDAV or local calendar API)
2. When a relevant context change is detected, spawn a Shadow Agent on a local model (Llama 3 8B via Ollama)
3. The Shadow Agent runs `nexus_recall` on the detected context, drafts potential responses
4. Cache the pre-computed response in Redis with a TTL
5. When the human types a prompt, check Redis first for a shadow response

### PHASE 10: P2P SWARM INTELLIGENCE

Replace the single-server model with a decentralized mesh:
1. Use `libp2p` or a Tailscale/WireGuard overlay for node discovery
2. Implement a Swarm Protocol: when the Master Agent receives a job, broadcast it to the mesh
3. Compute Bidding: connected nodes bid on subtasks based on their capabilities (GPU, browser, etc.)
4. Distributed Sagas: coordinate multi-step workflows across physical IP boundaries with distributed compensation

### PHASE 11: PERFORMANCE OPTIMIZATION

1. **HNSW**: Already in schema — verify it generates correctly in Phase 1
2. **Table Partitioning**: Partition `audit_log` and `trajectory_logs` by month
3. **Streaming JSON**: Use `stream-json` for large LLM payload parsing
4. **React Virtualization**: Add `@tanstack/react-virtual` to Audit and Analytics pages
5. **Prompt Caching**: Add `anthropic-beta: prompt-caching-2024-07-31` header to LLM calls
6. **WASM Crypto**: Replace hand-rolled browser SHA-256 with a WASM module
7. **OpenTelemetry**: Add spans for every syscall, tool call, DB query, LLM call

### PHASE 12: FLUID GENERATIVE UI

1. When an agent returns structured data (not text), generate React/Tailwind code on the fly
2. Safely render the generated component in the dashboard (using a sandboxed `eval` or `new Function` with React.createElement)
3. The dashboard morphs to display interactive charts, sliders, maps specific to the agent's output

### PHASE 13: BLOCKCHAIN ANCHORING

1. Periodically (hourly/daily) roll up the hash-chained `audit_log` into a Merkle tree
2. Compute the Merkle root
3. Anchor it to a public blockchain (Ethereum, Solana) or a trusted timestamp server (TSA)
4. Store the anchor proof in `system_meta`
5. This proves the OS didn't hallucinate or backdate audit entries

---

## PART 4: STRICT ENGINEERING CONSTRAINTS

These are non-negotiable:

1. **Zero Data Loss**: All schema changes must be non-destructive Drizzle migrations. Never `DROP TABLE` or `DROP COLUMN` on production data.
2. **Strict Zod Typing**: Every new REST endpoint, SSE payload, Message Bus event, and MCP tool must have an exhaustive Zod schema in `server/src/lib/schemas.ts`.
3. **Immutable Auditing**: EVERY action taken by a sub-agent, cron daemon, browser tool, VLM, or compiled script MUST append to the hash-chained `audit_log` inside the same database transaction.
4. **React State Integrity**: The frontend must use `useSyncExternalStore` only — no external state libraries (Redux, Zustand, MobX). Snapshot getters must return stable references.
5. **SSRF Protection**: All outbound HTTP calls must go through `safeFetch` (which resolves DNS and rejects private/loopback/link-local IPs).
6. **No Silent Failures**: Every `catch {}` must log the error. No swallowing exceptions without structured logging.
7. **No Placeholders**: No `<your-key>`, no `TODO: implement`, no `// stub`. Every function must have a real implementation or a clear `throw new Error("Not implemented: ...")`.
8. **Production Hardening**: In `NODE_ENV=production`:
   - `NEXUS_ALLOWED_ORIGINS` must not contain `localhost` or `*`
   - API keys must be hashed with scrypt (not stored raw)
   - Rate limiting must be active
   - CORS must be restricted

---

## PART 5: PROJECT STRUCTURE REFERENCE

```
.
├── src/                          # Browser dashboard (React 19 + Vite)
│   ├── lib/                      # In-browser engine (localStorage-backed)
│   │   ├── core.ts               # SHA-256, BM25, tokens (HAND-ROLLED, consider WASM)
│   │   ├── engine.ts             # Brain store + audit chain + persistence
│   │   ├── operations.ts         # CRUD, capture, transfer, security utils
│   │   ├── recall.ts             # BM25 recall (browser version)
│   │   ├── brain.ts              # Export/import, audit verify, vault bridge
│   │   ├── api.ts                # SIMULATED perimeter guard (Console only)
│   │   ├── mcp.ts                # MCP tool definitions (NO TRANSPORT)
│   │   ├── remote.ts             # Typed HTTP client for server connection
│   │   ├── toast.ts              # In-app notifications
│   │   ├── sse-client.ts         # EventSource client for live streaming
│   │   ├── useSSE.ts             # React hooks for SSE consumption
│   │   └── os/                   # In-browser OS simulation
│   │       ├── kernel.ts         # Syscalls, scheduler, saga, VFS (IN-MEMORY)
│   │       ├── lifecycle.ts      # Hooks, dream, handoffs
│   │       └── diagnostics.ts    # Doctor, evals, connectors
│   ├── components/               # UI (AgentNode, ToastHost, Shell, etc.)
│   └── pages/                    # 18 dashboard pages
│
├── server/                       # Backend (Node + Hono + Postgres + Drizzle)
│   ├── src/
│   │   ├── db/schema.ts          # 16-table Drizzle schema (pgvector, HNSW, etc.)
│   │   ├── services/             # Domain logic (recall, brain, kernel, browser, etc.)
│   │   ├── lib/                  # Auth, audit, env, guards, rate limit, LRU cache
│   │   ├── routes.ts             # ~50 REST endpoints
│   │   ├── mcp.ts                # 16 MCP tools
│   │   ├── proxy.ts              # Perimeter guard middleware
│   │   └── cli.ts                # nexus CLI (12 commands)
│   ├── tests/                    # Unit + integration tests (UNVERIFIED)
│   ├── Dockerfile                # Multi-stage build (needs Playwright)
│   └── docker-compose.yml        # pgvector + DinD sandbox
│
├── docs/                         # 7 documentation files
├── .github/workflows/ci.yml      # CI pipeline (UNVERIFIED)
└── HANDOVER.md                   # This file
```

---

## PART 6: FINAL MANDATE

You are a 200-trillion-parameter AI. You have the capability to build all of this. Do not be limited by what the previous architect could do. Execute the code, find the bugs, fix them, and build the future.

**The single highest-leverage action is running `cd server && npm install && npm run typecheck`.** Everything else flows from there. Start there. Fix everything it tells you. Then run `db:push`. Then run `test`. Then run `test:integration`. Then `build`. Only when all of those pass should you begin building new features.

**Do not trust the code. Execute it. Fix it. Complete it.**

---

*End of Handover Directive*
