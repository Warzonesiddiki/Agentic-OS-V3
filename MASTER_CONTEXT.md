# Agentic OS V4 — Master Context File

> **For AI assistants working on the Agentic OS V4 integration.**
> This file provides complete project context in a compact format.

---

## 1. 📋 PROJECT SNAPSHOT

```
Name:           Agentic OS V4
Type:           Universal AI Agent Operating System
Repository:     TBD (new monorepo)
Status:         Integration Planning Stage
License:        Apache 2.0
Target Binary:  Single ~30MB executable (no runtime dependencies)
Target Users:   Developers, AI Engineers, Platform Teams, Enterprise
```

## 2. 🧱 MERGED PROJECTS (8)

| # | Project | Language | Key Contribution |
|---|---------|----------|-----------------|
| 1 | **Agentic OS V3** | TypeScript | DAG, Pipeline, Graph, P2P Swarm, Self-Improvement, Shadow Daemon, 40+ Skills, WASM Sandbox |
| 2 | **9Router** | TypeScript+Python | 100+ Providers, Protocol Translation (30+ bidirectional), MITM Proxy, RTK Compression, OAuth (20+) |
| 3 | **Goose** | Rust+TypeScript | CLI/TUI (Rust), ACP Server, Extensions (WASM), Recipes (YAML), Local Inference (llama.cpp), Dictation (Whisper), MCP, Computer Control, Auto-Update |
| 4 | **litellm** | Python | 100+ Providers, Proxy, Adaptive Router (Bandit), Caching (Semantic), Guardrails, Budgets, Load Balancing |
| 5 | **new-api** | Go | Channel Management, Billing/Quotas, Relay (40+ Adapters), Multi-Tenant, SSO, Payment Integrations |
| 6 | **OmniRoute2** | TypeScript | Auto-Combo Routing, Skills (40+), Compression, Plugins, 30+ i18n, Quality Gates |
| 7 | **Portkey** | TypeScript | 50+ Providers, Guardrail Plugins, Caching, Fallbacks, Observability |
| 8 | **gemini-cli** | TypeScript (Node) | Interactive CLI (Ink/React), Agent Sessions, MCP Client/OAuth, Hooks System, Safety Checkers, Voice (Whisper+Gemini Live), Sandbox (Docker/macOS), IDE Integration, OTEL Telemetry, Evals (Memory/Perf/Behavioral) |

## 3. 🏛️ ARCHITECTURE

```
5-Layer Stack:

┌────────────────────────────────────────────────────────────────┐
│  L5: UI LAYER (CLI, TUI, Desktop, Web Dashboard, VS Code)     │
│  Primary: Goose CLI/TUI (Rust)                                 │
│  Secondary: gemini-cli Ink/React (Node)                        │
│  Desktop: Tauri + React Shell                                  │
│  Web: Next.js Dashboard (from 9Router)                         │
│  IDE: gemini-cli VS Code companion                             │
├────────────────────────────────────────────────────────────────┤
│  L4: ACP SERVER (Unification Protocol Layer)                   │
│  From Goose ACP Server + gemini-cli ACP SDK                    │
│  Session Mgmt | Extension Mgmt | Recipe Engine                 │
│  Tool Confirmation | Prompt Mgmt | Subagent Mgmt               │
├────────────────────────────────────────────────────────────────┤
│  L3: AGENT ORCHESTRATION LAYER                                 │
│  From Agentic OS V3 + gemini-cli agent system                  │
│  DAG Engine | Pipeline Executor | Graph Engine                 │
│  P2P Swarm | A2A Protocol | Task Scheduler                     │
│  Agent Session Mgr | Agent Registry | Self-Improvement         │
├────────────────────────────────────────────────────────────────┤
│  L2: UNIVERSAL AI GATEWAY (Merged from 5 gateways)            │
│  Provider Registry (150+) | Protocol Translator (30+ bi)       │
│  Routing Engine (Adaptive, Budget, Latency, Combo, Fallback)   │
│  Streaming Engine (SSE, WS, gRPC)                             │
│  Auth/OAuth Mgr | Billing/Quotas | Cache Mgr                   │
│  Safety/Guardrails | MITM Proxy | RTK Compression             │
├────────────────────────────────────────────────────────────────┤
│  L1: INFRASTRUCTURE LAYER                                      │
│  Config (TOML-first) | Storage (SQLite/Redis/Postgres)         │
│  OTEL Observability | Secrets Vault | WASM Sandbox             │
│  Local Inference (llama.cpp/LiteRT) | MCP Registry             │
│  Policy Engine | Health Checks | Auto-Update                   │
└────────────────────────────────────────────────────────────────┘
```

## 4. 🔑 KEY ARCHITECTURE DECISIONS

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-001 | **Rust Core + TS Extensions** | Single binary + accessible skill dev |
| ADR-002 | **TOML as canonical config** | Most readable, supported in Rust |
| ADR-003 | **ACP as unification layer** | Already in Goose + gemini-cli |
| ADR-004 | **OTEL-first observability** | Already in litellm + gemini-cli + Portkey |
| ADR-005 | **WASM + Docker dual sandbox** | Skill isolation + code execution sandbox |
| ADR-006 | **Copy-Edit-Merge approach** | Preserve tested code, avoid rewrites |
| ADR-007 | **Embedded JS runtime (napi-rs)** | Run TS skills without Node.js dependency |

## 5. 🧩 COMPONENT SOURCE MAP

| Component | Primary Source | Secondary Source | Integration Method |
|-----------|---------------|-----------------|-------------------|
| Provider Registry | 9Router (100+) | litellm (100+), Portkey (50+), new-api (40+) | Merge + deduplicate |
| Protocol Translator | 9Router (30+ bi) | — | Copy as-is, adapt types |
| Routing (Adaptive) | litellm (bandit) | OmniRoute2 (combo) | Merge algorithms |
| Routing (Fallback) | Portkey | 9Router | Copy as-is |
| Streaming | 9Router (chatCore) | litellm, gemini-cli | Unify interface |
| DAG/Pipeline/Graph | Agentic OS V3 | — | Copy as crate |
| P2P Swarm | Agentic OS V3 | — | Copy as crate |
| CLI | Goose (Rust) | gemini-cli (Ink) | Goose primary |
| TUI | Goose (ratatui) | gemini-cli (Ink) | Goose primary |
| Auth/OAuth | 9Router (20+ OAuth) | gemini-cli (OAuth2 flows) | Merge interfaces |
| Billing/Quotas | new-api | litellm (budgets) | Copy from new-api |
| Cache (exact) | Portkey | litellm | Portkey patterns |
| Cache (semantic) | litellm | — | Copy embedding logic |
| Safety/Guardrails | gemini-cli | litellm, Portkey | gemini-cli pipeline |
| Skill System | Agentic OS V3 | OmniRoute2, Goose, gemini-cli | Unified contract |
| Recipe Engine | Goose | — | Copy as-is |
| MCP Integration | gemini-cli | Goose | gemini-cli is more complete |
| Local Inference | Goose (llama.cpp) | gemini-cli (LiteRT/MLX) | Merge runtimes |
| Voice | Goose (Whisper) | gemini-cli (Whisper+Live) | Merge |
| Sandbox | gemini-cli (Docker) | V3 (WASM) | Dual approach |
| Policy Engine | gemini-cli | — | Copy as-is |
| OTEL Tracing | gemini-cli | litellm | Merge exporters |
| Testing | gemini-cli (Vitest) | Goose (cargo test) | Both per language |
| Evals | gemini-cli (behavioral) | — | Copy framework |
| VS Code Extension | gemini-cli | — | Copy as-is |
| Auto-Update | Goose | — | Copy, add rollback |
| Binary Distribution | Goose (Rust) | gemini-cli (sea) | Rust binary + napi-rs |
| Dashboard | 9Router (Next.js) | — | Copy as-is |

## 6. ⚙️ TECH STACK

```
Core Runtime:     Rust (2024 edition)
Scripting:        TypeScript (Node 20+ compatible)
UI (CLI/TUI):     Rust (ratatui) + TypeScript (Ink/React - optional)
UI (Desktop):     Tauri + React
UI (Web):         Next.js 14+
Config:           TOML (canonical) + YAML/JSON/ENV (compat)
Storage:          SQLite (default), PostgreSQL (multi-tenant), Redis (cache)
Protocols:        ACP, MCP, REST, SSE, WebSocket, gRPC
Observability:    OpenTelemetry (traces, metrics, logs)
Tracing:          tokio-rs/tracing
Async Runtime:    tokio
Serialization:    serde + serde_json + toml
Auth:             OAuth 2.0 (PKCE), OIDC, SAML 2.0, API Keys
Sandbox:          WASM (wasmtime), Docker/Podman
Local AI:         llama.cpp (Rust bindings), LiteRT/MLX (TS bindings)
Voice:            Whisper.cpp (Rust), Whisper (TS)
Testing:          cargo test + Vitest + Playwright
CI/CD:            GitHub Actions
Binary:           cargo build + napi-rs + sea/nexe
```

## 7. 🚫 INVARIANTS (What Must NEVER Break)

1. **Provider requests MUST always be deliverable** — if primary fails, fallback MUST work
2. **Config NEVER corrupts existing data** — migrations are copy-on-read, never modify-in-place
3. **Streaming NEVER deadlocks** — all streams have timeouts and cancellation
4. **Auth NEVER leaks credentials** — secrets encrypted at rest, never logged
5. **Sandbox NEVER allows escape** — WASM/Docker isolation is mandatory for untrusted code
6. **ACP protocol NEVER breaks** — backward compatible changes only
7. **Binary MUST be self-contained** — no runtime dependency (no Node, Python, Go required)
8. **Auto-update MUST be atomic** — download → verify → swap, rollback on failure
9. **OTEL spans MUST be connected** — trace_id propagates through all components
10. **Config changes MUST be validated** — invalid config rejected before application

## 8. ⚠️ KNOWN RISKS (Top 10)

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Language fragmentation (Rust+TS+Python+Go→Rust+TS) | Python/Go components rewritten; not ported |
| 2 | Provider interface incompatibility | Unified ProviderAdapter trait; adapters per source |
| 3 | Binary too large (>100MB) | Tree-shaking; optional provider packs |
| 4 | Performance regression vs specialized tools | Benchmarks in CI; baseline comparisons |
| 5 | Config migration corrupts existing setups | Read-only migration; backup before write |
| 6 | OTEL overhead impacts latency | Sampling; async batch exports |
| 7 | WASM sandbox limits skill capabilities | WASI preview 2; optional native fallback with warning |
| 8 | Community prefers existing tools over unified | Import tools; clear migration guides |
| 9 | License conflicts with aggregated dependencies | License audit tool in CI (cargo-deny + npm license-checker) |
| 10 | Auto-update failures leave broken installation | Atomic swap; versioned rollback; safety check before update |

## 9. 📐 CODING STANDARDS

```rust
// All Rust code follows these conventions:
// - thiserror for error types
// - tracing for logging  
// - serde for serialization
// - async fn with tokio runtime
// - #[async_trait] for trait objects
// - Bounded channels for streaming (mpsc::channel)
// - Doc comments on all public APIs

// All TypeScript code follows these conventions:
// - Zod for runtime validation
// - Vitest for testing
// - ES modules (type: "module")
// - typedoc for API docs
// - Prettier for formatting
```

## 10. 🗺️ FILES & DIRECTORIES REFERENCE

```
Key files created during integration planning:
├── MASTER_INTEGRATION_PLAN_30_PHASES_P1.md  — Phases 1-5  (Foundation → Provider)
├── MASTER_INTEGRATION_PLAN_30_PHASES_P2.md  — Phases 6-10 (Routing → Skills)
├── MASTER_INTEGRATION_PLAN_30_PHASES_P3.md  — Phases 11-15 (Cache → Billing)
├── MASTER_INTEGRATION_PLAN_30_PHASES_P4.md  — Phases 16-20 (CLI → Observability)
├── MASTER_INTEGRATION_PLAN_30_PHASES_P5.md  — Phases 21-25 (Local → Sandbox)
├── MASTER_INTEGRATION_PLAN_30_PHASES_P6.md  — Phases 26-30 (IDE → Launch)
├── ARCHITECTURE_ANALYSIS.md                 — Audit, risks, zero-hassle design
├── UNIFIED_PRD.md                           — Product requirements
├── .agentic-os-rules.md                     — AI assistant rules
└── MASTER_CONTEXT.md                        — This file
```

---

> **This context file should be loaded at the start of every AI-assisted development session.**
> *Last updated: 2026-07-02*
