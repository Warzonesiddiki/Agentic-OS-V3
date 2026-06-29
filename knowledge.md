# NEXUS 2.0 — Agentic OS & Second Brain
# FreeBuff Knowledge File — READ THIS FIRST ON EVERY SESSION

## What This Project Is
NEXUS 2.0 is a persistent memory, recall, skills, governance, and coordination layer
for AI agents. It acts as an operating system for AI — sitting between agents
(Claude Code, Codex, Cursor, Gemini CLI, custom agents) and the work they do,
making them smarter automatically across sessions, tools, and vendors.

## Dual-App Architecture (CRITICAL — NEVER VIOLATE)
This repo contains TWO completely independent applications:

### APP 1 — Browser Dashboard
- Root: src/
- Stack: React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, motion
- Database: PGlite (PostgreSQL WASM, runs IN the browser, data in IndexedDB)
- Entry: src/main.tsx → src/App.tsx
- State: src/store.ts (useSyncExternalStore + localStorage), src/osStore.ts
- Remote bridge: src/lib/remote.ts (optional typed HTTP client to backend)
- SSE client: src/lib/sse-client.ts
- NO server required — runs fully offline

### APP 2 — Backend Server
- Root: server/src/
- Stack: Node.js >=20, Hono 4, TypeScript, Drizzle ORM 0.36
- Database: PostgreSQL 17 + pgvector 0.8 (19 tables)
- Port: 9900
- Entry: server/src/index.ts → server/src/app.ts
- Routes: server/src/routes.ts (~50 endpoints)
- MCP: server/src/mcp.ts (16 tools, resources, prompts)

### Shared
- shared/types.ts — TypeScript types ONLY. Zero shared runtime code.

## Tech Stack Quick Reference
- HTTP Framework: Hono 4
- ORM: Drizzle ORM 0.36 / Drizzle Kit 0.28
- Validation: Zod (everywhere — all inputs, all env vars, all schemas)
- Auth: scrypt KDF (N=2^14, r=8, p=1), crypto.timingSafeEqual, 9 scoped API key levels
- Embeddings: OpenAI-compatible API via safeFetch, BM25 lexical fallback
- Search: RRF fusion (BM25 + pgvector cosine, k=60) → importance(0.3) + recency(0.1) + feedback(0.1)
- MCP Protocol: @modelcontextprotocol/sdk 1.0 (Streamable HTTP)
- Testing: Vitest 2.x
- Observability: OpenTelemetry (OTLP HTTP), Prometheus metrics
- Message Bus: In-memory default, Redis (ioredis) via NEXUS_BUS_BACKEND
- Blockchain: viem (Ethereum-compatible Merkle root anchoring)
- P2P: libp2p (gossipsub, noise, mplex, TCP)
- Browser Automation: Playwright
- Desktop Automation: VLM-driven (screenshot → coordinate action)
- Sandboxing: Docker ephemeral containers (primary), Node.js vm.Script (fallback)

## 19 Database Tables
memories, skills, projects, notes, audit_log, merkle_checkpoints,
anchored_roots, token_ledger, feedback, system_meta, api_keys,
trajectory_logs, tool_receipts, agents, agent_tasks, cron_jobs,
sandbox_executions, state_snapshots, compiled_scripts

## Memory Types
episodic | semantic | preference | reflexion | fact
Each has: confidence, evidence[], decay, stability, contradiction state

## Audit Chain Law (NEVER BREAK)
entry_hash = SHA256(prev_hash + sequence + actor + action + payload)
Auto-kill switch engages when 3+ consecutive entries fail verification.
Kill switch = HTTP 423, persists across restarts.

## Session Capture Invariant (NEVER BREAK)
Raw transcript MUST always be preserved on distillation failure.
Never lose data. Always write raw first, then attempt distillation.

## Token Budget Law (NEVER BREAK)
Recall results MUST be greedily packed and NEVER exceed the caller-specified token budget.

## Security Rules (NEVER SKIP)
- ALL outbound HTTP must go through safeFetch (SSRF protection)
- ALL path operations must validate against path-traversal attacks
- ALL secrets must go through secret detection guard
- ALL auth uses crypto.timingSafeEqual (no string comparison)
- ALL inputs validated with Zod schemas
- ALL rate limiting enforced before auth backstop

## Current Critical Status
⚠️  SERVER CODE HAS NEVER BEEN COMPILED — this is priority #1
⚠️  Frontend and backend are NOT connected — remote.ts client not wired up
⚠️  No real LLM integration yet — distillation is heuristic only
⚠️  Redis bus, IBC cross-chain, WASM plugin runtime — not yet implemented

## Priority Queue (Work in This Order)
Q0 — SAFETY: audit chain integrity, kill switch, sandbox security
Q1 — CORRECTNESS: server compilation, type errors, broken imports
Q2 — CONNECTIVITY: frontend ↔ backend wiring via remote.ts
Q3 — FEATURES: real LLM routing, Redis bus, performance
Q4 — SELF-IMPROVEMENT: skill compiler patterns, auto-compilation

## Key File Map (Memorize This)
server/src/services/recall.ts      → RRF fusion, BM25 + vector, budget packing
server/src/services/kernel.ts      → Agent lifecycle, syscalls, scheduler, saga
server/src/services/embeddings.ts  → OpenAI-compatible embedding pipeline
server/src/services/sandbox.ts     → Docker/vm isolated execution
server/src/services/audit-engine.ts → LLM trajectories, tool receipts, auto-kill
server/src/services/brain.ts       → Export/import/compress (no secrets leaked)
server/src/services/llm-router.ts  → Tiered model routing
server/src/services/skill-compiler.ts → Pattern detection → auto-scripts
server/src/services/browser.ts     → Playwright automation
server/src/services/vault.ts       → Obsidian vault bridge
server/src/services/bus.ts         → In-memory or Redis pub/sub
server/src/lib/audit.ts            → SHA-256 hash chain (advisory-locked)
server/src/lib/guards.ts           → SSRF, path-traversal, secret detection
server/src/lib/security.ts         → scrypt hashing, key gen, scopes
server/src/routes.ts               → ~50 REST endpoints
server/src/mcp.ts                  → 16 MCP tools + resources + prompts
src/lib/recall.ts                  → Browser BM25 recall
src/lib/engine.ts                  → Browser brain state + audit
src/lib/operations.ts              → Browser memory/skill CRUD
src/lib/remote.ts                  → Backend HTTP client (needs wiring)
shared/types.ts                    → All shared TypeScript types

## Coding Standards
- TypeScript strict mode — no `any`, no `as unknown as X` hacks
- Every function has explicit return types
- Every async function handles rejection (try/catch or .catch())
- All DB operations use Drizzle ORM — no raw SQL unless pgvector requires it
- All Zod schemas live in server/src/lib/schemas.ts
- All env variables go through server/src/lib/env.ts (Zod-validated)
- All errors use structured types from server/src/lib/errors.ts
- All logs use server/src/lib/logging.ts — no console.log in production paths
- API responses always use: { ok: true, data: ..., traceId: "req_xxx" }
- Error responses: { ok: false, error: { code, message }, traceId: "req_xxx" }