# NEXUS 2.0 — Agentic OS & Second Brain

> **A persistent memory, recall, skills, governance, and coordination layer for AI agents.**  
> An operating system that makes AI agents smarter automatically — across sessions, across tools, across vendors.

<p align="center">
  <img src="https://img.shields.io/badge/status-Phase%2011%2B%20in%20progress-orange" alt="Phase 11+ in progress">
  <img src="https://img.shields.io/badge/typescript-5.8-3178c6" alt="TypeScript 5.8">
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933" alt="Node >=20">
  <img src="https://img.shields.io/badge/postgresql-17-336791" alt="PostgreSQL 17">
  <img src="https://img.shields.io/badge/pgvector-0.8-4169e1" alt="pgvector 0.8">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache 2.0 License">
</p>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [MCP Protocol](#mcp-protocol)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Security Model](#security-model)
- [Roadmap](#roadmap)

---

## Overview

NEXUS 2.0 is the **memory and coordination layer** that sits between AI agents (Claude Code, Codex, Cursor, Gemini CLI, custom agents) and the work they do. It provides:

- **Durable memory** — typed cards with evidence, confidence, decay, and contradiction states
- **Semantic recall** — Reciprocal Rank Fusion (RRF) blending pgvector cosine similarity with BM25 lexical search, importance, recency, and feedback signals
- **Agentic OS kernel** — syscalls, scheduler, saga orchestration, message bus, virtual filesystem, runtime supervisor, execution rings, approval gates
- **Reusable skills** — procedures with outcome-tracked ratings and auto-compilation
- **Session capture** — transcript distillation with a never-lose-transcript invariant
- **Obsidian vault bridge** — markdown indexing and write-back with path-traversal protection
- **Hash-chained audit** — SHA-256, append-only, tamper-evident, verifiable
- **Token ledger** — tracks knowledge reuse and savings
- **MCP server** — Model Context Protocol tools, resources, and prompts
- **Kill switch** — emergency mutation blocking (HTTP 423)
- **Self-evolving skill compiler** — detects repeated patterns and auto-generates reusable scripts

### Two Deliverables

This is a **pnpm monorepo** with several cooperating parts (full map in `AGENTS.md`):

| Part                  | Location                                | Description                                                                      |
| --------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| **Browser Dashboard** | `src/` (React + Vite)                   | Single-page agent control plane (built to `dist/`, served by the server)         |
| **Backend Server**    | `server/` (Hono/Node)                   | REST API + MCP server + background worker (PostgreSQL / SQLite)                  |
| **Shared packages**   | `packages/` (sdk, a2a-server, devtools) | TS libraries consumed via tsconfig path aliases                                  |
| **Rust crates**       | `crates/` (decoupled)                   | Provider / crypto / safety tooling — see `docs/adr/0007` (no runtime link to TS) |
| **Desktop app**       | `nexus-tauri/` (Tauri)                  | Cross-platform native shell wrapping the server                                  |

The browser dashboard runs entirely in-browser with an embedded PostgreSQL-like engine (PGlite). No server is required for basic use. The backend server adds persistent storage, multi-user auth, the Agentic OS kernel, and production-scale recall.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AI Agents                             │
│  (Claude Code, Codex, Cursor, Gemini CLI, Custom)       │
└────────────┬────────────────────────────┬────────────────┘
             │ REST / MCP / SSE           │
             ▼                            ▼
┌───────────────────────┐  ┌────────────────────────────┐
│   Browser Dashboard   │  │    Backend Server (Hono)    │
│   (React + PGlite)    │  │    Port 9900                │
│   - In-browser DB     │  │    - REST API (/api/v1)     │
│   - Agent tree        │  │    - MCP Server (/api/mcp)  │
│   - Console           │  │    - SSE Events             │
│   - Event ticker      │  │    - Background Worker       │
└───────────────────────┘  └────────────┬───────────────┘
                                        │
                              ┌─────────▼─────────┐
                              │   PostgreSQL 17    │
                              │   + pgvector 0.8   │
                              │   (60+ tables)      │
                              └───────────────────┘
```

### Recall Pipeline

```
User Query ──► BM25 Lexical ──┐
              ---- or ----     ├──► RRF Fusion ──► Importance ──► Recency ──► Budget Pack ──► Result
              pgvector Cosine ─┘         (k=60)       Weighting     Weighting
```

When semantic embeddings are available (LLM provider configured), NEXUS uses **Reciprocal Rank Fusion** to combine:

1. **BM25 lexical** — keyword/term-overlap scoring
2. **pgvector cosine similarity** — semantic meaning via `HNSW` indexes

Fused scores are then blended with importance, recency, and feedback weights for the final ranking. If no embedding provider is configured, the system gracefully degrades to BM25-only (lexical mode).

---

## Features

### Core Memory System

| Feature                 | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| **Typed memories**      | Episodic, semantic, preference, reflexion, fact      |
| **Token budget recall** | Greedy pack within caller-specified token limit      |
| **RRF fusion**          | Blends BM25 + vector similarity (k=60)               |
| **Importance decay**    | Configurable half-life and recency weighting         |
| **Feedback loop**       | Record helpful/not-helpful per recall result         |
| **Checkpoints**         | Labeled snapshots for cross-session context transfer |

### Agentic OS Kernel

| Feature                | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| **Agent ring model**   | Ring 0 (kernel) → Ring 3 (user) privilege separation     |
| **Saga orchestration** | Steps with compensation (rollback) support               |
| **IPC message bus**    | In-memory or Redis pub/sub for agent communication       |
| **Virtual filesystem** | Namespace-isolated per-agent VFS                         |
| **Approval gates**     | Human-in-the-loop for privileged operations              |
| **Daemon supervisor**  | Auto-restart, heartbeat monitoring, stale task detection |
| **Timer/scheduler**    | Cron-resolved recurring tasks                            |

### Skills System

| Feature                   | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| **Versioned skills**      | Named procedures with description and triggers         |
| **Outcome tracking**      | Success/failure rating with bayesian averaging         |
| **Auto-compilation**      | Detects repeated patterns → generates reusable scripts |
| **Neural skill compiler** | Evaluates trigger patterns against task labels         |
| **Category organization** | Tag-based navigation and search                        |

### Security & Governance

| Feature                    | Description                                                   |
| -------------------------- | ------------------------------------------------------------- |
| **Scoped API keys**        | 9 scopes (memory:read/write, brain:admin, safety:write, etc.) |
| **Hash-chained audit**     | SHA-256, append-only, tamper-evident                          |
| **Constant-time auth**     | `crypto.timingSafeEqual` — no timing side-channels            |
| **Kill switch**            | Emergency mutation blocker, persistable                       |
| **Rate limiting**          | Configurable per-minute global throttle                       |
| **LLM trajectory logging** | Full reasoning traces per audit entry                         |
| **Tool receipt tracking**  | Immutable tool-call ledger with pre/post hashes               |

### Infrastructure

| Feature                      | Description                                         |
| ---------------------------- | --------------------------------------------------- |
| **pgvector semantic search** | `HNSW` indexes on memories, skills, notes           |
| **Obsidian vault bridge**    | Index markdown vault, write back as notes           |
| **Brain export/import**      | Schema-validated, idempotent, secrets-safe          |
| **Docker sandbox**           | Ephemeral containers for untrusted code             |
| **In-process sandbox**       | `vm.Script` isolation when Docker is unavailable    |
| **Browser automation**       | Playwright integration for web browsing             |
| **Desktop actuation**        | VLM-driven GUI automation (screenshot → action)     |
| **Blockchain anchoring**     | Merkle root anchoring to Ethereum-compatible chains |
| **OpenTelemetry**            | OTEL-compatible tracing and metrics                 |
| **IBC protocol support**     | Cross-chain bridging (proposal phase)               |

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **PostgreSQL** 16+ (for the backend server)
- **npm** (or pnpm/yarn)

### Option 1: Browser Dashboard (No Server)

```bash
# 1. Install dependencies (pnpm workspace)
pnpm install

# 2. Start the dev server (Vite, root)
npx vite

# 3. Open browser → http://localhost:5173
```

The browser dashboard uses PGlite (embedded PostgreSQL WASM) — zero backend required. All data lives in your browser's IndexedDB.

### Option 2: Full Backend Stack

```bash
# 1. Set up the database
createdb nexus
psql nexus -c "CREATE EXTENSION IF NOT EXISTS vector;"  # optional, enables semantic search

# 2. Configure environment
cp .env.example server/.env
# Edit server/.env — set DATABASE_URL to your PostgreSQL connection string

# 3. Install server dependencies
cd server
npm install

# 4. Push the database schema
npx drizzle-kit push

# 5. Start the server
npm run dev

# 6. Open browser → http://localhost:9900
```

On first boot, the server auto-generates an **operator API key** and logs it to stdout. Save it — it's shown only once.

### Option 3: Docker Compose (Production)

```bash
# Start the full stack
docker compose up -d

# Server: http://localhost:9900
# PostgreSQL with pgvector: localhost:5432

# Check logs for the auto-generated API key
docker compose logs nexus | grep "operator API key"
```

### Verify It's Working

```bash
# Health check
curl http://localhost:9900/api/v1/health

# Store a memory
curl -X POST http://localhost:9900/api/v1/memories \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"kind":"semantic","title":"Hello World","content":"My first memory"}'

# Recall (semantic search)
curl "http://localhost:9900/api/v1/recall?q=hello&budget=500" \
  -H "Authorization: Bearer <your-api-key>"
```

---

## QUICKSTART

Reference card for building, testing, and validating the workspace. (For a full dev walkthrough see
[Quickstart (dev)](#quickstart-dev) below; for runtime options see [Quick Start](#quick-start) above.)

### Prerequisites
- Node >= 20, pnpm, and a PostgreSQL 17 + pgvector instance (or SQLite for local/dev).

### Build

```bash
# Browser dashboard (Vite + React) → dist/
npm run dev                # vite dev server (http://localhost:5173)
npx vite build             # build dashboard for the server to serve

# Root workspace (pnpm) — builds packages/*, server, nexus-tauri (skips dashboard)
pnpm -r build

# Server (TypeScript / Hono, port 9900)
cd server && npm run build # tsc → dist/
```

### Test

```bash
pnpm -r test               # test all workspace members
cd server && npm test      # Vitest unit tests (no DB)
cd server && npx vitest run path/to/file.test.ts   # single test file
cd server && npx vitest run -t "recall budget"     # single test by name
cd server && npm run test:integration             # needs DATABASE_URL (Postgres)
```

### Lint & Typecheck

```bash
pnpm -r lint               # lint all workspace members
pnpm -r typecheck          # typecheck all workspace members
npx eslint src/ --max-warnings 0   # strict lint (root packages)
prettier --write 'packages/**/*.ts'
```

### Validate (full gate)

```bash
npm run validate           # pnpm -r lint && typecheck && test && build
cd server && npm run validate   # lint + typecheck + test + integration gate + build
```

> Full `pnpm run validate` may need `npm rebuild better-sqlite3` in some shells (Node-ABI mismatch) —
> an environment issue, not a code defect. The authoritative compile gate is
> `cd server && rm -f *.tsbuildinfo && npx tsc --noEmit --incremental false` → 0 errors.

### Rust (decoupled from the TS app — see ADR-0007)

```bash
cargo build --workspace    # all Rust crates
cargo check --workspace    # fast check (no codegen)
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cd nexus-tauri/src-tauri && cargo build   # full Tauri app build
```

---

## API Reference

All endpoints return a JSON envelope: `{ "ok": true, "data": ..., "traceId": "req_xxx" }` or `{ "ok": false, "error": { "code": "...", "message": "..." }, "traceId": "req_xxx" }`.

### Public Endpoints

| Method | Path              | Description                                 |
| ------ | ----------------- | ------------------------------------------- |
| `GET`  | `/api/v1/health`  | Server health, DB status, kill switch state |
| `GET`  | `/api/v1/metrics` | Prometheus-formatted metrics                |
| `GET`  | `/api/v1/system`  | System info: version, mode, entity counts   |
| `GET`  | `/`               | Serve the browser dashboard (static files)  |

### Memories

| Method   | Path                   | Scope          | Description                       |
| -------- | ---------------------- | -------------- | --------------------------------- |
| `GET`    | `/api/v1/memories`     | `memory:read`  | List memories (cursor pagination) |
| `POST`   | `/api/v1/memories`     | `memory:write` | Create a memory                   |
| `GET`    | `/api/v1/memories/:id` | `memory:read`  | Get a single memory               |
| `PATCH`  | `/api/v1/memories/:id` | `memory:write` | Update a memory                   |
| `DELETE` | `/api/v1/memories/:id` | `memory:write` | Delete a memory                   |

**Memory types**: `episodic`, `semantic`, `preference`, `reflexion`, `fact`

### Recall

| Method | Path                          | Scope         | Description                               |
| ------ | ----------------------------- | ------------- | ----------------------------------------- |
| `GET`  | `/api/v1/recall`              | `memory:read` | Token-budgeted recall (BM25 + vector RRF) |
| `POST` | `/api/v1/recall/conversation` | `memory:read` | Conversation-aware recall                 |

### Skills

| Method   | Path                         | Scope         | Description                    |
| -------- | ---------------------------- | ------------- | ------------------------------ |
| `GET`    | `/api/v1/skills`             | `skill:read`  | List skills                    |
| `POST`   | `/api/v1/skills`             | `skill:write` | Create a skill                 |
| `GET`    | `/api/v1/skills/:id`         | `skill:read`  | Get a single skill             |
| `PATCH`  | `/api/v1/skills/:id`         | `skill:write` | Update a skill                 |
| `DELETE` | `/api/v1/skills/:id`         | `skill:write` | Delete a skill                 |
| `POST`   | `/api/v1/skills/:id/outcome` | `skill:write` | Record success/failure outcome |

### Brain

| Method | Path                               | Scope         | Description                |
| ------ | ---------------------------------- | ------------- | -------------------------- |
| `GET`  | `/api/v1/brain/export`             | `brain:admin` | Full brain export (JSON)   |
| `POST` | `/api/v1/brain/import`             | `brain:admin` | Import from JSON backup    |
| `POST` | `/api/v1/brain/compress`           | `brain:admin` | Knowledge compression pass |
| `POST` | `/api/v1/brain/embeddings/rebuild` | `brain:admin` | Regenerate all embeddings  |

### Projects

| Method | Path                        | Scope          | Description                       |
| ------ | --------------------------- | -------------- | --------------------------------- |
| `GET`  | `/api/v1/projects`          | `memory:read`  | List projects                     |
| `POST` | `/api/v1/projects/transfer` | `memory:write` | Transfer knowledge to new project |

### Sessions

| Method | Path                       | Scope          | Description                              |
| ------ | -------------------------- | -------------- | ---------------------------------------- |
| `POST` | `/api/v1/sessions/capture` | `memory:write` | Capture and distill a session transcript |

### Vault (Obsidian)

| Method | Path                       | Scope         | Description                       |
| ------ | -------------------------- | ------------- | --------------------------------- |
| `GET`  | `/api/v1/vault/notes`      | `vault:read`  | List indexed vault notes          |
| `POST` | `/api/v1/vault/sync`       | `vault:write` | Sync vault markdown → NEXUS       |
| `POST` | `/api/v1/vault/write-back` | `vault:write` | Write memory as markdown to vault |

### Audit & Ledger

| Method | Path                       | Scope        | Description                             |
| ------ | -------------------------- | ------------ | --------------------------------------- |
| `GET`  | `/api/v1/audit`            | `audit:read` | Verify audit chain integrity            |
| `GET`  | `/api/v1/ledger`           | `audit:read` | Token ledger with savings summary       |
| `GET`  | `/api/v1/audit/verify`     | `audit:read` | Advanced audit verification + auto-kill |
| `POST` | `/api/v1/audit/trajectory` | `audit:read` | Log LLM trajectory                      |
| `POST` | `/api/v1/audit/receipt`    | `audit:read` | Log tool receipt                        |

### Safety

| Method | Path                         | Scope          | Description                             |
| ------ | ---------------------------- | -------------- | --------------------------------------- |
| `GET`  | `/api/v1/safety`             | (none)         | Kill switch status, heartbeat, LLM mode |
| `POST` | `/api/v1/safety/kill-switch` | `safety:write` | Enable/disable kill switch              |
| `POST` | `/api/v1/safety/heartbeat`   | `safety:write` | Record agent heartbeat                  |

### Feedback

| Method | Path               | Scope          | Description                      |
| ------ | ------------------ | -------------- | -------------------------------- |
| `POST` | `/api/v1/feedback` | `memory:write` | Record recall relevance feedback |

### Admin

| Method   | Path                               | Scope         | Description                           |
| -------- | ---------------------------------- | ------------- | ------------------------------------- |
| `GET`    | `/api/v1/admin/keys`               | `brain:admin` | List API keys                         |
| `POST`   | `/api/v1/admin/keys`               | `brain:admin` | Create a new API key                  |
| `DELETE` | `/api/v1/admin/keys/:id`           | `brain:admin` | Revoke an API key                     |
| `GET`    | `/api/v1/health/detailed`          | `memory:read` | Extended health: pgvector, audit, SSE |
| `GET`    | `/api/v1/analytics`                | `audit:read`  | Analytics dashboard data              |
| `GET`    | `/api/v1/compiled-scripts`         | `memory:read` | List auto-compiled scripts            |
| `POST`   | `/api/v1/compiled-scripts/compile` | `brain:admin` | Trigger compilation pipeline          |

### SSE Events

| Method | Path             | Scope         | Description               |
| ------ | ---------------- | ------------- | ------------------------- |
| `GET`  | `/api/v1/events` | `memory:read` | Server-Sent Events stream |

### MCP

| Method         | Path       | Scope      | Description                     |
| -------------- | ---------- | ---------- | ------------------------------- |
| `GET` / `POST` | `/api/mcp` | (per tool) | Model Context Protocol endpoint |

---

## MCP Protocol

NEXUS 2.0 is a full **Model Context Protocol** server, compatible with any MCP client:

### MCP Tools

| Tool                       | Description                                          | Scopes         |
| -------------------------- | ---------------------------------------------------- | -------------- |
| `nexus_recall`             | Token-budgeted recall across memories, skills, notes | `memory:read`  |
| `nexus_remember`           | Store a durable memory                               | `memory:write` |
| `nexus_capture`            | Capture and distill a session transcript             | `memory:write` |
| `nexus_feedback`           | Record recall relevance feedback                     | `memory:write` |
| `nexus_audit_verify`       | Verify hash-chained audit integrity                  | `audit:read`   |
| `nexus_agents_list`        | List active agents                                   | `memory:read`  |
| `nexus_agents_spawn`       | Spawn a new agent (kernel syscall)                   | `brain:admin`  |
| `nexus_browser_navigate`   | Navigate to a URL                                    | `memory:write` |
| `nexus_browser_extract`    | Extract text from page                               | `memory:write` |
| `nexus_browser_screenshot` | Capture page screenshot                              | `memory:write` |
| `nexus_cron_create`        | Create a scheduled cron job                          | `brain:admin`  |
| `nexus_cron_list`          | List cron jobs                                       | `memory:read`  |
| `nexus_scheduler_status`   | Check scheduler status                               | `memory:read`  |
| `nexus_kill_switch`        | Emergency mutation blocking                          | `safety:write` |

### MCP Resources

| Resource URI                    | Description                 |
| ------------------------------- | --------------------------- |
| `nexus://memories/{id}`         | A specific memory by ID     |
| `nexus://memories?kind={kind}`  | Memories filtered by kind   |
| `nexus://skills/{id}`           | A specific skill by ID      |
| `nexus://skills?category={cat}` | Skills filtered by category |

### Connecting from Claude Desktop

```json
{
  "mcpServers": {
    "nexus": {
      "command": "node",
      "args": ["path/to/server/src/mcp-http.js"],
      "env": {
        "DATABASE_URL": "postgresql://postgres:pass@localhost:5432/nexus",
        "NEXUS_API_KEY": "your-operator-key"
      }
    }
  }
}
```

---

## Configuration

All configuration is via environment variables (`.env` file). Full reference:

### Server

| Variable                 | Default       | Description                      |
| ------------------------ | ------------- | -------------------------------- |
| `PORT`                   | `9900`        | HTTP server port                 |
| `NODE_ENV`               | `development` | Environment mode                 |
| `DATABASE_URL`           | _(required)_  | PostgreSQL connection string     |
| `NEXUS_DB_POOL_MAX`      | `20`          | Max database connections         |
| `NEXUS_QUERY_TIMEOUT_MS` | `15000`       | Query timeout in milliseconds    |
| `NEXUS_DASHBOARD_DIR`    | `../dist`     | Static dashboard files directory |

### Security

| Variable                      | Default                 | Description                                              |
| ----------------------------- | ----------------------- | -------------------------------------------------------- |
| `NEXUS_API_KEY`               | _(auto-generated)_      | Operator API key (leave blank → auto-generate)           |
| `NEXUS_ALLOWED_ORIGINS`       | `http://localhost:9900` | CORS allowed origins (rejects `localhost` in production) |
| `NEXUS_RATE_LIMIT_PER_MINUTE` | `120`                   | Global request rate limit                                |
| `NEXUS_MAX_BODY_BYTES`        | `5MB`                   | Maximum request body size                                |
| `NEXUS_LOG_LEVEL`             | `info`                  | Log level: debug, info, warn, error                      |
| `NEXUS_TRUST_PROXY`           | `false`                 | Trust X-Forwarded-For headers                            |

### LLM & Embeddings

| Variable                     | Default      | Description                                         |
| ---------------------------- | ------------ | --------------------------------------------------- |
| `NEXUS_LLM_BASE_URL`         | _(optional)_ | OpenAI-compatible API base URL                      |
| `NEXUS_LLM_API_KEY`          | _(optional)_ | LLM provider API key                                |
| `NEXUS_LLM_MODEL`            | _(optional)_ | Default LLM model                                   |
| `NEXUS_LLM_SIMPLE_MODEL`     | _(optional)_ | Simple task model (falls back to `NEXUS_LLM_MODEL`) |
| `NEXUS_LLM_MEDIUM_MODEL`     | _(optional)_ | Medium task model                                   |
| `NEXUS_LLM_COMPLEX_MODEL`    | _(optional)_ | Complex task model                                  |
| `NEXUS_EMBEDDING_MODEL`      | _(optional)_ | Embedding model (e.g. `text-embedding-3-small`)     |
| `NEXUS_EMBEDDING_DIM`        | `1536`       | Vector dimension for embedding columns              |
| `NEXUS_EMBEDDING_BATCH_SIZE` | `64`         | Batch size for embedding generation                 |

### Recall Tuning

| Variable                         | Default | Description                                        |
| -------------------------------- | ------- | -------------------------------------------------- |
| `NEXUS_RRF_K`                    | `60`    | RRF constant (higher = more weight on lower ranks) |
| `NEXUS_SEMANTIC_THRESHOLD`       | `0.8`   | Minimum vector similarity score                    |
| `NEXUS_RECENCY_HALFLIFE_DAYS`    | `30`    | Recency decay half-life                            |
| `NEXUS_RECALL_WEIGHT_RRF`        | `0.5`   | RRF score weight                                   |
| `NEXUS_RECALL_WEIGHT_IMPORTANCE` | `0.3`   | Importance score weight                            |
| `NEXUS_RECALL_WEIGHT_RECENCY`    | `0.1`   | Recency score weight                               |
| `NEXUS_RECALL_WEIGHT_FEEDBACK`   | `0.1`   | Feedback score weight                              |
| `NEXUS_MAX_RECALL_CORPUS`        | `10000` | Max documents in recall corpus                     |

### Worker / Scheduler

| Variable                       | Default  | Description                          |
| ------------------------------ | -------- | ------------------------------------ |
| `NEXUS_WORKER_POLL_MS`         | `2000`   | Task polling interval                |
| `NEXUS_WORKER_MAX_CONCURRENCY` | `3`      | Max concurrent tasks                 |
| `NEXUS_WORKER_TIMEOUT_MS`      | `120000` | Task timeout                         |
| `NEXUS_WORKER_MAINTENANCE_MS`  | `60000`  | Maintenance interval                 |
| `NEXUS_WORKER_STALE_TASK_MS`   | `300000` | Time before task is considered stale |
| `NEXUS_WORKER_HEARTBEAT_MS`    | `120000` | Agent heartbeat interval             |
| `NEXUS_WORKER_AUTO_KILL`       | `false`  | Auto-terminate stalled agents        |

### Sandbox

| Variable                   | Default          | Description                              |
| -------------------------- | ---------------- | ---------------------------------------- |
| `NEXUS_SANDBOX_ENABLED`    | `false`          | Enable Docker sandbox for code execution |
| `NEXUS_SANDBOX_IMAGE`      | `node:20-alpine` | Docker image for sandboxed execution     |
| `NEXUS_SANDBOX_TIMEOUT_MS` | `30000`          | Sandbox execution timeout                |

### Optional Integrations

| Variable                           | Default                  | Description                              |
| ---------------------------------- | ------------------------ | ---------------------------------------- |
| `NEXUS_OBSIDIAN_VAULT`             | _(optional)_             | Path to Obsidian vault for markdown sync |
| `NEXUS_REDIS_URL`                  | `redis://localhost:6379` | Redis URL (bus backend)                  |
| `NEXUS_BUS_BACKEND`                | `memory`                 | Bus backend: `memory` or `redis`         |
| `NEXUS_OTEL_ENDPOINT`              | _(optional)_             | OpenTelemetry collector endpoint         |
| `NEXUS_OTEL_API_KEY`               | _(optional)_             | OpenTelemetry API key                    |
| `NEXUS_BLOCKCHAIN_ENABLED`         | `false`                  | Enable blockchain anchoring              |
| `NEXUS_BLOCKCHAIN_RPC_URL`         | _(optional)_             | Ethereum RPC URL                         |
| `NEXUS_BLOCKCHAIN_CHAIN_ID`        | `1`                      | Chain ID for anchoring                   |
| `NEXUS_BLOCKCHAIN_ANCHOR_INTERVAL` | `10`                     | Anchoring interval (checkpoints)         |

---

## Deployment

### Docker

```bash
# Build and start
docker compose up -d --build

# Scale the sandbox (Docker-in-Docker)
docker compose up -d sandbox --scale sandbox=2

# View logs
docker compose logs -f nexus
```

The included `docker-compose.yml` provides:

- `nexus` — the server (port 9900)
- `postgres` — PostgreSQL 16 + pgvector (port 5432)
- `redis` — optional Redis for pub/sub bus (commented out)
- `sandbox` — Docker-in-Docker for sandboxed code execution

### PostgreSQL with pgvector

For semantic recall (vector similarity search), install the `pgvector` extension:

```sql
CREATE EXTENSION vector;
```

If pgvector is unavailable, NEXUS gracefully falls back to BM25 lexical search.

### Environment Hardening (Production)

Before deploying to production:

1. Set `NODE_ENV=production` (rejects `localhost` in `NEXUS_ALLOWED_ORIGINS`)
2. Set `NEXUS_API_KEY` explicitly (auto-generation logs to stdout — not suitable for production)
3. Configure `NEXUS_ALLOWED_ORIGINS` with your real domain(s)
4. Enable `NEXUS_TRUST_PROXY` behind a reverse proxy
5. Set up Redis for the bus backend: `NEXUS_BUS_BACKEND=redis`
6. Configure a reverse proxy (Caddy, nginx) in front of port 9900

---

## Project Structure

```
nexus-2.0/
├── src/                    # Browser Dashboard (React + Vite)
│   ├── App.tsx             # Root component
│   ├── lib/                # Core engine, API client, brain
│   ├── components/         # UI components (AgentDrawer, Console, Shell)
│   └── ...
├── server/                 # Backend Server (Hono + Node)
│   ├── src/
│   │   ├── index.ts        # Server entry, bootstrap
│   │   ├── routes.ts       # REST API definitions
│   │   ├── mcp.ts          # MCP server factory
│   │   ├── services.ts     # Domain services
│   │   ├── cli.ts          # CLI entry point
│   │   ├── setup.ts        # Schema verification
│   │   ├── lib/            # Utilities: env, logging, auth, security
│   │   ├── db/             # Schema, client, migrations
│   │   ├── services/       # Business logic modules
│   │   │   ├── recall.ts       # Token-budgeted recall with RRF
│   │   │   ├── embeddings.ts   # pgvector embedding pipeline
│   │   │   ├── sandbox.ts      # Docker/vm code execution
│   │   │   ├── brain.ts        # Export/import/compress
│   │   │   ├── kernel.ts       # Agentic OS kernel
│   │   │   ├── bus.ts          # Event bus (memory/Redis)
│   │   │   ├── audit-engine.ts # Governance & provenance
│   │   │   ├── llm-router.ts   # Multi-model routing
│   │   │   ├── browser.ts      # Playwright web automation
│   │   │   ├── vault.ts        # Obsidian vault bridge
│   │   │   ├── p2p-swarm.ts    # libp2p peer discovery
│   │   │   ├── blockchain.ts   # Merkle anchoring
│   │   │   └── ...             # 30+ service modules
│   │   └── routes/         # Domain route modules
│   ├── drizzle/            # SQL migrations
│   ├── tests/              # Test suite (Vitest)
│   └── ...
├── packages/               # Shared TS libraries (sdk, a2a-server, devtools)
├── crates/                 # Rust workspace (decoupled — docs/adr/0007)
├── nexus-tauri/            # Tauri desktop shell
├── docs/                   # Documentation (ADRs in docs/adr/)
├── dist/                   # Built dashboard (served by backend)
├── docker-compose.yml      # Full-stack Docker deployment
└── ...
```

### Key Services

| Module               | File                           | Purpose                                                     |
| -------------------- | ------------------------------ | ----------------------------------------------------------- |
| **Kernel**           | `services/kernel.ts`           | Agent lifecycle, syscalls, scheduler, saga orchestration    |
| **Recall**           | `services/recall.ts`           | RRF fusion, BM25 + vector scoring, budget packing           |
| **Embeddings**       | `services/embeddings.ts`       | OpenAI-compatible embedding via safeFetch, batch processing |
| **Sandbox**          | `services/sandbox.ts`          | Docker/vm isolated code execution, execution tracking       |
| **Audit Engine**     | `services/audit-engine.ts`     | LLM trajectories, tool receipts, auto-kill detection        |
| **Brain**            | `services/brain.ts`            | Export/import/compress, idempotent, no secrets leaked       |
| **LLM Router**       | `services/llm-router.ts`       | Tiered model routing (simple/medium/complex)                |
| **Skill Compiler**   | `services/skill-compiler.ts`   | Pattern detection → auto-generated scripts                  |
| **Browser**          | `services/browser.ts`          | Playwright navigation, extraction, screenshots              |
| **Vault**            | `services/vault.ts`            | Obsidian vault indexing, path-traversal protection          |
| **Bus**              | `services/bus.ts`              | In-memory or Redis pub/sub event bus                        |
| **Desktop Actuator** | `services/desktop-actuator.ts` | VLM-driven GUI automation                                   |

---

## Testing

```bash
cd server

# Run unit/component tests
npm test                    # vitest run

# Watch mode
npm run test:watch

# Integration tests (requires PostgreSQL)
npm run test:integration

# Full validation suite
npm run validate            # lint → typecheck → test → integration → build

# Type check only
npm run typecheck           # tsc --noEmit

# Lint
npm run lint
```

Test files live in `server/tests/` and use Vitest with a clean database per test suite.

---

## Security Model

### API Key Authentication

- Keys are **scoped** (memory:read, memory:write, skill:read, etc.)
- Hashed using **scrypt** (N=2^14, r=8, p=1, 64MB maxmem)
- Verification uses **constant-time comparison** (`crypto.timingSafeEqual`)
- Rate-limited globally (configurable via `NEXUS_RATE_LIMIT_PER_MINUTE`)
- Raw key shown only once at creation time

### Hash-Chained Audit

Every mutation is recorded in an append-only audit log:

```
entry_hash = SHA256(prev_hash + sequence + actor + action + payload)
```

- Tamper-evident: changing any entry invalidates all subsequent hashes
- Verifiable: `GET /api/v1/audit` walks the chain and reports validity
- Auto-kill: when 3+ consecutive entries fail verification, kill switch engages

### Code Sandboxing

Two execution modes:

- **Docker sandbox** — ephemeral containers with timeout, auto-removal
- **In-process sandbox** — Node.js `vm.Script` with isolated context (blocks `require`, `process`, `Buffer`, `setTimeout`, `fetch`, etc.)

### Kill Switch

Emergency mutation blocker:

- HTTP 423 Locked on all write operations
- Persisted in the database (survives restart)
- Auto-engages on audit chain corruption

---

## Roadmap

For the detailed 20-Phase / 400-Subphase Zero-Compromise Engineering Master Plan, see [docs/REDEMPTION_PLAN.md](docs/REDEMPTION_PLAN.md).

- [x] Phase 1: Repository Hygiene, Mono-Repo Workspace & Governance
- [ ] Phase 2: Strict TypeScript ESM Compilation & Zero-Warning Type Safety
- [ ] Phase 3: Zero-Trust Isolation Sandbox (Worker Thread Pool & Hardened VM)
- [ ] Phase 4: Database Mutex Serialization, WAL Concurrency & Migration Integrity
- [ ] Phase 5: Automated Testing, CI/CD Pipeline & Coverage Enforcement
- [ ] Phase 6: Native SQLite FTS5 & pgvector High-Performance Hybrid Search Engine
- [ ] Phase 7: Full Portkey Multi-Provider Gateway & Unified LLM Bridge
- [ ] Phase 8: OmniRoute Intelligent Fallback & Dynamic Routing Engine
- [ ] Phase 9: Production Rust Workspace Hardening (Safety, Tools, Observability)
- [ ] Phase 10: Native Goose Provider Framework Port & Token Streaming
- [ ] Phase 11: Agent Runtime Execution Engine & Kernel Syscall System
- [ ] Phase 12: MCP (Model Context Protocol) Registry, OAuth & Subprocess Transport
- [ ] Phase 13: Google Gemini A2A (Agent-to-Agent) Inter-Agent Protocol Server
- [ ] Phase 14: On-Chain Audit Logging & Cryptographic Merkle Root Verification
- [ ] Phase 15: Cross-Platform Native GUI Desktop Actuator (Windows/Mac/Linux/Docker)
- [ ] Phase 16: Multi-Stage Docker Containerization, Orchestration & Hardening
- [ ] Phase 17: Observability, OpenTelemetry Tracing & Prometheus Metrics Dashboard
- [ ] Phase 18: Frontend React Control Plane, Visual Pipeline Builder & Terminal
- [ ] Phase 19: Full End-to-End System Integration & Real-World Validation Suite
- [ ] Phase 20: Open-Source Release Readiness, Verification & GitHub Publishing

---

## Documentation

Additional docs are in the `docs/` directory:

| Document               | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `docs/ARCHITECTURE.md` | Deep dive: subsystem interactions and data flow |
| `docs/DEPLOYMENT.md`   | Production deployment guide                     |
| `docs/SECURITY.md`     | Threat model and security hardening             |
| `docs/MCP.md`          | MCP protocol integration guide                  |
| `docs/AGENTIC_OS.md`   | Agentic OS kernel reference                     |
| `docs/TESTING.md`      | Testing strategy and coverage                   |
| `docs/HERMES.md`       | Hermes CLI integration notes                    |

---

## License

Apache 2.0 — see LICENSE for details.

---

## Quickstart (dev)

Fast path to a running dev stack for contributors. Assumes Node >= 20 and pnpm.

### 1. Install workspace deps

```bash
pnpm install
```

### 2. Configure the backend

```bash
cp .env.example server/.env
# Edit server/.env — at minimum set DATABASE_URL:
#   postgresql://postgres:pass@localhost:5432/nexus
```

### 3. Run the backend (Hono, port 9900)

```bash
cd server
npm install
npx drizzle-kit push     # create schema in Postgres
npm run dev              # tsx watch src/index.ts
```

On first boot an **operator API key** is auto-generated and printed once to stdout. Save it.

### 4. Run the dashboard (Vite, port 5173)

```bash
# from repo root
npx vite
# open http://localhost:5173
```

The dashboard talks to the backend at `http://localhost:9900` by default; it falls back to
in-browser PGlite (offline-only) when the backend is unreachable.

### 5. Smoke-test the API

```bash
# health (no auth)
curl http://localhost:9900/api/v1/health

# store a memory
curl -X POST http://localhost:9900/api/v1/memories \
  -H "Authorization: Bearer $NEXUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind":"semantic","title":"Hello","content":"My first memory"}'

# recall
curl "http://localhost:9900/api/v1/recall?q=hello&budget=500" \
  -H "Authorization: Bearer $NEXUS_API_KEY"
```

### 6. Validate (lint → typecheck → test → integration → build)

```bash
cd server
npm run validate
```

> Note: full `pnpm run validate` may need `npm rebuild better-sqlite3` in some shells due to a
> Node-ABI mismatch; that is an environment issue, not a code defect.

See `docs/ARCHITECTURE.md` for the subsystem map, `docs/api/endpoints.md` and `docs/api/openapi.yaml`
for the API surface, and `AGENTS.md` for the 20-agent fleet governance model.
