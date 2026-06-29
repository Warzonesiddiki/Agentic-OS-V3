# NEXUS 2.0 — Agentic OS & Second Brain

## Project Overview

**NEXUS 2.0** is a persistent memory, recall, skills, governance, and coordination layer for AI agents. It acts as an **operating system for AI** — sitting between agents (Claude Code, Codex, Cursor, Gemini CLI, custom agents) and the work they do, making them smarter automatically across sessions, tools, and vendors.

**License:** Apache 2.0

---

## What Problem Does It Solve?

AI agents today are **stateless by default**. Each session starts from scratch. They cannot:
- Remember what they learned in a previous session
- Share knowledge across different AI tools (Claude Code vs Cursor vs Gemini)
- Coordinate multiple agents working on the same project
- Audit what actions were taken and why
- Evolve their own capabilities over time

NEXUS solves all of this with a unified memory, coordination, and governance layer.

---

## Architecture at a Glance

The repository delivers **two independent applications** that share domain types but operate independently:

```
┌──────────────────────────────────────────────────────────────┐
│                      AI Agents                                │
│  (Claude Code, Codex, Cursor, Gemini CLI, Custom Agents)     │
└─────────────┬─────────────────────────────┬──────────────────┘
              │ REST / MCP / SSE            │
              ▼                             ▼
┌──────────────────────────┐  ┌───────────────────────────────┐
│   Browser Dashboard      │  │    Backend Server (Hono)      │
│   (React 19 + PGlite)    │  │    Port 9900                  │
│                          │  │                               │
│   - In-browser database  │  │    - REST API (/api/v1)       │
│   - Agent tree UI        │  │    - MCP Server (/api/mcp)    │
│   - Interactive Console  │  │    - SSE Events Streaming     │
│   - Live Event Ticker    │  │    - Background Worker        │
│   - Zero backend needed  │  │    - CLI Tool (nexus)         │
└──────────────────────────┘  └──────────────┬────────────────┘
                                             │
                                   ┌─────────▼──────────┐
                                   │   PostgreSQL 17     │
                                   │   + pgvector 0.8    │
                                   │   (19 tables)       │
                                   └────────────────────┘
```

### Key Design Principle

The two applications share **zero runtime code paths**. The browser dashboard runs entirely in-browser with an embedded PostgreSQL-like engine (PGlite WASM) and localStorage — **no server required**. The backend server adds persistent PostgreSQL storage, multi-user auth, the Agentic OS kernel, and production-scale recall. They communicate when the browser's `remote.ts` client connects to the server.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend (Dashboard)** | React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, `motion` (animations) |
| **Backend (Server)** | Node.js >=20, Hono 4 (HTTP framework), TypeScript |
| **Database** | PostgreSQL 17 with pgvector 0.8 extension |
| **ORM / Migrations** | Drizzle ORM 0.36, Drizzle Kit 0.28 |
| **MCP Protocol** | `@modelcontextprotocol/sdk` 1.0 (Streamable HTTP) |
| **Embeddings / LLM** | OpenAI-compatible API (configurable), BM25 lexical fallback |
| **Containerization** | Docker (multi-stage build), Docker Compose |
| **Testing** | Vitest 2.x (unit + integration tests) |
| **Observability** | OpenTelemetry (OTLP HTTP exporter), Prometheus metrics |
| **Message Bus** | In-memory (default) or Redis (`ioredis`) via `NEXUS_BUS_BACKEND` |
| **Auth & Security** | scrypt KDF, `crypto.timingSafeEqual`, Zod validation, rate limiting, CORS, CSP |
| **Blockchain** | `viem` for Ethereum-compatible chain anchoring |
| **P2P Networking** | `libp2p` with gossipsub, noise, mplex, TCP transports |
| **Browser Automation** | Playwright |
| **Desktop Automation** | VLM-driven GUI actuation (screenshot -> action) |
| **Sandboxing** | Docker (ephemeral containers) and Node.js `vm.Script` (in-process) |

---

## Core Features

### 1. Memory System

The heart of NEXUS — a durable, typed, searchable memory store for AI agents.

| Feature | Description |
|---|---|
| **Typed memories** | Episodic, semantic, preference, reflexion, fact — each with confidence, evidence, and decay |
| **Token-budgeted recall** | Greedy pack within caller-specified token limit — never exceeds budget |
| **RRF fusion recall** | Reciprocal Rank Fusion blending BM25 lexical search + pgvector cosine similarity (k=60) |
| **Importance decay** | Configurable half-life and recency weighting — memories fade naturally |
| **Feedback loop** | Record helpful/not-helpful per recall result to improve future ranking |
| **Checkpoints** | Labeled snapshots for cross-session context transfer |
| **Session capture** | Transcript distillation with a "never lose transcript" invariant — raw data always preserved on failure |

#### Recall Pipeline

```
User Query -> BM25 Lexical --------> RRF Fusion -> Importance -> Recency -> Budget Pack -> Result
              ---- or ----             (k=60)       Weighting    Weighting
              pgvector Cosine ------>
```

- When embeddings are available: hybrid BM25 + vector similarity
- When no embedding provider configured: graceful fallback to BM25-only (lexical mode)
- Final ranking blended with importance (0.3), recency (0.1), and feedback (0.1) weights

### 2. Agentic OS Kernel

A full privilege-separated operating system kernel for AI agents.

| Feature | Description |
|---|---|
| **Agent ring model** | Ring 0 (kernel) to Ring 3 (user) — privilege separation inspired by OS design |
| **Saga orchestration** | Multi-step workflows with compensation (rollback) on failure |
| **IPC message bus** | In-memory or Redis pub/sub for agent-to-agent communication |
| **Virtual filesystem (VFS)** | Namespace-isolated per-agent filesystem |
| **Approval gates** | Human-in-the-loop for privileged/destructive operations |
| **Daemon supervisor** | Auto-restart, heartbeat monitoring, stale task detection |
| **Timer/scheduler** | Cron-resolved recurring tasks with priority queues (Q0-Q4) |
| **Priority queues** | Q0 (safety) through Q4 (self-improvement), starvation prevention |

### 3. Skills System

Reusable, versioned, self-evolving procedures.

| Feature | Description |
|---|---|
| **Versioned skills** | Named procedures with description, triggers, and version tracking |
| **Outcome tracking** | Success/failure rating with Bayesian averaging |
| **Auto-compilation** | Detects repeated patterns and automatically generates reusable scripts |
| **Neural skill compiler** | Evaluates trigger patterns against task labels |
| **Category organization** | Tag-based navigation and search |

### 4. Security & Governance

Built from the ground up for production deployment.

| Feature | Description |
|---|---|
| **Scoped API keys** | 9 scopes: memory:read/write, skill:read/write, brain:admin, safety:write, etc. |
| **Hash-chained audit** | SHA-256 append-only, tamper-evident chain — every mutation recorded |
| **Constant-time auth** | `crypto.timingSafeEqual` — no timing side-channels |
| **Kill switch** | Emergency mutation blocker (HTTP 423), persists across restarts |
| **Rate limiting** | Configurable per-minute global throttle |
| **LLM trajectory logging** | Full reasoning traces per audit entry |
| **Tool receipt tracking** | Immutable tool-call ledger with pre/post hashes |
| **SSRF/path-traversal/secret detection** | Guards for all outbound operations |

#### Audit Chain Structure

```
entry_hash = SHA256(prev_hash + sequence + actor + action + payload)
```

- Tamper-evident: changing any entry invalidates all subsequent hashes
- Verifiable: `GET /api/v1/audit` walks the chain and reports validity
- Auto-kill: when 3+ consecutive entries fail verification, kill switch engages

### 5. MCP (Model Context Protocol) Server

Full MCP server compatible with any MCP client (Claude Desktop, etc.).

**14 MCP Tools:**
- `nexus_recall`, `nexus_remember`, `nexus_capture` — memory operations
- `nexus_feedback`, `nexus_audit_verify` — feedback and governance
- `nexus_agents_list`, `nexus_agents_spawn` — agent management
- `nexus_browser_navigate`, `nexus_browser_extract`, `nexus_browser_screenshot` — browser automation
- `nexus_cron_create`, `nexus_cron_list`, `nexus_scheduler_status` — task scheduling
- `nexus_kill_switch` — emergency control

**MCP Resources:**
- `nexus://memories/{id}` — specific memory by ID
- `nexus://memories?kind={kind}` — memories filtered by kind
- `nexus://skills/{id}` — specific skill by ID
- `nexus://skills?category={cat}` — skills filtered by category

### 6. API Surface — 50+ REST Endpoints

All endpoints return a JSON envelope: `{ "ok": true, "data": ..., "traceId": "req_xxx" }`

| Category | Endpoints | Description |
|---|---|---|
| **Health** | `GET /api/v1/health`, `/metrics`, `/system` | Server status, Prometheus metrics, system info |
| **Memories** | CRUD at `/api/v1/memories` | 5 memory types with cursor pagination |
| **Recall** | `GET /api/v1/recall`, `POST /recall/conversation` | Token-budgeted semantic + lexical search |
| **Skills** | CRUD at `/api/v1/skills` + outcome recording | Versioned, rated, auto-compilable |
| **Brain** | Export, Import, Compress, Rebuild embeddings | Full brain lifecycle management |
| **Sessions** | `POST /api/v1/sessions/capture` | Transcript distillation |
| **Vault** | List, Sync, Write-back | Obsidian vault bridge |
| **Audit** | Verify chain, Trajectory logs, Tool receipts | Governance and provenance |
| **Safety** | Kill switch, Heartbeat | Emergency controls |
| **Admin** | API key management, Analytics, Compiled scripts | Administration |
| **SSE** | `GET /api/v1/events` | Real-time state streaming |
| **MCP** | `GET/POST /api/mcp` | Model Context Protocol endpoint |

### 7. Infrastructure & Integrations

| Integration | Description |
|---|---|
| **pgvector** | HNSW indexes on memories, skills, notes for semantic search |
| **Obsidian vault bridge** | Index markdown vault, write back as notes with path-traversal protection |
| **Brain export/import** | Schema-validated, idempotent, secrets-safe — full brain backup |
| **Docker sandbox** | Ephemeral containers for untrusted code execution |
| **In-process sandbox** | `vm.Script` isolation when Docker is unavailable |
| **Browser automation** | Playwright integration for web browsing (navigate, extract, screenshot) |
| **Desktop actuation** | VLM-driven GUI automation (screenshot -> coordinate-based action) |
| **Blockchain anchoring** | Merkle root anchoring to Ethereum-compatible chains for audit proof |
| **OpenTelemetry** | OTEL-compatible tracing and metrics export |
| **P2P swarm** | libp2p peer discovery and communication (gossipsub, noise, mplex) |
| **Hermes connector** | External agent integration protocol |

---

## Database Schema (19 PostgreSQL Tables)

| Table | Purpose |
|---|---|
| `memories` | Typed memory cards with pgvector embedding, importance, recall tracking |
| `skills` | Versioned reusable procedures with ratings and embeddings |
| `projects` | Project groupings with memory/skill counts |
| `notes` | Obsidian vault markdown notes with embeddings |
| `audit_log` | SHA-256 hash-chained append-only mutation log |
| `merkle_checkpoints` | Merkle tree checkpoints over audit chunks |
| `anchored_roots` | Blockchain-anchored Merkle roots |
| `token_ledger` | Token reuse/savings tracking |
| `feedback` | Recall relevance feedback records |
| `system_meta` | Key-value system metadata (kill switch state, etc.) |
| `api_keys` | Scoped API keys with scrypt hashes |
| `trajectory_logs` | LLM reasoning traces linked to audit |
| `tool_receipts` | Cryptographic pre/post tool-call hashes |
| `agents` | Multi-agent registry |
| `agent_tasks` | Priority-queued task system (Q0-Q4) |
| `cron_jobs` | Scheduled recurring daemon tasks |
| `sandbox_executions` | Docker/VM sandbox execution records |
| `state_snapshots` | Saga step snapshots for rollback |
| `compiled_scripts` | Auto-generated JIT skill scripts |

---

## Directory Structure

```
nexus-2.0/
├── src/                          # Browser Dashboard (React 19 + Vite + Tailwind)
│   ├── App.tsx                   # Root React component
│   ├── main.tsx                  # Entry point
│   ├── store.ts                  # Brain store (useSyncExternalStore + localStorage)
│   ├── osStore.ts                # OS kernel store
│   ├── lib/                      # Core domain logic
│   │   ├── core.ts               # SHA-256, BM25, token estimation, formatting
│   │   ├── engine.ts             # Brain state, hash-chained audit, pruning
│   │   ├── operations.ts         # CRUD for memories/skills, session capture
│   │   ├── recall.ts             # Token-budgeted BM25 recall
│   │   ├── brain.ts              # Export/import/compress, audit verify
│   │   ├── api.ts                # Browser-side perimeter guard simulation
│   │   ├── mcp.ts                # MCP tool definitions (no transport in browser)
│   │   ├── config.ts             # Reactive env config with Zod
│   │   ├── vault.ts              # Obsidian markdown parsing + path safety
│   │   ├── remote.ts             # Typed HTTP client for backend server
│   │   ├── sse-client.ts         # Server-Sent Events client
│   │   ├── os/                   # Agentic OS kernel (browser simulation)
│   │   │   ├── kernel.ts         # Syscalls, scheduler, saga, bus, VFS, supervisor
│   │   │   ├── store.ts          # OS state store
│   │   │   ├── policy.ts         # Tool registry, execution rings, approvals
│   │   │   ├── lifecycle.ts      # Session hooks, observation capture, dream
│   │   │   └── diagnostics.ts    # Doctor, drift, evals, connectors
│   ├── components/               # React UI components
│   │   ├── Shell.tsx             # Main app shell layout
│   │   ├── Console.tsx           # Interactive console
│   │   ├── AgentDrawer.tsx       # Agent management drawer
│   │   ├── EventTicker.tsx       # Live event ticker
│   │   ├── HoldToConfirm.tsx     # Safety confirmation button
│   │   └── ...                   # Toast, Loading, ErrorBoundary, etc.
│   └── pages/                    # Route pages
│       ├── Dashboard.tsx         # Main dashboard
│       ├── Memories.tsx          # Memory browser
│       ├── Recall.tsx            # Search and recall interface
│       ├── Skills.tsx            # Skills management
│       ├── Sessions.tsx          # Session capture
│       ├── Projects.tsx          # Project organization
│       ├── Vault.tsx             # Obsidian vault
│       ├── Audit.tsx             # Audit chain viewer
│       ├── Safety.tsx            # Kill switch & safety controls
│       └── os/                   # Agentic OS pages
│
├── server/                       # Backend Server (Hono + Node + PostgreSQL)
│   ├── src/
│   │   ├── index.ts              # Server entrypoint, bootstrap
│   │   ├── app.ts                # Hono app creation
│   │   ├── routes.ts             # ~50 REST API endpoints (706 lines)
│   │   ├── mcp.ts                # MCP server factory (16 tools + resources + prompts)
│   │   ├── mcp-http.ts           # Streamable HTTP MCP transport
│   │   ├── services.ts           # Domain services (transactional + audit)
│   │   ├── proxy.ts              # Perimeter guard: CORS, rate limit, auth, CSP
│   │   ├── cli.ts                # CLI tool (nexus status, recall, remember, etc.)
│   │   ├── connectors/
│   │   │   └── hermes.ts         # Hermes agent connector
│   │   ├── db/
│   │   │   ├── schema.ts         # 19-table Drizzle schema (with pgvector)
│   │   │   ├── client.ts         # DB client (pooled, statement timeout)
│   │   │   └── dev-schema.ts     # Development schema
│   │   ├── lib/                  # Utilities
│   │   │   ├── env.ts            # Environment config with Zod
│   │   │   ├── security.ts       # Scrypt hashing, key generation, scopes
│   │   │   ├── audit.ts          # SHA-256 hash chain (advisory-locked)
│   │   │   ├── guards.ts         # SSRF, path-traversal, secret detection
│   │   │   ├── rateLimit.ts      # Token bucket rate limiter
│   │   │   ├── errors.ts         # Structured error types
│   │   │   ├── logging.ts        # Structured logging
│   │   │   ├── schemas.ts        # Zod validation schemas
│   │   │   └── ...               # LRU cache, OTel, HTTP utils, auth context
│   │   ├── routes/               # Domain route modules
│   │   │   ├── agents.ts         # Agent management routes
│   │   │   ├── automation.ts     # Automation routes
│   │   │   └── sse.ts            # SSE event stream route
│   │   └── services/             # 25+ business logic modules
│   │       ├── recall.ts         # RRF fusion (BM25 + pgvector), budget packing
│   │       ├── embeddings.ts     # Embedding pipeline (OpenAI-compatible)
│   │       ├── brain.ts          # Export/import/compress brain
│   │       ├── kernel.ts         # Agent lifecycle, syscalls, scheduler, saga
│   │       ├── audit-engine.ts   # LLM trajectories, tool receipts, auto-kill
│   │       ├── sandbox.ts        # Docker/vm sandboxed execution
│   │       ├── llm-router.ts     # Tiered model routing
│   │       ├── browser.ts        # Playwright web automation
│   │       ├── vault.ts          # Obsidian vault bridge
│   │       ├── bus.ts            # Event bus (memory or Redis)
│   │       ├── skill-compiler.ts # Pattern detection -> auto-compiled scripts
│   │       ├── blockchain.ts     # Merkle root anchoring
│   │       ├── p2p-swarm.ts      # libp2p peer discovery and swarm
│   │       ├── desktop-actuator.ts # VLM-driven GUI automation
│   │       └── ...               # Shadow daemon, metrics, SSE, task worker, etc.
│   ├── tests/                    # Test suite
│   │   ├── audit.test.ts, env.test.ts, security.test.ts, ...
│   │   └── integration/          # Integration tests (require PostgreSQL)
│   ├── drizzle/                  # Generated SQL migrations
│   ├── Dockerfile                # Multi-stage Docker build
│   └── docker-compose.yml        # Server-local Docker (Postgres + Redis)
│
├── shared/
│   └── types.ts                  # Shared TypeScript types
│
├── docs/                         # Documentation
│   ├── ARCHITECTURE.md           # Deep architecture dive
│   ├── AGENTIC_OS.md             # Agentic OS kernel reference
│   ├── DEPLOYMENT.md             # Production deployment guide
│   ├── SECURITY.md               # Threat model and hardening
│   ├── MCP.md                    # MCP protocol integration guide
│   ├── TESTING.md                # Testing strategy
│   └── HERMES.md                 # Hermes CLI integration notes
│
├── proto/
│   └── desktop_actuator.proto    # Protobuf for desktop actuation
│
├── dist/                         # Built dashboard (served by backend)
├── docker-compose.yml            # Full-stack Docker deployment
├── obsidian-sync.py              # Python script for Obsidian vault sync
├── .env.example                  # Environment variable template
├── HANDOVER.md                   # Architecture handover / build directive
└── README.md                     # Main project documentation
```

---

## Configuration

All configuration is via environment variables. The key groups are:

| Group | Key Variables | Purpose |
|---|---|---|
| **Server** | `PORT`, `NODE_ENV`, `DATABASE_URL` | Server and database connectivity |
| **Security** | `NEXUS_API_KEY`, `NEXUS_ALLOWED_ORIGINS`, `NEXUS_RATE_LIMIT_PER_MINUTE` | Auth, CORS, rate limiting |
| **LLM** | `NEXUS_LLM_BASE_URL`, `NEXUS_LLM_API_KEY`, `NEXUS_LLM_MODEL` | LLM provider configuration |
| **Embeddings** | `NEXUS_EMBEDDING_MODEL`, `NEXUS_EMBEDDING_DIM`, `NEXUS_EMBEDDING_BATCH_SIZE` | Embedding pipeline |
| **Recall** | `NEXUS_RRF_K`, `NEXUS_SEMANTIC_THRESHOLD`, various weights | Recall tuning |
| **Worker** | `NEXUS_WORKER_POLL_MS`, `NEXUS_WORKER_MAX_CONCURRENCY` | Background task scheduling |
| **Sandbox** | `NEXUS_SANDBOX_ENABLED`, `NEXUS_SANDBOX_IMAGE` | Code execution sandbox |
| **Integrations** | `NEXUS_OBSIDIAN_VAULT`, `NEXUS_REDIS_URL`, `NEXUS_OTEL_ENDPOINT` | Optional integrations |
| **Blockchain** | `NEXUS_BLOCKCHAIN_ENABLED`, `NEXUS_BLOCKCHAIN_RPC_URL` | Audit chain anchoring |

---

## Quick Start

### Option 1: Browser Dashboard (Zero Backend)

```bash
npm install
npm run dev
# Open browser -> http://localhost:5173
```

Runs entirely in-browser with PGlite (embedded PostgreSQL WASM). All data lives in IndexedDB. **No server required.**

### Option 2: Full Backend Stack

```bash
# Requires PostgreSQL 17+ with pgvector
cp .env.example server/.env
cd server && npm install
npx drizzle-kit push
npm run dev
# Open browser -> http://localhost:9900
```

### Option 3: Docker Compose (Production)

```bash
docker compose up -d --build
# Server: http://localhost:9900
```

---

## Current Status & Roadmap

### Implemented Features

- [x] Core memory + recall (BM25 + pgvector RRF)
- [x] Agentic OS kernel (syscalls, scheduler, IPC, VFS, saga)
- [x] Skill compiler (auto-detect patterns -> compile)
- [x] Hash-chained audit ledger
- [x] MCP server (16 tools, resources, prompts)
- [x] Obsidian vault sync and write-back
- [x] Docker sandboxed code execution
- [x] Browser automation (Playwright)
- [x] VLM-driven desktop actuation
- [x] P2P swarm (libp2p)
- [x] 50+ REST API endpoints
- [x] Scoped API key auth with scrypt hashing
- [x] Full browser dashboard with 18 pages

### In Progress / Planned

- [ ] Verify server code compiles and runs (currently unverified — never compiled)
- [ ] Connect frontend to backend via unified data source
- [ ] Real LLM integration (replace heuristic distillation)
- [ ] Dynamic LLM routing (simple -> cheap models, complex -> flagship)
- [ ] Redis-distributed message bus
- [ ] IBC cross-chain protocol
- [ ] WebAssembly plugin runtime
- [ ] Federated learning across instances
- [ ] Real-time multi-agent collaboration
- [ ] Performance optimization (partitioning, streaming JSON, virtualization, WASM crypto)

---

## Key Design Decisions

1. **Audit hash chain**: SHA-256, entries chained by previous-hash, advisory-locked appends. Tamper-evident, verifiable, auto-kill on corruption.

2. **Session capture invariant**: Raw transcript is ALWAYS preserved on distillation failure — never lose data.

3. **Token-budgeted recall**: BM25 blended with importance/recency/feedback; greedily packed under budget; never exceeds it.

4. **Auth**: scrypt (server) or SHA-256 domain-separated (browser); constant-time comparison; bounded cache; 9 scoped principals.

5. **Typed memory graph**: Cards with evidence[], confidence, stability, decay, contradiction states + graph edges.

6. **Dual deliverable architecture**: Browser runs independently (no backend), server provides production-scale. Shared types only, zero shared runtime.

---

## Security Model

- **API Keys**: scrypt-hashed (N=2^14, r=8, p=1), scoped to 9 permission levels, constant-time verification
- **Hash-chained Audit**: SHA-256 append-only chain, tamper-evident, verifiable via API
- **Code Sandboxing**: Docker ephemeral containers (primary) or Node.js `vm.Script` (fallback) — both with timeouts
- **Kill Switch**: Emergency mutation blocker (HTTP 423), persists across restarts, auto-engages on audit corruption
- **Rate Limiting**: Configurable per-minute global throttle with token bucket
- **SSRF Protection**: All outbound HTTP through `safeFetch` — rejects private/loopback/link-local IPs
- **Perimeter Guard**: CORS -> security headers -> payload limit -> rate limit -> auth backstop

---

## Key Services (Server)

| Module | File | Purpose |
|---|---|---|
| **Kernel** | `services/kernel.ts` | Agent lifecycle, syscalls, scheduler, saga orchestration |
| **Recall** | `services/recall.ts` | RRF fusion, BM25 + vector scoring, budget packing |
| **Embeddings** | `services/embeddings.ts` | OpenAI-compatible embedding via safeFetch, batch processing |
| **Sandbox** | `services/sandbox.ts` | Docker/vm isolated code execution, execution tracking |
| **Audit Engine** | `services/audit-engine.ts` | LLM trajectories, tool receipts, auto-kill detection |
| **Brain** | `services/brain.ts` | Export/import/compress, idempotent, no secrets leaked |
| **LLM Router** | `services/llm-router.ts` | Tiered model routing (simple/medium/complex) |
| **Skill Compiler** | `services/skill-compiler.ts` | Pattern detection -> auto-generated scripts |
| **Browser** | `services/browser.ts` | Playwright navigation, extraction, screenshots |
| **Vault** | `services/vault.ts` | Obsidian vault indexing, path-traversal protection |
| **Bus** | `services/bus.ts` | In-memory or Redis pub/sub event bus |
| **Desktop Actuator** | `services/desktop-actuator.ts` | VLM-driven GUI automation |

---

## Testing

```bash
cd server
npm test                    # Unit tests (Vitest)
npm run test:integration    # Integration tests (requires PostgreSQL)
npm run validate            # Full: lint -> typecheck -> test -> integration -> build
npm run typecheck           # tsc --noEmit
npm run lint                # ESLint
```

---

## Documentation

Additional docs in the `docs/` directory:

| Document | Description |
|---|---|
| `ARCHITECTURE.md` | Deep dive: subsystem interactions and data flow |
| `DEPLOYMENT.md` | Production deployment guide |
| `SECURITY.md` | Threat model and security hardening |
| `MCP.md` | MCP protocol integration guide |
| `AGENTIC_OS.md` | Agentic OS kernel reference |
| `TESTING.md` | Testing strategy and coverage |
| `HERMES.md` | Hermes CLI integration notes |
| `HANDOVER.md` | Build directive and known gaps |
