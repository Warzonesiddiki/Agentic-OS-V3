# AGENTS.md

This file provides guidance to various AI agents when working with code in this repository.

> **NEXUS 2.0 / Agentic OS V3** — a persistent memory, recall, skills, governance, and coordination layer for AI agents (a "Universal AI Agent Operating System"). A pnpm monorepo spanning a React dashboard, a Hono/TypeScript backend, shared TS packages, a Rust provider workspace, and a Tauri desktop shell.
>
> **Operating model (read this first):** This repository is built and maintained by a **fleet of 20 all-rounder agents**, each owning an **exclusive, non-overlapping file namespace**, running in a **nonstop improvement loop** with zero-compromise perfection. The fleet contract is defined in **[Multi-Agent Operating Model](#multi-agent-operating-model-fleet-of-20)** below and is the source of truth for ownership. Companion docs: `docs/TEAM_OWNERSHIP_GOVERNANCE.md` (9-agent predecessor), `docs/RUNTIME_LOOP_REFERENCE.md` (kernel loop), `docs/AGENT_DEV_GUIDE.md` + `docs/PERSONA_REGISTRY.md` (persona contract).

## Build / test / lint

```bash
# ── Browser dashboard (Vite + React, root src/) ──
npm run dev                # vite dev server (http://localhost:5173)
npx vite build             # build dashboard to dist/ (served by server at NEXUS_DASHBOARD_DIR)

# ── Root workspace (pnpm) ──
pnpm -r build              # build all workspace members (packages/*, server, nexus-tauri) — skips the dashboard
pnpm -r test               # test all workspace members
pnpm -r lint               # lint all workspace members
pnpm -r typecheck          # typecheck all workspace members
npm run validate           # pnpm -r lint && typecheck && test && build
npm run validate:server    # cd server && npm run validate

# ── Server (TypeScript / Hono, port 9900) ──
cd server && npm run build         # tsc compile to dist/
cd server && npm run dev           # tsx watch src/index.ts
cd server && npm start             # node dist/index.js
cd server && npm test              # Vitest unit tests (no DB)
cd server && npx vitest run path/to/file.test.ts   # single test file
cd server && npx vitest run -t "recall budget"      # single test by name
cd server && npm run test:integration   # needs DATABASE_URL (Postgres)
cd server && npm run validate      # lint + typecheck + test + integration gate + build

# ── Rust crates (crates/) ──
cargo build --workspace    # all Rust crates
cargo check --workspace    # fast check (no codegen)
cargo clippy --all-targets -- -D warnings   # lint
cargo test --workspace     # Rust unit tests

# ── Rust desktop (Tauri) ──
cd nexus-tauri/src-tauri && cargo build   # full Tauri app build

# ── Lint / format (root) ──
cd server && npm run lint     # ESLint (server)
prettier --write 'packages/**/*.ts'   # format TS
npx eslint src/ --max-warnings 0       # strict lint (root packages)
# git commit triggers lint-staged (prettier + eslint) via husky
```

## High-Level Architecture

This is a **pnpm workspace monorepo** (`package.json` workspaces: `packages/*`, `server`, `nexus-tauri`). Five top-level areas:

- **`src/` — Browser Dashboard.** React + Vite SPA (root `src/`). The user-facing control plane: agent tree, console, event ticker, pipeline builder, kernel/scheduler views, settings. State lives in `src/store.ts` + `src/osStore.ts` (zustand/jotai/react-query). Built to `dist/` and served statically by the server.
- **`server/` — Backend (Hono/TypeScript, port 9900).** The core brain. `src/index.ts` boots the app; `src/routes.ts` + `src/routes/*.ts` define REST; `src/mcp.ts` + `src/mcp-http.ts` expose the MCP server; `src/services/*.ts` hold ~190 business modules. Storage is Drizzle ORM over a **dual backend**: `db/client-postgres.ts` (production Postgres + pgvector) and `db/client-sqlite.ts` (local/dev), selected by `db/client.ts`. Schema defined in `db/schema.ts` (Postgres) and `db/schema-sqlite.ts`.
- **`packages/` — Shared TS libraries** (`sdk`, `a2a-server`, `devtools`), consumed by server and dashboard via tsconfig `paths` aliases (`@agentic-os/sdk`, `@agentic-os/a2a-server`, `@agentic-os/devtools`). Build with `tsc`, test with `vitest run`. Edit source under `packages/*/src`, never the `dist/` output.
- **`crates/` — Rust workspace** (`Cargo.toml`, 10 members + standalone `nexus-cli`). LLM provider implementations, canonical types, config, tools, safety filters, installer, observability, CLI. **Decoupled from the running TS app** — see Cross-language boundary below.
- **`nexus-tauri/` — Tauri desktop app** (workspace member). Rust in `src-tauri/` (`lib.rs`, `main.rs`, `build.rs`), UI in `src/` (`App.tsx`, `vite.config.ts`).
- **`docs/` — Architecture/ADRs (`docs/adr/0001`–`docs/adr/0030`, indexed in `docs/adr/README.md`), plan/phase tracking (`docs/PLAN_TRACKER.md`), governance (`docs/TEAM_OWNERSHIP_GOVERNANCE.md`, `docs/RUNTIME_LOOP_REFERENCE.md`, `docs/AGENT_DEV_GUIDE.md`, `docs/PERSONA_REGISTRY.md`), the operating standard (`docs/AUTONOMOUS_OPERATIONS_MANUAL_v4.0.0.md` — ML-001/002/003 meta-loops, kill-switch, hash-chained audit, perfection metrics), and the live perfection dashboard (`docs/PERFECTION_METRICS.md`).**

### Key server subsystems

- **Recall pipeline** — central retrieval: BM25 lexical + pgvector cosine → RRF fusion (k=60) → importance/recency/feedback weighting → budget-packed results. `recall.ts`, `federated-recall.ts`, `embeddings.ts`.
- **Kernel** — ring-model execution (Ring 0 → Ring 3), saga orchestration w/ compensation, IPC message bus (`message-bus.ts`, `sse-bus.ts`), virtual filesystem, approval gates, daemon supervisor, timer/scheduler. `kernel.ts`, `kernel-panic.ts`, `kernel-persistence.ts`, `kernel-introspect*.ts`.
- **Scheduler** — MLFQ (Q0–Q4) plus EDF and FairShare policies, swappable via `setSchedulingPolicy`. `scheduler.ts`.
- **Runtime loop** — `task-worker.ts` drives poll-and-wake dispatch through the kernel admission gate; `pipeline-executor.ts` runs DAGs in waves. Canonical reference: `docs/RUNTIME_LOOP_REFERENCE.md`.
- **Orchestration** — multi-agent runtime, DAG executor, planner, blackboard, consensus, deadlock detection, specialization registry, A2A bridge (`packages/a2a-server`). `orchestrator.ts`, `agent-dag.ts`, `agent-runtime.ts`.
- **MCP server** — full Model Context Protocol server (~14 tools, 4 resource URI patterns). `mcp-registry.ts`.
- **Security/governance** — scoped API keys (9 scopes), scrypt + constant-time auth, hash-chained append-only audit (`audit-engine.ts`), HTTP 423 kill switch, rate limiting, guardrails, crypto suite, PII/DLP/secret scanning.
- **Observability** — OpenTelemetry-compatible tracing/metrics; spans in Postgres.
- **LLM gateway** — TS provider-adapter layer: `services/providers/*` (`openai`, `anthropic`, `google`, `ollama`, `vllm`, `m3`) implement `ProviderAdapter` from `llm-gateway-v2.ts`, wrapped by the unified gateway (`unified-gateway/portkey`). `llm-router.ts`, `llm-client.ts`, `omniroute*.ts`.
- **Self-Optimization** — auto-tuner control plane that tunes the runtime loop live via setters. `self-improvement-harness.ts`, `services/self-opt/**`.

## Multi-Agent Operating Model (Fleet of 20)

The project is advanced and kept that way by **20 all-rounder agents** working in a **nonstop loop**, each owning one **exclusive file namespace** so edits never collide. Every agent perfects its area end-to-end (backend + frontend + tests + docs) with full autonomy, until it reaches the **Perfection Bar** (below). Cross-area needs are routed to the **Leader** (human orchestrator) and integrated only through stable public interfaces.

### The 20 agents and their exclusive namespaces

| #   | Agent          | Area                                                       | Exclusive files (edit ONLY these)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Forge**      | Kernel, Scheduler & Runtime Loop                           | `server/src/services/kernel*.ts` (kernel, -schema, -persistence, -panic, -introspect, -introspect-state, -hotpatch, -bootstrap, ring-audit), `scheduler.ts`, `task-worker.ts`, `task-notifier.ts`, `message-bus.ts`, `sse-bus.ts`, `sse-bridge.ts`, `sse.ts`, `pipeline-executor.ts`, `resource-quota.ts`, `preemption-leak-guard.ts`, `signal-hooks.ts`, `routes/kernel.ts`, `routes/kernel-introspect.ts`, `routes/sse.ts`                                                                                                                                    |
| 2   | **Atlas**      | Orchestration, DAG & Agent Runtime                         | `server/src/services/{orchestrator,blackboard,dag-executor,planner,agent-dag,agent-runtime,agent-loop,agent-persistence,agent-permissions,consensus,deadlock-detector,workflow-dsl,conditional-router,merge-strategies,specialization-registry,action-registry,propagation,graph-engine,pipeline-io}.ts`, `routes/{agents,agent-lifecycle,a2a,automation}.ts`, `packages/a2a-server/**`                                                                                                                                                                         |
| 3   | **Mnemosyne**  | Memory Core & Recall                                       | `server/src/services/{memory.service,memory-search-suggest,memory-search-explanation,memory-nl-query,memory-graph-browser,memory-attachments,memory-batch,memory-tag-taxonomy,memory-clustering,memory-cluster,memory-causal-chains,memory-contradiction,memory-conflict-resolver,memory-provenance,memory-dedup,memory-privacy-zones,memory-multilingual,memory-multimodal}.ts`, `recall.ts`, `federated-recall.ts`, `embeddings.ts`, `routes/memory-*.ts`                                                                                                     |
| 4   | **Lethe**      | Memory Lifecycle, Training & Maintenance                   | `server/src/services/{memory-decay,memory-forget,memory-hierarchy,memory-templates,memory-quota,memory-fragmentation,memory-cold-storage,memory-backup,memory-anomaly,memory-stitcher,memory-consolidation,memory-priming,memory-rehearsal,memory-emotion,memory-export-v3,memory-diff-sync}.ts`, `consolidation.ts`, `consolidation-budget.ts`, `memory-trainer.ts`, `dedup-engine.ts`                                                                                                                                                                         |
| 5   | **Cerebrum**   | LLM Gateway & Inference                                    | `server/src/services/{llm,llm-scheduler,llm-router,llm-gateway-v2,llm-client}.ts`, `omniroute.ts`, `omniroute-bridge.ts`, `portkey-bridge.ts`, `brain.ts`, `vlm.ts`, `services/providers/**`, `services/unified-gateway/**`                                                                                                                                                                                                                                                                                                                                     |
| 6   | **Sentinel**   | Security Core, Crypto & Guardrails                         | `server/src/services/{guardrails,guardrail-types,guardrail-registry,guardrail-patterns,safety.service,security-posture,runtime-security,network-policy,crypto-suite,db-encryption,memory-encryption,file-watcher,data-classification,dlp-scanner,secrets-scanner,secret-rotator,cert-manager,vault,rate-limit.service}.ts`, `server/src/lib/{security,security-headers,zero-trust,mfa,geo-fence,jit-elevation,time-gate,crypto-sign,hsm-provider,env-sanitizer,container,tokens,auth-context,verify,rate-limit}.ts`, `server/src/scripts/audit-keys-leakage.ts` |
| 7   | **Aegis**      | Reliability, Resilience, Audit & Compliance                | `server/src/services/{audit-engine,audit-worker,audit-watchdog,audit-analytics,incident-response,breach-notifier,anomaly-detector,ransomware-detector,insider-threat,compliance-reporter,fairness-corrector,evidence-collector,cspm,supply-chain,vendor-assessor,vdp,siem-forwarder,blockchain}.ts`, `server/src/lib/{audit,auditing}.ts`, `routes/audit-routes.ts`                                                                                                                                                                                             |
| 8   | **Pulse**      | Self-Optimization & Improvement                            | `server/src/services/self-improvement-harness.ts`, `ranking-trainer.ts`, `services/self-opt/**` (index, types, tuners, telemetry, guardrail-guard, gap-items, controller, bootstrap, adapters), `routes/self-opt.ts`                                                                                                                                                                                                                                                                                                                                            |
| 9   | **Metron**     | Performance, Observability & Health                        | `server/src/services/{metrics,metrics-validation,tracing,trace-exporter,span-context,overhead-accounting,probe-harness,health-monitor,shadow-daemon}.ts`, `server/src/lib/{metrics,otel,monitoring,perf-cache,lru-cache}.ts`, `routes/{perf,analytics}.ts`                                                                                                                                                                                                                                                                                                      |
| 10  | **Artisan**    | DevEx, SDK, Skills, Marketplace & Plugins                  | `server/src/services/{marketplace.service,skill.service,skill-compiler,skill-template-engine,plugin-manifest,session.service,session-recorder,feedback.service,project.service,workspace-sync,sandbox,sandbox-worker,wasm-plugin-runtime}.ts`, `routes/marketplace-routes.ts`, `scripts/import-skills.ts`, `packages/sdk/src/{types,index,errors,client,bindings}.ts`, `packages/devtools/**`                                                                                                                                                                   |
| 11  | **Helix**      | Enterprise, Org/Tenant & Federated Mesh                    | `server/src/services/{enterprise.service,p2p-swarm}.ts`, `routes/enterprise.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 12  | **Prism**      | Primary Dashboard UI & State                               | `src/pages/*.tsx` (top-level), `src/components/**`, `src/store.ts`, `src/lib/*.ts` (frontend lib, except `os/` and `mcp.ts`), `src/lib/vault.ts`                                                                                                                                                                                                                                                                                                                                                                                                                |
| 13  | **Halcyon**    | OS Kernel Admin & Enterprise Admin Pages                   | `src/pages/os/**`, `src/pages/admin/**`, `src/osStore.ts`, `src/lib/os/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 14  | **Ferric**     | Rust Core, Config, Provider-Types & Providers              | `crates/core/**`, `crates/config/**`, `crates/provider-types/**`, `crates/providers/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 15  | **Rusty**      | Rust Tools, Safety, Installer, Observability, Search & CLI | `crates/tools/**`, `crates/safety/**`, `crates/installer/**`, `crates/observability/**`, `crates/nexus-search/**`, `crates/cli/**`, `crates/nexus-cli/**`                                                                                                                                                                                                                                                                                                                                                                                                       |
| 16  | **Tess**       | Tauri Desktop Shell                                        | `nexus-tauri/**` (both `src-tauri/` and `src/`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 17  | **Aeon**       | Protocols, MCP & External Connectors                       | `server/src/mcp.ts`, `server/src/mcp-http.ts`, `server/src/services/mcp-registry.ts`, `server/src/connectors/**`, `src/lib/mcp.ts`, `packages/sdk/src/acp.ts`, `packages/sdk/src/webhooks.ts`                                                                                                                                                                                                                                                                                                                                                                   |
| 18  | **Lorekeeper** | Docs, ADRs, Plans & Personas                               | `docs/**`, `README*`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `MASTER_MISSION_BRIEF.md`, `PLAN.md`, `REDEMPTION_PLAN.md`, `PHASES_11_30_MASTER_PLAN.md`, `PHASES_11_30_GAP_UPDATE.md`, `TASKBOARD.md`, `docs/PERSONA_REGISTRY.md`                                                                                                                                                                                                                                                                                                                     |
| 19  | **Quill**      | Quality, Testing & Merge Gate                              | `server/tests/**`, `tests/**` (root), `server/src/tests/**`, all `*.test.ts`/`*.spec.ts`, test helpers (`server/tests/helpers/**`), `server/vitest.config.ts`. Owns the merge gate.                                                                                                                                                                                                                                                                                                                                                                             |
| 20  | **Bastion**    | Build, CI/CD, Infra & Tooling Config                       | `Dockerfile*`, `docker-compose*`, `nginx*`, `entrypoint.sh`, `.github/workflows/**`, `vite.config.ts`, `vite.config.standalone.ts`, `tsconfig*.json`, `eslint.config.mjs`, `server/package.json` (dep bumps, sign-off), root `package.json` scripts, `routes/v3-upgrade.ts`, `scripts/{verify-system-readiness,profile-system-performance}.ts`, deploy docs (`docs/DEPLOYMENT.md`, `docs/PRODUCTION_CHECKLIST.md`, `docs/DR_RUNBOOK.md`)                                                                                                                        |

### FROZEN common infrastructure (Leader-owned — no agent edits without sign-off)

These are shared contract/util files that were the historical source of collisions. Editing them requires explicit Leader approval; agents consume them via their public exports only:

- `server/src/index.ts`, `app.ts`, `proxy.ts`, `routes.ts`, `services.ts`, `typings.d.ts`, `cli.ts`, `setup.ts`, `_probe_status.ts`
- `server/src/db/client.ts`, `db/schema.ts`, `db/schema-sqlite.ts`, `db/dev-schema.ts`
- `server/src/lib/{envelope,errors,id,hono-env,env,guards,http,zvalidator,schemas,strings,payload-limit,protocol-integration,logging,logger}.ts`
- `src/skill-registry.ts` (root shared skill registry)

### Nonstop loop protocol (per agent)

Each agent runs the same continuous cycle, independently of the others, forever:

1. **Pull** — take the next item from its area backlog: issue/PR labeled `<agent>`, an open ADR/phase gap (Phases 11–20), or a `TODO`/`stub` discovered in its namespace.
2. **Implement** — real, production-grade code (no stubs, no `FIXME`), with unit tests for every new behavior.
3. **Local gate** — `tsc --noEmit` (fresh, `--incremental false`) = 0 AND `vitest run` for the agent's own area passes.
4. **Open PR** — title prefixed with the agent name (e.g., `Forge: close GAP 11.13 ring-policy PATCH`).
5. **Merge gate (Quill)** — full `cd server && npm run validate` must be green; Quill blocks merge on any regression. Leader/human merges.
6. **Loop** — return to step 1. The loop never stops; idle agents pick the next highest-value area improvement (perf, coverage, docs, hardening).

### Collision-free guarantees

- **Exclusive namespaces** — the table above is the only file an agent may edit. Overlap is structurally impossible.
- **CODEOWNERS enforcement (to be added by Bastion)** — a root `CODEOWNERS` mapping each glob to its agent, so GitHub blocks cross-namespace edits at review time. This file is the canonical mapping.
- **Frozen core sign-off** — changes to the FROZEN set go through the Leader only.
- **Interface-only integration** — an agent consumes another area's functionality via its public exports; it never edits the producing file. The universal seam is the kernel/scheduler (`enqueueTask` + `pickNextTask`) which Atlas, Pulse, and Forge coordinate through; Pulse tunes the loop via setters (`configureWorker`, `setSchedulingPolicy`) without touching loop code.

### Perfection Bar (per area, zero compromise)

For its namespace, each owner must reach: `tsc` = 0 (fresh), its unit tests pass, handlers return `c.json(ok/err)` with correct arity, **no stubs/TODOs/FIXMEs**, real implementations, the feature wired to the kernel/scheduler seam where applicable, and coverage ≥ 80% for new agents (per `docs/AGENT_DEV_GUIDE.md`). "As advanced as possible and most useful" means each area ships the full Phase feature set, not a scaffold.

### Persona registry

Each agent has a persona card in `docs/PERSONA_REGISTRY.md` with `reportsTo` culminating at `forge`, so the fleet forms a dynamic team under the kernel dispatcher (see `docs/AGENT_DEV_GUIDE.md`).

## Project conventions

- **TypeScript strict mode** — `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`. No `any` where possible.
- **Async/await** over raw promises. In Rust, use the `tokio` runtime; use bounded `mpsc` channels (not unbounded); heavy CPU work via `spawn_blocking`.
- **Error handling** — Rust: `thiserror` + `AgenticError` enum (in `crates/core`), never `Box<dyn Error>` or `String`. TS: use `server/src/lib/errors.ts`.
- **Structured logging** — Rust: `tracing` with context fields (provider, model, latency). TS: `server/src/lib/logging.ts`.
- **Config** — TOML-first for Rust, validated via JSON Schema from Rust types. Server uses `.env` with `.env.example` as template (never commit `.env`).
- **ACP (Agent Client Protocol)** — types live in `packages/sdk/src/acp.ts`; external APIs use REST/MCP/SSE.
- **Naming** — camelCase in TS/JS, snake_case in Rust. File names match the primary export.
- **Formatting** — 2-space indent, LF endings, single quotes, trailing commas (ES5). Enforced by `.editorconfig`, `.prettierrc`, and lint-staged.
- **No dead code** — deprecate over 2 releases before removal; feature flags need removal deadlines.
- **Planning tooling (BMAD)** — the BMAD method is configured (`.github/copilot-instructions.md`, `.clinerules/`). Load `_bmad/bmm/config.yaml` before running BMAD workflows/slash commands.

## Cross-language boundary (Rust ↔ TypeScript)

Per **ADR-0007 (Final)**, the Rust `crates/` and the TypeScript app are **two complete, separate systems in one repo with no runtime connection** — no FFI, no napi-rs, no IPC, no HTTP bridge. The Hono server makes LLM calls from TypeScript (the provider-adapter gateway above); the Rust providers are a parallel, dormant implementation with no callers.

Consequences for agents:

- **Editing `crates/` does NOT change the behavior of the server, dashboard, or any user-facing feature.** The npm TS packages are the single source of truth for LLM/provider logic.
- CI still validates Rust (`cargo build`/`clippy`/`test`) so it does not rot — treat Rust changes as isolated (owned by **Ferric** / **Rusty**).
- **Workspace crates (10):** `core`, `config`, `installer`, `safety`, `cli`, `provider-types`, `providers`, `tools`, `observability`, `nexus-search`. Plus a standalone `nexus-cli` crate (not in workspace `members`).
- **No `ts-rs` binding generation** — there is no auto-generated TS from Rust. Core Rust types live in `crates/core/src/types.rs` (a file, not a directory). Do not assume TS types mirror Rust types.

## Key environment variables

| Variable                                                                                                                                                                         | Purpose                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                                                                                   | PostgreSQL 17 + pgvector connection string (also required for integration tests) |
| `NEXUS_API_KEY`                                                                                                                                                                  | Operator API key (auto-generated if unset; shown once at boot)                   |
| `NEXUS_LLM_PROVIDER` / `NEXUS_LLM_API_KEY` / `NEXUS_LLM_MODEL`                                                                                                                   | LLM backend selection                                                            |
| `NEXUS_EMBEDDING_MODEL` / `NEXUS_EMBEDDING_DIM`                                                                                                                                  | Embedding model + vector dimension                                               |
| `NEXUS_RRF_K`                                                                                                                                                                    | RRF fusion constant (default 60)                                                 |
| `NEXUS_RECALL_BUDGET` / `NEXUS_RECALL_WEIGHT_*`                                                                                                                                  | Recall budget + weighting                                                        |
| `NEXUS_BUS_BACKEND`                                                                                                                                                              | Event-bus backend: `memory` or `redis` (`NEXUS_REDIS_URL`)                       |
| `NODE_ENV`                                                                                                                                                                       | `development`                                                                    | `production` (production rejects `localhost` origins) |
| `NEXUS_SCHEDULER_POLICY`                                                                                                                                                         | `mlfq` (default)                                                                 | `edf`                                                 | `fairshare` |
| `NEXUS_WORKER_POLL_MS` / `NEXUS_WORKER_MAX_CONCURRENCY` / `NEXUS_WORKER_TIMEOUT_MS` / `NEXUS_WORKER_MAINTENANCE_MS` / `NEXUS_WORKER_STALE_TASK_MS` / `NEXUS_WORKER_HEARTBEAT_MS` | Runtime-loop tuning knobs (Pulse's control surface)                              |

## Current Reality (coherence anchor — read before trusting stale audit snapshots)

Read-only reconciliation so contributors don't trust stale audit notes (source of truth: `docs/PLAN_TRACKER.md`, last updated 2026-07-09; ADRs in `docs/adr/`).

- **`crates/` and `nexus-tauri/` ARE present and are first-class workspace members.** Older notes claiming this tree is "TS/Hono only" or that `crates/` is absent are wrong — ignore them. The Rust↔TS _runtime_ is still decoupled (see ADR-0007 above), but the directories exist and build via `cargo`.
- **Kernel is REAL, not a demo.** `server/src/services/kernel.ts` is a ring-based kernel (rings 0–4, cgroups, POSIX ACL, audit chaining, gang scheduling, priority inheritance). **Naming:** the runtime uses `RingPolicyStore` (class in `kernel.ts`) and `RingOscillationDetector` (`ring-audit.ts`). There is **no class named `RingKernel`, `ClientKernel`, or `RingSupervisor`** — do not search for them.
- **Scheduler is MLFQ, not flat.** `scheduler.ts` ships `MLFQPolicy` (Q0–Q4, timeslice/boost/starvation-promotion), `EDFPolicy`, `FairSharePolicy`, swappable via `setSchedulingPolicy`. See ADR-0009.
- **Pipeline, Message-Bus, SSE-Bridge, A2A are implemented server-side** and wired with tests. A2A packaging ratified in ADR-0008.
- **LLM layer is the TS provider-adapter gateway**, not the npm `openai`/`@anthropic-ai/sdk` packages ADR-0007 describes (those are not in `server/package.json`). Use `services/providers/*` + `unified-gateway/portkey`.
- **Database:** `server/src/db/schema.ts` defines **~60 Drizzle tables** (memories, skills, projects, audit, agents/tasks, scheduler, telemetry, plugins, marketplace, self-opt, orgs/workspaces, …) — far more than the "19 tables" mentioned in the top-level README. Dual Postgres/SQLite backend.
- **Phases 11–20 are COMPLETED** as of 2026-07-09 (server `tsc --noEmit` = 0 on the settled gate, Leader-ratified, task board = COMPLETED per PLAN_TRACKER). The full `cd server && npm run validate` is GREEN-able once the environment resolves a `better-sqlite3` Node-ABI mismatch (`npm rebuild better-sqlite3`); that is an env issue, not a code defect. Frontend↔backend wiring is tracked continuously (owner: Prism/Halcyon) — verify before assuming a feature is fully bridged.
- **CLAUDE.md is partially stale** — it claims `ts-rs` binding generation and a `crates/core/src/types/` directory; neither exists (see Cross-language boundary). Trust this file and ADR-0007.

## Things to avoid

- **Vendored source reference:** `gemini-cli/` is NOT the active workspace — don't modify it or treat it as part of the pnpm workspace.
- **SQLite artifacts:** `agentic-os.db`, `*.db-wal`, `*.db-shm`, `server/data/*.sqlite*` are local runtime data — never commit them.
- **`.env` files:** never commit secrets. Only `.env.example` should be tracked.
- **Build artifacts:** `dist/`, `coverage/`, `*.tsbuildinfo`, `node_modules/`, `server/node_modules/`, `server/dist/` are all gitignored.
- **Rust build cache:** `nexus-tauri/src-tauri/target/` is heavy (multi-GB) — don't commit or back up.
- **No blocking in async:** all I/O must be async; CPU-heavy work uses `spawn_blocking` in Rust.
- **No dead code:** deprecate over 2 releases before removal. Feature flags must have removal deadlines.
- **Integration tests need Postgres:** `DATABASE_URL` must be set. They fail loudly if the DB is unreachable.
- **Manual DB edits:** don't hand-edit local SQLite/Postgres files — use Drizzle migrations (`server/drizzle/`) or the app's API.
- **Cross-namespace edits:** an agent must never edit files outside its exclusive namespace (see Multi-Agent Operating Model). Route cross-area needs to the Leader.
- **Don't expect Rust changes to affect the app:** editing `crates/` does not change server/dashboard behavior (see Cross-language boundary).
