# Agentic OS V4: Unified "All-in-One" Integration Plan

## Executive Summary

Merge **Agentic OS V3** (agent orchestration brain) + **9Router/temp_gateways** (AI gateway body) + **Goose** (agent runtime + CLI/TUI + ACP + extensions) into a single unified platform: **Agentic OS V4 — The Universal Agent Operating System**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AGENTIC OS V4 — UNIFIED ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │   CLI / TUI      │  │   Desktop App    │  │   Web Dashboard          │  │
│  │   (Goose CLI)    │  │   (Tauri + React)│  │   (Next.js)              │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────────┬─────────────┘  │
│           │                     │                         │                │
│           └─────────────────────┼─────────────────────────┘                │
│                                 ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    ACP SERVER (Agent Client Protocol)                 │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │ Session Mgmt│  │  Extension  │  │   Recipe    │  │   Skill     │  │  │
│  │  │  (Goose)    │  │   Manager   │  │   Engine    │  │  Registry   │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                          │
│                                   ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    AGENT ORCHESTRATION LAYER (Agentic OS V3)          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Agent DAG  │  │  Pipeline   │  │   Graph     │  │   P2P       │  │  │
│  │  │  Executor   │  │  Executor   │  │  Engine     │  │  Swarm      │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Self-Impr. │  │  Shadow     │  │   Task      │  │  Scheduler  │  │  │
│  │  │  Harness    │  │  Daemon     │  │  Worker     │  │             │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                          │
│                                   ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    AI GATEWAY LAYER (9Router)                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │ Provider    │  │  Protocol   │  │   SSE       │  │   MITM      │  │  │
│  │  │  Registry   │  │ Translator  │  │  Streaming  │  │  Proxy      │  │  │
│  │  │  (100+)     │  │ (OpenAI↔A   │  │  Handlers   │  │  (IDE)      │  │  │
│  │  └─────────────┘  │  nthropic)  │  └─────────────┘  └─────────────┘  │  │
│  │  ┌─────────────┐  └─────────────┘  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  OAuth/     │  ┌─────────────┐  │  RTK        │  │  Usage/     │  │  │
│  │  │  Auth       │  │  Combo/     │  │  Compression│  │  Cost Track │  │  │
│  │  │  Manager    │  │  Routing    │  │  (caveman)  │  │             │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └────────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                          │
│                                   ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    INFRASTRUCTURE LAYER                                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  SQLite/    │  │  OTEL       │  │  Config/    │  │  Security/  │  │
│  │  │  Postgres   │  │  Tracing    │  │  Secrets    │  │  Guardrails │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Local      │  │  MCP        │  │  Sandbox/   │  │  Dictation  │  │
│  │  │  Inference  │  │  Registry   │  │  WASM       │  │  (Whisper)  │  │
│  │  │  (llama.cpp)│  │             │  │             │  │             │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Mapping Matrix

| Capability | Agentic OS V3 | 9Router | Goose | **Unified V4** |
|------------|---------------|---------|-------|----------------|
| **Agent Orchestration** | ✅ DAG, Pipeline, Graph, P2P | ❌ | ❌ Subagents only | **✅ Full (V3 wins)** |
| **Provider Gateway** | ✅ Basic (6 providers) | ✅ 100+ providers, translation | ✅ 30+ providers | **✅ 9Router core + Goose providers** |
| **Protocol Translation** | ❌ | ✅ Full (OpenAI↔Anthropic↔Gemini) | ✅ Canonical formats | **✅ 9Router translator** |
| **SSE Streaming** | ✅ Basic | ✅ Advanced handlers | ✅ ACP streaming | **✅ 9Router handlers** |
| **MCP Support** | ✅ Registry, client | ✅ Server proxy | ✅ Full client/server | **✅ Goose MCP + 9Router registry** |
| **ACP (Agent Client Protocol)** | ❌ | ❌ | ✅ Full server | **✅ Goose ACP server** |
| **Extension/Plugin System** | ✅ Skills (40+) | ✅ Skills | ✅ Extensions + MCP | **✅ Unified: Skills=Extensions=MCP** |
| **Recipe/Workflow Engine** | ✅ Pipeline builder | ❌ | ✅ YAML recipes + subrecipes | **✅ Goose recipes + V3 builder** |
| **Local Inference** | ❌ | ❌ | ✅ llama.cpp, MLX | **✅ Goose local inference** |
| **Desktop App** | ✅ Tauri (basic) | ✅ Next.js | ✅ Tauri + React (mature) | **✅ Goose desktop + V3 pages** |
| **CLI/TUI** | ❌ | ✅ CLI | ✅ CLI + TUI (ratatui) | **✅ Goose CLI/TUI** |
| **Web Dashboard** | ✅ React/Vite | ✅ Next.js | ❌ | **✅ Next.js (9Router) + V3 pages** |
| **MITM Proxy (IDE)** | ❌ | ✅ Full (Cursor, Kiro, etc.) | ❌ | **✅ 9Router MITM** |
| **OAuth Management** | ✅ Basic | ✅ 20+ providers | ✅ Device flow, OAuth | **✅ 9Router + Goose** |
| **RTK Compression** | ❌ | ✅ caveman/ponytail | ❌ | **✅ 9Router RTK** |
| **Security/Guardrails** | ✅ Guardrails service | ✅ Adversary mode | ✅ Classification, egress | **✅ Combined** |
| **Dictation/STT** | ❌ | ❌ | ✅ Whisper | **✅ Goose dictation** |
| **Computer Control** | ❌ | ❌ | ✅ MCP computer controller | **✅ Goose computer controller** |
| **Auto-visualiser** | ❌ | ❌ | ✅ Mermaid/sankey/treemap | **✅ Goose autovisualiser** |
| **Scheduling** | ✅ Scheduler service | ❌ | ✅ Cron schedules | **✅ Unified scheduler** |
| **Session Management** | ✅ Basic | ❌ | ✅ Full (search, export) | **✅ Goose sessions** |
| **Telemetry/OTEL** | ✅ OTEL service | ❌ | ✅ Langfuse, OTLP | **✅ Goose OTEL + V3** |
| **Sandbox/WASM** | ✅ WASM plugin runtime | ❌ | ❌ | **✅ V3 WASM runtime** |
| **Self-Improvement** | ✅ Harness | ❌ | ❌ | **✅ V3 harness** |
| **P2P Swarm** | ✅ libp2p | ❌ | ❌ | **✅ V3 P2P** |
| **Shadow Daemon** | ✅ Background learning | ❌ | ❌ | **✅ V3 shadow daemon** |

---

## Migration Strategy: Phased Approach

### Phase 0: Foundation (Week 1-2) — **CRITICAL PATH**

#### 0.1 Monorepo Structure
```
agentic-os-v4/
├── apps/
│   ├── cli/                    # Goose CLI (Rust)
│   ├── tui/                    # Goose TUI (Rust)
│   ├── desktop/                # Tauri + React (Goose desktop + V3 pages)
│   ├── dashboard/              # Next.js (9Router dashboard + V3 pages)
│   └── server/                 # Unified HTTP + ACP server
├── packages/
│   ├── core/                   # Shared types, config, errors
│   ├── agent-runtime/          # V3: agent-dag, pipeline, graph, p2p, scheduler
│   ├── gateway/                # 9Router: providers, translator, streaming, MITM
│   ├── acp/                    # Goose: ACP server, session mgmt, extensions
│   ├── mcp/                    # Unified: MCP registry, client, server runner
│   ├── recipes/                # Goose: recipe engine, subrecipes, validation
│   ├── skills/                 # Unified: V3 skills + Goose extensions = skills
│   ├── local-inference/        # Goose: llama.cpp, MLX, tool emulation
│   ├── dictation/              # Goose: whisper integration
│   ├── computer-control/       # Goose: computer controller MCP
│   ├── autovisualiser/         # Goose: mermaid/sankey/treemap generator
│   ├── security/               # V3 guardrails + Goose adversary/classification
│   ├── rtk/                    # 9Router: caveman/ponytail compression
│   ├── oauth/                  # 9Router + Goose: unified auth manager
│   ├── sandbox/                # V3: WASM plugin runtime
│   ├── self-improvement/       # V3: harness, shadow daemon
│   ├── telemetry/              # V3 OTEL + Goose Langfuse/OTLP
│   ├── config/                 # Unified configuration system
│   └── database/               # SQLite/Postgres schema + migrations
├── tools/
│   ├── goose-binary/           # Prebuilt binaries per platform
│   └── install-link-generator/
├── docs/                       # Unified documentation (Docusaurus)
├── evals/                      # Goose harbor benchmarks
├── scripts/                    # Build, test, release scripts
└── Cargo.toml / package.json   # Workspace roots
```

#### 0.2 Build System Unification
- **Rust workspace** (Cargo.toml) for all Rust crates (Goose core, CLI, TUI, local-inference, MCP)
- **pnpm workspace** for all TypeScript/React apps (desktop renderer, dashboard, SDK)
- **Justfile** for cross-language task running (like Goose)

#### 0.3 Shared Configuration Schema
```toml
# agentic-os.toml (unified config)
[agent]
orchestration = "dag"  # dag | pipeline | graph | swarm
max_concurrent_agents = 10

[gateway]
providers = ["openai", "anthropic", "gemini", "ollama", "openrouter", ...]
default_model = "claude-3-5-sonnet"
translation_enabled = true
streaming_enabled = true
mitm_enabled = false

[acp]
server_enabled = true
port = 20127
extensions_dir = "~/.agentic-os/extensions"

[mcp]
registry_enabled = true
servers = []

[recipes]
auto_discover = true
recipes_dir = "~/.agentic-os/recipes"

[skills]
registry_url = "https://skills.agentic-os.dev"
local_dir = "~/.agentic-os/skills"

[local_inference]
enabled = true
backend = "llamacpp"  # llamacpp | mlx
models_dir = "~/.agentic-os/models"

[dictation]
enabled = true
model = "base.en"

[security]
guardrails_enabled = true
adversary_mode = false
egress_policy = "strict"

[rtk]
compression = "caveman"  # none | caveman | ponytail
intensity = "full"

[scheduler]
enabled = true

[telemetry]
otel_enabled = true
langfuse_enabled = false
```

---

### Phase 1: Gateway Core Integration (Week 2-4)

#### 1.1 Port 9Router Provider Registry
**Source**: `9router/open-sse/providers/registry/`
**Target**: `packages/gateway/src/providers/registry/`

Key files to port:
- `index.js` → `registry.ts` (main registry)
- `capabilities.js` → `capabilities.ts`
- `pricing.js` → `pricing.ts`
- `schema.js` → `schema.ts`
- All 100+ provider files → TypeScript equivalents

**Add Goose providers not in 9Router**:
- `databricks`, `bedrock`, `vertex`, `sagemaker`, `snowflake`
- `huggingface`, `cohere`, `mistral`, `together`, `fireworks`
- `xai`, `deepseek`, `qwen`, `glm`, `kimi`

#### 1.2 Port Protocol Translator
**Source**: `9router/open-sse/translator/`
**Target**: `packages/gateway/src/translator/`

Structure:
```
translator/
├── formats/
│   ├── openai.ts
│   ├── anthropic.ts
│   ├── gemini.ts
│   ├── ollama.ts
│   └── openai-responses.ts
├── concerns/
│   ├── thinking.ts
│   ├── tool-call.ts
│   ├── image.ts
│   ├── reasoning.ts
│   └── usage.ts
├── request/
│   ├── openai-to-anthropic.ts
│   ├── openai-to-gemini.ts
│   ├── anthropic-to-openai.ts
│   └── ... (all 30+ translators)
├── response/
│   ├── anthropic-to-openai.ts
│   ├── gemini-to-openai.ts
│   └── ... (all response translators)
└── index.ts          # Main translate() function
```

#### 1.3 Port SSE Streaming Handlers
**Source**: `9router/open-sse/handlers/`
**Target**: `packages/gateway/src/streaming/`

- `chatCore/` → `chat-stream.ts`
- `embeddingsCore/` → `embeddings-stream.ts`
- `imageGenerationCore/` → `image-stream.ts`
- `search/` → `search-stream.ts`
- `ttsCore/` / `sttCore/` → `audio-stream.ts`

#### 1.4 Port Provider Executors
**Source**: `9router/open-sse/executors/`
**Target**: `packages/gateway/src/executors/`

Each executor handles provider-specific quirks:
- `base.ts` → `BaseExecutor` abstract class
- `openai.ts`, `anthropic.ts`, `gemini.ts`, etc.

---

### Phase 2: Agent Runtime Integration (Week 4-6)

#### 2.1 Preserve V3 Agent Orchestration (Crown Jewel)
Keep intact, enhance with Goose patterns:
```
packages/agent-runtime/
├── src/
│   ├── dag/              # V3: agent-dag.ts → enhance with Goose subagent patterns
│   ├── pipeline/         # V3: pipeline-executor.ts → add recipe-style steps
│   ├── graph/            # V3: graph-engine.ts
│   ├── swarm/            # V3: p2p-swarm.ts
│   ├── scheduler/        # V3: scheduler.ts + Goose cron schedules
│   ├── task-worker/      # V3: task-worker.ts
│   ├── self-improvement/ # V3: self-improvement-harness.ts (unique!)
│   ├── shadow-daemon/    # V3: shadow-daemon.ts (unique!)
│   └── agents/
│       ├── base-agent.ts
│       ├── subagent.ts          # NEW: from Goose subagent_handler
│       ├── recipe-agent.ts      # NEW: executes YAML recipes
│       └── skill-agent.ts       # NEW: executes skills
```

#### 2.2 Integrate Goose Agent Patterns
From `crates/goose/src/agents/`:
- `agent.rs` → `BaseAgent` with lifecycle hooks
- `subagent_handler.rs` → Subagent spawning with isolation
- `tool_execution.rs` → Unified tool execution with confirmation routing
- `extension_manager.rs` → Skill/extension loading (merge with V3 skill system)

---

### Phase 3: ACP Server + Session Management (Week 6-8)

#### 3.1 Port Goose ACP Server
**Source**: `crates/goose/src/acp/`
**Target**: `packages/acp/src/server/`

```
acp/
├── server/
│   ├── server.ts           # Main ACP server (from server.rs)
│   ├── transport/
│   │   ├── stdio.ts
│   │   ├── websocket.ts
│   │   └── sse.ts
│   ├── session/
│   │   ├── manager.ts      # SessionManager (from session_manager.rs)
│   │   ├── store.ts        # SQLite-backed session store
│   │   ├── events.ts       # Event bus for session events
│   │   └── naming.ts       # Session naming (from session_naming.rs)
│   ├── extensions/
│   │   ├── manager.ts      # ExtensionManager (from extension_manager.rs)
│   │   ├── loader.ts
│   │   └── malware_check.ts
│   ├── tools/
│   │   ├── registry.ts     # Tool registry with confirmations
│   │   ├── confirmation.ts # ToolConfirmationRouter
│   │   └── execution.ts    # ToolExecution with streaming
│   └── prompts/
│       └── manager.ts      # PromptManager (from prompt_manager.rs)
```

#### 3.2 Session Persistence & Search
Port from Goose `session/`:
- `chat_history_search.rs` → Full-text search (SQLite FTS5)
- `session_manager.rs` → Session CRUD, fork, export/import
- `diagnostics.rs` → Session health, token usage
- `nostr_share.rs` → Optional Nostr sharing

---

### Phase 4: Recipe & Skill Unification (Week 8-10)

#### 4.1 Recipe Engine (Goose → Unified)
**Source**: `crates/goose/src/recipe/`
**Target**: `packages/recipes/src/`

```
recipes/
├── engine/
│   ├── executor.ts         # RecipeExecutor (from recipe.rs)
│   ├── parser.ts           # YAML parser with validation
│   ├── validator.ts        # validate_recipe.rs
│   ├── subrecipe.ts        # Subrecipe support (from subrecipes.md)
│   └── parameters.ts       # Parameter substitution
├── builtins/
│   ├── code-review.yaml
│   ├── create-app.yaml
│   └── ...
├── registry/
│   ├── local.ts            # Local filesystem recipes
│   ├── remote.ts           # GitHub/Git registry
│   └── marketplace.ts      # Skill marketplace integration
└── cli/
    └── commands.ts         # recipe run, create, validate
```

#### 4.2 Skill System = V3 Skills + Goose Extensions
**Unified concept**: A **Skill** is a portable capability package that can be:
- A prompt template (V3 style)
- A tool/extension (Goose style)
- An MCP server wrapper
- A recipe
- A subagent definition

```
skills/
├── registry/
│   ├── client.ts           # Skills registry client
│   ├── manifest.ts         # SKILL.md schema (V3) + manifest.json (Goose)
│   ├── compiler.ts         # V3: skill-compiler.ts → WASM or JS
│   └── installer.ts
├── builtins/
│   ├── omni-agents-a2a/
│   ├── omni-compression/
│   ├── omni-inference/
│   └── ... (all 40+ V3 skills)
├── goose-extensions/       # Migrated Goose extensions as skills
│   ├── github-mcp/
│   ├── figma-mcp/
│   └── ...
└── runtime/
    ├── loader.ts           # Dynamic skill loading
    ├── sandbox.ts          # WASM sandbox (V3 wasm-plugin-runtime)
    └── permissions.ts      # Skill permission model
```

---

### Phase 5: Desktop + CLI + TUI Unification (Week 10-12)

#### 5.1 Desktop App (Tauri v2)
**Base**: Goose desktop (`ui/desktop/`) + V3 pages (`src/pages/os/`)

```
apps/desktop/
├── src/
│   ├── main.ts             # Tauri entry (from Goose main.ts)
│   ├── preload.ts          # Preload script
│   ├── App.tsx             # Root component
│   ├── components/         # Shared UI components
│   │   ├── GooseSidebar/   # From Goose
│   │   ├── V3Kernel/       # V3 Kernel page
│   │   ├── AgentGraph/     # V3 Graph page
│   │   ├── PipelineBuilder/# V3 PipelineBuilder
│   │   └── ...
│   ├── pages/
│   │   ├── Chat.tsx        # Goose chat + V3 agent selector
│   │   ├── Dashboard.tsx   # Unified dashboard
│   │   ├── Sessions.tsx    # Goose session management
│   │   ├── Recipes.tsx     # Recipe browser
│   │   ├── Skills.tsx      # Skill marketplace
│   │   ├── Settings.tsx    # Unified settings
│   │   ├── Gateway.tsx     # 9Router provider management
│   │   ├── MCPManager.tsx  # MCP server management
│   │   └── OS/             # V3 OS pages (Kernel, Analytics, etc.)
│   ├── hooks/              # React hooks (Goose + V3)
│   ├── stores/             # Zustand stores (unified)
│   ├── acp/                # ACP client connection
│   └── utils/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs         # Rust backend
│       ├── commands.rs     # Tauri commands
│       ├── gateway.rs      # Embedded gateway server
│       ├── acp_server.rs   # Embedded ACP server
│       └── mitm.rs         # MITM proxy (optional)
```

#### 5.2 CLI (Goose CLI + V3 Commands)
**Source**: `crates/goose-cli/src/commands/`
**Target**: `apps/cli/src/commands/`

Add V3-specific commands:
- `agentic dag run <file>`
- `agentic pipeline build`
- `agentic swarm deploy`
- `agentic improve run`
- `agentic skill install <skill>`

#### 5.3 TUI (Goose TUI - ratatui)
**Source**: `ui/text/src/`
**Target**: `apps/tui/src/`

Full terminal UI with:
- Chat interface
- Session browser
- Recipe runner
- Skill manager
- Gateway status
- Agent DAG visualizer (ASCII)

---

### Phase 6: Advanced Features (Week 12-16)

#### 6.1 Local Inference (Goose)
**Source**: `crates/goose-local-inference/`
**Target**: `packages/local-inference/`

- llama.cpp backend (CPU/GPU/Metal)
- MLX backend (Apple Silicon)
- Model registry (HuggingFace)
- Tool emulation for models without native tools
- Multimodal support (llava, etc.)

#### 6.2 Dictation (Goose)
**Source**: `crates/goose/src/dictation/`
**Target**: `packages/dictation/`

- Whisper.cpp integration
- Global hotkey
- Auto-punctuation
- Multi-language

#### 6.3 Computer Controller (Goose MCP)
**Source**: `crates/goose-mcp/src/computercontroller/`
**Target**: `packages/computer-control/`

- Screen capture
- Mouse/keyboard automation
- Window management
- OCR (optional)
- PDF/Excel/Word tools

#### 6.4 Auto-visualiser (Goose MCP)
**Source**: `crates/goose-mcp/src/autovisualiser/`
**Target**: `packages/autovisualiser/`

- Mermaid diagram generation
- Sankey charts
- Treemaps
- Radar charts
- Auto-render in chat

#### 6.5 Security Suite (V3 + Goose)
**Merge**:
- V3: `guardrails.ts`, `policy.ts`, `egress-policy`
- Goose: `adversary_inspector.rs`, `classification_client.rs`, `egress_inspector.rs`

Unified:
```
security/
├── guardrails/           # V3: input/output filtering
├── adversary/            # Goose: prompt injection detection
├── classification/       # Goose: content classification API
├── egress/               # Both: network egress control
├── supply-chain/         # V3: supply chain scanning
└── permissions/          # Unified permission model
```

#### 6.6 MITM Proxy (9Router)
**Source**: `9router/src/mitm/`
**Target**: `packages/gateway/src/mitm/`

- Certificate generation/installation
- DNS configuration
- IDE handlers (Cursor, Kiro, Copilot, etc.)
- Request/response logging
- Token extraction

---

### Phase 7: Web Dashboard (Next.js) (Week 14-18)

**Base**: 9Router dashboard (`9router/src/app/`) + V3 pages

```
apps/dashboard/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── callback/
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              # Overview
│   │   │   ├── gateway/
│   │   │   │   ├── providers/page.tsx
│   │   │   │   ├── models/page.tsx
│   │   │   │   ├── combos/page.tsx
│   │   │   │   └── usage/page.tsx
│   │   │   ├── agents/
│   │   │   │   ├── page.tsx          # Agent list
│   │   │   │   ├── dag/[id]/page.tsx # DAG visualizer
│   │   │   │   └── pipeline/[id]/page.tsx
│   │   │   ├── sessions/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── recipes/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── builder/page.tsx  # Visual recipe builder
│   │   │   │   └── marketplace/page.tsx
│   │   │   ├── skills/
│   │   │   │   ├── page.tsx
│   │   │   │   └── marketplace/page.tsx
│   │   │   ├── mcp/
│   │   │   │   ├── page.tsx
│   │   │   │   └── servers/page.tsx
│   │   │   ├── security/
│   │   │   │   ├── guardrails/page.tsx
│   │   │   │   ├── adversary/page.tsx
│   │   │   │   └── audit/page.tsx
│   │   │   ├── settings/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── providers/page.tsx
│   │   │   │   ├── oauth/page.tsx
│   │   │   │   └── local-inference/page.tsx
│   │   │   └── os/                   # V3 OS pages
│   │   │       ├── kernel/page.tsx
│   │   │       ├── analytics/page.tsx
│   │   │       ├── live-agents/page.tsx
│   │   │       ├── graph/page.tsx
│   │   │       └── improvement/page.tsx
│   │   └── api/                      # Next.js API routes
│   ├── components/                   # Shared components
│   ├── lib/                          # Client libraries
│   └── hooks/
```

---

### Phase 8: Testing & Quality (Week 16-20)

#### 8.1 Test Strategy (from all three projects)
- **Unit**: Vitest (TS) + cargo test (Rust) — target 80% coverage
- **Integration**: 
  - 9Router: golden tests with snapshots
  - Goose: scenario tests with recordings
  - V3: API integration tests
- **E2E**: Playwright (desktop + web)
- **Benchmarks**: Goose harbor + custom agent benchmarks

#### 8.2 Regression Baselines
- Provider behavior snapshots (9Router)
- Translator round-trip tests
- Agent DAG execution traces
- Recipe execution golden files

---

## Unified API Surface

### REST API (Server)
```
POST   /v1/chat/completions           # OpenAI-compatible (gateway)
POST   /v1/embeddings                 # OpenAI-compatible
POST   /v1/images/generations         # OpenAI-compatible
POST   /v1/audio/speech               # OpenAI-compatible
POST   /v1/audio/transcriptions       # OpenAI-compatible
GET    /v1/models                     # Model list (gateway)
GET    /v1/providers                  # Provider list
POST   /v1/gateway/combos             # Combo routing
POST   /v1/gateway/translate          # Protocol translation

# ACP Protocol (WebSocket)
WS     /acp                           # ACP server

# Agent Orchestration
POST   /v1/agents/dag/execute
GET    /v1/agents/dag/:id/status
POST   /v1/agents/pipeline/execute
POST   /v1/agents/graph/execute
POST   /v1/agents/swarm/deploy

# Recipes
POST   /v1/recipes/execute
GET    /v1/recipes
POST   /v1/recipes/validate

# Skills
GET    /v1/skills
POST   /v1/skills/install
POST   /v1/skills/execute

# MCP
GET    /v1/mcp/servers
POST   /v1/mcp/servers
POST   /v1/mcp/call

# Sessions
GET    /v1/sessions
POST   /v1/sessions
GET    /v1/sessions/:id
POST   /v1/sessions/:id/fork
DELETE /v1/sessions/:id

# Local Inference
GET    /v1/local/models
POST   /v1/local/models/pull
POST   /v1/local/inference

# Security
POST   /v1/security/scan
POST   /v1/security/classify
GET    /v1/security/audit

# Telemetry
GET    /v1/telemetry/traces
GET    /v1/telemetry/metrics
```

### CLI Commands (Unified)
```bash
# Core
agentic chat                    # Interactive chat (TUI or CLI)
agentic serve                   # Start all servers
agentic doctor                  # Diagnostics

# Gateway
agentic provider list           # List 100+ providers
agentic provider add <name>     # Configure provider
agentic model list              # List all models
agentic gateway translate       # Test translation

# Agents
agentic dag run <file>          # Execute DAG
agentic pipeline run <file>     # Execute pipeline
agentic graph run <file>        # Execute graph
agentic swarm deploy <config>   # Deploy swarm
agentic schedule list           # List scheduled tasks

# Recipes
agentic recipe run <name>       # Run recipe
agentic recipe create           # Interactive recipe creator
agentic recipe validate <file>  # Validate recipe
agentic recipe list             # List recipes

# Skills
agentic skill install <name>    # Install skill
agentic skill list              # List skills
agentic skill create            # Create new skill
agentic skill publish           # Publish to registry

# MCP
agentic mcp list                # List MCP servers
agentic mcp add <name> <cmd>    # Add MCP server
agentic mcp call <server> <tool> # Call MCP tool

# Local Inference
agentic local list              # List local models
agentic local pull <model>      # Download model
agentic local run <model>       # Run inference

# Sessions
agentic session list            # List sessions
agentic session show <id>       # Show session
agentic session fork <id>       # Fork session
agentic session export <id>     # Export session

# Security
agentic security scan <path>    # Scan for vulnerabilities
agentic security adversary      # Run adversary tests
agentic security audit          # Full security audit

# Config
agentic config show             # Show config
agentic config set <key> <val>  # Set config
agentic config providers        # Interactive provider setup
```

---

## Data Models (Unified)

### Provider Config
```typescript
interface ProviderConfig {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openrouter' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  models: ModelConfig[];
  auth?: OAuthConfig;
  capabilities: ProviderCapabilities;
  pricing?: PricingConfig;
  rateLimits?: RateLimitConfig;
  middleware?: MiddlewareConfig[];
}
```

### Agent Definition (V3 + Goose)
```typescript
interface AgentDefinition {
  id: string;
  name: string;
  type: 'dag' | 'pipeline' | 'graph' | 'swarm' | 'recipe' | 'skill' | 'subagent';
  version: string;
  description: string;
  
  // DAG/Pipeline/Graph
  nodes?: AgentNode[];
  edges?: AgentEdge[];
  
  // Recipe
  recipe?: RecipeDefinition;
  
  // Skill
  skill?: SkillManifest;
  
  // Subagent (Goose)
  subagent?: {
    prompt: string;
    tools: string[];
    model?: string;
    permission_policy: 'ask' | 'allow' | 'deny';
  };
  
  // Common
  model?: string;
  provider?: string;
  config?: Record<string, any>;
  permissions: PermissionSet;
  metadata: AgentMetadata;
}
```

### Session (Goose + V3)
```typescript
interface Session {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
  messages: Message[];
  agent_id?: string;
  recipe_id?: string;
  metadata: SessionMetadata;
  token_usage: TokenUsage;
  cost: number;
  tags: string[];
  forked_from?: string;
}
```

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Rust/TS interop complexity | High | High | Clear FFI boundaries; use ACP/HTTP for cross-lang |
| Config migration for users | Medium | High | Automated migration script; backward compat config |
| Binary size (Tauri + Rust) | Medium | Medium | Strip symbols; optional features; dynamic loading |
| Provider API churn | High | Medium | Abstract provider interface; adapter pattern |
| MITM cert trust issues | Medium | High | Clear docs; auto-install with user consent |
| Local inference model size | Low | Medium | Model quantization; on-demand download |
| Skill/extension sandbox escape | Low | Critical | WASM sandbox; capability-based permissions |

---

## Team Structure Recommendation

| Team | Focus | Source Projects |
|------|-------|-----------------|
| **Core Runtime** | Agent orchestration, scheduler, DAG, graph | V3 (lead) |
| **Gateway** | Providers, translator, streaming, MITM | 9Router (lead) |
| **Agent Protocol** | ACP server, session mgmt, extensions | Goose (lead) |
| **Desktop/CLI/TUI** | Tauri app, CLI, TUI | Goose (lead) + V3 pages |
| **Web Dashboard** | Next.js dashboard | 9Router (lead) + V3 |
| **Local AI** | Inference, dictation, computer control | Goose (lead) |
| **Security** | Guardrails, adversary, egress, supply chain | V3 + Goose |
| **Platform** | Build, release, CI/CD, telemetry | All |

---

## Success Metrics (V4 Launch)

- [ ] **100+ providers** working out of the box
- [ ] **< 2s cold start** for CLI chat
- [ ] **< 500ms** gateway translation overhead
- [ ] **Zero-config** local inference (llama.cpp auto-download)
- [ ] **ACP compliant** — works with any ACP client
- [ ] **MCP compatible** — runs all MCP servers
- [ ] **Recipe portability** — Goose recipes run unmodified
- [ ] **Skill marketplace** — 50+ skills at launch
- [ ] **Desktop app** — signed, auto-updating, < 100MB
- [ ] **Self-improvement** — agents that improve themselves (V3 unique)
- [ ] **P2P swarm** — multi-machine agent clusters (V3 unique)

---

## Appendix: File Copy Checklist

### From 9Router (temp_gateways)
- [ ] `9router/open-sse/providers/registry/` → `packages/gateway/src/providers/registry/`
- [ ] `9router/open-sse/translator/` → `packages/gateway/src/translator/`
- [ ] `9router/open-sse/handlers/` → `packages/gateway/src/streaming/`
- [ ] `9router/open-sse/executors/` → `packages/gateway/src/executors/`
- [ ] `9router/open-sse/services/combo.js` → `packages/gateway/src/services/combo.ts`
- [ ] `9router/open-sse/services/tokenRefresh/` → `packages/gateway/src/services/token-refresh/`
- [ ] `9router/open-sse/services/usage/` → `packages/gateway/src/services/usage/`
- [ ] `9router/open-sse/rtk/` → `packages/rtk/`
- [ ] `9router/src/mitm/` → `packages/gateway/src/mitm/`
- [ ] `9router/src/lib/db/` → `packages/database/`
- [ ] `9router/src/lib/auth/` → `packages/oauth/`
- [ ] `9router/src/app/api/` → `apps/dashboard/src/app/api/`
- [ ] `9router/src/components/` → `apps/dashboard/src/components/`
- [ ] `9router/public/i18n/` → `apps/dashboard/public/i18n/`
- [ ] `9router/tests/` → `packages/gateway/tests/`

### From Goose
- [ ] `crates/goose/src/acp/` → `packages/acp/src/`
- [ ] `crates/goose/src/agents/` → `packages/agent-runtime/src/agents/`
- [ ] `crates/goose/src/config/` → `packages/config/`
- [ ] `crates/goose/src/recipe/` → `packages/recipes/src/`
- [ ] `crates/goose/src/skills/` → `packages/skills/src/`
- [ ] `crates/goose/src/session/` → `packages/acp/src/session/`
- [ ] `crates/goose/src/providers/` → `packages/gateway/src/providers/goose/`
- [ ] `crates/goose/src/local_inference/` → `packages/local-inference/`
- [ ] `crates/goose/src/dictation/` → `packages/dictation/`
- [ ] `crates/goose/src/security/` → `packages/security/`
- [ ] `crates/goose/src/mcp_utils.rs` → `packages/mcp/src/utils/`
- [ ] `crates/goose-mcp/src/computercontroller/` → `packages/computer-control/`
- [ ] `crates/goose-mcp/src/autovisualiser/` → `packages/autovisualiser/`
- [ ] `crates/goose-mcp/src/memory/` → `packages/mcp/src/memory/`
- [ ] `crates/goose-cli/src/` → `apps/cli/src/`
- [ ] `crates/goose-cli/src/session/` → `apps/cli/src/session/`
- [ ] `ui/desktop/src/` → `apps/desktop/src/`
- [ ] `ui/desktop/src-tauri/` → `apps/desktop/src-tauri/`
- [ ] `ui/text/src/` → `apps/tui/src/`
- [ ] `crates/goose-sdk/` → `packages/sdk/`
- [ ] `crates/goose-provider-types/` → `packages/provider-types/`
- [ ] `crates/goose-providers/` → `packages/gateway/src/providers/goose-providers/`
- [ ] `crates/goose-server/src/routes/` → `packages/acp/src/routes/`
- [ ] `documentation/` → `docs/` (merge with V3 docs)

### From Agentic OS V3 (Current)
- [ ] `server/src/services/` → `packages/agent-runtime/src/services/`
- [ ] `server/src/routes/` → `packages/agent-runtime/src/routes/`
- [ ] `server/src/lib/os/` → `packages/agent-runtime/src/os/`
- [ ] `src/pages/os/` → `apps/desktop/src/pages/os/` + `apps/dashboard/src/app/(dashboard)/os/`
- [ ] `src/components/` → `apps/desktop/src/components/` + `apps/dashboard/src/components/`
- [ ] `src/lib/` → `apps/desktop/src/lib/` + `apps/dashboard/src/lib/`
- [ ] `skills/omniroute/` → `packages/skills/src/builtins/omniroute/`
- [ ] `shared/types.ts` → `packages/core/src/types.ts`
- [ ] `nexus-tauri/` → merge into `apps/desktop/src-tauri/`

---

## Next Steps

1. **Create monorepo** with Cargo + pnpm workspaces
2. **Copy 9Router gateway** as first package (highest value, most complete)
3. **Copy Goose ACP server** as second package
4. **Port V3 agent runtime** as third package
5. **Build unified desktop app** combining Goose UI + V3 pages
6. **Build unified dashboard** combining 9Router + V3
7. **Integrate all** via ACP protocol + shared config

**Estimated timeline**: 20 weeks for full integration with 4-6 engineers
**MVP (CLI + Gateway + Basic Agents)**: 8 weeks

---

*This plan preserves the unique strengths of each project while eliminating duplication. The result: a single binary that runs everywhere, speaks every AI protocol, orchestrates any agent topology, and learns from its own operation.*