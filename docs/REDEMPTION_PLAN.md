# AGENTIC OS V4: ZERO-COMPROMISE REDEMPTION & ENGINEERING ROADMAP

**Document Version:** 4.0.0  
**Status:** Active Master Engineering Blueprint  
**Target:** Open-Source Release on GitHub (Production Quality, Zero Faked Features, Zero Compromises)

---

## Executive Summary & Engineering Mandate

Agentic OS V4 is a universal, multi-provider AI Agent Operating System combining TypeScript control-plane services, high-performance Rust execution crates, Model Context Protocol (MCP) tool orchestration, Google Agent-to-Agent (A2A) inter-agent networking, and cross-platform desktop actuation.

This document defines the **definitive 20-Phase, 400-Subphase Master Execution Plan**. Every phase contains exactly 20 granular subphases. Any AI or human developer contributing to this codebase MUST execute this plan sequentially, enforcing strict verification at every step.

---

## 20-Phase High-Level Roadmap Overview

```
Phase 01: Repository Hygiene, Mono-Repo Workspace & Governance [DONE]
Phase 02: Strict TypeScript ESM Compilation & Zero-Warning Type Safety [DONE]
Phase 03: Zero-Trust Isolation Sandbox (Worker Thread Pool & Hardened VM) [DONE] [DONE]
Phase 04: Database Mutex Serialization, WAL Concurrency & Migration Integrity
Phase 05: Automated Testing, CI/CD Pipeline & Coverage Enforcement
Phase 06: Native SQLite FTS5 & pgvector High-Performance Hybrid Search Engine
Phase 07: Full Portkey Multi-Provider Gateway & Unified LLM Bridge
Phase 08: OmniRoute Intelligent Fallback & Dynamic Routing Engine
Phase 09: Production Rust Workspace Hardening (Safety, Tools, Observability)
Phase 10: Native Goose Provider Framework Port & Token Streaming
Phase 11: Agent Runtime Execution Engine & Kernel Syscall System
Phase 12: MCP (Model Context Protocol) Registry, OAuth & Subprocess Transport
Phase 13: Google Gemini A2A (Agent-to-Agent) Inter-Agent Protocol Server
Phase 14: On-Chain Audit Logging & Cryptographic Merkle Root Verification
Phase 15: Cross-Platform Native GUI Desktop Actuator (Windows/Mac/Linux/Docker)
Phase 16: Multi-Stage Docker Containerization, Orchestration & Hardening
Phase 17: Observability, OpenTelemetry Tracing & Prometheus Metrics Dashboard
Phase 18: Frontend React Control Plane, Visual Pipeline Builder & Terminal
Phase 19: Full End-to-End System Integration & Real-World Validation Suite
Phase 20: Open-Source Release Readiness, Verification & GitHub Publishing
```

---

## Detailed 20-Phase / 400-Subphase Specifications

### Phase 1: Repository Hygiene, Mono-Repo Workspace & Governance

_Goal: Purge all root clutter, establish standard pnpm + cargo workspace architecture, enforce git hygiene, and configure pre-commit hooks._

- [x] 1.1. Audit root directory for all legacy script files (`.py`, `.txt`, `.bak`, `.log`) and record inventory.
- [x] 1.2. Purge temporary debug scripts (`_fix_*.py`, `test.txt`, `errors.txt`, `out.txt`, `*.raw.txt`).
- [x] 1.3. Move legacy documentation and historical planning HTML files into `docs/archive/legacy-plans/` (subsequently purged for clean repo state).
- [x] 1.4. Delete backup files (`server/src/lib/env.ts.bak`, `server/tsconfig.json.bak`) across the repository.
- [x] 1.5. Configure `pnpm-workspace.yaml` with explicit real workspace paths: `server`, `nexus-tauri`, `packages/*`.
- [x] 1.6. Align root `package.json` `workspaces` array with `pnpm-workspace.yaml` structure.
- [x] 1.7. Remove root `package-lock.json` and nested npm lockfiles to maintain single source of truth (`pnpm-lock.yaml`).
- [x] 1.8. Install pnpm workspace dependencies, approve native builds (`better-sqlite3`, `esbuild`), and verify workspace symlinks.
- [x] 1.9. Remove empty `packages/vscode` directory.
- [x] 1.10. Harden `.gitignore` to cover `target/`, `dist/`, `*.db`, `*.sqlite`, `*.db-wal`, `*.db-shm`, `.claude/`, `*.exe`, `*.log`.
- [x] 1.11. Add root `.npmrc` enforcing `shamefully-hoist=true` and `strict-peer-dependencies=false`.
- [x] 1.12. Align TypeScript dependencies across root, `server/`, and `packages/*/` to `^5.8.3`.
- [x] 1.13. Standardize `.prettierrc` and `.prettierignore` at root.
- [x] 1.14. Create `.editorconfig` enforcing UTF-8, 2-space indentation, LF line endings, and trailing newlines.
- [x] 1.15. Verify Rust workspace compilation (`cargo check --workspace`).
- [x] 1.16. Add missing crates (`crates/tools`, `crates/observability`) to root `Cargo.toml` workspace members.
- [x] 1.17. Create authoritative directory structure documentation in `docs/ARCHITECTURE.md`.
- [x] 1.18. Configure `.lintstagedrc` and initialize `husky` pre-commit hooks.
- [x] 1.19. Run full workspace check (`pnpm install`, `cargo check`) and confirm zero failures.
- [x] 1.20. Git checkpoint: `chore: phase 1 — repository hygiene and workspace unification`.

---

### Phase 2: Strict TypeScript ESM Compilation & Zero-Warning Type Safety

_Goal: Eliminate all TypeScript compilation errors across the entire codebase (`tsc --noEmit`), enforce ESM `.js` import specifiers, and enable strict null checking._

- [x] 2.1. Run baseline typecheck (`pnpm run typecheck`) and output error log to benchmark total errors.
- [x] 2.2. Add missing `.js` ESM extensions to all relative imports in `server/src/index.ts`.
- [x] 2.3. Add missing `.js` ESM extensions to all relative imports in `server/src/routes.ts`.
- [x] 2.4. Add missing `.js` ESM extensions to relative imports in `server/src/services.ts`.
- [x] 2.5. Batch-update relative imports across all files in `server/src/services/*.ts` to include `.js` extensions.
- [x] 2.6. Batch-update relative imports across all files in `server/src/lib/*.ts` to include `.js` extensions.
- [x] 2.7. Batch-update relative imports across all files in `server/src/routes/*.ts` to include `.js` extensions.
- [x] 2.8. Batch-update relative imports across all files in `server/src/db/*.ts` to include `.js` extensions.
- [x] 2.9. Resolve duplicate module canonical path references (e.g. standardizing on `./db/client.js`).
- [x] 2.10. Annotate all implicit `any` callback parameters in Hono routes and middleware with explicit types.
- [x] 2.11. Align Zod schema inferred types with Drizzle database table definitions in `server/src/db/schema.ts`.
- [x] 2.12. Resolve Date object vs ISO string format mismatches across scheduler and task worker modules.
- [x] 2.13. Un-exclude active code directories from `server/tsconfig.json` to ensure 100% file typechecking.
- [x] 2.14. Add strict type definitions for third-party external integrations lacking typings.
- [x] 2.15. Fix TypeScript type errors in React frontend components (`src/pages/*.tsx`, `src/components/*.tsx`).
- [x] 2.16. Configure path aliases (`@/*`) consistently in root `tsconfig.json` and `vite.config.ts`.
- [x] 2.17. Fix compilation and build pipeline for `@agentic-os/sdk` in `packages/sdk/`.
- [x] 2.18. Fix compilation and build pipeline for `@agentic-os/devtools` in `packages/devtools/`.
- [x] 2.19. Verify `pnpm run typecheck` produces **0 errors** across all workspaces.
- [x] 2.20. Git checkpoint: `fix: phase 2 — strict esm typescript compilation zero errors`.

---

### Phase 3: Zero-Trust Isolation Sandbox (Worker Thread Pool & Hardened VM)

_Goal: Eliminate VM prototype-climbing vulnerabilities, implement worker thread isolation, freeze prototypes, and enforce strict execution quotas._

- [x] 3.1. Perform threat assessment on existing `server/src/services/sandbox.ts` to identify prototype climb vectors (`input.constructor.constructor`).
- [x] 3.2. Deprecate insecure in-process `vm.createContext` execution paths.
- [x] 3.3. Build `server/src/services/sandbox-worker.ts` utilizing Node.js `worker_threads` with isolated context.
- [x] 3.4. Implement structured JSON message-passing protocol (`postMessage` / `on('message')`) between host and sandbox worker.
- [x] 3.5. Enforce hard execution timeout handling via `worker.terminate()` when execution duration exceeds threshold.
- [x] 3.6. Enforce memory resource limits (`resourceLimits: { maxOldGenerationSizeMb: 64 }`) on spawned sandbox workers.
- [x] 3.7. Freeze global prototypes (`Object.prototype`, `Function.prototype`, `Array.prototype`) inside worker thread startup.
- [x] 3.8. Block access to dangerous primitives (`process`, `require`, `import`, `globalThis.fetch`) within sandbox scope.
- [x] 3.9. Implement AST pre-parsing using `acorn` to validate JavaScript expression syntax before execution.
- [x] 3.10. Reject code containing dangerous tokens or syntax constructs prior to worker execution.
- [x] 3.11. Implement a warm worker thread pool (default size: 4) to eliminate cold-start overhead for user script execution.
- [x] 3.12. Wire Docker container sandbox provider as primary isolated executor when `NEXUS_DOCKER_SANDBOX=true`.
- [x] 3.13. Create security regression test suite (`server/tests/sandbox-security.test.ts`) testing exploit vectors (infinite loops, memory bombs, prototype pollution).
- [x] 3.14. Assert all exploit test cases fail securely with appropriate sandbox error codes.
- [x] 3.15. Assert valid JavaScript function execution works deterministically with correct output.
- [x] 3.16. Audit and update `skill-compiler.ts` to use the hardened sandbox worker for all dynamic skill evaluations.
- [x] 3.17. Add telemetry logging for sandbox execution latency, memory consumption, and error rates.
- [x] 3.18. Update `docs/SECURITY.md` with full sandbox threat model and isolation architecture.
- [x] 3.19. Run full sandbox test suite and verify 100% pass rate.
- [x] 3.20. Git checkpoint: `security: phase 3 — zero-trust worker sandbox implementation`.

---

### Phase 4: Database Mutex Serialization, WAL Concurrency & Migration Integrity

_Goal: Resolve SQLite concurrent async transaction lock races, configure WAL journal mode, support Postgres connection pooling, and automate Drizzle migrations._

- [ ] 4.1. Audit `server/src/db/client.ts` for concurrent write race conditions under async workload.
- [ ] 4.2. Integrate `async-mutex` into `server/src/db/client.ts` to serialize write transactions for SQLite.
- [ ] 4.3. Implement `withTransaction` wrapper ensuring mutual exclusion during multi-step database writes.
- [ ] 4.4. Enable SQLite Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and busy timeout (`PRAGMA busy_timeout = 5000;`).
- [ ] 4.5. Configure `PRAGMA synchronous = NORMAL;` for optimal balance of safety and write performance.
- [ ] 4.6. Update all database transactions in `services.ts` to use the mutex-protected transaction handler.
- [ ] 4.7. Move out-of-band network calls (LLM requests, external HTTP calls) outside database transaction blocks.
- [ ] 4.8. Add transaction execution timeout safety (auto-rollback after 30 seconds).
- [ ] 4.9. Implement exponential backoff retry handler for transient `SQLITE_BUSY` errors.
- [ ] 4.10. Ensure Postgres backend client (`drizzle-orm/postgres-js`) operates smoothly when `DATABASE_URL` is set to PostgreSQL.
- [ ] 4.11. Clean up schema definitions in `server/src/db/schema.ts` to remove unused columns or orphaned tables.
- [ ] 4.12. Generate clean Drizzle migration files for SQLite (`drizzle-kit generate:sqlite`) and Postgres (`drizzle-kit generate:pg`).
- [ ] 4.13. Add auto-migration execution on server startup (`migrate(db, { migrationsFolder: './drizzle' })`).
- [ ] 4.14. Create database concurrency test suite (`server/tests/db-concurrency.test.ts`) running 50 parallel write operations.
- [ ] 4.15. Create rollback verification tests asserting partial failures correctly revert database state.
- [ ] 4.16. Implement database connection health check function (`dbHealthy()`).
- [ ] 4.17. Expose database health status in `/api/v1/health` endpoint.
- [ ] 4.18. Add automatic `CREATE EXTENSION IF NOT EXISTS vector;` initialization for Postgres deployments.
- [ ] 4.19. Update database documentation in `docs/DATABASE.md`.
- [ ] 4.20. Git checkpoint: `fix: phase 4 — database mutex serialization and migration integrity`.

---

### Phase 5: Automated Testing, CI/CD Pipeline & Coverage Enforcement

_Goal: Restore unit and integration test suites, configure mock providers, setup GitHub Actions CI matrix, and enforce test coverage thresholds._

- [ ] 5.1. Repair broken imports and missing helper references in `server/tests/security.test.ts`.
- [ ] 5.2. Implement constant-time string comparison utility `timingSafeStrEq` using `crypto.timingSafeEqual`.
- [ ] 5.3. Add unit tests for constant-time security helper functions.
- [ ] 5.4. Review and repair all existing test files in `server/tests/` to align with current API signatures.
- [ ] 5.5. Build clean database setup fixture (`server/tests/helpers/db-setup.ts`) using in-memory SQLite instances for fast testing.
- [ ] 5.6. Implement deterministic LLM provider mock helper (`server/tests/helpers/mock-llm.ts`) for offline testing.
- [ ] 5.7. Add test coverage for API key hashing, validation, and authorization middleware.
- [ ] 5.8. Add test coverage for guardrail rules (PII scrubbing, prompt injection detection).
- [ ] 5.9. Add test coverage for memory recall search and document scoring logic.
- [ ] 5.10. Add test coverage for Agent Action Registry action validation and execution.
- [ ] 5.11. Add test coverage for MCP registry server lifecycle and tool discovery.
- [ ] 5.12. Verify Vitest configuration (`server/vitest.config.ts`) and setup v8 code coverage reporting.
- [ ] 5.13. Enforce 80%+ code coverage threshold on core security, database, and agent runtime services.
- [ ] 5.14. Configure `.github/workflows/ci.yml` matrix testing across Node 20.x, Node 22.x on Ubuntu and Windows runners.
- [ ] 5.15. Add Rust workspace checking (`cargo check`, `cargo test`, `cargo clippy`) to CI workflow.
- [ ] 5.16. Add pnpm lockfile validation and dependency audit to CI workflow.
- [ ] 5.17. Configure GitHub Actions dependency caching for pnpm store and cargo build targets.
- [ ] 5.18. Run full test suite (`pnpm run test`) and confirm **100% pass rate**.
- [ ] 5.19. Document testing conventions in `docs/TESTING.md`.
- [ ] 5.20. Git checkpoint: `test: phase 5 — test suite restoration and ci pipeline configuration`.

---

### Phase 6: Native SQLite FTS5 & pgvector High-Performance Hybrid Search Engine

_Goal: Replace O(n) JavaScript array search with native SQLite FTS5 full-text indexing, pgvector similarity search, and Reciprocal Rank Fusion (RRF)._

- [ ] 6.1. Benchmark existing `recall.ts` search latency across a test corpus of 10,000 memory records.
- [ ] 6.2. Add SQLite FTS5 virtual table definition (`memories_fts`) in database migrations.
- [ ] 6.3. Add Postgres `tsvector` columns and GIN indexing for lexical text search.
- [ ] 6.4. Create database triggers to auto-update FTS indexes upon memory INSERT, UPDATE, or DELETE operations.
- [ ] 6.5. Create backfill migration script to populate FTS index for pre-existing memory records.
- [ ] 6.6. Implement database-native lexical search query runner (`SELECT rowid, rank FROM memories_fts WHERE memories_fts MATCH ?`).
- [ ] 6.7. Implement vector similarity search query runner for SQLite (blob distance) and Postgres (`<->` cosine operator).
- [ ] 6.8. Remove legacy in-memory JavaScript BM25 scoring loop.
- [ ] 6.9. Implement Reciprocal Rank Fusion (RRF) algorithm to combine lexical (FTS5) and semantic (vector) rank lists.
- [ ] 6.10. Bound maximum candidate fetch size from database queries (top-100 per retriever) to protect memory.
- [ ] 6.11. Incorporate exponential age decay scoring inside SQL query expressions.
- [ ] 6.12. Incorporate memory importance weight factors into candidate ranking.
- [ ] 6.13. Implement greedy context window packing algorithm for final memory output generation.
- [ ] 6.14. Create search benchmark test (`server/tests/recall-perf.test.ts`) asserting search response latency < 50ms.
- [ ] 6.15. Add search quality evaluation tests verifying expected document recall for standard query sets.
- [ ] 6.16. Handle search query edge cases (special characters, empty strings, SQL wildcards, Unicode).
- [ ] 6.17. Add telemetry spans for lexical search, vector search, and RRF rank fusion steps.
- [ ] 6.18. Implement LRU memory result caching layer (30-second TTL) for identical queries.
- [ ] 6.19. Verify search parity across both SQLite and Postgres database backends.
- [ ] 6.20. Git checkpoint: `perf: phase 6 — native fts5 and vector hybrid search engine`.

---

### Phase 7: Full Portkey Multi-Provider Gateway & Unified LLM Bridge

_Goal: Resolve Portkey gateway dependencies, restore TypeScript compilation, wire Portkey multi-provider routing into `llm-gateway-v2.ts`, and support 150+ LLMs._

- [ ] 7.1. Scan `server/src/services/unified-gateway/portkey/` to identify missing package dependencies.
- [ ] 7.2. Install missing runtime dependencies required by Portkey provider adapters.
- [ ] 7.3. Create explicit type declarations for Portkey configuration objects.
- [ ] 7.4. Repair TypeScript import paths and type mismatches across Portkey provider adapters.
- [ ] 7.5. Un-exclude `server/src/services/unified-gateway/**` in `server/tsconfig.json`.
- [ ] 7.6. Confirm `server/src/services/unified-gateway/portkey` compiles cleanly with zero errors.
- [ ] 7.7. Implement `server/src/services/portkey-bridge.ts` wrapping Portkey gateway initialization and request dispatching.
- [ ] 7.8. Wire Portkey bridge into `llm-gateway-v2.ts` as a primary provider backend selector.
- [ ] 7.9. Implement standard API key header mappings for OpenAI, Anthropic, Google Gemini, Groq, Mistral, and Azure.
- [ ] 7.10. Enable Portkey's memory cache middleware for duplicate prompt execution.
- [ ] 7.11. Enable Portkey's automatic retry logic with exponential backoff on HTTP 429/500 responses.
- [ ] 7.12. Ensure Server-Sent Events (SSE) token streaming operates seamlessly through Hono response pipelines.
- [ ] 7.13. Export Portkey request execution metrics to Prometheus exporter.
- [ ] 7.14. Create integration test verifying chat completion dispatch through Portkey bridge using mocked endpoints.
- [ ] 7.15. Create integration test verifying dynamic provider switching based on request configuration.
- [ ] 7.16. Implement graceful fallback to native `llm.ts` direct client if Portkey initialization fails.
- [ ] 7.17. Document Portkey setup, supported models, and API key environment variables in `docs/PORTKEY_GATEWAY.md`.
- [ ] 7.18. Prune unused or cloud-only proprietary Portkey adapter files.
- [ ] 7.19. Verify full project typecheck (`pnpm run typecheck`) succeeds.
- [ ] 7.20. Git checkpoint: `feat: phase 7 — portkey multi-provider llm gateway integration`.

---

### Phase 8: OmniRoute Intelligent Fallback & Dynamic Routing Engine

_Goal: Integrate OmniRoute smart routing, cost optimization, dynamic latency fallback chains, and content guardrails into the LLM gateway._

- [ ] 8.1. Audit `server/src/services/omniroute/` to verify dependencies and interface definitions.
- [ ] 8.2. Install or stub missing utility packages used by OmniRoute handlers.
- [ ] 8.3. Resolve TypeScript compilation errors across OmniRoute router modules.
- [ ] 8.4. Un-exclude `server/src/services/omniroute/**` in `server/tsconfig.json`.
- [ ] 8.5. Implement `server/src/services/omniroute-bridge.ts` to interface OmniRoute logic with the server.
- [ ] 8.6. Wire cost-based routing rules (`costRules.ts`) to auto-select optimal models based on prompt complexity.
- [ ] 8.7. Implement dynamic fallback chains (Primary Model -> Secondary Model -> Local Model) on provider outages.
- [ ] 8.8. Implement tag-based model routing (routing `code` tasks to Claude 3.5 Sonnet, `fast` tasks to Groq/Flash).
- [ ] 8.9. Integrate OmniRoute PII masking and prompt injection filters with `guardrails.ts`.
- [ ] 8.10. Implement provider health tracking (`modelAvailability.ts`) to temporarily skip failing API endpoints.
- [ ] 8.11. Wire OmniRoute decision engine into `llm-gateway-v2.ts` as the pre-dispatch decision layer.
- [ ] 8.12. Add diagnostic response headers (`X-Route-Provider`, `X-Route-Model`, `X-Route-Latency`) to API output.
- [ ] 8.13. Write unit tests verifying cost-based model selection logic.
- [ ] 8.14. Write unit tests verifying automatic provider fallback execution when primary endpoint throws HTTP 503.
- [ ] 8.15. Expose routing strategy selection via environment variable (`NEXUS_ROUTING_STRATEGY=cost|latency|quality`).
- [ ] 8.16. Expose API endpoint (`GET /api/v1/routing/status`) returning active provider health and routing metrics.
- [ ] 8.17. Add telemetry logging for every routing decision, including cost savings estimates.
- [ ] 8.18. Assert OmniRoute decision evaluation overhead adds < 5ms to total request processing time.
- [ ] 8.19. Run typecheck and full test suite to confirm zero regressions.
- [ ] 8.20. Git checkpoint: `feat: phase 8 — omniroute smart routing and fallback engine`.

---

### Phase 9: Production Rust Workspace Hardening (Safety, Tools, Observability)

_Goal: Implement real Rust code across `crates/safety`, `crates/tools`, `crates/observability`, clean clippy lints, and build native binaries._

- [ ] 9.1. Implement production PII scanner in `crates/safety/src/pii.rs` (email, phone, SSN, API key regexes).
- [ ] 9.2. Implement prompt injection detector in `crates/safety/src/injection.rs` using heuristic pattern matching.
- [ ] 9.3. Implement jailbreak detector in `crates/safety/src/jailbreak.rs` for adversarial prompts.
- [ ] 9.4. Implement profanity filter in `crates/safety/src/profanity.rs`.
- [ ] 9.5. Wire all safety checks into `SafetyManager::check()` in `crates/safety/src/lib.rs`.
- [ ] 9.6. Write unit tests for `agentic-os-safety` crate with 90%+ code coverage.
- [ ] 9.7. Implement tool execution traits and registry manager in `crates/tools/src/lib.rs`.
- [ ] 9.8. Build native Rust system tools (file I/O, system stats, process execution) in `crates/tools/src/builtin/`.
- [ ] 9.9. Verify `crates/tools` builds and integrates cleanly with `crates/cli`.
- [ ] 9.10. Implement structured tracing initialization in `crates/observability/src/lib.rs` using `tracing-subscriber`.
- [ ] 9.11. Implement Prometheus metrics exporter support in `crates/observability/src/metrics.rs`.
- [ ] 9.12. Wire `agentic-os-observability` into `crates/cli/src/main.rs` startup sequence.
- [ ] 9.13. Add `rustls-tls` and `native-tls` features in `crates/providers/Cargo.toml` to eliminate `unexpected_cfgs` warnings.
- [ ] 9.14. Remove dead code, unused imports, and unneeded variables across all Rust crates.
- [ ] 9.15. Run `cargo clippy --workspace --all-targets -- -D warnings` and fix all lint warnings.
- [ ] 9.16. Run `cargo fmt --all -- --check` and format all Rust source files.
- [ ] 9.17. Run `cargo test --workspace` and confirm **100% pass rate**.
- [ ] 9.18. Build release binary (`cargo build --workspace --release`).
- [ ] 9.19. Document Rust crate architecture in `docs/RUST_CRATES.md`.
- [ ] 9.20. Git checkpoint: `feat: phase 9 — production rust workspace implementation`.

---

### Phase 10: Native Goose Provider Framework Port & Token Streaming

_Goal: Port Block's Goose Rust provider infrastructure into `crates/providers`, implement streaming clients for OpenAI, Anthropic, Ollama, and expose FFI bindings._

- [ ] 10.1. Audit `crates/provider-types/src/lib.rs` to ensure full alignment with Goose provider traits.
- [ ] 10.2. Verify `agentic-os-provider-types` compiles without warnings.
- [ ] 10.3. Refactor `crates/providers/src/lib.rs` to expose concrete provider clients.
- [ ] 10.4. Implement production OpenAI client in `crates/providers/src/openai.rs` supporting function calling.
- [ ] 10.5. Implement production Anthropic client in `crates/providers/src/anthropic.rs` supporting Claude 3.5.
- [ ] 10.6. Implement production Ollama client in `crates/providers/src/ollama.rs` for local LLM inference.
- [ ] 10.7. Implement provider factory (`create_provider(name: &str)`) for dynamic Rust client instantiation.
- [ ] 10.8. Add unit tests for OpenAI Rust provider client using mocked HTTP responses.
- [ ] 10.9. Add unit tests for Anthropic Rust provider client.
- [ ] 10.10. Add unit tests for Ollama local provider client.
- [ ] 10.11. Implement exponential backoff retry policy (`retry.rs`) for transient network errors.
- [ ] 10.12. Implement SSE token stream parser (`stream.rs`) returning async token streams.
- [ ] 10.13. Implement token counter and BPE estimator in `crates/providers/src/tokens.rs`.
- [ ] 10.14. Wire Rust provider clients into `crates/cli/src/main.rs` for native CLI chat capability.
- [ ] 10.15. Expose model discovery function (`list_available_models()`) across configured provider backends.
- [ ] 10.16. Implement error mapping from raw HTTP errors to structured `ProviderError` types.
- [ ] 10.17. Create C-ABI or NAPI binding interfaces for calling Rust provider clients from Node.js runtime.
- [ ] 10.18. Run benchmark comparing Rust native provider throughput against Node.js `fetch()`.
- [ ] 10.19. Document Goose provider integration in `docs/GOOSE_PROVIDERS.md`.
- [ ] 10.20. Git checkpoint: `feat: phase 10 — goose rust provider framework port`.

---

### Phase 11: Agent Runtime Execution Engine & Kernel Syscall System

_Goal: Harden the TypeScript agent runtime, action registry, kernel syscall interface, token budgeting, DAG pipeline execution, and state persistence._

- [ ] 11.1. Audit `server/src/services/agent-runtime.ts` and document all registered agent actions.
- [ ] 11.2. Fix type errors and missing imports in `agent-runtime.ts`.
- [ ] 11.3. Enforce strict `validate -> authorize -> execute -> audit` lifecycle for all action calls.
- [ ] 11.4. Implement per-action timeout enforcement to terminate long-running or hung action handlers.
- [ ] 11.5. Implement action ring permission checks (`minRing`, `riskLevel`) before allowing action execution.
- [ ] 11.6. Audit `server/src/services/kernel.ts` kernel syscall interface for agent process management.
- [ ] 11.7. Fix cumulative token usage tracking per agent process in `kernel.ts`.
- [ ] 11.8. Implement agent auto-pause when process token consumption exceeds configured budget ceiling.
- [ ] 11.9. Audit `agent-dag.ts` and ensure DAG execution engines resolve node dependencies correctly.
- [ ] 11.10. Harden `graph-engine.ts` against cycle detection failures and orphaned graph node execution.
- [ ] 11.11. Emit agent lifecycle state transitions (`created`, `running`, `paused`, `completed`, `failed`) over SSE event bus.
- [ ] 11.12. Implement agent process state persistence in SQLite/Postgres to support server restart recovery.
- [ ] 11.13. Create integration test suite for agent process lifecycle (`create -> run -> pause -> resume -> terminate`).
- [ ] 11.14. Create integration test suite for multi-node DAG execution pipelines.
- [ ] 11.15. Create unit tests for action registry registration, schema validation, and execution.
- [ ] 11.16. Implement error recovery and exponential backoff retry strategies for transient action failures.
- [ ] 11.17. Connect emergency global kill switch to halt all active agent runtime threads instantly.
- [ ] 11.18. Clean up `task-worker.ts` to prevent process leaks or unhandled background promises.
- [ ] 11.19. Benchmark agent loop overhead under 20 concurrent active agent runtimes (< 50ms per loop iteration).
- [ ] 11.20. Git checkpoint: `feat: phase 11 — agent runtime execution engine hardening`.

---

### Phase 12: MCP (Model Context Protocol) Registry, OAuth & Subprocess Transport

_Goal: Build production-ready MCP tool registry supporting stdio, HTTP-SSE, and streamable transport, tool discovery, resource reading, and security isolation._

- [ ] 12.1. Audit `server/src/services/mcp-registry.ts` transport implementations (stdio, HTTP-SSE, WebSocket).
- [ ] 12.2. Harden stdio subprocess spawn handler (`ChildProcess`) with JSON-RPC 2.0 message boundary parsing.
- [ ] 12.3. Implement automatic `tools/list` RPC discovery upon connecting to an external MCP server.
- [ ] 12.4. Map discovered MCP tools directly into the `ActionRegistry` for seamless agent usage.
- [ ] 12.5. Implement `resources/read` and `prompts/get` RPC handlers for MCP resource integration.
- [ ] 12.6. Implement periodic ping/pong health monitoring for all active MCP server connections.
- [ ] 12.7. Implement automatic reconnect logic with backoff for disconnected MCP servers.
- [ ] 12.8. Implement idle server auto-shutdown (stop stdio process after 10 minutes of inactivity).
- [ ] 12.9. Support OAuth 2.0 authorization code flow for authenticated cloud MCP servers.
- [ ] 12.10. Implement `mcp-servers.json` configuration file loader for auto-registering servers on boot.
- [ ] 12.11. Sandbox stdio MCP subprocesses with restricted environment variables and working directory limits.
- [ ] 12.12. Write MCP integration test suite using mock stdio MCP server (`server/tests/mcp.test.ts`).
- [ ] 12.13. Add validation schema checking for tool parameters returned by MCP servers.
- [ ] 12.14. Export MCP tool execution counts, latencies, and error metrics to Prometheus.
- [ ] 12.15. Expose REST endpoints: `GET /api/v1/mcp/servers`, `POST /api/v1/mcp/servers`, `GET /api/v1/mcp/tools`.
- [ ] 12.16. Validate integration against reference MCP servers (`@modelcontextprotocol/server-filesystem`, `server-memory`).
- [ ] 12.17. Document MCP server setup, custom tool creation, and configuration in `docs/MCP.md`.
- [ ] 12.18. Ensure cross-platform path compatibility (Windows `cmd.exe` vs Linux `/bin/sh`) for stdio execution.
- [ ] 12.19. Verify `pnpm run typecheck` passes cleanly.
- [ ] 12.20. Git checkpoint: `feat: phase 12 — model context protocol integration`.

---

### Phase 13: Google Gemini CLI A2A Protocol Integration

_Goal: Extract and integrate Google's Agent-to-Agent (A2A) protocol server into `packages/a2a-server`, implement `agent.json` discovery, task creation, and inter-agent networking._

- [ ] 13.1. Extract `a2a-server` source module from `gemini-cli/packages/a2a-server/src/` into `packages/a2a-server/src/`.
- [ ] 13.2. Create clean `packages/a2a-server/package.json` with correct ESM exports and workspace references.
- [ ] 13.3. Add `packages/a2a-server` to `pnpm-workspace.yaml` and root `package.json`.
- [ ] 13.4. Resolve TypeScript compilation errors in the extracted A2A server package.
- [ ] 13.5. Expose standardized `/.well-known/agent.json` discovery endpoint per the Google A2A specification.
- [ ] 13.6. Implement task submission endpoint (`POST /api/v1/a2a/tasks`) accepting remote agent payloads.
- [ ] 13.7. Implement task status endpoint (`GET /api/v1/a2a/tasks/:id`) returning real-time progress.
- [ ] 13.8. Implement local agent discovery endpoint (`GET /api/v1/a2a/agents`) listing capabilities.
- [ ] 13.9. Implement Server-Sent Events (SSE) streaming handler for real-time task log output to calling agents.
- [ ] 13.10. Wire incoming A2A tasks to spawn local Agent Runtime process instances.
- [ ] 13.11. Implement request signature verification and bearer token auth for A2A endpoints.
- [ ] 13.12. Implement outbound A2A client allowing local agents to discover and delegate subtasks to external A2A agents.
- [ ] 13.13. Write A2A protocol integration test suite (`server/tests/a2a.test.ts`).
- [ ] 13.14. Implement error mapping and timeout handling for inter-agent network calls.
- [ ] 13.15. Log all inter-agent messages and task transfers to the audit log.
- [ ] 13.16. Completely remove vendored `gemini-cli/` source folder once `packages/a2a-server` is fully integrated.
- [ ] 13.17. Update `pnpm-workspace.yaml` to ensure clean workspace linking.
- [ ] 13.18. Document A2A inter-agent protocol integration in `docs/HERMES.md` / `docs/A2A_PROTOCOL.md`.
- [ ] 13.19. Confirm `pnpm run typecheck` and `pnpm run build` succeed across all workspace packages.
- [ ] 13.20. Git checkpoint: `feat: phase 13 — google a2a inter-agent protocol server`.

---

### Phase 14: On-Chain Audit Logging & Cryptographic Merkle Root Verification

_Goal: Build SHA-256 Merkle tree verification for audit logs, construct EVM transactions, support RPC submission, and enable tamper-evident verification._

- [ ] 14.1. Create `server/src/services/blockchain.ts` audit anchor service.
- [ ] 14.2. Implement cryptographic SHA-256 Merkle tree calculation (`computeMerkleRoot(hashes: string[])`).
- [ ] 14.3. Implement periodic audit log batch aggregation (combining last 1,000 log entries into a Merkle tree).
- [ ] 14.4. Build raw EVM transaction encoder placing the Merkle root hash into the transaction `data` field.
- [ ] 14.5. Implement JSON-RPC client (`eth_sendRawTransaction`, `eth_getTransactionReceipt`) using native fetch.
- [ ] 14.6. Create `blockchain_anchors` database table in `server/src/db/schema.ts`.
- [ ] 14.7. Generate and apply Drizzle migration for `blockchain_anchors`.
- [ ] 14.8. Wire periodic Merkle root anchoring to `scheduler.ts` background task executor.
- [ ] 14.9. Implement verification API (`GET /api/v1/audit/verify/:anchorId`) that recalculates local Merkle root and compares with on-chain data.
- [ ] 14.10. Support graceful fallback when `NEXUS_BLOCKCHAIN_RPC_URL` is omitted (log local Merkle root without sending transaction).
- [ ] 14.11. Support multi-chain RPC configuration (Ethereum, Polygon, Arbitrum, Base, local Anvil/Hardhat).
- [ ] 14.12. Implement gas price estimation and spending cap checks before transmitting transactions.
- [ ] 14.13. Create unit tests for Merkle tree generation and verification algorithms.
- [ ] 14.14. Create integration tests with mock JSON-RPC server verifying transaction submission flow.
- [ ] 14.15. Secure private key handling (read exclusively from `NEXUS_BLOCKCHAIN_PRIVATE_KEY` environment variable).
- [ ] 14.16. Add audit log tamper detection alert when computed log hashes disagree with stored Merkle roots.
- [ ] 14.17. Export blockchain anchor metrics (total anchors, gas spent, RPC failures) to Prometheus.
- [ ] 14.18. Document blockchain verification in `docs/SECURITY.md`.
- [ ] 14.19. Verify zero TypeScript errors.
- [ ] 14.20. Git checkpoint: `feat: phase 14 — on-chain audit log merkle verification`.

---

### Phase 15: Cross-Platform Native GUI Desktop Actuator (Windows/Mac/Linux/Docker)

_Goal: Implement desktop GUI actuator abstraction supporting Windows (PowerShell), macOS (AppleScript), Linux (xdotool), and headless Docker fallback._

- [ ] 15.1. Define unified `DesktopActuator` interface (`screenshot`, `moveMouse`, `click`, `type`, `scroll`, `getScreenSize`).
- [ ] 15.2. Refactor Windows actuator implementation using PowerShell and `System.Windows.Forms`.
- [ ] 15.3. Implement Linux actuator using `xdotool` and `import` (ImageMagick) CLI utilities.
- [ ] 15.4. Implement macOS actuator using `osascript` (AppleScript) and `screencapture`.
- [ ] 15.5. Implement Headless actuator returning stub responses and logging actions for headless Docker environments.
- [ ] 15.6. Implement automatic platform detection selector (`process.platform`) with fallback to Headless mode.
- [ ] 15.7. Add pre-flight system check verifying required native binary dependencies exist before execution.
- [ ] 15.8. Sanitize all shell command invocation arguments to eliminate shell injection vulnerabilities.
- [ ] 15.9. Support manual override via environment variable (`NEXUS_GUI_MODE=windows|mac|linux|headless`).
- [ ] 15.10. Wire desktop actuator to Vision Language Model (`vlm.ts`) agent execution loop for visual GUI automation.
- [ ] 15.11. Write unit tests for actuator selection logic and shell argument sanitizer.
- [ ] 15.12. Write mock integration tests asserting commands execute without error.
- [ ] 15.13. Report active actuator backend status in `/api/v1/health` API response.
- [ ] 15.14. Standardize screen capture outputs to base64 PNG format across all actuators.
- [ ] 15.15. Support bounding-box crop regions for targeted screen capture operations.
- [ ] 15.16. Add rate limiting (max 10 input events per second) to prevent runaway mouse/keyboard actions.
- [ ] 15.17. Document actuator prerequisites and OS permissions in `docs/CONTROL_PLANE_UX_SPEC.md`.
- [ ] 15.18. Verify `pnpm run typecheck` passes cleanly.
- [ ] 15.19. All unit tests pass.
- [ ] 15.20. Git checkpoint: `feat: phase 15 — cross-platform desktop gui actuator`.

---

### Phase 16: Multi-Stage Docker Containerization, Orchestration & Hardening

_Goal: Build hardened, multi-stage production Docker images for server and frontend, configure docker-compose orchestration, and enforce non-root execution._

- [ ] 16.1. Audit root `Dockerfile` and `docker-compose.yml`.
- [ ] 16.2. Build multi-stage production `Dockerfile` for backend server (build stage -> lightweight Node 20 alpine runtime stage).
- [ ] 16.3. Build multi-stage production `Dockerfile.frontend` building Vite SPA and serving via Nginx alpine.
- [ ] 16.4. Configure root `docker-compose.yml` orchestrating PostgreSQL, Redis, Server, and Frontend containers.
- [ ] 16.5. Configure Nginx reverse proxy routing `/api/*` to backend server and static assets to frontend.
- [ ] 16.6. Update `.env.example` with full documentation for every production environment variable.
- [ ] 16.7. Configure persistent named Docker volumes for Postgres data, Redis data, and SQLite backups.
- [ ] 16.8. Add container healthchecks (`curl -f http://localhost:9900/api/v1/health`) for all services in docker-compose.
- [ ] 16.9. Enforce CPU and memory resource constraints on container services in docker-compose.
- [ ] 16.10. Configure non-root user execution (`USER node`) in backend Dockerfile for container hardening.
- [ ] 16.11. Implement graceful SIGTERM handling in server startup (`index.ts`) draining connections before exit.
- [ ] 16.12. Build `docker-compose.dev.yml` supporting local hot-reloading and source volume mounting.
- [ ] 16.13. Build standalone single-container Dockerfile operating in lightweight SQLite-only mode.
- [ ] 16.14. Implement environment validation on server startup logging clear error messages if required vars are missing.
- [ ] 16.15. Add auto-migration execution to container startup entrypoint script.
- [ ] 16.16. Test clean container stack deployment (`docker compose up --build -d`).
- [ ] 16.17. Verify `/api/v1/health` returns HTTP 200 OK from running container stack.
- [ ] 16.18. Document container deployment workflows in `docs/DEPLOYMENT.md`.
- [ ] 16.19. Verify full clean checkout builds and launches via Docker without errors.
- [ ] 16.20. Git checkpoint: `ops: phase 16 — docker containerization and compose orchestration`.

---

### Phase 17: Observability, OpenTelemetry Tracing & Prometheus Metrics Dashboard

_Goal: Integrate OpenTelemetry distributed tracing, Prometheus metrics export, structured JSON logging, and system health dashboards._

- [ ] 17.1. Audit `server/src/lib/logging.ts` and `server/src/services/tracing.ts`.
- [ ] 17.2. Configure OpenTelemetry Node SDK exporting traces to OTLP gRPC/HTTP collector endpoints.
- [ ] 17.3. Instrument Hono HTTP route handlers with auto-generated OTEL trace spans.
- [ ] 17.4. Instrument database queries (Drizzle/SQLite/Postgres) with DB trace spans.
- [ ] 17.5. Instrument LLM API dispatches with model name, prompt tokens, completion tokens, and latency attributes.
- [ ] 17.6. Setup Prometheus metric registry (`prom-client`) in `server/src/lib/metrics.ts`.
- [ ] 17.7. Implement standard HTTP request duration histogram and error counter metrics.
- [ ] 17.8. Implement active agent process count gauge and token consumption counter metrics.
- [ ] 17.9. Implement LLM cost tracking metrics partitioned by provider and model.
- [ ] 17.10. Expose `/metrics` Prometheus scraping endpoint (protected by bearer token in production).
- [ ] 17.11. Standardize all server console output to structured JSON format in production mode (`NODE_ENV=production`).
- [ ] 17.12. Include trace ID and span ID in all log outputs for distributed log correlation.
- [ ] 17.13. Create Grafana dashboard JSON specification (`docs/grafana-dashboard.json`) for system monitoring.
- [ ] 17.14. Write unit tests for metric collection counters and histograms.
- [ ] 17.15. Write unit tests for OTEL trace span creation utilities.
- [ ] 17.16. Verify metrics endpoint returns valid Prometheus text format under test load.
- [ ] 17.17. Document telemetry setup and Grafana configuration in `docs/DEPLOYMENT.md`.
- [ ] 17.18. Verify zero performance impact (< 2ms) from telemetry instrumentation.
- [ ] 17.19. Confirm `pnpm run typecheck` passes cleanly.
- [ ] 17.20. Git checkpoint: `feat: phase 17 — opentelemetry tracing and prometheus metrics`.

---

### Phase 18: Frontend React Control Plane, Visual Pipeline Builder & Terminal

_Goal: Refactor Vite + React frontend, implement visual Agent DAG pipeline builder, integrated terminal emulator, real-time SSE stream display, and theme support._

- [ ] 18.1. Audit `src/App.tsx` and `src/pages/*.tsx` for UI component organization and state handling.
- [ ] 18.2. Clean up outdated UI components and standardize design system tokens in `src/index.css`.
- [ ] 18.3. Implement responsive navigation sidebar allowing seamless switching between Dashboard, Agents, Pipelines, Memory, and Settings.
- [ ] 18.4. Build real-time Agent Status Dashboard displaying active agent processes, token usage, and execution logs.
- [ ] 18.5. Build visual Agent DAG Pipeline Builder using React Flow / HTML5 canvas for connecting agent node workflows.
- [ ] 18.6. Connect pipeline builder UI to save/load pipeline definitions via `/api/v1/pipelines` REST API.
- [ ] 18.7. Implement integrated web terminal emulator (`xterm.js`) connecting to server web socket / SSE stream for CLI interaction.
- [ ] 18.8. Implement real-time SSE event stream hook (`useSSE`) updating UI state instantly on agent actions.
- [ ] 18.9. Build Memory Recall explorer UI allowing developers to search, inspect, and manage stored memory embeddings.
- [ ] 18.10. Build MCP Server management UI for adding, toggling, and inspecting registered MCP tools.
- [ ] 18.11. Build LLM Provider & Route Configurator UI for adjusting OmniRoute strategies and API keys visually.
- [ ] 18.12. Implement dark/light theme switcher with custom CSS variables and glassmorphism styling.
- [ ] 18.13. Add responsive layout support for mobile, tablet, and desktop display viewports.
- [ ] 18.14. Add error boundary components preventing full UI crashes on unhandled react rendering errors.
- [ ] 18.15. Optimize bundle size via Vite code-splitting and dynamic component imports.
- [ ] 18.16. Verify frontend production build (`pnpm run build`) generates clean static distribution in `dist/`.
- [ ] 18.17. Write component unit tests using React Testing Library and Vitest.
- [ ] 18.18. Document frontend UI architecture in `docs/CONTROL_PLANE_UX_SPEC.md`.
- [ ] 18.19. Confirm zero console errors or warnings in browser devtools during navigation.
- [ ] 18.20. Git checkpoint: `feat: phase 18 — react control plane and visual pipeline builder`.

---

### Phase 19: Full End-to-End System Integration & Real-World Validation Suite

_Goal: Execute comprehensive end-to-end integration test scenarios validating multi-agent delegation, MCP tool execution, memory recall, and failure recovery._

- [ ] 19.1. Create E2E test suite directory (`server/tests/e2e/`).
- [ ] 19.2. Implement E2E Test Scenario 1: Agent creation -> Goal setting -> LLM execution -> Memory storage -> Memory recall verification.
- [ ] 19.3. Implement E2E Test Scenario 2: Agent DAG pipeline execution -> Multi-step node data passing -> Final result output.
- [ ] 19.4. Implement E2E Test Scenario 3: MCP Tool registration -> Discovery -> Agent tool call invocation -> Result return.
- [ ] 19.5. Implement E2E Test Scenario 4: OmniRoute provider failure -> Automatic model fallback -> Successful request completion.
- [ ] 19.6. Implement E2E Test Scenario 5: Google A2A inter-agent task delegation -> Remote agent execution -> Task result retrieval.
- [ ] 19.7. Implement E2E Test Scenario 6: Sandbox exploit attempt -> Worker thread termination -> Safe error report logging.
- [ ] 19.8. Implement E2E Test Scenario 7: Heavy concurrent request load (100 parallel calls) -> Mutex serialization -> Zero database corruption.
- [ ] 19.9. Implement E2E Test Scenario 8: Audit log batch generation -> Merkle tree computation -> Cryptographic hash verification.
- [ ] 19.10. Implement E2E Test Scenario 9: Desktop GUI actuator screenshot and click event execution in Headless mode.
- [ ] 19.11. Implement E2E Test Scenario 10: Server crash -> Startup auto-recovery -> Agent state restoration from database.
- [ ] 19.12. Run full E2E validation suite against SQLite database backend.
- [ ] 19.13. Run full E2E validation suite against PostgreSQL database backend.
- [ ] 19.14. Measure total end-to-end system latency and resource consumption under full test workload.
- [ ] 19.15. Fix any race conditions, memory leaks, or unhandled promise rejections discovered during E2E testing.
- [ ] 19.16. Assert 100% pass rate across all E2E scenarios.
- [ ] 19.17. Generate consolidated test coverage report verifying > 80% coverage across all workspace packages.
- [ ] 19.18. Document E2E test scenarios and execution commands in `docs/TESTING.md`.
- [ ] 19.19. Confirm zero typescript, lint, or test failures workspace-wide.
- [ ] 19.20. Git checkpoint: `test: phase 19 — full end-to-end system integration and validation`.

---

### Phase 20: Open-Source Release Readiness, Verification & GitHub Publishing

_Goal: Finalize repository documentation, license headers, release notes, security policies, and push a flawless, production-ready release to GitHub._

- [ ] 20.1. Review and refine root `README.md` to ensure professional formatting, architecture diagrams, and quickstart commands.
- [ ] 20.2. Verify `LICENSE` file is valid Apache 2.0 license.
- [ ] 20.3. Update `CODE_OF_CONDUCT.md` with standard Contributor Covenant v2.1.
- [ ] 20.4. Update `CONTRIBUTING.md` with detailed pull request guidelines, code style rules, and commit message standards.
- [ ] 20.5. Update `SECURITY.md` with vulnerability disclosure instructions and security architecture overview.
- [ ] 20.6. Create clean `CHANGELOG.md` documenting V4.0.0 release features.
- [ ] 20.7. Audit repository for any accidentally committed API keys, secrets, or local environment paths.
- [ ] 20.8. Audit repository for any temporary, backup, or unneeded files (`git status` must show completely clean working tree).
- [ ] 20.9. Verify all internal code comments maintain clean, professional, and accurate technical documentation.
- [ ] 20.10. Run `pnpm run validate` (typecheck + lint + test + build) and verify 100% success.
- [ ] 20.11. Run `cargo check --workspace`, `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`.
- [ ] 20.12. Test fresh git clone execution flow on clean environment (`git clone` -> `pnpm install` -> `pnpm run dev`).
- [ ] 20.13. Tag release version (`git tag -a v4.0.0 -m "Agentic OS V4.0.0 Production Release"`).
- [ ] 20.14. Generate GitHub release notes summary.
- [ ] 20.15. Verify GitHub Actions CI workflow runs cleanly on pushed branch.
- [ ] 20.16. Create launch announcement documentation in `docs/RELEASE_NOTES_V4.md`.
- [ ] 20.17. Conduct final security and license compliance sign-off.
- [ ] 20.18. Perform final repository verification check.
- [ ] 20.19. Push finalized codebase to GitHub main branch (`git push origin main --tags`).
- [ ] 20.20. Git checkpoint: `release: phase 20 — agentic os v4.0.0 open-source release`.

---

## Contributor & AI Agent Execution Verification Checklist

When executing tasks within this plan, every contributor or automated AI coding agent MUST verify:

1. **Sequential Order:** Do not skip phases or subphases out of sequence.
2. **Zero Compromises:** No `any` type overrides, no `@ts-ignore` comments, no disabled lint rules without explicit justification.
3. **Commit discipline:** Commit after completing every phase using the exact specified commit message format.
4. **Verification Requirement:** Run `pnpm run validate` before declaring any phase complete.
