﻿# Agentic OS V4: The Universal AI Agent Operating System

## 30-Phase Master Integration Plan â€” From 8 Projects to 1 Perfect Product

> **Last Updated:** 2026-07-02
> **Status:** Draft â€” Part 1 (Phases 1â€“5)
> **Target Release:** Agentic OS V4.0.0-alpha

---

## Why Agentic OS V4?

The AI agent ecosystem is fractured. Developers must stitch together gateways,
orchestrators, runtimes, and CLI tools from different projects, each with its
own configuration, deployment model, and protocol. **Agentic OS V4** eliminates
this fragmentation by merging **8 leading open-source projects** into a single,
coherent operating system for AI agents.

**The 8 Projects Being Unified:**

| # | Project | Language | Role | Key Strengths |
|---|---------|----------|------|---------------|
| 1 | **Agentic OS V3** | Rust + TS | Agent Orchestration | DAG/Pipeline/Graph executors, P2P Swarm, Self-improvement, Shadow Daemon, Skill Runtime |
| 2 | **9Router** | Rust + TS | Universal Gateway | 100+ providers, Protocol translation (OpenAIâ†”Anthropicâ†”Gemini), MITM proxy, RTK compression |
| 3 | **Goose** | Rust + TS | Agent Runtime | ACP server, CLI/TUI, Extensions/Recipes, Local inference, MCP, Dictation, Computer control |
| 4 | **litellm** | Python | LLM Gateway | 100+ providers, Proxy server, Routing strategies, Caching, Guardrails, Budget management |
| 5 | **new-api** | Go | AI Gateway | Channel management, Billing, Relay, Multi-tenant, Load balancing, Web UI |
| 6 | **OmniRoute2** | TypeScript | Gateway | Skills system, Auto-combo routing, Compression, Plugin system, 30+ i18n languages |
| 7 | **Portkey** | TypeScript | Gateway | 50+ providers, Guardrail plugins, Semantic caching, Fallbacks, Observability dashboards |
| 8 | **gemini-cli** | TypeScript | CLI Agent | Google Gemini integration, MCP support, Code understanding, Sandboxing, GitHub Actions |

### Zero-Hassle Philosophy

Agentic OS V4 is built around a simple promise: **download, run, done.**

- **Single binary distribution** â€” One executable for your platform, zero dependencies
- **Zero-config startup** â€” Works out of the box with sensible defaults
- **Auto-discovery** â€” Detects providers, tools, and MCP servers automatically
- **Backward compatible** â€” Existing configs from any of the 8 projects work
- **Self-updating** â€” Automatic updates with rollback protection

---

## Architectural Vision

### The 5-Layer Stack

Agentic OS V4 is organized as a clean 5-layer architecture. Each layer
communicates via well-defined interfaces, allowing independent evolution and
hot-swappable implementations.

```mermaid
---
title: Agentic OS V4 â€” 5-Layer Architecture Stack
---
graph TB
    subgraph UI_Layer["UI Layer â€” User Interfaces"]
        CLI["CLI<br/>(Rust + ratatui)"]
        TUI["TUI<br/>(Rust + ratatui)"]
        DESKTOP["Desktop<br/>(Tauri + React)"]
        WEB["Web Dashboard<br/>(Next.js)"]
    end

    subgraph ACP_Layer["ACP Server â€” Agent Client Protocol"]
        ACP["ACP Server<br/>(Rust)"]
        SESSION["Session Manager"]
        EXT["Extension Manager"]
        RECIPE["Recipe Engine"]
        PROMPT["Prompt Manager"]
    end

    subgraph ORCH_Layer["Agent Orchestration Layer"]
        DAG["DAG Executor"]
        PIPELINE["Pipeline Engine"]
        GRAPH["Graph Engine"]
        P2P["P2P Swarm"]
        SELF["Self-Improvement"]
        SHADOW["Shadow Daemon"]
        SCHED["Task Scheduler"]
    end

    subgraph GATEWAY_Layer["Universal AI Gateway Layer"]
        REGISTRY["Provider Registry<br/>250+ providers"]
        TRANSLATOR["Protocol Translator<br/>OpenAI â†” Anthropic â†” Gemini"]
        STREAM["Streaming Engine<br/>SSE, WebSocket, Raw"]
        ROUTING["Routing Engine<br/>Adaptive, Budget, Latency"]
        RESILIENCE["Resilience<br/>Circuit Breaker, Fallback"]
        MITM["MITM Proxy<br/>IDE Integration"]
        RTK["RTK Compression<br/>Caveman, Ponytail"]
        AUTH["Auth Manager<br/>20+ OAuth providers"]
        BILLING["Billing & Quotas"]
        CACHE["Cache Layer<br/>Redis, Semantic, Disk"]
        OBSERV["Observability<br/>OTEL, Langfuse, Prometheus"]
        GUARD["Guardrails<br/>Security, PII, Injection"]
    end

    subgraph INFRA_Layer["Infrastructure Layer"]
        DB["Database<br/>SQLite / PostgreSQL"]
        REDIS["Redis Cluster"]
        CONFIG["Config Manager"]
        SECRETS["Secrets Vault"]
        LOCAL_INF["Local Inference<br/>llama.cpp, MLX"]
        MCP["MCP Registry"]
        SANDBOX["WASM Sandbox"]
        DICT["Dictation<br/>Whisper"]
        COMP_CTRL["Computer Control"]
    end

    CLI --> ACP
    TUI --> ACP
    DESKTOP --> ACP
    WEB --> ACP

    ACP --> ORCH_Layer
    ORCH_Layer --> GATEWAY_Layer
    GATEWAY_Layer --> INFRA_Layer
```

---

### Component Mapping: Best-of-Breed from Each Project

Every component of Agentic OS V4 inherits from the strongest implementation
across the 8 source projects. This ensures we never reinvent wheels â€” we only
polish them.

```mermaid
---
title: Best-of-Breed Component Selection
---
graph LR
    subgraph AgenticOSV4["Agentic OS V4 â€” Unified Component Map"]
        direction TB

        AGENT_ORCH["Agent Orchestration"]
        PROV_REG["Provider Registry"]
        PROT_TRANS["Protocol Translation"]
        STREAM_ENG["Streaming Engine"]
        ROUTING_ENG["Routing Engine"]
        RESILIENCE["Resilience & Guardrails"]
        CLI_TUI["CLI / TUI"]
        DESKTOP["Desktop App"]
        WEB_DASH["Web Dashboard"]
        ACP_SRV["ACP Server"]
        MCP_SUPPORT["MCP Support"]
        LOCAL_INF["Local Inference"]
        SECURITY["Security"]
        EXT_SYS["Extension/Plugin System"]
        RECIPE_ENG["Recipe Engine"]
        CONFIG_SYS["Configuration System"]
        BILLING["Billing & Quotas"]
        CACHE["Caching"]
        OBSERV["Observability"]
        MITM["MITM Proxy"]
        AUTH["Auth/OAuth"]
        RTK["RTK Compression"]
        COMP_CTRL["Computer Control"]
        DICT["Dictation"]
        SELF_IMPR["Self-Improvement"]
        GEMINI_INT["Gemini Integration"]
    end

    V3["Agentic OS V3"] --> AGENT_ORCH
    V3 --> SELF_IMPR
    V3 --> EXT_SYS

    R9["9Router"] --> PROV_REG
    R9 --> PROT_TRANS
    R9 --> MITM
    R9 --> RTK
    R9 --> AUTH
    R9 --> MCP_SUPPORT

    GOOSE["Goose"] --> CLI_TUI
    GOOSE --> ACP_SRV
    GOOSE --> MCP_SUPPORT
    GOOSE --> LOCAL_INF
    GOOSE --> COMP_CTRL
    GOOSE --> DICT
    GOOSE --> DESKTOP

    LIT["litellm"] --> PROV_REG
    LIT --> ROUTING_ENG
    LIT --> RESILIENCE
    LIT --> CACHE
    LIT --> OBSERV

    NA["new-api"] --> BILLING
    NA --> PROV_REG
    NA --> RESILIENCE

    OMNI["OmniRoute2"] --> EXT_SYS
    OMNI --> ROUTING_ENG
    OMNI --> RTK

    PK["Portkey"] --> PROV_REG
    PK --> RESILIENCE
    PK --> CACHE
    PK --> OBSERV

    GC["gemini-cli"] --> GEMINI_INT
    GC --> MCP_SUPPORT
    GC --> SECURITY
    GC --> CLI_TUI

    style V3 fill:#e1f5fe,stroke:#01579b
    style R9 fill:#f3e5f5,stroke:#4a148c
    style GOOSE fill:#e8f5e9,stroke:#1b5e20
    style LIT fill:#fff3e0,stroke:#e65100
    style NA fill:#fce4ec,stroke:#b71c1c
    style OMNI fill:#f1f8e9,stroke:#33691e
    style PK fill:#e0f7fa,stroke:#006064
    style GC fill:#fff8e1,stroke:#f57f17
```

---

### Data Flow: Request Lifecycle

Every request through Agentic OS V4 follows a well-defined path through the
stack, with optional transformation at each hop.

```mermaid
---
title: Request â†’ Response Data Flow
---
sequenceDiagram
    actor User
    participant UI as UI Layer<br/>(CLI/TUI/Desktop/Web)
    participant ACP as ACP Server
    participant ORCH as Orchestrator
    participant GW as Gateway
    participant REG as Provider Registry
    participant TRAN as Protocol Translator
    participant STREAM as Streaming Engine
    participant PROVIDER as AI Provider<br/>(OpenAI/Anthropic/Gemini/etc.)

    User->>UI: Send prompt / request
    UI->>ACP: acp.sendMessage()

    alt Simple Request (no orchestration)
        ACP->>GW: gateway.complete()
    else Complex Workflow
        ACP->>ORCH: orchestrate.run(dag|pipeline|graph)
        ORCH->>GW: gateway.complete() [for each step]
    end

    GW->>REG: resolveProvider(model, features)
    REG-->>GW: ProviderConfig{ endpoint, auth, capabilities }

    GW->>TRAN: translateRequest(request, targetFormat)
    TRAN-->>GW: TranslatedRequest

    alt Streaming Mode
        GW->>STREAM: streamComplete(translatedRequest)
        STREAM->>PROVIDER: POST /chat/completions [stream]
        loop Chunk by Chunk
            PROVIDER-->>STREAM: SSE data chunk
            STREAM-->>GW: StreamEvent
            GW-->>ACP: StreamChunk
            ACP-->>UI: StreamChunk
            UI-->>User: Render tokens
        end
    else Non-Streaming Mode
        GW->>PROVIDER: POST /chat/completions
        PROVIDER-->>GW: FullResponse
        GW->>TRAN: translateResponse(response, originalFormat)
        TRAN-->>GW: TranslatedResponse
        GW-->>ACP: CompletionResult
        ACP-->>UI: FinalResponse
        UI-->>User: Display result
    end
```

---

### Single Binary Packaging Strategy

Agentic OS V4 targets a **single, self-contained binary** that runs everywhere.

```mermaid
---
title: Single Binary Architecture
---
graph TB
    subgraph BUILD["Build Pipeline"]
        RUST_SRC["Rust Source<br/>Core, CLI, TUI, ACP,<br/>Gateway, MCP, Local Inf."]
        TS_SRC["TypeScript Source<br/>Dashboard, Skills,<br/>Plugins, Recipes"]
        WASM_SRC["WASM Plugins<br/>Sandboxed Skills"]
    end

    subgraph COMPILE["Compilation"]
        RUST_COMP["rustc + cargo<br/>Native compilation"]
        NAPI["napi-rs<br/>TS â†’ Native bindings"]
        WASM_COMP["wasm-pack<br/>WASM compilation"]
    end

    subgraph BUNDLE["Bundling"]
        STATIC_LINK["Static Linking<br/>SQLite, openssl, zstd"]
        EMBED_TS["Embed TS Bundles<br/>JavaScriptCore / V8<br/>snapshot"]
        EMBED_WASM["Embed WASM<br/>Plugins as blobs"]
        EMBED_MODELS["Embed Models<br/>Whisper, tokenizers<br/>(optional)"]
    end

    subgraph OUTPUT["Output â€” Single Binary"]
        LINUX_BIN["agentic-os-linux<br/>x86_64, aarch64"]
        MACOS_BIN["agentic-os-macos<br/>x86_64, aarch64"]
        WIN_BIN["agentic-os-win.exe<br/>x86_64, aarch64"]
    end

    subgraph RUNTIME["Runtime Behavior"]
        RUNTIME_BINARY["On First Run"]
        EXTRACT["Extract embedded<br/>bundles & models"]
        CHECK["Check for updates<br/>Self-update mechanism"]
        READY["Ready in < 500ms"]
    end

    RUST_SRC --> RUST_COMP
    TS_SRC --> NAPI
    WASM_SRC --> WASM_COMP

    RUST_COMP --> STATIC_LINK
    NAPI --> EMBED_TS
    WASM_COMP --> EMBED_WASM

    STATIC_LINK --> LINUX_BIN
    STATIC_LINK --> MACOS_BIN
    STATIC_LINK --> WIN_BIN
    EMBED_TS --> LINUX_BIN
    EMBED_TS --> MACOS_BIN
    EMBED_TS --> WIN_BIN
    EMBED_WASM --> LINUX_BIN
    EMBED_WASM --> MACOS_BIN
    EMBED_WASM --> WIN_BIN

    LINUX_BIN --> RUNTIME_BINARY
    MACOS_BIN --> RUNTIME_BINARY
    WIN_BIN --> RUNTIME_BINARY

    RUNTIME_BINARY --> EXTRACT
    EXTRACT --> CHECK
    CHECK --> READY
```

**Key Technical Decisions:**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Core Language** | Rust | Single binary compilation, zero-cost abstractions, memory safety, cross-platform |
| **Extensibility** | TypeScript (via napi-rs) | Rich ecosystem, familiar to most developers, static typing |
| **Plugin Sandbox** | WASM | Isolated execution, portable, language-agnostic |
| **Protocol Unification** | ACP (Agent Client Protocol) | Industry standard, supports all agent interaction patterns |
| **Config Format** | TOML + YAML + JSON + Env | Flexible, human-readable, environment-aware |
| **Database** | SQLite (default) / PostgreSQL (production) | Zero-config defaults, scalable for production |
| **Packaging** | Static binary + embedded bundles | Single file distribution, no dependency hell |
| **Self-Update** | The update framework (Rust) | Reliable, atomic updates with rollback |

---

# Phase 1: Foundation & Monorepo Bootstrap

**Duration:** 2 weeks
**Goal:** Create the root monorepo structure, import core types from all 8 projects,
set up CI/CD, define unified configuration schema, and establish developer environment.

---

## 1.1 Create Root Monorepo Structure

**Description:**
Establish the top-level directory structure for the Agentic OS V4 monorepo,
combining Cargo workspace (Rust) and npm workspaces (TypeScript). The structure
must accommodate all 8 source projects' codebases while maintaining clean
separation of concerns.

**Implementation Details:**

1. **Initialize Cargo workspace** (`Cargo.toml`):
   - Create workspace members for all Rust crates:
     - `agentic-os-core` â€” Shared core types, traits, errors
     - `agentic-os-cli` â€” CLI binary
     - `agentic-os-tui` â€” TUI binary (ratatui)
     - `agentic-os-acp` â€” ACP server implementation
     - `agentic-os-gateway` â€” Gateway core (provider registry, translator)
     - `agentic-os-mcp` â€” MCP client/server
     - `agentic-os-local-inf` â€” Local inference engine
     - `agentic-os-dictation` â€” Whisper integration
     - `agentic-os-config` â€” Configuration parser
     - `agentic-os-security` â€” Guardrails & security
   - Configure workspace-level `[workspace.dependencies]` for shared deps
   - Set up `.cargo/config.toml` with target-specific optimizations

2. **Initialize npm/pnpm workspace** (`package.json`):
   - Create workspace members for all TypeScript packages:
     - `packages/core` â€” Shared TypeScript types, interfaces, utilities
     - `packages/gateway` â€” Gateway TypeScript layer (Portkey + OmniRoute2 patterns)
     - `packages/dashboard` â€” Next.js web dashboard
     - `packages/desktop` â€” Tauri desktop renderer
     - `packages/skills` â€” Skill runtime & registry
     - `packages/plugins` â€” Plugin system
     - `packages/recipes` â€” Recipe engine UI
     - `packages/acp-client` â€” ACP client SDK
     - `packages/mcp-client` â€” MCP client SDK
     - `packages/genai` â€” Gemini integration (@google/genai wrapper)
   - Configure pnpm as package manager with `pnpm-workspace.yaml`
   - Set up `turbo.json` for cross-language task orchestration

3. **Create root directory structure**:
```
agentic-os-v4/
â”œâ”€â”€ apps/                          # Runnable applications
â”‚   â”œâ”€â”€ cli/                       # Rust CLI binary (from Goose)
â”‚   â”œâ”€â”€ tui/                       # Rust TUI binary (from Goose, ratatui)
â”‚   â”œâ”€â”€ desktop/                   # Tauri + React desktop app
â”‚   â”œâ”€â”€ dashboard/                 # Next.js web dashboard
â”‚   â”œâ”€â”€ server/                    # Unified HTTP + ACP server
â”‚   â””â”€â”€ proxy/                     # MITM proxy (from 9Router)
â”œâ”€â”€ crates/                        # Rust crates (Cargo workspace)
â”‚   â”œâ”€â”€ core/                      # Agentic OS core types & traits
â”‚   â”œâ”€â”€ config/                    # Configuration parser
â”‚   â”œâ”€â”€ acp/                       # ACP server implementation
â”‚   â”œâ”€â”€ gateway/                   # Gateway core
â”‚   â”œâ”€â”€ orchestrator/              # Agent orchestration
â”‚   â”œâ”€â”€ mcp/                       # MCP client/server
â”‚   â”œâ”€â”€ local-inference/           # Local inference (llama.cpp)
â”‚   â”œâ”€â”€ dictation/                 # Whisper dictation
â”‚   â”œâ”€â”€ security/                  # Guardrails & security
â”‚   â”œâ”€â”€ telemetry/                 # Observability
â”‚   â””â”€â”€ sandbox/                   # WASM sandbox
â”œâ”€â”€ packages/                      # TypeScript packages (npm workspace)
â”‚   â”œâ”€â”€ core/                      # Shared TS types & interfaces
â”‚   â”œâ”€â”€ gateway/                   # Gateway TS layer
â”‚   â”œâ”€â”€ dashboard/                 # Next.js dashboard components
â”‚   â”œâ”€â”€ desktop-ui/                # Tauri renderer UI
â”‚   â”œâ”€â”€ skills/                    # Skill runtime (TS)
â”‚   â”œâ”€â”€ plugins/                   # Plugin system (TS)
â”‚   â”œâ”€â”€ recipes/                   # Recipe engine (TS)
â”‚   â”œâ”€â”€ acp-client/                # ACP client SDK
â”‚   â”œâ”€â”€ mcp-client/                # MCP client SDK
â”‚   â”œâ”€â”€ genai/                    # Gemini integration (@google/genai)
â”‚   â””â”€â”€ test-utils/               # Shared test utilities
â”œâ”€â”€ tools/                         # Build & dev tools
â”‚   â””â”€â”€ binary-bundler/           # Single binary bundler script
â”œâ”€â”€ docs/                          # Documentation (Docusaurus)
â”œâ”€â”€ scripts/                       # Build, test, release scripts
â”œâ”€â”€ evals/                         # Evaluation benchmarks
â”œâ”€â”€ tests/                         # Integration & e2e tests
â”œâ”€â”€ Cargo.toml                     # Rust workspace root
â”œâ”€â”€ package.json                   # npm workspace root
â”œâ”€â”€ pnpm-workspace.yaml           # pnpm workspace config
â”œâ”€â”€ turbo.json                     # Turborepo config
â”œâ”€â”€ Justfile                       # Task runner (Just)
â”œâ”€â”€ rust-toolchain.toml            # Rust toolchain config
â””â”€â”€ .github/                      # GitHub Actions
    â”œâ”€â”€ workflows/
    â””â”€â”€ CODEOWNERS
```

4. **Configure build toolchain**:
   - Set `rust-toolchain.toml` with stable + nightly (for WASM)
   - Configure `.cargo/config.toml` with:
     - `target-dir` for shared build cache
     - `registries` for any private crates
     - `[target.'cfg(target_os = "windows")]` linker settings
   - Set up `Justfile` with core commands:
     - `just build` â€” Build all crates and packages
     - `just test` â€” Run all tests
     - `just lint` â€” Run all linters
     - `just format` â€” Format all code
     - `just bundle` â€” Create single binary
     - `just dev` â€” Start development mode

5. **Configure dependency management**:
   - Create workspace-level `Cargo.lock` for Rust
   - Create `pnpm-lock.yaml` for TypeScript
   - Set up Dependabot for automated dependency updates
   - Configure Renovate for monorepo

**Files to Create:**

| File | Purpose |
|------|---------|
| `Cargo.toml` | Rust workspace definition with all crate members |
| `package.json` | npm workspace root with scripts and devDependencies |
| `pnpm-workspace.yaml` | pnpm workspace package patterns |
| `turbo.json` | Turborepo pipeline configuration |
| `Justfile` | Task runner with build, test, lint, format, bundle commands |
| `rust-toolchain.toml` | Rust toolchain specification (stable + nightly) |
| `.cargo/config.toml` | Cargo build configuration |
| `.github/CODEOWNERS` | Code ownership per directory |
| `.gitignore` | Git ignore patterns for all languages |
| `.prettierrc` | Prettier configuration for TS/JS/MD |
| `.editorconfig` | Editor configuration |
| `rustfmt.toml` | Rust formatting configuration |
| `clippy.toml` | Clippy lint configuration |
| `eslint.config.js` | ESLint flat config for TypeScript |

**Acceptance Criteria:**
- [ ] `cargo build` compiles all Rust crates without errors
- [ ] `pnpm install` resolves all TypeScript dependencies
- [ ] `npx turbo run build` executes all build tasks
- [ ] `just build` succeeds end-to-end
- [ ] Workspace inheritance works (deps, versions, metadata)
- [ ] Directory structure matches specification
- [ ] All configuration files are present and valid

---

## 1.2 Import Core Types & Interfaces from All 8 Projects

**Description:**
Extract, normalize, and consolidate the core type definitions and interfaces
from all 8 source projects into a shared type system. This is the foundation
for cross-project interoperability.

**Implementation Details:**

1. **Analyze and extract type systems** from each project:

   | Project | Key Types to Extract | Format |
   |---------|---------------------|--------|
   | Agentic OS V3 | Agent, DAG, Pipeline, Graph, Task, Skill, ShadowDaemon, Scheduler | Rust `struct` + TS `interface` |
   | 9Router | Provider, Route, Translation, MITMConfig, RTKConfig, Session | Rust `struct` |
   | Goose | ACPMessage, Extension, Recipe, Tool, MCPConfig, Session | Rust `struct` + TS `interface` |
   | litellm | ModelInfo, ProviderConfig, RoutingStrategy, CacheConfig, Budget | Python â†’ TS translation |
   | new-api | Channel, Relay, User, Tenant, Quota, BillingRecord | Go â†’ Rust translation |
   | OmniRoute2 | SkillManifest, ComboRoute, Plugin, i18nMessages | TS `interface` |
   | Portkey | Guardrail, Fallback, CachePolicy, ObservabilityConfig | TS `interface` |
   | gemini-cli | GenAIModel, SafetySetting, Tool, MCPConfig, Extension | TS `interface` |

2. **Create shared Rust core types** (`crates/core/src/`):

   ```rust
   // crates/core/src/lib.rs â€” Core crate root
   pub mod agent;         // Agent, Task, Workflow types
   pub mod provider;      // Provider, Model, Capability types
   pub mod gateway;       // Gateway, Route, Translation types
   pub mod acp;           // ACP message, Session types
   pub mod mcp;           // MCP tool, Resource types
   pub mod config;        // Configuration types
   pub mod security;      // Guardrail, Policy types
   pub mod telemetry;     // Span, Event, Metric types
   pub mod error;         // Unified error types
   pub mod result;        // Unified result types

   // Example: Unified Provider type
   pub struct Provider {
       pub id: String,
       pub name: String,
       pub provider_type: ProviderType,
       pub base_url: String,
       pub api_version: String,
       pub auth_type: AuthType,
       pub models: Vec<ModelInfo>,
       pub capabilities: ProviderCapabilities,
       pub rate_limits: RateLimitConfig,
       pub health_check: HealthCheckConfig,
       pub metadata: HashMap<String, String>,
   }
   ```

3. **Create shared TypeScript core types** (`packages/core/src/`):

   ```typescript
   // packages/core/src/index.ts â€” Core package entry
   export * from './agent.js';
   export * from './provider.js';
   export * from './gateway.js';
   export * from './acp.js';
   export * from './mcp.js';
   export * from './config.js';
   export * from './security.js';
   export * from './telemetry.js';
   export * from './error.js';
   export * from './skill.js';
   export * from './plugin.js';
   export * from './recipe.js';

   // Example: Unified Provider interface
   export interface Provider {
     id: string;
     name: string;
     providerType: ProviderType;
     baseUrl: string;
     apiVersion: string;
     authType: AuthType;
     models: ModelInfo[];
     capabilities: ProviderCapabilities;
     rateLimits: RateLimitConfig;
     healthCheck: HealthCheckConfig;
     metadata: Record<string, string>;
   }
   ```

4. **Create Rustâ†”TypeScript type bridges**:
   - Use `napi-rs` derive macros for automatic binding generation
   - Define `#[napi(object)]` on core structs for JS interop
   - Create `From`/`Into` implementations for type conversion

5. **Write normalization scripts** for importing from each project:
   - `scripts/import-agentic-os-v3.ts` â€” Extract types from V3 source
   - `scripts/import-9router.ts` â€” Extract types from 9Router source
   - `scripts/import-goose.ts` â€” Extract types from Goose source
   - `scripts/import-litellm.ts` â€” Extract and translate Python types
   - `scripts/import-new-api.ts` â€” Extract and translate Go types
   - `scripts/import-omniroute.ts` â€” Extract types from OmniRoute2
   - `scripts/import-portkey.ts` â€” Extract types from Portkey
   - `scripts/import-gemini-cli.ts` â€” Extract types from gemini-cli

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/core/src/lib.rs` | Rust core crate root with re-exports |
| `crates/core/src/agent.rs` | Agent, Task, Workflow types |
| `crates/core/src/provider.rs` | Provider, Model, Capability types |
| `crates/core/src/gateway.rs` | Gateway, Route, Translation types |
| `crates/core/src/acp.rs` | ACP message, Session types |
| `crates/core/src/mcp.rs` | MCP tool, Resource types |
| `crates/core/src/config.rs` | Configuration types |
| `crates/core/src/security.rs` | Guardrail, Policy types |
| `crates/core/src/telemetry.rs` | Span, Event, Metric types |
| `crates/core/src/error.rs` | Unified error types & error codes |
| `crates/core/src/result.rs` | Unified result types & helpers |
| `packages/core/src/index.ts` | TS core package entry |
| `packages/core/src/agent.ts` | TS agent types |
| `packages/core/src/provider.ts` | TS provider types |
| `packages/core/src/gateway.ts` | TS gateway types |
| `packages/core/src/acp.ts` | TS ACP types |
| `packages/core/src/mcp.ts` | TS MCP types |
| `packages/core/src/config.ts` | TS config types |
| `packages/core/src/security.ts` | TS security types |
| `packages/core/src/telemetry.ts` | TS telemetry types |
| `packages/core/src/skill.ts` | TS skill types |
| `packages/core/src/plugin.ts` | TS plugin types |
| `packages/core/src/recipe.ts` | TS recipe types |
| `packages/core/package.json` | Package manifest |
| `packages/core/tsconfig.json` | TypeScript configuration |

**Acceptance Criteria:**
- [ ] All Rust types compile with `cargo build -p agentic-os-core`
- [ ] All TS types compile with `tsc --noEmit`
- [ ] Type definitions cover all 8 projects' core concepts
- [ ] napi-rs bindings generate valid JS interfaces
- [ ] Normalization scripts import types from each project successfully
- [ ] No circular dependencies between type modules
- [ ] Error types are comprehensive and consistent

---

## 1.3 Set Up CI/CD (GitHub Actions, Multi-Arch Builds)

**Description:**
Establish a comprehensive CI/CD pipeline using GitHub Actions that builds,
tests, and packages Agentic OS V4 for all target platforms: Linux (x86_64,
aarch64), macOS (x86_64, aarch64), and Windows (x86_64, aarch64).

**Implementation Details:**

1. **Create core CI workflow** (`.github/workflows/ci.yml`):
   - Trigger on: `push` to main, `pull_request` to main
   - Matrix: 3 OS Ã— 2 architectures Ã— 2 build profiles (debug, release)
   - Steps: Checkout, install Rust/Node.js, cache deps, lint, build, test, bundle

2. **Create multi-arch build workflow** (`.github/workflows/build.yml`):
   - Target matrix: x86_64/aarch64 for Linux, macOS, Windows
   - Use `cross` tool for cross-compilation
   - Store build artifacts per architecture

3. **Create release workflow** (`.github/workflows/release.yml`):
   - Trigger on semver tags (`v*`)
   - Build all architectures, generate checksums, create GitHub Release
   - Publish to crates.io, npm, Homebrew, Docker Hub

4. **Create nightly build workflow** (`.github/workflows/nightly.yml`):
   - Daily cron schedule for full integration test suite
   - Publishes nightly tags to package registries

**Files to Create:**

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Core CI workflow |
| `.github/workflows/build.yml` | Multi-arch build workflow |
| `.github/workflows/release.yml` | Release workflow |
| `.github/workflows/nightly.yml` | Nightly build workflow |
| `.github/workflows/lint.yml` | Linting workflow |
| `.github/workflows/security.yml` | Security audit workflow |
| `.github/workflows/coverage.yml` | Code coverage workflow |
| `.github/dependabot.yml` | Dependabot configuration |
| `Cross.toml` | Cross-compilation configuration |

**Acceptance Criteria:**
- [ ] CI passes on all 3 OS Ã— 2 architectures
- [ ] Release workflow creates binaries for all 6 target triples
- [ ] Binary is statically linked and self-contained (< 50MB compressed)
- [ ] Docker image builds and runs successfully
- [ ] Nightly builds run on schedule
- [ ] Security audit passes (no critical vulnerabilities)
- [ ] Build caching reduces subsequent build times by > 50%

---

## 1.4 Create Unified Configuration Schema

**Description:**
Design and implement the unified configuration schema that covers all features
from all 8 projects. The schema supports TOML (primary), YAML, JSON, and
environment variables, with validation, merging, and inheritance.

**Implementation Details:**

1. **Design the unified config schema** covering agent, gateway, ACP, MCP,
   security, observability, cache, billing, local inference, dictation, MITM,
   RTK, skills, recipes, and developer mode.

2. **Create the schema definition** in Rust with `serde` for TOML/YAML/JSON

3. **Implement config file resolution**:
   - Priority: project-local > user-global > legacy > env vars > defaults
   - Environment variables: `AGENTIC_OS__<SECTION>__<KEY>`

4. **Create TypeScript schema mirror** for dashboard editing

5. **Create JSON Schema** for IDE autocompletion in VS Code

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/config/src/lib.rs` | Config crate root |
| `crates/config/src/schema.rs` | Config schema definitions |
| `crates/config/src/parser.rs` | TOML/YAML/JSON/env parser |
| `crates/config/src/merge.rs` | Config merging & inheritance |
| `crates/config/src/validate.rs` | Config validation |
| `crates/config/src/defaults.rs` | Default configuration values |
| `packages/core/src/config.ts` | TypeScript config types |
| `schemas/agentic-os-config.schema.json` | JSON Schema for autocompletion |

**Acceptance Criteria:**
- [ ] Config parser reads TOML, YAML, JSON correctly
- [ ] Environment variables override file settings
- [ ] Config merging works (project < user < env < cli flags)
- [ ] Validation catches invalid configurations with helpful messages
- [ ] Default config allows zero-config startup
- [ ] All 8 projects' configuration options are representable

---

## 1.5 Set Up Developer Environment

**Description:**
Create a consistent, reproducible developer environment using devcontainers,
with comprehensive linting, formatting, and editor configuration for all
languages in the monorepo.

**Implementation Details:**

1. **Create devcontainer configuration** (`.devcontainer/`) with Rust, Node.js,
   pnpm, and all build tools pre-installed
2. **Configure VS Code extensions**: rust-analyzer, even-better-toml, prettier,
   eslint, mermaid chart preview, and more
3. **Set up formatting**: `rustfmt.toml`, `.prettierrc`, `.editorconfig`
4. **Set up linting**: `clippy.toml`, ESLint flat config
5. **Create pre-commit hooks** (`.husky/`) for lint-staged and conventional commits
6. **Create documentation**: `CONTRIBUTING.md`, `DEVELOPMENT.md`

**Files to Create:**

| File | Purpose |
|------|---------|
| `.devcontainer/devcontainer.json` | Devcontainer metadata |
| `.devcontainer/Dockerfile` | Devcontainer Dockerfile |
| `.vscode/settings.json` | VS Code workspace settings |
| `.vscode/extensions.json` | Recommended VS Code extensions |
| `.vscode/launch.json` | Debug configurations |
| `rustfmt.toml` | Rust formatting rules |
| `clippy.toml` | Clippy lint rules |
| `.prettierrc` | Prettier formatting rules |
| `.editorconfig` | Cross-editor configuration |
| `.husky/pre-commit` | Pre-commit hook |
| `.husky/commit-msg` | Commit message hook |
| `scripts/dev-setup.sh` | Local dev setup script |
| `CONTRIBUTING.md` | Developer contribution guide |

**Acceptance Criteria:**
- [ ] Devcontainer builds and starts successfully
- [ ] `just fmt` formats all Rust and TypeScript code
- [ ] `just lint` passes with zero warnings
- [ ] Pre-commit hooks block commits with lint errors
- [ ] Conventional commit format is enforced
- [ ] New developer can go from `git clone` to `just build` in < 5 minutes

---

# Phase 2: Unified Configuration System

**Duration:** 2 weeks
**Goal:** Design and implement the unified configuration system that reads,
validates, merges, and watches configuration from multiple sources, with CLI
commands for management and a migration tool for existing configs.

---

## 2.1 Design Config Schema Covering All Projects' Needs

**Description:**
Design a comprehensive configuration schema that encompasses every
configuration option from all 8 projects, organized in a logical hierarchy with
proper defaults, validation rules, and documentation.

**Implementation Details:**

1. **Audit all configuration options from each project:**

   | Project | Config Files | Key Sections | Total Options |
   |---------|-------------|--------------|---------------|
   | Agentic OS V3 | `config.yaml`, `.env` | agent, orchestration, skills, security, scheduler | ~120 |
   | 9Router | `9router.toml`, `.9router.env` | providers, routes, translation, mitm, rtk, auth | ~200 |
   | Goose | `config.yaml`, `settings.json` | acp, extensions, recipes, mcp, local, dictation | ~180 |
   | litellm | `config.yaml`, `proxy_config.yaml` | general, model_list, router, litellm_settings, guardrails | ~250 |
   | new-api | `config.json`, `newapi.toml` | channels, relays, billing, users, tenants | ~150 |
   | OmniRoute2 | `omniroute.config.ts`, `.env` | providers, skills, combo, plugins, i18n | ~100 |
   | Portkey | `portkey.config.json` | providers, cache, guardrails, fallbacks, observability | ~120 |
   | gemini-cli | `settings.json`, `GEMINI.md` | model, auth, tools, mcp, sandbox, telemetry | ~90 |

2. **Design the unified schema hierarchy** with sections for:
   - Agent orchestration (from V3)
   - AI Gateway providers, translation, streaming, routing, resilience (from 9Router, litellm, new-api, OmniRoute2, Portkey)
   - ACP server (from Goose)
   - MCP registry and sandbox (from Goose, 9Router, gemini-cli)
   - Security and guardrails (from V3, Portkey, litellm)
   - Observability (from all projects)
   - Local inference and dictation (from Goose)
   - MITM proxy (from 9Router)
   - RTK compression (from 9Router, OmniRoute2)
   - Skills and recipes (from V3, OmniRoute2, Goose)
   - Billing and quotas (from new-api, litellm)

3. **Create JSON Schema** for IDE autocompletion and validation
4. **Document every option** with description, type, default, valid values, and source project

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/config/src/schema.rs` | Complete config schema (updated) |
| `docs/config-reference.md` | Comprehensive config reference |
| `packages/dashboard/src/components/ConfigEditor/` | Visual config editor |
| `packages/core/src/config.ts` | Updated config types |
| `schemas/agentic-os-config.schema.json` | Updated JSON Schema |

**Acceptance Criteria:**
- [ ] Schema covers 100% of configurable options from all 8 projects
- [ ] Every option has a description, type, default, and source
- [ ] Config editor UI renders and validates properly
- [ ] Default config allows zero-config operation for common use cases

---

## 2.2 Implement Config Parser (Rust Core, TOML/YAML/JSON/Env)

**Description:**
Build the core configuration parser in Rust that reads configuration from
multiple formats, merges them according to priority rules, and produces a
validated `AgenticOSConfig` struct.

**Implementation Details:**

1. **Implement file format detection and parsing** supporting:
   - TOML via `toml` crate with `Deserialize`
   - YAML via `serde_yaml` crate
   - JSON via `serde_json` crate
   - Environment files (`.env`) via custom parser or `dotenvy`

2. **Implement config file discovery** in priority order:
   - Project-local: `./agentic-os.toml`
   - User-global: `~/.config/agentic-os/config.toml`
   - Legacy: `~/.agentic-os/config.toml`
   - Environment variables: `AGENTIC_OS__*`

3. **Implement config merging** with layered priority:
   - Built-in defaults (lowest) â†’ System â†’ User â†’ Project â†’ Env â†’ CLI flags (highest)

4. **Implement secret redaction** for safe display of config
5. **Implement validation** with helpful error messages including file/line references

**Files to Create/Modify:**

| File | Purpose |
|------|---------|
| `crates/config/src/parser.rs` | File format detection and parsing |
| `crates/config/src/merge.rs` | Config merging with priority |
| `crates/config/src/discover.rs` | Config file discovery |
| `crates/config/src/env.rs` | Environment variable parsing |
| `crates/config/src/validate.rs` | Config validation |
| `crates/config/src/redact.rs` | Secret redaction for display |

**Acceptance Criteria:**
- [ ] Parses TOML, YAML, JSON, and .env files correctly
- [ ] Environment variables with `AGENTIC_OS__` prefix work
- [ ] Config file discovery finds files in correct priority order
- [ ] Merging applies higher-priority sources over lower-priority
- [ ] Secrets (api_key, password, token) are redacted in display
- [ ] Validation produces helpful error messages with file/line references

---

## 2.3 Create Config CLI Commands (init, validate, apply, diff)

**Description:**
Build a comprehensive set of CLI commands for managing configuration, inspired
by the best CLI patterns from all 8 projects.

**Implementation Details:**

1. **`config init`**: Creates a new config file with template selection (minimal/standard/enterprise), supports `--force`
2. **`config validate`**: Discovers and validates all config files, reports errors with file/line references, supports `--watch`
3. **`config apply`**: Validates config and hot-reloads running instance, supports `--no-reload`
4. **`config diff`**: Compares two config files or config vs running state, shows added/removed/changed options
5. **`config show`**: Displays current merged configuration with secrets redacted, supports `--json`, `--yaml`, `--toml`

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/cli/src/commands/config.rs` | Config CLI commands |
| `crates/config/templates/minimal.toml` | Minimal config template |
| `crates/config/templates/standard.toml` | Standard config template |
| `crates/config/templates/enterprise.toml` | Enterprise config template (SSO, RBAC, billing, HA, audit, compliance) (SSO, RBAC, billing, HA, audit, compliance) (SSO, RBAC, billing, HA, audit, compliance) (SSO, RBAC, billing, HA clustering, audit, compliance) |

**Acceptance Criteria:**
- [ ] `agentic-os config init` creates a valid config file
- [ ] `agentic-os config validate` reports errors with file/line references
- [ ] `agentic-os config apply` validates and prepares config for use
- [ ] `agentic-os config diff` shows meaningful differences
- [ ] `agentic-os config show` displays config with secrets redacted
- [ ] All commands have `--help` with comprehensive documentation

---

## 2.4 Implement Config Hot-Reload and Watch Mode

**Description:**
Implement file watching and hot-reload for configuration, allowing Agentic OS
V4 to detect config file changes at runtime and apply them without restarting
the process.

**Implementation Details:**

1. **Implement config watcher** using the `notify` crate:
   - Monitor config files for changes with debounce (200ms)
   - Support for watching multiple config files simultaneously

2. **Implement hot-reload triggers** for each subsystem:
   - ACP server: session timeout, extension paths
   - Gateway: provider configs, routing rules
   - Security: guardrail policies
   - Cache: TTL, max size
   - Observability: log level, sampling rate
   - Local inference: model paths, GPU settings

3. **Implement atomic config swap** using `Arc<RwLock<T>>`:
   - Readers always see a consistent config state
   - Writers atomically swap entire config struct

4. **Implement change events** for observability:
   - Emit metrics on config changes
   - Log all config changes with before/after values (secrets redacted)

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/config/src/watch.rs` | Config file watcher implementation |
| `crates/config/src/hot_reload.rs` | Hot-reload coordination |
| `crates/config/src/atomic.rs` | Atomic config swap |

**Acceptance Criteria:**
- [ ] Config file changes are detected within 1 second
- [ ] Hot-reload applies changes without process restart
- [ ] Atomic config swap prevents partial reads during hot-reload
- [ ] Port/host changes correctly warn that restart is required
- [ ] Provider config changes take effect immediately
- [ ] Security policy changes apply to new requests instantly
- [ ] Watch mode does not cause excessive CPU usage (< 1% idle)

---

## 2.5 Create Config Migration Tool for Existing Configs

**Description:**
Build a migration tool that automatically detects, reads, and converts
configuration files from any of the 8 source projects into the unified
Agentic OS V4 format.

**Implementation Details:**

1. **Implement auto-detection of legacy configs**: Scan standard locations
   for each project's config files; detect format by file name, extension,
   and content signature

2. **Implement per-project migrators**:
   - `AgenticOSV3Migrator` â€” Reads `config.yaml`, maps agent settings
   - `NineRouterMigrator` â€” Reads `9router.toml`, maps providers and routes
   - `GooseMigrator` â€” Reads `config.yaml`/`settings.json`, maps ACP/extensions
   - `LiteLLMMigrator` â€” Reads proxy config, maps model list and routing
   - `NewAPIMigrator` â€” Reads channel config, maps billing and quotas
   - `OmniRoute2Migrator` â€” Reads TS config, maps skills and plugins
   - `PortkeyMigrator` â€” Reads JSON config, maps guardrails and caching
   - `GeminiCliMigrator` â€” Reads `settings.json`, maps model, auth, MCP

3. **Implement migration reporting**: Report mapped/lost options with suggestions
4. **Implement `config migrate` CLI command**: Auto-detect or `--path`, `--dry-run`, `--output`

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/config/src/migration/mod.rs` | Migration framework |
| `crates/config/src/migration/agentic_os_v3.rs` | V3 config migrator |
| `crates/config/src/migration/nine_router.rs` | 9Router config migrator |
| `crates/config/src/migration/goose.rs` | Goose config migrator |
| `crates/config/src/migration/litellm.rs` | litellm config migrator |
| `crates/config/src/migration/new_api.rs` | new-api config migrator |
| `crates/config/src/migration/omniroute2.rs` | OmniRoute2 config migrator |
| `crates/config/src/migration/portkey.rs` | Portkey config migrator |
| `crates/config/src/migration/gemini_cli.rs` | gemini-cli config migrator |
| `crates/cli/src/commands/config/migrate.rs` | `config migrate` CLI command |

**Acceptance Criteria:**
- [ ] Migration tool detects all 8 project configs in standard locations
- [ ] Each migrator correctly converts to unified format
- [ ] Unmapped options are reported with clear explanations
- [ ] Original configs are never modified during migration
- [ ] `config migrate --dry-run` shows what would happen without applying

---

# Phase 3: Provider Registry â€” Core

**Duration:** 2 weeks
**Goal:** Design and implement the unified provider adapter interface, import
provider configurations from 9Router (100+), litellm (100+), Portkey (50+),
and new-api (40+), normalizing them into a single registry.

---

## 3.1 Design Unified Provider Adapter Interface (Rust Trait + TS Interface)

**Description:**
Create the abstraction layer that allows any AI provider to be represented
uniformly, with adapters implementing a common interface for chat completions,
embeddings, streaming, and tool calling.

**Implementation Details:**

1. **Design the Rust trait hierarchy**:
   - `AIProvider` â€” Core trait: id, name, models, capabilities, health check
   - `ChatProvider` â€” Chat completions + streaming (extends AIProvider)
   - `EmbeddingProvider` â€” Text embeddings (extends AIProvider)
   - `ImageProvider` â€” Image generation (extends AIProvider)
   - `AudioProvider` â€” Audio transcription (extends AIProvider)
   - `ToolProvider` â€” Tool/function calling (extends ChatProvider)

2. **Design the TypeScript interface hierarchy** mirroring Rust traits

3. **Design unified request/response types**: ChatRequest, ChatResponse,
   StreamChunk, EmbeddingRequest/Response, ToolDefinition/Call/Result

4. **Implement provider factory/registry**:
   - `ProviderRegistry` â€” Registration, lookup, capability-based resolution
   - `ProviderFactory` â€” Creates provider adapters from config

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/provider/mod.rs` | Provider module root |
| `crates/gateway/src/provider/traits.rs` | Provider trait definitions |
| `crates/gateway/src/provider/types.rs` | Unified request/response types |
| `crates/gateway/src/provider/registry.rs` | Provider registry implementation |
| `crates/gateway/src/provider/error.rs` | Provider-specific errors |
| `crates/gateway/src/provider/factory.rs` | Provider factory |
| `packages/core/src/provider.ts` | TypeScript provider interfaces |

**Acceptance Criteria:**
- [ ] `AIProvider` trait compiles with all associated methods
- [ ] `ChatProvider`, `EmbeddingProvider`, `ImageProvider`, `AudioProvider` traits defined
- [ ] `ProviderRegistry` supports registration, lookup, and resolution
- [ ] TypeScript interfaces mirror Rust traits
- [ ] napi-rs bindings export provider types to JS
- [ ] Provider resolution works (find provider for given model + capabilities)

---

## 3.2 Import and Normalize 9Router's 100+ Providers

**Description:**
Extract, analyze, and normalize the provider configurations from 9Router's
codebase â€” one of the most comprehensive provider registries with 100+ providers.

**Implementation Details:**

1. **Analyze 9Router's provider structure** in `9Router/src/gateway/providers/`:
   - Categories: LLM APIs (OpenAI, Anthropic, Google), Open Source Hosted
     (Ollama, vLLM), AI Platforms (OpenRouter, Together), IDE Tools (Cursor,
     Windsurf), Code Assistants (Copilot), Chinese Providers (DeepSeek, Qwen),
     Enterprise (Databricks, AWS Bedrock)

2. **Create import script** scanning provider directories, parsing configs,
   extracting models, endpoints, auth types, rate limits

3. **Create provider adapter implementations** for each major provider with
   full streaming and non-streaming support

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/provider/import/nine_router/mod.rs` | 9Router import module |
| `crates/gateway/src/provider/adapters/openai.rs` | OpenAI adapter |
| `crates/gateway/src/provider/adapters/anthropic.rs` | Anthropic adapter |
| `crates/gateway/src/provider/adapters/google.rs` | Google/Gemini adapter |
| `crates/gateway/src/provider/adapters/azure.rs` | Azure OpenAI adapter |
| `crates/gateway/src/provider/adapters/bedrock.rs` | AWS Bedrock adapter |
| `crates/gateway/src/provider/adapters/vertex.rs` | GCP Vertex adapter |
| `crates/gateway/src/provider/adapters/ollama.rs` | Ollama adapter |
| `crates/gateway/src/provider/adapters/openrouter.rs` | OpenRouter adapter |
| `scripts/import-9router-providers.ts` | 9Router import script |
| `data/providers/9router-providers.json` | Extracted provider data |

**Acceptance Criteria:**
- [ ] All 100+ 9Router providers are imported and normalized
- [ ] Each major provider has a working adapter implementation
- [ ] Provider capability matrix is accurate (models, features, pricing)
- [ ] Adapter handles both streaming and non-streaming requests

---

## 3.3 Import and Normalize litellm's 100+ Providers

**Description:**
Extract, analyze, and normalize the provider configurations from litellm's
codebase, which has extensive model metadata, pricing, and routing configurations.

**Implementation Details:**

1. **Import litellm's model pricing database**:
   - `model_prices_and_context_window.json` â€” Master database with per-model:
     max_tokens, pricing (input/output/cache), capabilities, rate limits

2. **Merge litellm metadata into existing provider configs**:
   - Update pricing with litellm's data (most accurate source)
   - Add context window limits and capability flags

3. **Integrate litellm's routing strategies**:
   - SimpleFallback, LeastBusy, LatencyBased, CostBased, Weighted, UsageBased

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/provider/import/litellm/mod.rs` | litellm import module |
| `crates/gateway/src/provider/import/litellm/pricing.rs` | Pricing data integration |
| `crates/gateway/src/routing/litellm.rs` | Litellm routing integration |
| `data/providers/litellm-models.json` | Extracted model database |
| `scripts/import-litellm-providers.ts` | litellm import script |

**Acceptance Criteria:**
- [ ] All litellm providers are imported with pricing and capabilities
- [ ] Model metadata (context windows, pricing, features) is accurate
- [ ] Routing strategies from litellm are available in unified router
- [ ] Rate limit data (TPM, RPM) is preserved

---

## 3.4 Import and Normalize Portkey's 50+ Providers

**Description:**
Extract, analyze, and normalize the provider configurations from Portkey's
codebase, which has a clean provider registry with strong guardrail and
observability integrations.

**Implementation Details:**

1. **Import and normalize Portkey providers**:
   - 50+ providers with clean TypeScript interfaces
   - Preserve guardrail plugin configurations
   - Preserve semantic caching and fallback configurations

2. **Integrate Portkey's guardrail system**:
   - Pre-request guardrails: PII detection, prompt injection, jailbreak
   - Post-request guardrails: content safety, factual consistency
   - Load Portkey guardrail plugins dynamically

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/provider/import/portkey/mod.rs` | Portkey import module |
| `crates/security/src/guardrails/portkey.rs` | Portkey guardrail adapters |
| `data/providers/portkey-providers.json` | Extracted provider data |
| `scripts/import-portkey-providers.ts` | Portkey import script |

**Acceptance Criteria:**
- [ ] All 50+ Portkey providers are imported
- [ ] Guardrail plugin system is integrated
- [ ] Semantic caching and fallback configurations are preserved

---

## 3.5 Import and Normalize new-api's 40+ Relay Adapters

**Description:**
Extract, analyze, and normalize the provider configurations from new-api's
Go-based codebase, which features a unique channel/relay model and billing system.

**Implementation Details:**

1. **Import and normalize new-api relay adapters**:
   - 40+ relay adapters for various providers
   - Channel management with priority, weight, rate limits
   - Model mapping (aliases) for each channel

2. **Integrate new-api's billing system**:
   - Usage tracking per user/tenant
   - Quota management with request and token limits
   - Budget alerts and rate limit profiles

3. **Integrate new-api's multi-tenant system**:
   - Tenant authentication via API keys
   - Per-tenant rate limits and quotas
   - Isolated usage tracking

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/provider/import/new_api/mod.rs` | new-api import module |
| `crates/gateway/src/billing/new_api.rs` | Billing system integration |
| `crates/gateway/src/tenant/mod.rs` | Multi-tenant management |
| `crates/gateway/src/channel/mod.rs` | Channel management |
| `data/providers/new-api-channels.json` | Extracted channel data |
| `scripts/import-new-api-providers.ts` | new-api import script |

**Acceptance Criteria:**
- [ ] All 40+ new-api relay adapters are imported
- [ ] Channel management, billing, and multi-tenant systems work
- [ ] Model mapping (aliases) from new-api are preserved

---

# Phase 4: Provider Registry â€” Completion

**Duration:** 2 weeks
**Goal:** Complete the provider registry by importing gemini-cli's Gemini
integration, merging all provider configs, implementing the capability matrix,
health check system, and auto-discovery.

---

## 4.1 Import gemini-cli's Gemini API Integration (@google/genai)

**Description:**
Import and integrate gemini-cli's robust Google Gemini API integration,
including the `@google/genai` client library, authentication flows, model
support, safety settings, and ground truth with Google Search.

**Implementation Details:**

1. **Create Rust Gemini adapter** supporting:
   - Three auth flows: API key, OAuth (device flow), Vertex AI
   - Chat completions and SSE streaming
   - Safety settings mapping (harassment, hate speech, dangerous content)
   - Google Search grounding with dynamic retrieval
   - Context caching for long conversations (up to 1M tokens)
   - Function calling via Gemini's FunctionCall content blocks
   - Multimodal inputs (images, audio, video, PDFs via base64)
   - Token counting via Gemini's native `countTokens` API

2. **Implement OAuth flow from gemini-cli**:
   - Device authorization flow with user_code/verification_uri display
   - Token polling and automatic refresh
   - Secure token storage via system keychain

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/provider/adapters/gemini.rs` | Gemini adapter implementation |
| `crates/gateway/src/provider/adapters/gemini/safety.rs` | Safety settings mapping |
| `crates/gateway/src/provider/adapters/gemini/grounding.rs` | Google Search grounding |
| `crates/gateway/src/provider/adapters/gemini/caching.rs` | Context caching |
| `crates/gateway/src/auth/gemini.rs` | Gemini OAuth flow |
| `packages/genai/src/index.ts` | TypeScript Gemini integration |
| `packages/genai/src/adapter.ts` | TS-to-Rust bridge |

**Acceptance Criteria:**
- [ ] Gemini adapter supports API key, OAuth, and Vertex AI auth
- [ ] All Gemini models are registered (Gemini 2.5 Pro, Flash, etc.)
- [ ] Safety settings map correctly
- [ ] Google Search grounding works
- [ ] Context caching for long conversations works
- [ ] Multimodal inputs (images, audio) are supported
- [ ] Token counting uses Gemini's native API

---

## 4.2 Merge All Provider Configs into Unified Registry

**Description:**
Combine all provider configurations from 9Router, litellm, Portkey, new-api,
and gemini-cli into a single, deduplicated, unified provider registry.

**Implementation Details:**

1. **Design the merge algorithm**:
   - `SmartMerge` â€” Union of models, best pricing wins, union of capabilities
   - Track sources in metadata for provenance
   - Handle conflicts: same provider ID from multiple sources

2. **Create the unified provider data file** (`data/providers/unified-registry.json`):
   - Single source of truth, human-readable JSON
   - Build-time code generation embeds all data into Rust binary
   - Zero runtime parsing overhead

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/provider/merge.rs` | Provider merging logic |
| `crates/gateway/build.rs` | Build-time code generation |
| `data/providers/unified-registry.json` | Single source of truth |
| `scripts/generate-unified-registry.ts` | Script to regenerate registry |

**Acceptance Criteria:**
- [ ] No duplicate providers in the unified registry
- [ ] Each provider has the best available data from all sources
- [ ] Source tracking shows which projects contributed
- [ ] Build-time code generation produces valid Rust code

---

## 4.3 Implement Provider Capability Matrix

**Description:**
Build a comprehensive capability matrix that allows querying providers by
model features, pricing, rate limits, and supported capabilities.

**Implementation Details:**

1. **Design capability matrix** with `ProviderCapabilities` and `ModelCapabilities`
2. **Implement query interface**: `find_providers()`, `find_best_model()`,
   `compare_models()`, `estimate_cost()`, `estimate_latency()`
3. **Create CLI commands**: `provider list`, `provider compare`, `provider estimate`

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/provider/capabilities.rs` | Capability matrix |
| `crates/gateway/src/provider/capabilities/query.rs` | Query interface |
| `crates/gateway/src/provider/capabilities/compare.rs` | Model comparison |
| `crates/gateway/src/provider/capabilities/pricing.rs` | Cost estimation |
| `crates/cli/src/commands/provider.rs` | Provider CLI commands |

**Acceptance Criteria:**
- [ ] Capability matrix is populated from all providers in registry
- [ ] Query interface returns correct results for capability filters
- [ ] Model comparison shows meaningful differences
- [ ] Cost estimation is accurate based on provider pricing data

---

## 4.4 Implement Provider Health Check System

**Description:**
Build a robust health check system that periodically verifies provider
availability, latency, and correctness, with automatic deactivation of
unhealthy providers.

**Implementation Details:**

1. **Implement health check execution**:
   - Concurrent checks for all providers via `GET /v1/models` (OpenAI-compatible)
   - Latency tracking (p50, p99)
   - Automatic deactivation after N consecutive failures
   - Automatic reactivation after N consecutive successes

2. **Implement health check API endpoints**:
   - `GET /api/v1/health` â€” Overall system health
   - `GET /api/v1/health/providers` â€” All provider statuses
   - `GET /api/v1/health/providers/:id` â€” Specific provider status

3. **Implement health dashboard** with real-time cards and status indicators

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/health/mod.rs` | Health check system |
| `crates/gateway/src/health/checker.rs` | Health check execution |
| `crates/gateway/src/health/scheduler.rs` | Scheduled health checks |
| `crates/server/src/routes/health.rs` | Health check API endpoints |
| `packages/dashboard/src/pages/Health.tsx` | Health dashboard UI |

**Acceptance Criteria:**
- [ ] Health checks run on configurable interval
- [ ] Unhealthy providers are auto-deactivated after N failures
- [ ] Health check results are available via API and dashboard
- [ ] Health checks are concurrent and non-blocking

---

## 4.5 Create Provider Discovery and Auto-Configuration

**Description:**
Implement automatic provider discovery from the environment, including
detecting local providers, reading environment variables for API keys, and
offering guided setup for new providers.

**Implementation Details:**

1. **Implement local provider discovery**:
   - Detect Ollama at `http://localhost:11434`
   - Detect vLLM at `http://localhost:8000`
   - Detect LM Studio at `http://localhost:1234`
   - Detect LocalAI, llama.cpp server, TGI
   - Auto-detect available models via each provider's API

2. **Implement environment variable discovery**:
   - Scan for `*_API_KEY` env vars (OPENAI, ANTHROPIC, GEMINI, etc.)
   - Auto-generate provider configs from discovered keys

3. **Implement guided provider setup wizard**:
   - Interactive prompts for provider configuration
   - Connection testing with live API calls
   - Model listing after successful connection

4. **Implement first-run auto-config**:
   - On first startup, run discovery automatically
   - Present discovered providers to user
   - Auto-save to config with user confirmation

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/provider/discovery.rs` | Provider discovery |
| `crates/gateway/src/provider/discovery/local.rs` | Local provider detection |
| `crates/gateway/src/provider/discovery/env.rs` | Environment variable discovery |
| `crates/gateway/src/provider/setup.rs` | Guided provider setup |
| `crates/cli/src/commands/provider/add.rs` | `provider add` command |
| `crates/cli/src/commands/provider/discover.rs` | `provider discover` command |

**Acceptance Criteria:**
- [ ] Local providers (Ollama, vLLM, LM Studio) are auto-detected
- [ ] Environment variables trigger automatic provider configuration
- [ ] Guided setup walks through provider configuration
- [ ] Auto-config on first run discovers and saves providers
- [ ] Connection testing validates provider configuration

---

# Phase 5: Protocol Translation Layer

**Duration:** 2 weeks
**Goal:** Implement the protocol translation layer that converts between
different AI provider formats (OpenAI, Anthropic, Gemini) while preserving
streaming, function calling, and advanced features.

---

## 5.1 Implement OpenAI-Compatible Protocol Adapter

**Description:**
Build a robust adapter that translates between unified format and OpenAI's API
format â€” the de-facto standard for AI providers.

**Implementation Details:**

1. **Design the OpenAI protocol handler**:
   - `translate_request()` â€” Unified â†’ OpenAI chat completion format
   - `translate_response()` â€” OpenAI â†’ Unified response format
   - `translate_stream_chunk()` â€” OpenAI SSE â†’ Unified stream chunk
   - Handle system/user/assistant/tool messages
   - Handle multimodal content (images, audio as base64)
   - Handle tool/function calling definitions and results
   - Handle response format (JSON mode) and seed

2. **Implement OpenAI SSE streaming parser**:
   - Parse `data: {...}` SSE events with `[DONE]` termination
   - Reassemble fragmented chunks
   - Support multiple choices in a single stream

3. **Implement OpenAI-compatible API endpoints**:
   - `POST /v1/chat/completions`, `POST /v1/embeddings`, `GET /v1/models`
   - All follow OpenAI error format for compatibility

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/translator/openai.rs` | OpenAI protocol handler |
| `crates/gateway/src/translator/openai/types.rs` | OpenAI request/response types |
| `crates/gateway/src/translator/openai/stream.rs` | OpenAI SSE streaming |
| `crates/gateway/src/translator/openai/tools.rs` | Tool/function translation |
| `crates/server/src/routes/openai.rs` | OpenAI-compatible API routes |

**Acceptance Criteria:**
- [ ] Unified â†’ OpenAI request translation is lossless
- [ ] OpenAI â†’ Unified response translation preserves all fields
- [ ] Streaming SSE chunks translate correctly
- [ ] Multimodal content (images, audio) translates properly
- [ ] Tool/function calling round-trips correctly
- [ ] OpenAI-compatible endpoints respond with correct format
- [ ] Error responses follow OpenAI error format

---

## 5.2 Implement Anthropic-Compatible Protocol Adapter

**Description:**
Build a robust adapter that translates between unified format and Anthropic's
API format, handling Anthropic-specific features like thinking mode, extended
thinking, and content block streaming.

**Implementation Details:**

1. **Design the Anthropic protocol handler**:
   - Handle Anthropic's separate `system` field and content blocks
   - Handle `stop_reason` mapping and token counting
   - Handle content block streaming (content_block_start/delta/stop)
   - Handle extended thinking mode with budget tokens
   - Handle tool use content blocks

2. **Map Anthropic content blocks to unified format**:
   - `text` â†’ Unified text content
   - `tool_use` â†’ Unified tool calls
   - `thinking` â†’ Unified metadata (thinking text)

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/translator/anthropic.rs` | Anthropic protocol handler |
| `crates/gateway/src/translator/anthropic/types.rs` | Anthropic request/response types |
| `crates/gateway/src/translator/anthropic/stream.rs` | Anthropic SSE streaming |
| `crates/gateway/src/translator/anthropic/thinking.rs` | Thinking mode handling |

**Acceptance Criteria:**
- [ ] Unified â†’ Anthropic request translation is correct
- [ ] Anthropic â†’ Unified response preserves all fields
- [ ] Streaming with content blocks works correctly
- [ ] Extended thinking mode is handled properly
- [ ] Tool use from Anthropic translates to unified format

---

## 5.3 Implement Google/Gemini-Compatible Protocol Adapter

**Description:**
Build a robust adapter that translates between unified format and Google's
Gemini API format, leveraging gemini-cli's integration patterns.

**Implementation Details:**

1. **Design the Gemini protocol handler**:
   - Handle Gemini's separate `system_instruction` and `contents` array
   - Handle `safety_settings` and `generation_config`
   - Handle `FunctionCall` and `FunctionResponse` content parts
   - Handle Google Search grounding parameters
   - Handle context caching (up to 1M tokens)

2. **Map Gemini multimodal inputs**:
   - Images, audio as `data:...;base64,...` URIs
   - Video and PDF as File API URIs

3. **Map Gemini safety settings** between formats (harassment, hate speech, etc.)

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/translator/gemini.rs` | Gemini protocol handler |
| `crates/gateway/src/translator/gemini/types.rs` | Gemini request/response types |
| `crates/gateway/src/translator/gemini/safety.rs` | Safety settings mapping |
| `crates/gateway/src/translator/gemini/grounding.rs` | Google Search grounding |
| `crates/gateway/src/translator/gemini/caching.rs` | Context caching |

**Acceptance Criteria:**
- [ ] Unified â†’ Gemini request translation is correct
- [ ] Gemini â†’ Unified response preserves all fields
- [ ] Safety settings map correctly between formats
- [ ] Google Search grounding is handled
- [ ] Function calling works (Gemini's FunctionCall â†’ unified ToolCall)
- [ ] Multimodal inputs translate correctly

---

## 5.4 Implement Bidirectional Translation Engine (from 9Router)

**Description:**
Implement the core bidirectional translation engine based on 9Router's proven
protocol translation system, with automatic format detection and streaming
conversion.

**Implementation Details:**

1. **Design the translation engine** with registered format handlers:
   - Two-step translation: Source â†’ Unified â†’ Target
   - Direct format-to-format for performance optimization

2. **Implement format auto-detection**:
   - OpenAI: path `/v1/chat/completions`, body has `"model"` field
   - Anthropic: path `/v1/messages`, body has `"anthropic_version"`
   - Gemini: path contains `generateContent`, body has `"contents"`

3. **Implement streaming translation pipeline**:
   - Source SSE â†’ Unified chunks â†’ Target SSE in real-time
   - Proper stream termination for each format

4. **Support all format combinations**: OpenAIâ†”Anthropic, OpenAIâ†”Gemini, Anthropicâ†”Gemini

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/translator/engine.rs` | Translation engine |
| `crates/gateway/src/translator/engine/detector.rs` | Format auto-detection |
| `crates/gateway/src/translator/engine/pipeline.rs` | Stream pipeline |

**Acceptance Criteria:**
- [ ] Auto-detection correctly identifies OpenAI, Anthropic, Gemini formats
- [ ] Direct format-to-format translation is lossless
- [ ] Streaming pipeline correctly translates chunks in real-time
- [ ] Unknown formats produce helpful error messages
- [ ] New format handlers can be registered at runtime

---

## 5.5 Implement Streaming Format Conversion (SSE, WebSocket, Raw)

**Description:**
Implement comprehensive streaming support across all transport formats (SSE,
WebSocket, raw TCP) with format conversion at the streaming level.

**Implementation Details:**

1. **Implement SSE transport**:
   - Standard SSE format: `event:{type}\ndata:{json}\n\n`
   - Support event types: chunk, done, error, ping
   - Automatic keep-alive pings, compression (gzip, zstd)

2. **Implement WebSocket transport**:
   - Bidirectional streaming (client â†” server â†” provider)
   - Text and binary frames with automatic reconnection

3. **Implement stream format converter**:
   - SSE â†” JSONLines conversion
   - Support for custom codecs via `StreamCodec` trait

4. **Implement unified stream manager**:
   - Track active streams with metadata
   - Stream cancellation and cleanup
   - Stream metrics (bytes sent, chunks sent, duration)
   - Concurrent stream limits

**Files to Create:**

| File | Purpose |
|------|---------|
| `crates/gateway/src/stream/mod.rs` | Stream module root |
| `crates/gateway/src/stream/sse.rs` | SSE transport |
| `crates/gateway/src/stream/websocket.rs` | WebSocket transport |
| `crates/gateway/src/stream/converter.rs` | Format conversion |
| `crates/gateway/src/stream/manager.rs` | Stream lifecycle manager`n| `crates/installer/src/mod.rs` | Installer module root |`n| `crates/installer/src/detect.rs` | OS/arch detection |`n| `crates/installer/src/download.rs` | Binary download with checksum |`n| `crates/installer/src/path.rs` | PATH setup |`n| `crates/installer/src/completions.rs` | Shell completions |`n| `crates/installer/src/self_update.rs` | Auto-update with atomic swap |`n| `crates/installer/src/rollback.rs` | Versioned rollback |`n| `crates/safety/src/mod.rs` | Safety module root |`n| `crates/safety/src/checker.rs` | Content safety checker |`n| `crates/safety/src/pipeline.rs` | Safety pipeline orchestration |`n| `crates/safety/src/rules.rs` | Safety rules engine |`n| `crates/safety/src/redact.rs` | PII redaction | |

**Acceptance Criteria:**
- [ ] SSE streaming works with OpenAI, Anthropic, and Gemini formats
- [ ] WebSocket transport supports bidirectional streaming
- [ ] Format conversion between SSE â†” JSONLines works
- [ ] Stream cancellation terminates streams gracefully
- [ ] Multiple concurrent streams are supported
- [ ] Stream metrics are available via observability

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **ACP** | Agent Client Protocol â€” standard for agent-UI communication |
| **MCP** | Model Context Protocol â€” standard for tool/resource access |
| **DAG** | Directed Acyclic Graph â€” execution model for agent workflows |
| **MITM** | Man-in-the-Middle â€” proxy for intercepting IDE API calls |
| **RTK** | Real-Time Kit â€” compression system for API calls |
| **SSE** | Server-Sent Events â€” HTTP-based streaming protocol |
| **WASM** | WebAssembly â€” sandboxed execution environment |
| **napi-rs** | Rust bindings for Node.js native addons |
| **Provider Registry** | Central database of all AI providers and capabilities |
| **Protocol Translator** | System that converts between different API formats |

## Appendix B: Migration Paths for Each Project

| Existing Project | Migration to Agentic OS V4 |
|-----------------|---------------------------|
| Agentic OS V3 | `agentic-os config migrate --from v3` |
| 9Router | `agentic-os config migrate --from 9router` |
| Goose | `agentic-os config migrate --from goose` |
| litellm | `agentic-os config migrate --from litellm` |
| new-api | `agentic-os config migrate --from new-api` |
| OmniRoute2 | `agentic-os config migrate --from omniroute2` |
| Portkey | `agentic-os config migrate --from portkey` |
| gemini-cli | `agentic-os config migrate --from gemini-cli` |

## Appendix C: Key Dependencies

| Dependency | Version | Usage |
|-----------|---------|-------|
| Rust | 1.85+ | Core language |
| tokio | 1.x | Async runtime |
| reqwest | 0.12.x | HTTP client |
| axum | 0.8.x | HTTP server |
| serde | 1.x | Serialization |
| napi-rs | 3.x | Rustâ†”TypeScript bindings |
| ratatui | 0.29.x | TUI framework |
| tauri | 2.x | Desktop framework |
| react | 19.x | Desktop/Web UI |
| next.js | 15.x | Dashboard |
| llama.cpp | latest | Local inference |
| whisper-rs | latest | Dictation |
| notify | 7.x | File watching |
| tower | 0.5.x | Middleware |
| opentelemetry | 0.27.x | Observability |

---

> **END OF PART 1 â€” Phases 1â€“5**
>
> Next: Part 2 will cover Phases 6â€“10 including:
> - Phase 6: Agent Orchestration Core
> - Phase 7: ACP Server Implementation
> - Phase 8: MCP Registry & Tool System
> - Phase 9: CLI & TUI Implementation
> - Phase 10: Desktop Application & Dashboard


---

## Additional Implementation Guidance for Phases 1-5

---

### Provider Adapter Implementation Pattern

Each provider adapter follows a consistent architectural pattern that ensures
uniform error handling, retry logic, rate limiting, and observability across
all 250+ providers.

```rust
// Template for provider adapter implementations
pub struct ProviderAdapter {
    config: ProviderConfig,
    client: reqwest::Client,
    rate_limiter: RateLimiter,
    metrics: ProviderMetrics,
    retry_policy: RetryPolicy,
    circuit_breaker: CircuitBreaker,
}

impl ProviderAdapter {
    /// Build request with auth headers from provider config
    fn build_request(&self, method: Method, path: &str) -> reqwest::RequestBuilder {
        let url = format!(
            "{}{}",
            self.config.base_url.trim_end_matches("/"),
            path
        );
        let mut req = self.client.request(method, &url);

        match &self.config.auth_type {
            AuthType::Bearer { key } => {
                req = req.header("Authorization", format!("Bearer {}", key));
            }
            AuthType::Header { name, value } => {
                req = req.header(name, value);
            }
            AuthType::OAuth { .. } => {
                // OAuth token acquisition and refresh handler
            }
            AuthType::None => {}
        }

        // Add provider-specific headers
        for (name, value) in &self.config.default_headers {
            req = req.header(name, value);
        }

        req
    }

    /// Execute request with retry and circuit breaker logic
    async fn execute_with_retry<T>(
        &self,
        request: reqwest::RequestBuilder,
    ) -> Result<T, ProviderError>
    where
        T: serde::de::DeserializeOwned,
    {
        // Check circuit breaker
        if !self.circuit_breaker.is_allowed() {
            return Err(ProviderError::CircuitBreakerOpen);
        }

        // Apply rate limiter
        self.rate_limiter.acquire().await?;

        let mut last_error = None;
        for attempt in 0..=self.retry_policy.max_retries {
            let start = std::time::Instant::now();

            match request.try_clone()
                .ok_or(ProviderError::RequestCloneFailed)?
                .send()
                .await
            {
                Ok(response) => {
                    let latency = start.elapsed();
                    self.metrics.record_latency(latency);

                    if response.status().is_success() {
                        self.circuit_breaker.record_success();
                        return response.json::<T>().await
                            .map_err(|e| ProviderError::Deserialization(e.to_string()));
                    } else {
                        let status = response.status();
                        let body = response.text().await.unwrap_or_default();

                        if status.is_server_error() {
                            // Retry on 5xx
                            last_error = Some(ProviderError::ServerError(status, body));
                            let delay = self.retry_policy.backoff(attempt);
                            tokio::time::sleep(delay).await;
                            continue;
                        } else {
                            // Client errors (4xx) are not retried
                            self.circuit_breaker.record_failure();
                            return Err(ProviderError::ClientError(status, body));
                        }
                    }
                }
                Err(e) => {
                    // Network errors are retried
                    last_error = Some(ProviderError::Transport(e.to_string()));
                    let delay = self.retry_policy.backoff(attempt);
                    tokio::time::sleep(delay).await;
                }
            }
        }

        self.circuit_breaker.record_failure();
        Err(last_error.unwrap_or(ProviderError::MaxRetriesExceeded))
    }
}
```

### Rate Limiting Architecture

Rate limiting is critical when managing 250+ concurrent providers. The system
uses a token-bucket algorithm with per-provider and global limits:

```rust
pub struct RateLimiter {
    /// Per-provider rate limit buckets
    provider_buckets: HashMap<String, TokenBucket>,
    /// Global rate limit bucket
    global_bucket: TokenBucket,
    /// Configuration
    config: RateLimitConfig,
}

pub struct TokenBucket {
    capacity: u32,
    tokens: AtomicU32,
    refill_rate: u32,       // tokens per second
    last_refill: AtomicI64, // UNIX timestamp in nanos
}

impl TokenBucket {
    pub fn new(capacity: u32, refill_rate: u32) -> Self {
        Self {
            capacity,
            tokens: AtomicU32::new(capacity),
            refill_rate,
            last_refill: AtomicI64::new(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos() as i64
            ),
        }
    }

    pub async fn acquire(&self) -> Result<(), RateLimitError> {
        loop {
            self.refill();

            let current = self.tokens.load(std::sync::atomic::Ordering::Relaxed);
            if current > 0 {
                if self.tokens.compare_exchange(
                    current,
                    current - 1,
                    std::sync::atomic::Ordering::Acquire,
                    std::sync::atomic::Ordering::Relaxed,
                ).is_ok() {
                    return Ok(());
                }
            } else {
                // Wait for next refill
                let wait_ms = 1000 / self.refill_rate.max(1);
                tokio::time::sleep(std::time::Duration::from_millis(wait_ms as u64)).await;
            }
        }
    }

    fn refill(&self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos() as i64;

        let last = self.last_refill.load(std::sync::atomic::Ordering::Relaxed);
        let elapsed = now - last;

        if elapsed > 1_000_000_000 {
            // At least 1 second elapsed
            let tokens_to_add = (elapsed / 1_000_000_000) as u32 * self.refill_rate;
            let new_tokens = (self.tokens.load(std::sync::atomic::Ordering::Relaxed) + tokens_to_add)
                .min(self.capacity);

            self.tokens.store(new_tokens, std::sync::atomic::Ordering::Release);
            self.last_refill.store(now, std::sync::atomic::Ordering::Release);
        }
    }
}
```

### Circuit Breaker Implementation

```rust
pub struct CircuitBreaker {
    state: AtomicU8,  // 0=Closed, 1=HalfOpen, 2=Open
    failure_count: AtomicU32,
    last_failure_time: AtomicI64,
    threshold: u32,
    reset_timeout_ms: u64,
    half_open_max_requests: u32,
    half_open_requests: AtomicU32,
}

impl CircuitBreaker {
    pub fn new(threshold: u32, reset_timeout_ms: u64) -> Self {
        Self {
            state: AtomicU8::new(0),
            failure_count: AtomicU32::new(0),
            last_failure_time: AtomicI64::new(0),
            threshold,
            reset_timeout_ms,
            half_open_max_requests: 1,
            half_open_requests: AtomicU32::new(0),
        }
    }

    pub fn is_allowed(&self) -> bool {
        match self.state.load(std::sync::atomic::Ordering::Acquire) {
            0 => true,
            1 => {
                let current = self.half_open_requests.load(std::sync::atomic::Ordering::Relaxed);
                if current < self.half_open_max_requests {
                    self.half_open_requests.fetch_add(1, std::sync::atomic::Ordering::AcqRel);
                    true
                } else {
                    false
                }
            }
            2 => {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as i64;
                let last = self.last_failure_time.load(std::sync::atomic::Ordering::Relaxed);
                if now - last > self.reset_timeout_ms as i64 {
                    self.state.store(1, std::sync::atomic::Ordering::Release);
                    self.half_open_requests.store(1, std::sync::atomic::Ordering::Release);
                    true
                } else {
                    false
                }
            }
            _ => false,
        }
    }

    pub fn record_success(&self) {
        self.failure_count.store(0, std::sync::atomic::Ordering::Release);
        self.state.store(0, std::sync::atomic::Ordering::Release);
    }

    pub fn record_failure(&self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        self.last_failure_time.store(now, std::sync::atomic::Ordering::Release);

        let failures = self.failure_count.fetch_add(1, std::sync::atomic::Ordering::AcqRel) + 1;
        if failures >= self.threshold {
            self.state.store(2, std::sync::atomic::Ordering::Release);
        }
    }
}
```

### Observability Integration for Providers

Every provider adapter automatically emits OpenTelemetry spans and metrics:

- **Spans**: `provider.request`, `provider.complete`, `provider.stream`
  - Attributes: provider.id, model, request_id, attempt_number
  - Events: rate_limit_applied, circuit_breaker_state_change, retry_attempt
- **Metrics**:
  - `provider.requests.total` (counter with provider, model, status tags)
  - `provider.latency` (histogram with provider, model tags)
  - `provider.tokens.input` and `provider.tokens.output` (counters)
  - `provider.errors.total` (counter with error_type tag)
  - `provider.rate_limit.wait_time` (histogram)
  - `provider.circuit_breaker.state` (gauge with state tag)

### Testing Strategy for Provider Adapters

Each provider adapter requires multi-layer testing:

1. **Unit Tests**: Mock HTTP responses, test request building and response parsing
2. **Integration Tests**: Against provider sandbox/test endpoints
3. **Contract Tests**: Verifying translation preserves all fields
4. **Chaos Tests**: Network failures, timeouts, malformed responses
5. **Performance Tests**: Sustained throughput, latency under load

### Configuration Migration: Detailed Example

When migrating from gemini-cli's `settings.json` to Agentic OS V4 format:

```json
// Original: ~/.gemini/settings.json
{
  "model": "gemini-2.5-flash",
  "apiKey": "AIza...",
  "authType": "oauth",
  "mcpServers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"]
    }
  ],
  "sandbox": "docker",
  "telemetry": {
    "enabled": true,
    "sampleRate": 0.1
  }
}
```

```toml
# Migrated: agentic-os.toml
[gateway]
default_provider = "gemini"
default_model = "gemini-2.5-flash"

[gateway.providers.gemini]
auth_type = "oauth"
api_key = "AIza..."

[mcp]
enabled = true

[mcp.servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem"]

[security]
sandbox_type = "docker"

[observability]
enabled = true
sample_rate = 0.1
```

### Unified Error Taxonomy

All errors across the system follow a consistent taxonomy with error codes:

| Code | Category | Description | HTTP Status |
|------|----------|-------------|-------------|
| `AUTH_001` | Authentication | Invalid API key | 401 |
| `AUTH_002` | Authentication | Expired OAuth token | 401 |
| `AUTH_003` | Authentication | Insufficient permissions | 403 |
| `PROV_001` | Provider | Provider not found | 404 |
| `PROV_002` | Provider | Provider unavailable | 503 |
| `PROV_003` | Provider | Rate limit exceeded | 429 |
| `PROV_004` | Provider | Model not found | 404 |
| `PROV_005` | Provider | Context window exceeded | 400 |
| `TRANS_001` | Translation | Unknown input format | 400 |
| `TRANS_002` | Translation | Translation failed | 422 |
| `STREAM_001` | Streaming | Stream interrupted | 499 |
| `STREAM_002` | Streaming | Stream timeout | 408 |
| `CONFIG_001` | Configuration | Invalid config | 400 |
| `CONFIG_002` | Configuration | Missing required field | 400 |
| `ORCH_001` | Orchestration | DAG cycle detected | 400 |
| `ORCH_002` | Orchestration | Task timeout | 408 |
| `SEC_001` | Security | Prompt injection detected | 400 |
| `SEC_002` | Security | PII detected in output | 400 |
| `INFRA_001` | Infrastructure | Database unavailable | 503 |
| `INFRA_002` | Infrastructure | Storage full | 507 |

### Performance Benchmarks (Targets)

| Operation | Target Latency (p50) | Target Latency (p99) | Throughput |
|-----------|---------------------|---------------------|------------|
| Config parse (cold) | < 50ms | < 100ms | N/A |
| Config parse (cached) | < 1ms | < 5ms | N/A |
| Config hot-reload | < 500ms | < 1s | N/A |
| Provider resolve | < 1ms | < 5ms | 100k/sec |
| Request translation | < 3ms (target: zero-copy OpenAI) | < 10ms | 50k/sec |
| Request translation (zero-copy path) | < 1ms | < 3ms | 100k/sec |
| Response translation | < 5ms | < 20ms | 50k/sec |
| Health check (single) | < 1s | < 3s | 100/sec |
| Health check (all 250) | < 10s | < 30s | N/A |
| Provider discovery | < 2s | < 5s | N/A |
| Config migration | < 1s | < 3s | N/A |
| Binary startup | < 500ms | < 1s | N/A |

### Security Considerations

1. **API Key Storage**: Keys are never logged, displayed only as "****",
   stored encrypted at rest using system keychain (macOS, Windows) or
   libsecret (Linux)

2. **OAuth Token Management**: Tokens are stored with encryption, auto-refreshed
   before expiry, revoked on sign-out

3. **Config File Permissions**: Config files with secrets should have
   0600 permissions on Unix, auto-warn if permissions are too permissive

4. **Environment Variable Leakage**: The `config show` command must redact
   all secret fields before display; process env vars should be scrubbed
   from crash dumps

5. **Network Security**: All provider calls use TLS 1.3; certificate
   pinning for well-known providers; MITM proxy generates its own CA cert

### Build Size Budget

| Component | Target Size |
|-----------|-------------|
| Core binary (no models) | < 30MB |
| With embedded TS runtime | < 45MB |
| With Whisper model (tiny.en) | < 80MB |
| With llama.cpp (no model) | < 55MB |
| Full distribution | < 100MB |
| Compressed (.tar.gz / .zip) | < 35MB |

---

> **END OF PART 1 — Phases 1–5 (Complete with Implementation Guidance)**

