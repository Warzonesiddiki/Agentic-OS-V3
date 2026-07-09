# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build / test / lint

```bash
# ── Browser dashboard (Vite + React, root vite.config.ts) ──
npx vite build                   # build dashboard to dist/ (served by server at NEXUS_DASHBOARD_DIR)
npx vite                         # dev server (http://localhost:5173)
pnpm -r build                    # build ALL workspace members (packages/*, server, nexus-tauri) — skip the dashboard

# ── Server (TypeScript / Hono) ──
cd server && npm run build       # tsc compile to dist/
cd server && npm run dev         # tsx watch src/index.ts
cd server && npm start           # node dist/index.js

# ── Rust crates (standalone CLI layer) ──
cargo build --workspace
cargo check --workspace
cargo clippy --all-targets -- -D warnings

# ── Tests ──
cargo test --workspace                       # Rust unit tests
cd server && npm test                        # Vitest unit tests (no DB)
cd server && npx vitest run path/to/file.test.ts   # single test file
cd server && npx vitest run -t "recall budget"     # single test by name
cd server && npm run test:integration         # needs DATABASE_URL (Postgres)

# ── Full validation ──
cd server && npm run validate    # lint + typecheck + test + integration + build
```

## Architecture overview

This repo has **two independent deliverables** plus a **Rust CLI layer**:

### 1. Browser Dashboard (`src/`)

React 19 + Vite 7 SPA. The UI layer for the agentic OS. Tailwind CSS v4, React Router.

### 2. Backend Server (`server/`)

Hono-based HTTP server on port 9900. The core brain — 30+ service modules:

- **Recall pipeline** — The central retrieval system: BM25 lexical search + pgvector cosine similarity → RRF fusion (k=60) → importance/recency/feedback weighting → budget-packed results. Services: `recall`, `federated-recall`, `embeddings`, `pgvector`.
- **Kernel services** — Ring-model execution (Ring 0 kernel → Ring 3 user), saga orchestration with compensation, IPC message bus (memory/Redis), virtual filesystem, approval gates, daemon supervisor, timer/scheduler.
- **Memory system** — 30+ PostgreSQL tables (memories, notes, skills, projects, audit log, agents/tasks, scheduler, telemetry spans, …). Drizzle ORM with schema in `server/src/db/schema.ts`. The server supports a **dual DB backend**: Postgres (`client-postgres.ts`) for production and SQLite (`client-sqlite.ts`) for local/dev; `client.ts` selects between them.
- **MCP protocol** — Full Model Context Protocol server with 14 tools and 4 resource URI patterns. MCP registry in `server/src/services/mcp-registry.ts`.
- **Security** — Scoped API keys (9 scopes), scrypt hashing, constant-time auth, hash-chained audit (SHA-256 append-only), HTTP 423 kill switch, rate limiting.
- **Observability** — OpenTelemetry-compatible tracing/metrics, telemetry spans stored in PostgreSQL.

### 3. Rust Crates (`crates/`, `Cargo.toml`)

Standalone CLI/tooling layer — **NOT integrated** with the TypeScript server (no FFI, no napi-rs bridge). Cargo workspace of 9 crates: `core`, `config`, `installer`, `safety`, `cli`, `provider-types`, `providers`, `tools`, `observability`.

## Project conventions

- **TypeScript strict mode** — `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`. No `any`.
- **Async/await** over raw promises. Rust uses `tokio` runtime with bounded `mpsc` channels.
- **Error handling** — Rust: `thiserror` + `AgenticError` enum, never `Box<dyn Error>`. TS: use `server/src/lib/errors.ts`.
- **Structured logging** — Rust: `tracing` with context fields. TS: `server/src/lib/logging.ts`.
- **Config** — TOML-first for Rust, validated via JSON Schema from Rust types. Server uses `.env` with `.env.example` as template.
- **Naming** — camelCase in TS/JS, snake_case in Rust. File names match the primary export.
- **Formatting** — 2-space indent, LF endings, single quotes, trailing commas. Enforced by `.editorconfig` + `.prettierrc` + lint-staged.
- **Core types in Rust** — defined in `crates/core/src/types/`, auto-generate TS bindings via `ts-rs`. No duplicate type definitions.
- **ACP (Agent Client Protocol)** — internal service-to-service communication. External APIs via REST/MCP/SSE.
- **Workspace packages** — `packages/sdk`, `packages/a2a-server`, `packages/devtools` are consumed by the server and the dashboard. The server resolves them via tsconfig `paths` aliases (`@agentic-os/sdk`, `@agentic-os/a2a-server`, `@agentic-os/devtools`); the dashboard resolves `@agentic-os/sdk` the same way. Each package builds with `tsc` and tests with `vitest run`. Do not edit compiled output in `dist/` — edit source under `packages/*/src`.

## Key environment variables

| Variable              | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL 17 + pgvector 0.8 connection string |
| `NEXUS_API_KEY`       | API authentication                             |
| `NEXUS_LLM_PROVIDER`  | LLM backend (Anthropic, OpenAI, etc.)          |
| `NEXUS_LLM_API_KEY`   | LLM provider API key                           |
| `NEXUS_RECALL_BUDGET` | Recall budget pack size                        |
| `NEXUS_RRF_K`         | RRF fusion constant (default 60)               |

## Things to avoid

- **`gemini-cli/`** — vendored source reference, NOT part of the active workspace. Don't modify.
- **SQLite artifacts** — `agentic-os.db`, `*.db-wal`, `*.db-shm` are local runtime data. Never commit.
- **`.env` files** — never commit secrets. Only `.env.example` should be tracked.
- **Build artifacts** — `dist/`, `coverage/`, `*.tsbuildinfo`, `node_modules/`, `server/node_modules/`, `server/dist/` are all gitignored.
- **Rust build cache** — `nexus-tauri/src-tauri/target/` is multi-GB. Don't commit or back up.
- **No blocking in async** — All I/O must be async. CPU-heavy work uses `spawn_blocking` in Rust.
- **No dead code** — Deprecate over 2 releases before removal. Feature flags must have removal deadlines.
- **Manual DB edits** — Don't edit `agentic-os.db` or `server/data/app.sqlite` by hand. Use Drizzle migrations in `server/drizzle/` or the app's API.
- **Integration tests need Postgres** — `DATABASE_URL` must be set. They fail loudly if unreachable.
