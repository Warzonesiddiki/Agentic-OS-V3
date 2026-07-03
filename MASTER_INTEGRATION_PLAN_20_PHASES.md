# Agentic OS V4: The Universal AI Agent Operating System
## 20-Phase Master Integration Plan — From 7 Projects to 1 Perfect Product

> **Projects being unified:**
> 1. **Agentic OS V3** — Agent orchestration brain (DAG, Pipeline, Graph, P2P, Self-improvement, Shadow daemon)
> 2. **9Router** — Universal AI gateway (100+ providers, protocol translation, MITM, RTK compression, skills)
> 3. **Goose** — Agent runtime (ACP server, CLI/TUI, Extensions, Recipes, Local inference, MCP, Dictation)
> 4. **litellm** — Python LLM gateway (100+ providers, Proxy, Routing strategies, Caching, Guardrails, Budgets)
> 5. **new-api** — Go AI gateway (Channel management, Billing, Relay, Multi-tenant, Load balancing)
> 6. **OmniRoute2** — TypeScript gateway (Skills, Auto-combo routing, Compression, Plugins, 30+ i18n)
> 7. **Portkey** — TypeScript gateway (50+ providers, Guardrail plugins, Caching, Fallbacks, Observability)

---

## Unified Architecture Vision

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        AGENTIC OS V4 — UNIVERSAL AI AGENT OS                         │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │    CLI       │  │    TUI       │  │   Desktop    │  │    Web       │             │
│  │  (Goose)     │  │  (Goose)     │  │  (Tauri+     │  │   Dashboard  │             │
│  │              │  │              │  │   React)     │  │  (Next.js)   │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                 │                 │                 │                     │
│         └─────────────────┼─────────────────┼─────────────────┘                     │
│                           ▼                 ▼                                       │
│              ┌─────────────────────────────────────────────┐                        │
│              │           ACP SERVER (Goose)                 │                        │
│              │  Session Mgmt │ Extension Mgmt │ Recipe Eng  │                        │
│              │  Tool Confirm │ Prompt Mgmt    │ Subagents   │                        │
│              └────────────────────────┬────────────────────┘                        │
│                                       │                                              │
│                                       ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                    AGENT ORCHESTRATION LAYER (Agentic OS V3)                 │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│  │  │ Agent    │ │ Pipeline │ │ Graph    │ │ P2P      │ │ Self-    │           │   │
│  │  │ DAG      │ │ Executor │ │ Engine   │ │ Swarm    │ │ Improve  │           │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│  │  │ Shadow   │ │ Task     │ │ Scheduler│ │ Skill    │ │ Recipe   │           │   │
│  │  │ Daemon   │ │ Worker   │ │ (Cron)   │ │ Runtime  │ │ Engine   │           │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘           │   │
│  └────────────────────────────────────┬────────────────────────────────────────┘   │
│                                       │                                              │
│                                       ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                      UNIVERSAL AI GATEWAY (Merged: 9Router + litellm +      │   │
│  │                      new-api + OmniRoute2 + Portkey)                         │   │
│  │                                                                              │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │   │
│  │  │ Provider   │ │ Protocol   │ │ Streaming  │ │ Routing    │ │ Resilience │ │   │
│  │  │ Registry   │ │ Translator │ │ Engine     │ │ Engine     │ │ & Guardrails│ │   │
│  │  │ (150+ prov)│ │ (OpenAI↔   │ │ (SSE, WS,  │ │ (Adaptive, │ │ (Circuit   │ │   │
│  │  │            │ │  Anth↔Gem) │ │  Streaming)│ │  Budget,   │ │  Breaker,  │ │   │
│  │  └────────────┘ └────────────┘ └────────────┘ │  Latency)  │ │  Fallback) │ │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ └────────────┘ └────────────┘ │   │
│  │  │ MITM Proxy │ │ RTK Comp   │ │ Observability                      │   │
│  │  │ (IDE Int)  │ │ (caveman,  │ │ (OTEL, Langfuse, Prometheus,         │   │
│  │  │            │ │  ponytail) │ │  Datadog, Custom)                   │   │
│  │  └────────────┘ └────────────┘ └────────────┘                          │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐           │   │
│  │  │ Auth/OAuth │ │ Billing/   │ │ Cache      │ │ Plugin/    │           │   │
│  │  │ Manager    │ │ Quotas     │ │ (Redis,    │ │ Skill Sys  │           │   │
│  │  │ (20+ prov) │ │ (new-api)  │ │  Semantic) │ │ (Unified)  │           │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘           │   │
│  └────────────────────────────────────┬────────────────────────────────────┘   │
│                                       │                                          │
│                                       ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                        INFRASTRUCTURE LAYER                                   ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           ││
│  │  │ SQLite/  │ │ Redis    │ │ OTEL     │ │ Config   │ │ Secrets  │           ││
│  │  │ Postgres │ │ Cluster  │ │ Tracing  │ │ Mgmt     │ │ Vault    │           ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘           ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           ││
│  │  │ Local    │ │ MCP      │ │ Sandbox  │ │ Dictation│ │ Computer │           ││
│  │  │ Inference│ │ Registry │ │ (WASM)   │ │ (Whisper)│ │ Control  │           ││
│  │  │(llama.cpp)│ │          │ │          │ │          │ │ (MCP)    │           ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘           ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Foundation & Monorepo Setup (Week 1)

### 0.1 Create Unified Monorepo Structure
```bash
agentic-os-v4/
├── apps/
│   ├── cli/                 # Goose CLI (Rust)
│   ├── tui/                 # Goose TUI (Rust, ratatui)
│   ├── desktop/             # Tauri + React (Goose desktop + V3 pages)
│   ├── dashboard/           # Next.js (9Router + OmniRoute2 + V3)
│   ├── server/              # Unified HTTP + ACP server (Rust + TS)
│   └── proxy/               # MITM proxy (9Router + Goose)
├── packages/
│   ├── core/                # Shared types, config, errors (TS + Rust)
│   ├── agent-runtime/       # V3: DAG, Pipeline, Graph, P2P, Scheduler, Self-improve
│   ├── gateway/             # Merged gateway core
│   │   ├── providers/       # 150+ provider adapters (from all 4 gateways)
│   │   ├── translator/      # Protocol translation (9Router + Portkey + litellm)
│   │   ├── streaming/       # SSE/WS handlers (9Router + Goose + Portkey)
│   │   ├── routing/         # Adaptive, Budget, Latency, Fallback (all 4)
│   │   ├── resilience/      # Circuit breaker, Retry, Fallback (litellm + new-api)
│   │   ├── mitm/            # MITM proxy for IDE (9Router + Goose)
│   │   ├── rtk/             # Real-Time Kit compression (9Router + OmniRoute2)
│   │   ├── auth/            # OAuth manager (9Router + Goose + OmniRoute2)
│   │   ├── billing/         # Quotas, budgets, billing (new-api + litellm)
│   │   ├── cache/           # Redis, Semantic, Disk (litellm + Portkey + 9Router)
│   │   ├── observability/   # OTEL, Langfuse, Prometheus, Datadog (all)
│   │   ├── plugins/         # Unified plugin system (Portkey + OmniRoute2 + Goose)
│   │   └── skills/          # Skill runtime (V3 + OmniRoute2 + Goose extensions)
│   ├── acp/                 # Goose ACP server
│   ├── mcp/                 # MCP registry, client, server runner (Goose + 9Router)
│   ├── recipes/             # Goose recipe engine + V3 pipeline builder
│   ├── local-inference/     # Goose llama.cpp + MLX + litellm local
│   ├── dictation/           # Goose Whisper
│   ├── computer-control/    # Goose computer controller MCP
│   ├── autovisualiser/      # Goose mermaid/sankey/treemap
│   ├── security/            # V3 guardrails + litellm guardrails + Portkey plugins
│   ├── sandbox/             # V3 WASM plugin runtime
│   ├── telemetry/           # V3 OTEL + Goose Langfuse + litellm OTEL
│   ├── config/              # Unified configuration (all formats)
│   └── database/            # SQLite/Postgres schema + migrations (Prisma + sqlx)
├── tools/
│   ├── goose-binary/        # Prebuilt binaries per platform
│   └── install-link-generator/
├── docs/                    # Docusaurus (OmniRoute2 i18n + V3 + Goose)
├── evals/                   # Goose Harbor benchmarks + litellm evals
├── scripts/                 # Build, test, release (Justfile + Goose scripts)
├── Cargo.toml               # Rust workspace
├── package.json             # pnpm workspace
└── turbo.json               # Turborepo config
```

### 0.2 Build System Unification
- **Rust workspace** (Cargo.toml): All Rust crates (Goose core, CLI, TUI, local-inference, MCP, SDK)
- **pnpm workspace**: All TypeScript packages (Gateway, Desktop renderer, Dashboard, Skills, Plugins)
- **Turborepo**: Cross-language task orchestration
- **Justfile**: Primary task runner (like Goose)

### 0.3 Shared Configuration Schema
```toml
# agentic-os.toml (single source of truth)
[agent]
orchestration = "dag"           # dag | pipeline | graph | swarm
max_concurrent = 10

[gateway]
providers = ["openai", "anthropic", "gemini", "ollama", "openrouter", "bedrock", "vertex", "azure", "cohere", "mistral", "groq", "fireworks", "together", "deepseek", "xai", "perplexity", "cerebras", "sambanova", "huggingface", "replicate", "ollama", "lmstudio", "vllm", "tgi", "claude-code", "codex", "cursor", "kiro", "antigravity", "copilot", "github-copilot", "windsurf", "continue", "cline", "roo", "droid", "opencode", "aider", "zed", "jetbrains", "sourcegraph", "codeium", "tabnine", "qodo", "kimi", "qwen", "glm", "minimax", "moonshot", "stepfun", "baichuan", "zhipu", "internlm", "yi", "deepseek-coder", "starcoder", "codellama", "wizardcoder", "phind", "magicoder", "opencode-go", "commandcode", "mimo", "iflow", "trae", "vscode-copilot", "jetbrains-ai", "databricks", "snowflake", "sagemaker", "vertex-ai", "bedrock", "azure-ai", "google-vertex", "aws-bedrock", "gcp-vertex", "oci", "alibaba", "tencent", "huawei", "volcengine", "siliconflow", "modelers", "infinity", "jina", "voyage", "cohere", "together", "fireworks", "anyscale", "databricks", "snowflake-cortex"]
default_model = "claude-3-5-sonnet-20241022"
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
backend = "llamacpp"              # llamacpp | mlx | ollama | vllm
models_dir = "~/.agentic-os/models"

[dictation]
enabled = true
model = "base.en"

[security]
guardrails_enabled = true
adversary_mode = false
egress_policy = "strict"
pii_detection = true
prompt_injection_detection = true

[rtk]
compression = "caveman"           # none | caveman | ponytail
intensity = "full"

[scheduler]
enabled = true

[telemetry]
otel_enabled = true
langfuse_enabled = false
prometheus_enabled = true
datadog_enabled = false
```

---

## Phase 1: Gateway Core — Provider Registry & Adapters (Week 2-3)

### 1.1 Unified Provider Registry (150+ Providers)
**Source files to copy & merge:**
| Source | Files | Target |
|--------|-------|--------|
| 9Router | `9router/open-sse/providers/registry/*.js` (100+) | `packages/gateway/src/providers/registry/` |
| litellm | `litellm/litellm/llms/*/` (100+) | `packages/gateway/src/providers/adapters/litellm/` |
| Portkey | `portkey/src/providers/*/` (50+) | `packages/gateway/src/providers/adapters/portkey/` |
| new-api | `new-api/relay/channel/*/` (40+) | `packages/gateway/src/providers/adapters/newapi/` |
| OmniRoute2 | `OmniRoute2/src/lib/providers/*.ts` | `packages/gateway/src/providers/adapters/omniroute/` |
| Goose | `crates/goose/src/providers/*.rs` (30+) | `packages/gateway/src/providers/adapters/goose/` |

**Unified Provider Adapter Interface:**
```typescript
// packages/gateway/src/providers/types.ts
export interface ProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  
  // Auth
  authenticate(config: AuthConfig): Promise<AuthResult>;
  refreshToken(config: AuthConfig): Promise<AuthResult>;
  validateCredentials(config: AuthConfig): Promise<boolean>;
  
  // Chat Completions
  chatComplete(request: ChatRequest, options: RequestOptions): AsyncIterable<ChatChunk> | Promise<ChatResponse>;
  
  // Embeddings
  embed(request: EmbedRequest): Promise<EmbedResponse>;
  
  // Images
  generateImage(request: ImageRequest): Promise<ImageResponse>;
  editImage(request: ImageEditRequest): Promise<ImageResponse>;
  
  // Audio
  transcribe(request: TranscribeRequest): Promise<TranscribeResponse>;
  speak(request: TTSRequest): Promise<TTSResponse>;
  
  // Models
  listModels(): Promise<ModelInfo[]>;
  getModelInfo(modelId: string): Promise<ModelInfo>;
  
  // Health
  healthCheck(): Promise<HealthStatus>;
  
  // Streaming
  supportsStreaming(): boolean;
  supportsTools(): boolean;
  supportsVision(): boolean;
  supportsReasoning(): boolean;
}

export interface ProviderCapabilities {
  chat: boolean;
  completions: boolean;
  embeddings: boolean;
  images: boolean;
  audio: boolean;
  video: boolean;
  realtime: boolean;
  batches: boolean;
  fineTuning: boolean;
  toolUse: boolean;
  vision: boolean;
  reasoning: boolean;
  streaming: boolean;
  maxTokens: number;
  maxContext: number;
}
```

### 1.2 Provider Capability Normalization
- Merge litellm's `model_prices_and_context_window.json` (44K lines) + Portkey `models.json` + 9Router `providerModels.js` + OmniRoute2 `providerModels.ts`
- Create unified `model-registry.json` with: pricing, context window, modalities, capabilities, rate limits, regions

### 1.3 Authentication Manager (Unified)
**Merge:** 9Router OAuth (20+ providers) + Goose OAuth (device flow, Codex, Claude, Gemini, GitHub, Kiro, Cursor, Antigravity) + OmniRoute2 OAuth + new-api custom OAuth + litellm proxy auth
```typescript
// packages/gateway/src/auth/manager.ts
export class UnifiedAuthManager {
  // OAuth2 with PKCE for all major providers
  // API key validation & rotation
  // Device authorization flow (Claude, Codex, Gemini, GitHub, Kiro)
  // Custom OAuth for enterprise (new-api)
  // SSO integration (OIDC, SAML via new-api)
  // Token encryption at rest (libsql + sqlx)
  // Credential sharing across team (new-api teams)
}
```

---

## Phase 2: Protocol Translation Engine (Week 3-4)

### 2.1 Universal Format Translator
**Source:** 9Router `open-sse/translator/` (30+ bidirectional translators) + Portkey request/response handlers + litellm `llms/` format handlers + OmniRoute2 translators

```
packages/gateway/src/translator/
├── formats/
│   ├── openai.ts           # OpenAI Chat Completions
│   ├── anthropic.ts        # Anthropic Messages
│   ├── gemini.ts           # Gemini API
│   ├── openai-responses.ts # OpenAI Responses API
│   ├── cohere.ts           # Cohere Chat
│   ├── mistral.ts          # Mistral Chat
│   ├── bedrock.ts          # AWS Bedrock (multiple formats)
│   ├── vertex.ts           # Vertex AI (Gemini + partner models)
│   ├── ollama.ts           # Ollama API
│   ├── azure.ts            # Azure OpenAI
│   └── custom.ts           # OpenAI-compatible generic
├── concerns/
│   ├── thinking.ts         # Thinking/reasoning blocks
│   ├── tool-call.ts        # Tool call normalization
│   ├── image.ts            # Image input/output
│   ├── modality.ts         # Multimodal handling
│   ├── usage.ts            # Token usage normalization
│   ├── finish-reason.ts    # Finish reason mapping
│   ├── chunk.ts            # Streaming chunk handling
│   └── reasoning.ts        # Reasoning effort/content
├── request/
│   ├── openai-to-anthropic.ts
│   ├── openai-to-gemini.ts
│   ├── anthropic-to-openai.ts
│   ├── gemini-to-openai.ts
│   ├── openai-to-bedrock.ts
│   ├── openai-to-vertex.ts
│   ├── openai-to-cohere.ts
│   ├── openai-to-mistral.ts
│   ├── openai-to-ollama.ts
│   ├── openai-to-azure.ts
│   ├── claude-to-openai.ts
│   ├── kiro-to-openai.ts
│   ├── cursor-to-openai.ts
│   ├── codex-to-openai.ts
│   └── ... (all 30+ combinations)
├── response/
│   ├── anthropic-to-openai.ts
│   ├── gemini-to-openai.ts
│   ├── bedrock-to-openai.ts
│   ├── vertex-to-openai.ts
│   └── ...
└── index.ts                # Main translate() function
```

### 2.2 Streaming Translation Pipeline
```typescript
// packages/gateway/src/streaming/translator.ts
export class StreamingTranslator {
  // Translates streaming chunks in real-time
  // Handles: tool call streaming, thinking streaming, delta accumulation
  // Supports: SSE, WebSocket, HTTP streaming
  
  async *translateStream(
    source: AsyncIterable<Uint8Array>,
    fromFormat: Format,
    toFormat: Format,
    options: TranslationOptions
  ): AsyncIterable<Uint8Array>
}
```

---

## Phase 3: Streaming & SSE Engine (Week 4-5)

### 3.1 Unified Streaming Handlers
**Source:** 9Router `open-sse/handlers/chatCore/` + Goose ACP streaming + Portkey `streamHandler.ts` + litellm `streaming_handler.py` + OmniRoute2 SSE handlers

```typescript
// packages/gateway/src/streaming/
├── chat-stream.ts          # Chat completion streaming
├── embeddings-stream.ts    # Embedding streaming
├── image-stream.ts         # Image generation streaming
├── audio-stream.ts         # TTS/STT streaming
├── realtime-stream.ts      # Realtime API (WebSocket)
├── sse-to-json.ts          # SSE → JSON converter
├── chunk-buffer.ts         # Chunk buffering & recombination
├── error-normalizer.ts     # Unified error format
└── index.ts
```

### 3.2 Response Transformer Pipeline
```typescript
// Post-processing pipeline for all responses
export const responsePipeline = [
  normalizeUsage,           // Standardize token usage
  injectReasoningMetadata,  // Add reasoning info
  formatToolCalls,          // Normalize tool call format
  compressIfNeeded,         // RTK compression
  addGatewayMetadata,       // Request ID, routing info
  validateSchema            // Ensure OpenAI compatibility
];
```

---

## Phase 4: Routing Engine — The Brain (Week 5-6)

### 4.1 Multi-Strategy Router (Merge All)
| Strategy | Source | Implementation |
|----------|--------|----------------|
| **Adaptive/ML** | litellm `adaptive_router` (bandit, classifier) | `packages/gateway/src/routing/adaptive/` |
| **Auto-combo** | 9Router + OmniRoute2 | `packages/gateway/src/routing/combo/` |
| **Budget-aware** | new-api + litellm budget_limiter | `packages/gateway/src/routing/budget/` |
| **Latency-based** | litellm `lowest_latency` | `packages/gateway/src/routing/latency/` |
| **Cost-based** | litellm `lowest_cost` + new-api pricing | `packages/gateway/src/routing/cost/` |
| **Quality-based** | litellm `quality_router` | `packages/gateway/src/routing/quality/` |
| **Complexity** | litellm `complexity_router` | `packages/gateway/src/routing/complexity/` |
| **Tag-based** | OmniRoute2 + 9Router | `packages/gateway/src/routing/tag/` |
| **Quota-share** | OmniRoute2 | `packages/gateway/src/routing/quota/` |
| **Fallback chain** | All gateways | `packages/gateway/src/routing/fallback/` |
| **Load balance** | new-api + litellm | `packages/gateway/src/routing/loadbalance/` |

### 4.2 Unified Routing Config (YAML)
```yaml
# ~/.agentic-os/gateway/router.yaml
router:
  default_strategy: "adaptive"
  strategies:
    adaptive:
      enabled: true
      exploration_rate: 0.1
      bandit_algorithm: "thompson"
      learning_window: "7d"
    combo:
      enabled: true
      max_steps: 3
      auto_promote: true
      fusion_enabled: true
    budget:
      enabled: true
      daily_limit_usd: 100
      per_model_limits:
        "gpt-4o": 50
        "claude-3-5-sonnet": 30
    fallback:
      enabled: true
      chains:
        - ["claude-3-5-sonnet", "gpt-4o", "gemini-1.5-pro"]
        - ["deepseek-chat", "qwen-2.5-coder", "codellama-70b"]
    loadbalance:
      algorithm: "least_latency"
      health_check_interval: 30
```

---

## Phase 5: Resilience & Guardrails (Week 6-7)

### 5.1 Circuit Breaker & Retry (litellm + new-api + Goose)
```typescript
// packages/gateway/src/resilience/
├── circuit-breaker.ts      # State: closed|open|half-open, per-provider
├── retry-policy.ts         # Exponential backoff, jitter, max attempts
├── fallback-handler.ts     # Multi-model fallback with context preservation
├── rate-limiter.ts         # Token bucket, sliding window, per-key/per-team
├── timeout-manager.ts      # Per-request, per-provider, streaming timeouts
├── health-monitor.ts       # Active/passive health checks, degradation detection
└── degradation.ts          # Graceful degradation (disable features under load)
```

### 5.2 Guardrails Engine (Merge All)
| Feature | Source | Implementation |
|---------|--------|----------------|
| PII Detection | Portkey (Patronus, Pangea) + litellm (Presidio) | `packages/security/pii/` |
| Prompt Injection | Portkey (Qualifire, Lakera) + litellm (custom) | `packages/security/injection/` |
| Content Moderation | Portkey (Azure, OpenAI) + litellm | `packages/security/moderation/` |
| Hallucination | Portkey (Patronus) | `packages/security/hallucination/` |
| Tool Use Quality | Portkey (Qualifire) | `packages/security/tool-quality/` |
| Custom Rules | litellm `custom_guardrail` + Portkey plugins | `packages/security/custom/` |
| Adversary Mode | Goose `adversary_inspector` | `packages/security/adversary/` |
| Egress Control | V3 `egress_inspector` + new-api SSRF | `packages/security/egress/` |

### 5.3 Guardrail Pipeline
```yaml
# ~/.agentic-os/security/guardrails.yaml
guardrails:
  - name: "pii-mask"
    type: "pii_detection"
    provider: "presidio"
    mode: "mask"          # mask | block | alert
    entities: ["EMAIL", "PHONE", "SSN", "CREDIT_CARD", "API_KEY"]
    
  - name: "injection-block"
    type: "prompt_injection"
    provider: "lakera"
    mode: "block"
    threshold: 0.8
    
  - name: "custom-secrets"
    type: "custom_regex"
    patterns:
      - "sk-[a-zA-Z0-9]{48}"
      - "ghp_[a-zA-Z0-9]{36}"
    mode: "redact"
```

---

## Phase 6: MITM Proxy for IDE Integration (Week 7-8)

### 6.1 Full MITM Implementation (9Router + Goose)
**Source:** `9router/src/mitm/` + Goose (planned)

```typescript
// packages/gateway/src/mitm/
├── cert/
│   ├── generate.ts       # Root CA generation
│   ├── install.ts        # System trust store installation
│   └── root-ca.ts        # CA management
├── dns/
│   └── config.ts         # DNS routing rules
├── handlers/
│   ├── base.ts           # Base handler
│   ├── cursor.ts         # Cursor protobuf interception
│   ├── copilot.ts        # GitHub Copilot
│   ├── kiro.ts           # Kiro IDE
│   ├── antigravity.ts    # Antigravity IDE
│   ├── windsuf.ts        # Windsurf
│   ├── cline.ts          # Cline
│   └── continue.ts       # Continue
├── manager.ts            # Proxy lifecycle
├── server.ts             # HTTP/HTTPS proxy server
└── win-elevated.ts       # Windows admin elevation
```

### 6.2 IDE Auto-Configuration
- Detect running IDEs
- Auto-configure proxy settings
- Certificate trust automation
- Per-IDE connection profiles

---

## Phase 7: Auth, Billing & Multi-Tenancy (Week 8-9)

### 7.1 Unified Auth System (new-api + 9Router + Goose + OmniRoute2)
```typescript
// packages/gateway/src/auth/
├── oauth/
│   ├── providers/          # 30+ OAuth providers
│   ├── device-flow.ts      # Device authorization (Claude, Codex, etc.)
│   ├── pkce.ts             # PKCE implementation
│   └── token-store.ts      # Encrypted token storage
├── api-keys/
│   ├── generator.ts        # Secure key generation
│   ├── validator.ts        # Key validation & scoping
│   ├── rotation.ts         # Automatic rotation
│   └── inheritance.ts      # Team/org key inheritance
├── sso/
│   ├── oidc.ts             # OpenID Connect
│   ├── saml.ts             # SAML 2.0 (new-api)
│   └── ldap.ts             # LDAP (new-api)
└── sessions/
    ├── manager.ts          # Session lifecycle
    ├── jwt.ts              # JWT issuance/validation
    └── refresh.ts          # Token refresh
```

### 7.2 Billing & Quotas (new-api + litellm)
```typescript
// packages/gateway/src/billing/
├── quota-engine.ts         # Multi-dimensional quotas (requests, tokens, cost, time)
├── budget-manager.ts       # Budgets: daily, monthly, per-model, per-team, per-user
├── pricing-engine.ts       # Dynamic pricing, volume discounts, custom rates
├── invoice-generator.ts    # Invoice generation (new-api Stripe/Creem/Epay/Waffo)
├── usage-aggregator.ts     # Real-time usage aggregation (ClickHouse/Redis)
├── cost-tracker.ts         // Per-request cost with breakdown
└── alerts.ts               // Budget alerts, webhook notifications
```

### 7.3 Multi-Tenant Architecture (new-api)
- Organizations → Teams → Users → Projects
- Role-based access (RBAC + ABAC via Casbin)
- Resource isolation (keys, models, budgets, logs)
- SSO integration

---

## Phase 8: Caching Layer (Week 9-10)

### 8.1 Multi-Level Cache (litellm + Portkey + 9Router)
```typescript
// packages/gateway/src/cache/
├── memory/
│   └── lru-cache.ts        // In-memory LRU with TTL
├── redis/
│   ├── cache.ts            // Redis cache (cluster support)
│   ├── semantic.ts         // Semantic cache (embeddings + vector search)
│   └── cluster.ts          // Redis cluster
├── disk/
│   └── sqlite-cache.ts     // SQLite persistent cache (sql.js / better-sqlite3)
├── semantic/
│   ├── embedder.ts         // Embedding generation for cache keys
│   ├── vector-store.ts     // Qdrant / pgvector / sqlite-vec
│   └── similarity.ts       // Cosine similarity, threshold tuning
├── cache-key.ts            // Request normalization for cache keys
├── cache-policy.ts         // TTL, size, eviction policies
└── manager.ts              // Unified cache manager
```

### 8.2 Cache Strategies
- **Exact match**: Full request hash
- **Semantic match**: Embedding similarity > 0.95
- **Prefix match**: For streaming, cache common prefixes
- **Parameterized**: Template-based for variable parts

---

## Phase 9: Observability & Telemetry (Week 10-11)

### 9.1 Unified Telemetry (V3 OTEL + Goose Langfuse + litellm OTEL + Portkey)
```typescript
// packages/telemetry/
├── otel/
│   ├── provider.ts         // OTEL SDK setup
│   ├── exporters.ts        // OTLP, Jaeger, Zipkin, Console
│   ├── instruments.ts      // Counters, histograms, gauges
│   ├── semantic-conventions.ts // GenAI semantic conventions
│   └── propagators.ts      // W3C tracecontext, baggage
├── langfuse/
│   ├── client.ts           // Langfuse client
│   ├── trace.ts            // Trace creation
│   ├── observation.ts      // Spans, generations, events
│   └── scoring.ts          // User feedback, model evals
├── prometheus/
│   ├── metrics.ts          // Prometheus metrics
│   ├── pushgateway.ts      // Pushgateway for batch jobs
│   └── rules.ts            // Alerting rules
├── datadog/
│   └── ...                 // Datadog integration
├── custom/
│   ├── logger.ts           // Structured logging (Pino/Zerolog)
│   ├── audit.ts            // Audit trail (V3 audit-engine)
│   └── request-logger.ts   // Full request/response logging
└── dashboard/
    ├── grafana/            // Grafana dashboards (JSON)
    └── custom/             // Built-in web dashboard
```

### 9.2 Key Metrics to Track
- Request latency (p50, p95, p99) per provider/model
- Token throughput (input/output/total)
- Error rates by type (timeout, rate limit, auth, validation)
- Cost per request, per model, per team
- Cache hit rates (exact, semantic)
- Routing decisions (which strategy, why)
- Fallback chain depth
- Guardrail triggers
- MITM proxy connections

---

## Phase 10: Plugin & Skill System Unification (Week 11-12)

### 10.1 Unified Plugin Architecture
**Merge:** Goose Extensions + Portkey Plugins + OmniRoute2 Plugins + 9Router Skills + V3 Skills + litellm Callbacks

```typescript
// packages/gateway/src/plugins/
├── types.ts                // Unified plugin manifest
├── registry.ts             // Plugin registry & discovery
├── loader.ts               // Dynamic loading (WASM, JS, native)
├── sandbox.ts              // WASM sandbox (V3 wasm-plugin-runtime)
├── permissions.ts          // Capability-based permissions
├── marketplace.ts          // Plugin marketplace client
├── hooks/
│   ├── pre-request.ts      // Modify request before routing
│   ├── post-request.ts     // Modify response
│   ├── on-error.ts         // Error handling
│   ├── on-stream-chunk.ts  // Stream transformation
│   └── on-cost.ts          // Cost tracking hooks
└── builtins/
    ├── compression/        // RTK compression as plugin
    ├── guardrails/         // Guardrails as plugins
    ├── caching/            // Custom cache strategies
    ├── routing/            // Custom routing strategies
    ├── auth/               // Custom auth providers
    └── observability/      // Custom exporters
```

### 10.2 Skill System = Plugins + Recipes + Agents
```yaml
# skill.yaml (unified manifest)
name: "github-pr-reviewer"
version: "1.2.0"
type: "agent"                 # agent | tool | prompt | recipe | mcp-wrapper
description: "Reviews PRs using multi-model consensus"
capabilities:
  - chat
  - tools
  - filesystem
  - git
permissions:
  - read: [repository]
  - write: [comments, reviews]
  - network: [github.com]
entry:
  agent: "github-pr-reviewer.yaml"    # Agent DAG definition
  tools: ["github-api", "diff-analyzer"]
  prompts: ["review-prompt.md"]
config_schema:
  model: "string"
  strictness: "enum: [low, medium, high]"
  languages: "string[]"
```

---

## Phase 11: Recipe Engine + Agent Orchestration Fusion (Week 12-13)

### 11.1 Recipe → Agent DAG Compiler
**Merge:** Goose Recipes (YAML, subrecipes, parameters) + V3 Pipeline Builder + V3 Agent DAG

```typescript
// packages/recipes/src/compiler.ts
export class RecipeToDAGCompiler {
  // Compiles YAML recipe → Agent DAG
  // Supports: parallel steps, conditionals, loops, subrecipes, parameter substitution
  // Output: executable DAG for agent-runtime
  
  compile(recipe: Recipe): AgentDAG {
    // 1. Parse YAML with parameter validation
    // 2. Build dependency graph from step dependencies
    // 3. Convert each step to AgentNode:
    //    - llm_call → LLMNode (with model, prompt, tools)
    //    - tool_call → ToolNode
    //    - parallel → ParallelNode
    //    - conditional → ConditionalNode
    //    - subrecipe → SubDAGNode
    // 4. Add orchestration metadata (retries, timeouts, fallbacks)
    // 5. Validate DAG (no cycles, all refs resolved)
    // 6. Return typed AgentDAG
  }
}
```

### 11.2 Unified Execution Engine
```typescript
// packages/agent-runtime/src/executor.ts
export class UnifiedExecutor {
  // Executes: Agent DAG, Pipeline, Graph, Swarm, Recipe, Skill
  // Single execution engine with multiple scheduling strategies
  
  async execute<T>(definition: ExecutableDefinition, context: ExecutionContext): Promise<ExecutionResult<T>> {
    const scheduler = this.getScheduler(definition.type);
    return scheduler.schedule(definition, context);
  }
  
  private getScheduler(type: ExecutableType): Scheduler {
    switch(type) {
      case 'dag': return this.dagScheduler;
      case 'pipeline': return this.pipelineScheduler;
      case 'graph': return this.graphScheduler;
      case 'swarm': return this.swarmScheduler;
      case 'recipe': return this.recipeScheduler;  // compiles to DAG first
      case 'skill': return this.skillScheduler;
    }
  }
}
```

---

## Phase 12: Local Inference & Device AI (Week 13-14)

### 12.1 Unified Local Inference (Goose + litellm)
```rust
// packages/local-inference/src/
// Rust crate with llama.cpp, MLX, Ollama, vLLM, TGI backends

pub enum InferenceBackend {
    LlamaCpp(LlamaCppConfig),
    MLX(MLXConfig),
    Ollama(OllamaConfig),
    VLLM(VLLMConfig),
    TGI(TGIConfig),
}

pub struct LocalInferenceManager {
    backends: HashMap<String, Box<dyn InferenceBackend>>,
    model_registry: LocalModelRegistry,
    tool_emulator: ToolEmulator,      // Goose tool emulation for non-tool models
    parser: NativeToolParser,         // Parse tool calls from raw output
}
```

### 12.2 Model Management
- **Download**: HuggingFace, ModelScope, local files
- **Quantization**: GGUF (Q4_K_M, Q8_0, etc.), MLX 4-bit, AWQ, GPTQ
- **Registry**: Local model metadata, capabilities, recommended settings
- **Auto-selection**: Pick best model for task (coding → coder models, chat → instruct)

---

## Phase 13: Desktop App — Tauri + React (Week 14-15)

### 13.1 Merge Goose Desktop + V3 Pages
```
apps/desktop/
├── src-tauri/                  # Goose Tauri config + V3 Rust backend
│   ├── src/
│   │   ├── main.rs             # Goose main + V3 services
│   │   ├── lib.rs              # Tauri commands (V3 + Goose)
│   │   ├── gateway.rs          # Embedded gateway (in-process)
│   │   ├── acp_server.rs       # Embedded ACP server
│   │   ├── mitm_proxy.rs       # Embedded MITM
│   │   ├── local_inference.rs  # llama.cpp integration
│   │   └── system_tray.rs      # Tray icon + menus
│   ├── capabilities/
│   │   └── default.json        # Tauri permissions
│   └── tauri.conf.json         # Config
├── src/
│   ├── components/             # Goose components + V3 components
│   ├── pages/
│   │   ├── os/                 # V3 OS pages (Kernel, Graph, LiveAgents, Analytics, etc.)
│   │   ├── Chat.tsx            # Goose chat interface
│   │   ├── Sessions.tsx        # Session management
│   │   ├── Extensions.tsx      # Extension marketplace
│   │   ├── Recipes.tsx         # Recipe builder + runner
│   │   ├── Skills.tsx          # Skill marketplace
│   │   ├── Providers.tsx       # Provider config (9Router style)
│   │   ├── Routing.tsx         # Visual routing builder
│   │   ├── Analytics.tsx       # Usage, cost, performance
│   │   ├── Guardrails.tsx      # Security config
│   │   ├── MITM.tsx            # Proxy management
│   │   ├── LocalModels.tsx     # Local inference management
│   │   └── Settings.tsx        # Unified settings
│   ├── hooks/                  # Goose hooks + V3 hooks
│   ├── stores/                 # Zustand stores (Goose + V3)
│   ├── lib/                    # Shared utilities
│   └── App.tsx
└── package.json
```

### 13.2 Native Features
- **System tray** with quick actions
- **Global hotkey** for instant chat
- **File drag-drop** for context
- **Clipboard monitoring** (opt-in)
- **Auto-updater** (Goose github-updater + V3)
- **Native notifications**
- **Secure storage** (Keychain/Keytar/Credential Manager)

---

## Phase 14: CLI & TUI (Week 15-16)

### 14.1 Goose CLI (Rust) — Enhanced
```
apps/cli/src/commands/
├── chat.rs           # Interactive chat (Goose)
├── run.rs            # Run recipe/skill/agent
├── session.rs        # Session management
├── recipe.rs         # Recipe CRUD + run
├── skill.rs          # Skill install/update/list
├── provider.rs       # Provider config (from 9Router)
├── routing.rs        # Routing config
├── gateway.rs        # Start/stop gateway server
├── mitm.rs           # MITM proxy control
├── local.rs          # Local model management
├── dictation.rs      # Voice input
├── config.rs         # Unified config
├── doctor.rs         # Diagnostics
├── update.rs         # Self-update
├── schedule.rs       # Cron schedules
├── project.rs        # Project tracking
└── completion.rs     # Shell completions
```

### 14.2 Goose TUI (Ratatui) — Full Screen Dashboard
```
apps/tui/src/
├── tabs/
│   ├── chat.rs       # Chat interface
│   ├── sessions.rs   # Session list + search
│   ├── agents.rs     # Running agents + DAG view
│   ├── gateway.rs    # Gateway status + routing
│   ├── providers.rs  # Provider health + models
│   ├── skills.rs     # Skill browser
│   ├── recipes.rs    # Recipe runner
│   ├── logs.rs       # Live logs + filtering
│   ├── analytics.rs  # Charts (ratatui + unicode)
│   └── settings.rs   # Config editor
├── components/
│   ├── streaming.rs  # Streaming text display
│   ├── markdown.rs   # Markdown rendering
│   ├── diff.rs       # Diff viewer
│   └── table.rs      # Data tables
└── main.rs
```

---

## Phase 15: Web Dashboard — Next.js (Week 16-17)

### 15.1 Merge 9Router + OmniRoute2 + V3 Dashboards
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
│   │   │   ├── providers/
│   │   │   │   ├── page.tsx          # Provider grid
│   │   │   │   ├── [id]/page.tsx     # Provider detail
│   │   │   │   └── add/page.tsx      # Add provider wizard
│   │   │   ├── routing/
│   │   │   │   ├── page.tsx          # Visual routing builder
│   │   │   │   ├── combos/page.tsx   # Combo management
│   │   │   │   └── strategies/page.tsx
│   │   │   ├── analytics/
│   │   │   │   ├── usage/page.tsx    # Usage charts (Recharts)
│   │   │   │   ├── costs/page.tsx    # Cost breakdown
│   │   │   │   ├── performance/page.tsx
│   │   │   │   └── routing/page.tsx  # Routing decisions
│   │   │   ├── guardrails/
│   │   │   │   ├── page.tsx
│   │   │   │   └── rules/page.tsx
│   │   │   ├── mitm/
│   │   │   │   └── page.tsx
│   │   │   ├── local-models/
│   │   │   │   └── page.tsx
│   │   │   ├── skills/
│   │   │   │   ├── page.tsx          # Marketplace
│   │   │   │   ├── builder/page.tsx  # Visual skill builder
│   │   │   │   └── registry/page.tsx
│   │   │   ├── recipes/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── builder/page.tsx  # Visual recipe builder
│   │   │   │   └── runs/page.tsx
│   │   │   ├── agents/
│   │   │   │   ├── page.tsx          # Agent dashboard
│   │   │   │   ├── dag/[id]/page.tsx # DAG visualizer
│   │   │   │   └── swarm/page.tsx
│   │   │   ├── sessions/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── team/
│   │   │   │   ├── members/page.tsx
│   │   │   │   ├── budgets/page.tsx
│   │   │   │   └── audit/page.tsx
│   │   │   └── settings/
│   │   │       ├── page.tsx
│   │   │       ├── general/page.tsx
│   │   │       ├── appearance/page.tsx
│   │   │       ├── i18n/page.tsx     # 30+ languages (OmniRoute2)
│   │   │       └── advanced/page.tsx
│   │   ├── api/                      # Next.js API routes
│   │   │   ├── v1/                   # OpenAI-compatible
│   │   │   ├── v1beta/
│   │   │   └── management/           # Dashboard APIs
│   │   └── globals.css
│   ├── components/                   # Shared UI (shadcn/ui + custom)
│   ├── lib/                          # Utilities, API client
│   ├── hooks/                        # React hooks
│   ├── stores/                       # Zustand stores
│   └── types/
├── public/
├── next.config.mjs
├── tailwind.config.ts
└── package.json
```

### 15.2 Key Features
- **Real-time updates** via SSE/WebSocket (Goose ACP + 9Router live server)
- **Visual routing builder** (React Flow / XYFlow)
- **Visual DAG/Graph editor** (V3 Graph + React Flow)
- **Skill/Recipe marketplace** with search, ratings, one-click install
- **Multi-language** (30+ from OmniRoute2)
- **PWA support** (OmniRoute2)
- **Dark/Light/System theme**

---

## Phase 16: MCP Ecosystem Integration (Week 17-18)

### 16.1 MCP Registry & Client (Goose + 9Router + litellm)
```typescript
// packages/mcp/
├── registry/
│   ├── index.ts              # MCP server registry (local + remote)
│   ├── discovery.ts          # Auto-discover .mcp.json, npm packages
│   ├── marketplace.ts        # MCP marketplace (Glama, Smithery, etc.)
│   └── installer.ts          # One-click install
├── client/
│   ├── stdio.ts              # stdio transport
│   ├── sse.ts                # SSE transport
│   ├── websocket.ts          # WebSocket transport
│   ├── http.ts               # Streamable HTTP
│   └── manager.ts            # Connection pooling, lifecycle
├── server/
│   ├── runner.ts             # Run MCP servers (Goose mcp_server_runner)
│   ├── proxy.ts              # MCP → Gateway proxy
│   └── aggregator.ts         # Aggregate multiple MCP servers
├── tools/
│   ├── converter.ts          # MCP tools → Gateway tools
│   ├── filter.ts             # Semantic tool filtering (OmniRoute2)
│   └── permissions.ts        # Tool permissions
└── types.ts
```

### 16.2 Computer Control MCP (Goose)
- **Desktop automation**: Click, type, scroll, screenshot
- **File operations**: Read, write, list, search
- **Shell commands**: Execute, background, pipes
- **Browser control**: Via CDP/Playwright
- **App control**: Windows/macOS/Linux accessibility APIs

---

## Phase 17: Dictation & Voice (Week 18)

### 17.1 Whisper Integration (Goose)
```rust
// packages/dictation/src/
// whisper.cpp integration with VAD, streaming, hotkeys

pub struct DictationEngine {
    model: WhisperModel,
    vad: VoiceActivityDetector,
    hotkey_manager: GlobalHotkeyManager,
    audio_capture: AudioCapture,
}

impl DictationEngine {
    pub async fn start_listening(&mut self) -> Result<()>
    pub async fn stop_listening(&mut self) -> Result<String>  // Returns transcribed text
    pub fn set_push_to_talk(&mut self, key: KeyCombo)
    pub fn set_voice_activity(&mut self, enabled: bool)
}
```

### 17.2 TTS Integration (Portkey + 9Router + litellm)
- Edge TTS (free, local)
- ElevenLabs (premium)
- OpenAI TTS
- Google Cloud TTS
- Coqui TTS (local)
- Piper (local, fast)

---

## Phase 18: Autovisualiser & Data Tools (Week 18-19)

### 18.1 Mermaid/Sankey/Treemap Generator (Goose)
```rust
// packages/autovisualiser/src/
// Generate diagrams from code, data, logs

pub enum DiagramType {
    Mermaid(MermaidType),    // flowchart, sequence, class, state, gitgraph
    Sankey(SankeyData),      // Flow visualization
    Treemap(TreemapData),    // Hierarchical data
    Radar(RadarData),        // Multi-dimensional
    Network(NetworkData),    // Graph visualization
}

pub struct AutoVisualiser {
    llm_client: Box<dyn LLMClient>,
    templates: TemplateRegistry,
}

impl AutoVisualiser {
    pub async fn visualize_code(&self, code: &str, lang: &str) -> Result<Diagram>
    pub async fn visualize_data(&self, data: &Value, diagram_type: DiagramType) -> Result<Diagram>
    pub async fn visualize_logs(&self, logs: &[LogEntry]) -> Result<Diagram>
    pub async fn visualize_agent_dag(&self, dag: &AgentDAG) -> Result<Diagram>
}
```

---

## Phase 19: Testing, Hardening & Documentation (Week 19-20)

### 19.1 Comprehensive Test Suite
| Test Type | Source | Coverage Target |
|-----------|--------|-----------------|
| Unit | Goose + litellm + 9Router + Portkey + new-api + OmniRoute2 | 90%+ |
| Integration | All projects | Critical paths 100% |
| E2E | Goose + 9Router + OmniRoute2 | User journeys |
| Load | litellm + new-api | 10k RPS |
| Chaos | new-api + litellm | Failure injection |
| Security | Goose adversary + litellm guardrails | Penetration |
| Regression | All golden tests | No regressions |

### 19.2 Golden Test Baselines (from 9Router + litellm)
- Request/response translation for all provider pairs
- Streaming chunk sequences
- Routing decisions
- Fallback chains
- Guardrail triggers
- Cost calculations

### 19.3 Documentation (Docusaurus + OmniRoute2 i18n)
```
docs/
├── getting-started/
│   ├── installation.md
│   ├── quickstart.md
│   ├── providers.md
│   └── first-agent.md
├── architecture/
│   ├── overview.md
│   ├── gateway.md
│   ├── agents.md
│   └── data-flow.md
├── guides/
│   ├── providers/
│   ├── routing/
│   ├── guardrails/
│   ├── local-inference/
│   ├── mitm-proxy/
│   ├── recipes/
│   ├── skills/
│   ├── mcp/
│   ├── dictation/
│   └── desktop/
├── reference/
│   ├── api/
│   ├── config/
│   ├── cli/
│   └── env-vars/
├── tutorials/
│   ├── build-custom-agent.md
│   ├── create-skill.md
│   ├── setup-mitm.md
│   └── deploy-production.md
└── i18n/           # 30 languages from OmniRoute2
```

---

## Phase 20: Release Engineering & Distribution (Week 20)

### 20.1 Build Pipeline
```yaml
# .github/workflows/release.yml
jobs:
  build-rust:
    # Build: CLI, TUI, Desktop backend, Local inference, MCP, SDK
    # Targets: linux-x64, linux-arm64, macos-x64, macos-arm64, windows-x64
    # Artifacts: Binaries, .deb, .rpm, .dmg, .msi, .appimage
  
  build-node:
    # Build: Dashboard (Next.js), Desktop renderer, SDK
    # Docker images: gateway, dashboard, proxy
  
  test:
    # Unit, Integration, E2E, Load, Security
  
  publish:
    # GitHub Release with all artifacts
    # npm packages (@agentic-os/*)
    # crates.io (agentic-os-*)
    # Docker Hub (agentic-os/*)
    # Homebrew tap
    # Scoop bucket
    # AUR package
    # Winget manifest
```

### 20.2 Installers
```bash
# One-liner install (like Goose)
curl -fsSL https://agentic-os.dev/install.sh | bash

# Windows
irm https://agentic-os.dev/install.ps1 | iex

# Package managers
brew install agentic-os/tap/agentic-os
scoop install agentic-os
winget install AgenticOS.AgenticOS
pacman -S agentic-os  # AUR
```

### 20.3 Auto-Update
- **Desktop**: Tauri updater (GitHub Releases)
- **CLI**: Self-update command (Goose pattern)
- **Dashboard**: Docker image pull + restart
- **Gateway**: Rolling update via systemd/k8s

---

## Cross-Cutting Concerns (All Phases)

### Security (Continuous)
- **Supply chain**: cargo-audit, npm audit, sigstore signing
- **Secrets**: Never in code, encrypted at rest, rotation
- **Dependencies**: Renovate/Dependabot, license checking
- **Runtime**: Sandbox (WASM), capability-based permissions
- **Network**: Egress control, SSRF protection, mTLS

### Performance (Continuous)
- **Benchmarks**: Every PR (litellm benchmarks + Goose benchmarks)
- **Profiles**: CPU, memory, allocation tracking
- **Regression detection**: Automated comparison

### Developer Experience (Continuous)
- **TypeScript**: Strict mode, full types for all packages
- **Rust**: Clippy, rustfmt, deny.toml
- **DX tools**: Dev container, VS Code extensions, CLI completions

---

## Final Deliverable: Single Binary + Ecosystem

```
agentic-os (single binary ~150MB)
├── CLI:        agentic-os chat, agentic-os run, agentic-os gateway ...
├── TUI:        agentic-os tui
├── Desktop:    agentic-os desktop (Tauri app bundle)
├── Server:     agentic-os serve --http --acp --mitm
├── Gateway:    agentic-os gateway --config router.yaml
├── Proxy:      agentic-os mitm --install-cert
├── Local AI:   agentic-os local pull llama-3.2-3b-q4
├── Dictation:  agentic-os dictate --push-to-talk f13
├── MCP:        agentic-os mcp install github
├── Skills:     agentic-os skill install github-pr-reviewer
├── Recipes:    agentic-os recipe run code-review
└── Doctor:     agentic-os doctor --fix
```

**Plus:**
- **Web Dashboard**: `docker run -p 3000:3000 agentic-os/dashboard`
- **Gateway Server**: `docker run -p 8000:8000 agentic-os/gateway`
- **Python SDK**: `pip install agentic-os`
- **TypeScript SDK**: `npm i @agentic-os/sdk`
- **Rust SDK**: `cargo add agentic-os-sdk`

---

## Success Criteria (Definition of Done)

| Criterion | Target |
|-----------|--------|
| **Provider Coverage** | 150+ providers, all modalities |
| **Protocol Support** | OpenAI, Anthropic, Gemini, Responses API, ACP, MCP, A2A |
| **Routing Strategies** | 10+ built-in, extensible |
| **Latency (p99)** | < 100ms gateway overhead |
| **Throughput** | 10k+ RPS on modest hardware |
| **Test Coverage** | >90% unit, 100% critical paths |
| **Binary Size** | < 150MB (all features) |
| **Startup Time** | < 500ms cold, < 50ms warm |
| **Memory (idle)** | < 100MB |
| **Languages** | 30+ (UI), English (docs) |
| **Platforms** | Linux, macOS, Windows, Docker, Web |
| **Install Methods** | curl, brew, scoop, winget, apt, docker, npm, pip, cargo |

---

## Team Allocation (Recommended)

| Phase | Engineers | Focus |
|-------|-----------|-------|
| 0-1 | 2 | Monorepo, build, provider registry |
| 2-3 | 3 | Translator, streaming |
| 4-5 | 3 | Routing, resilience |
| 6-7 | 2 | MITM, auth/billing |
| 8-9 | 2 | Cache, observability |
| 10-11 | 3 | Plugins, recipes, agents |
| 12-13 | 2 | Local inference, desktop |
| 14-15 | 2 | CLI, TUI, Dashboard |
| 16-18 | 2 | MCP, Dictation, Autovisualiser |
| 19-20 | All | Testing, hardening, release |

**Total: ~8-10 engineers for 20 weeks**

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Scope creep | High | High | Strict phase gates, MVP definition |
| Integration complexity | High | High | Early integration tests, contract testing |
| Performance regression | Medium | High | Continuous benchmarking |
| Dependency conflicts | Medium | Medium | Lockfiles, workspace version alignment |
| Talent spread | Medium | High | Pair programming, knowledge sharing |
| Burnout | Medium | High | Sustainable pace, clear milestones |

---

## Appendix: File Copy Map (Phase 0 Quick Start)

```
# Run this to bootstrap the monorepo with all source files
rsync -av --progress \
  --include="*/" \
  --include="*.rs" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" \
  --include="*.toml" --include="*.yaml" --include="*.yml" \
  --include="*.md" --include="*.sql" --include="*.prisma" \
  --exclude="*" \
  /path/to/goose_repo/crates/goose/src/          packages/agent-runtime/src/ \
  /path/to/goose_repo/crates/goose-cli/src/      apps/cli/src/ \
  /path/to/goose_repo/crates/goose-cli/src/session/ apps/cli/src/session/ \
  /path/to/goose_repo/ui/desktop/src/            apps/desktop/src/ \
  /path/to/goose_repo/ui/desktop/src-tauri/      apps/desktop/src-tauri/ \
  /path/to/goose_repo/ui/text/src/               apps/tui/src/ \
  /path/to/goose_repo/crates/goose-acp-macros/   packages/acp/macros/ \
  /path/to/goose_repo/crates/goose-mcp/          packages/mcp/ \
  /path/to/goose_repo/crates/goose-local-inference/ packages/local-inference/ \
  /path/to/goose_repo/crates/goose-provider-types/ packages/provider-types/ \
  /path/to/goose_repo/crates/goose-providers/    packages/gateway/src/providers/adapters/goose/ \
  /path/to/goose_repo/crates/goose-sdk/          packages/sdk/ \
  /path/to/goose_repo/crates/goose-server/       packages/acp/server/ \
  /path/to/9router/open-sse/                     packages/gateway/src/ \
  /path/to/9router/src/                          packages/gateway/src/ \
  /path/to/9router/skills/                       packages/skills/builtins/ \
  /path/to/OmniRoute2/src/                       packages/gateway/src/ \
  /path/to/OmniRoute2/skills/                    packages/skills/builtins/ \
  /path/to/litellm/litellm/                      packages/gateway/src/providers/adapters/litellm/ \
  /path/to/litellm/litellm/proxy/                packages/gateway/src/proxy/ \
  /path/to/litellm/litellm/router_strategy/      packages/gateway/src/routing/ \
  /path/to/litellm/litellm/caching/              packages/gateway/src/cache/ \
  /path/to/litellm/litellm/guardrails/           packages/security/ \
  /path/to/new-api/relay/                        packages/gateway/src/providers/adapters/newapi/ \
  /path/to/new-api/controller/                   packages/gateway/src/billing/ \
  /path/to/new-api/service/                      packages/gateway/src/billing/ \
  /path/to/new-api/model/                        packages/gateway/src/billing/ \
  /path/to/portkey/src/providers/                packages/gateway/src/providers/adapters/portkey/ \
  /path/to/portkey/src/middlewares/              packages/gateway/src/plugins/ \
  /path/to/portkey/plugins/                      packages/gateway/src/plugins/ \
  /path/to/Agentic_OS_V3/server/src/             packages/agent-runtime/src/ \
  /path/to/Agentic_OS_V3/src/                    apps/desktop/src/ \
  /path/to/Agentic_OS_V3/skills/                 packages/skills/builtins/ \
  /path/to/Agentic_OS_V3/docs/                   docs/ \
  /path/to/Agentic_OS_V3/shared/                 packages/core/
```

---

*This plan represents the synthesis of 7 production-grade AI agent/gateway projects into a single, unified, world-class platform. Each phase builds incrementally on the previous, with working software at every step. The result: **Agentic OS V4** — the only AI agent platform you'll ever need.*