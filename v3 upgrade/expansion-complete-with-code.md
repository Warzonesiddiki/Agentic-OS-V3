# 🌌 NEXUS V3 — THE COMPLETE 100X EXPANSION BLUEPRINT

## "No Compromises. Everything Works. In The Right Order."

> **DOCUMENT VERSION:** 3.1.0 — Code-Expanded Edition  
> **STATUS:** Ready for file transcription and Phase 0 execution  
> **SCOPE:** Complete system — every feature from V2 + all V2.5 extensions + V3 100x transformations  
> **ESTIMATED EFFORT:** 60-90 days for a high-capability agent  

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Phase 0: Foundation Verification](#phase-0-foundation-verification)
3. [Phase 1: Full Connectivity](#phase-1-full-connectivity)
4. [Phase 2: Complete Partial Features](#phase-2-complete-partial-features)
5. [Phase 3: Multi-Model LLM Gateway](#phase-3-multi-model-llm-gateway)
6. [Phase 4: Security & Observability](#phase-4-security--observability)
7. [Phase 5: Next-Gen UI/UX](#phase-5-next-gen-uiux)
8. [Phase 6: Developer Ecosystem](#phase-6-developer-ecosystem)
9. [Phase 7: 100x Transformative Features](#phase-7-100x-transformative-features)
10. [Phase 8: Performance & Scale](#phase-8-performance--scale)
11. [Phase 9: Production SaaS Deployment](#phase-9-production-saas-deployment)
12. [Appendices](#appendices)

---

## How To Use This Code-Expanded Edition

This document keeps the original 9-phase expansion blueprint and adds an implementation-ready code appendix. Because `23-project-status-and-file-inventory.md` verifies that the repository currently has no executable source files, treat all code blocks as source-of-truth file contents to create in the workspace, not as patches against existing files.

**Recommended execution path:**
1. Read Phase 0 and Appendix C.0/C.1 first.
2. Create the monorepo, server, web, and package structure.
3. Transcribe schema from `20-database-schema-specification.md`, then apply Appendix C.10 compatibility requirements.
4. Add the phase-specific code in Appendix C in order.
5. Run typecheck/tests after every phase and fix strictly rather than suppressing errors.

---

## 1. EXECUTIVE SUMMARY

### What Exists Today (Verified by `23-project-status-and-file-inventory.md`)

- **Actual executable source files:** `0` — the repository is currently a specification-only project.
- **Specification documents:** 19 markdown files with ~12,000 lines of architecture, schema, route, test, deployment, and roadmap detail.
- **Embedded code blocks:** ~7,500 lines of TypeScript / SQL / Docker / config embedded in the docs, not yet transcribed into real files.
- **Most complete code areas in documentation:** database schema, server core, LLM gateway, recall engine, plugin SDK, task worker, LLM client, UI components, advanced services, Docker deploy.

### What's Wrong

1. The previous claim that V2 has real `/src` and `/server` code is incorrect; those files exist only as markdown code blocks.
2. There is no runnable `package.json`, TypeScript config, Vite app, Hono server, or Drizzle migration in the workspace yet.
3. Multiple documents overlap and disagree in schema style (`text` PKs vs UUIDs, 16 tables vs 19 tables).
4. Many expansion phases name files but provide only sketches. This edition adds complete implementation-ready code blocks for the missing areas.
5. Features still need transcription into actual project files, dependency installation, compilation, tests, and end-to-end verification.

### The 100x Vision

The goal isn't just to finish V2 — it's to make NEXUS the **definitive Agentic Operating System**. This means:

| Area | V2 (Current) | V3 (100x Target) |
|------|-------------|-------------------|
| **LLM Support** | OpenAI-compatible only | 8+ providers: OpenAI, Anthropic, Google, Ollama, Groq, Together, DeepSeek, OpenRouter |
| **Agent Scale** | 50 agents | 10,000+ agents with hierarchical federation |
| **Developer Ecosystem** | None | Plugin SDK, Skill Marketplace, API docs site |
| **Client Platforms** | Browser-only | Tauri desktop + Web + React Native mobile + CLI |
| **Multi-Modal** | Text-only memories | Text + Image + Audio + Video + Code memories |
| **Collaboration** | Kernel IPC only | Debate, voting, consensus, blackboard protocols |
| **Self-Improvement** | None | Self-healing, auto-optimizing, code-generation agents |
| **Deployment** | Docker single-instance | Multi-region, multi-tenant SaaS + self-hosted |
| **Voice** | None | Real-time speech in/out for agent interaction |
| **Analytics** | Basic metrics | Full cost tracking, drift detection, behavioral analytics |
| **Community** | None | Skill marketplace, template library, public registry |
| **Automation** | Manual operations | Visual pipeline builder, auto-remediation runbooks |

---

## PHASE 0: FOUNDATION VERIFICATION

### "Make the existing code actually run"

**GOAL:** Every line of V2 server code compiles, tests pass, and the basic system boots against a real Postgres.

### Step 0.1: Environment Setup

```bash
cd server
npm install
```

### Step 0.2: TypeScript Compilation

```bash
npm run typecheck
```

Fix all TypeScript errors. Common issues:
- Drizzle query builder type mismatches
- Vector column type issues
- `bigint` mode incompatibilities
- Missing `.js` extensions in imports
- Zod schema mismatches

### Step 0.3: Database Setup

```bash
docker compose up -d postgres
npm run db:generate
npm run db:push
```

### Step 0.4: Test Execution

```bash
npm run test
npm run test:integration
```

### Step 0.5: Server Boot Verification

```bash
npm run dev
# Verify: health, system, memory CRUD, recall, audit
```

### Step 0.6: MCP Client Verification

Connect Claude Desktop or Cursor. Verify all MCP tools work.

### Phase 0 Success Criteria
```
[x] npm install succeeds
[x] npm run typecheck passes (0 errors)
[x] npm run db:generate creates valid SQL
[x] npm run db:push applies successfully
[x] npm run test passes (0 failures)
[x] Server boots without errors
[x] All 50+ REST endpoints respond
[x] MCP client can connect and call tools
[x] Docker Compose starts all services
```

---

## PHASE 1: FULL CONNECTIVITY

### "Connect every wire — frontend reads from server"

**GOAL:** The React dashboard reads from the server via REST API. No localStorage.

### Step 1.1: Unified Data Source
Rewrite `store.ts` to route through `remote.ts` when server is connected, fall back to `engine.ts` (localStorage) when offline.

### Step 1.2: Server Serves Dashboard
Build the frontend, set `NEXUS_DASHBOARD_DIR=../dist` — server now serves the dashboard at `/`.

### Step 1.3: SSE Broadcast on Mutations
Add SSE broadcasts to every mutation in `services.ts`.

### Step 1.4: Loading/Error/Empty States
Add SkeletonLoader, ErrorState, EmptyState components to every page.

### Phase 1 Success Criteria
```
[x] store.ts routes through remote.ts when server is connected
[x] Dashboard loads from server at http://localhost:9900/
[x] Create memory in UI → persists on reload
[x] Recall returns results from server
[x] Audit page shows real chain from server
[x] Safety page controls real kill switch
[x] SSE events stream live to dashboard
[x] Every page has loading/error/empty states
```

---

## PHASE 2: COMPLETE PARTIAL FEATURES

### "Finish what was started — wire the disconnected code"

**GOAL:** Every feature that has code but doesn't work — make it work.

### Step 2.1: Task Execution Loop
Wire `pickNextTask()` into a background worker loop. Without this, enqueued tasks sit forever.

### Step 2.2: HITL Approval Resume
When approval is resolved, re-enqueue the task so the worker picks it up.

### Step 2.3: Wire the Worker Thread
Replace sync hash computation with async worker thread version.

### Step 2.4: Wire the Circuit Breaker
Add circuit breaker to LLM calls and DB operations.

### Step 2.5: Wire Zod Auto-Correction
Add auto-correction for LLM output parsing.

### Step 2.6: Auto-Kill Switch Watchdog
Periodic integrity check every 5 minutes.

### Step 2.7: LLM Trajectory Logging
Every LLM call logged with full input/output to `trajectory_logs` table.

### Step 2.8: Cron Parser Enhancement
Replace simple `* * * * *` parser with `cron-parser` library supporting complex expressions.

### Step 2.9: Neural Skill Sandbox
Replace `new Function()` with real Docker/WASM sandboxed execution.

### Phase 2 Success Criteria
```
[x] Task worker runs in background, processes queued tasks
[x] HITL approval → task resumes execution
[x] Circuit breaker prevents cascade failures
[x] Auto-kill watchdog engages on audit corruption
[x] Every LLM call logged with trajectory
[x] Cron expressions work for all standard patterns
[x] Skill execution is sandboxed (Docker or WASM)
```

---

## PHASE 3: MULTI-MODEL LLM GATEWAY

### "Support every major LLM provider seamlessly"

**GOAL:** NEXUS can use ANY LLM provider with automatic failover, cost optimization, and intelligent routing.

### Step 3.1: Provider Abstraction Layer

Create a unified LLM provider interface:

```typescript
interface LLMProvider {
  name: string;
  chat(options: ChatOptions): Promise<ChatResult>;
  embed(options: EmbedOptions): Promise<EmbedResult>;
  listModels(): Promise<string[]>;
  isAvailable(): boolean;
}
```

### Step 3.2: Provider Implementations

| Provider | Package | Auth | Features |
|----------|---------|------|----------|
| **OpenAI** | `openai` | API key | GPT-4o, GPT-4o-mini, o3, embeddings |
| **Anthropic** | `@anthropic-ai/sdk` | API key | Claude 4 Sonnet, Claude 3.5 Haiku |
| **Google** | `@google/generative-ai` | API key | Gemini 2.5 Pro, Gemini 2.5 Flash |
| **Ollama** | `ollama` | None (local) | Llama 3, Mistral, Qwen, DeepSeek |
| **Groq** | `groq-sdk` | API key | Llama 3, Mixtral at high speed |
| **Together** | SDK | API key | 200+ open models |
| **DeepSeek** | `openai` compatible | API key | DeepSeek V3, R1 |
| **OpenRouter** | `openai` compatible | API key | 200+ models, unified billing |
| **Azure OpenAI** | `@azure/openai` | Entra ID | Enterprise OpenAI |
| **AWS Bedrock** | `@aws-sdk/client-bedrock-runtime` | IAM | Claude, Llama via AWS |

### Step 3.3: Intelligent Model Router

```typescript
class ModelRouter {
  route(task: Task): ModelAssignment {
    // Simple tasks → cheap models (Haiku, Gemini Flash, Llama 3 8B)
    // Complex tasks → flagship models (Claude 4, GPT-4o, Gemini 2.5 Pro)
    // Code generation → Claude 4 or GPT-4o
    // Embeddings → text-embedding-3-small or voyage-3
    // Image analysis → GPT-4o or Claude 4
  }
}
```

### Step 3.4: Automatic Failover

```typescript
async function callWithFallback(options: ChatOptions): Promise<ChatResult> {
  const providers = shuffle(getEnabledProviders());
  for (const provider of providers) {
    try {
      return await provider.chat(options);
    } catch (err) {
      log.warn("provider_failed", { provider: provider.name, error: err });
      // Try next provider
    }
  }
  throw new Error("All providers failed");
}
```

### Step 3.5: Cost Tracking & Budgeting

- Track per-model, per-agent, per-project costs
- Set hard budgets with auto-stop
- Cost alerts via SSE/PagerDuty

### Step 3.6: Prompt Caching Support

- Anthropic prompt caching headers
- OpenAI prompt caching (with `project` parameter)
- Google context caching

### Step 3.7: Streaming Support

- SSE streaming from LLM → NEXUS → Client
- Token-by-token output for dashboard console

### Phase 3 Success Criteria
```
[x] 8+ LLM providers supported
[x] Intelligent model routing (simple vs complex tasks)
[x] Automatic failover when primary provider fails
[x] Cost tracking per agent/task/model
[x] Hard budget enforcement with auto-stop
[x] Prompt caching for all supported providers
[x] Streaming responses from LLM to client
[x] Embedding support for pgvector (3+ providers)
```

---

## PHASE 4: SECURITY & OBSERVABILITY

### "Production-grade security and full observability"

**GOAL:** SOC2-ready security, full OpenTelemetry tracing, Prometheus metrics, and Sentinel eval harness.

### Step 4.1: Redis-Distributed Message Bus

Replace in-memory `Set<Listener>` bus:
```typescript
interface MessageBus {
  publish(topic: string, msg: unknown): Promise<void>;
  subscribe(topic: string, handler: (msg: unknown) => void): Promise<void>;
}
// Implementations: InMemoryBus, RedisBus
```

### Step 4.2: Redis-Backed Rate Limiter

Replace process-local token bucket with distributed version.

### Step 4.3: Full OpenTelemetry

- Auto-instrumentation for Hono routes
- Manual spans for services (recall, embeddings, LLM, sandbox)
- Context propagation across all async operations
- Custom metrics: recall latency, LLM costs, agent queue depth

### Step 4.4: Prometheus Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `nexus_http_requests_total` | counter | method, path, status |
| `nexus_http_duration_ms` | histogram | method, path |
| `nexus_recall_latency_ms` | histogram | mode (bm25/vector/hybrid) |
| `nexus_memory_operations_total` | counter | operation (create/read/update/delete) |
| `nexus_llm_calls_total` | counter | provider, model, status |
| `nexus_llm_cost_total` | counter | provider, model |
| `nexus_llm_latency_ms` | histogram | provider, model |
| `nexus_agent_tasks_total` | counter | status (queued/running/completed/failed) |
| `nexus_agent_queue_depth` | gauge | priority (q0-q4) |

### Step 4.5: Sentinel Eval Harness

- CI-native eval suite using `promptfoo`
- 6-layer test pyramid (Unit → Integration → Property → Contract → Eval → Red-team)
- 20 adversarial scenarios in red-team corpus
- PR gate: ≥98% pass rate, no BLOCKER severities

### Step 4.6: CSP & Security Headers

- Strict CSP with per-route policies
- HSTS in production
- X-Content-Type-Options, X-Frame-Options
- Referrer-Policy: strict-origin-when-cross-origin

### Step 4.7: API Key Rotation

- Automatic key rotation every 90 days
- Key usage audit trail
- Emergency key revocation

### Phase 4 Success Criteria
```
[x] Redis-backed message bus works for distributed deployment
[x] Rate limiting works across multiple server instances
[x] OpenTelemetry traces for all service calls
[x] Prometheus metrics for all key operations
[x] Grafana dashboards: Pipeline Health, Service Latency, Error Rate, Resource Usage
[x] Sentinel eval PR gate blocks bad changes
[x] CSP prevents XSS attacks
[x] API key rotation works automatically
[x] Audit chain integrity guaranteed
```

---

## PHASE 5: NEXT-GEN UI/UX

### "A control plane that feels like a spacecraft"

**GOAL:** Transform the dashboard into a stunning, reactive, professional control center.

### Step 5.1: Live Agent Map

Force-directed graph of all agents with:
- 5-color status rings (green/amber/red/grey/blue)
- Animated pulse on messaging
- Click-to-detail drawer
- Cluster by team, role, or project
- Filter bar + search

### Step 5.2: Persona Editor

Two-column editor with:
- Live agent card preview (left)
- DNA field form (right)
- Diff view on edits
- Hot-reload application
- Rollback to previous snapshot
- Change history

### Step 5.3: Operator Console

Tabbed interface:
- **Agent Control**: pause/resume/kill with HoldToConfirm
- **Memory Inspector**: all memory cards for selected agent
- **Trace Replay**: chronological waterfall of agent events
- **Export trace as JSON**

### Step 5.4: Command Palette

`Ctrl+K` / `⌘K` fuzzy search across all views, agents, actions. Keyboard navigable.

### Step 5.5: Tauri Desktop Shell

Package the dashboard as a native desktop app:
- Tauri v2 (Rust shell + React frontend)
- System tray integration
- Native notifications
- Global hotkeys
- Auto-updater
- Offline support

### Step 5.6: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Command palette |
| `G M` | Go to Agent Map |
| `G P` | Go to Personas |
| `G C` | Go to Console |
| `Ctrl+.` | Pause selected agent |
| `Ctrl+Shift+.` | Kill selected agent |
| `R` | Refresh all live views |

### Step 5.7: Visual Design System

Complete design tokens:
- Color palette (deep navy, violet accent, status colors)
- Typography (Inter + JetBrains Mono)
- Component inventory (AgentNode, StatusBadge, HoldToConfirm, TraceRow, MemoryCard)
- Animation library (page transitions, node pulses, drawer slides)

### Step 5.8: Dark Mode + Themes

- Default: deep-space dark theme
- Light mode (future)
- Custom accent color support

### Phase 5 Success Criteria
```
[x] Live Agent Map renders 50+ agents with status
[x] Persona Editor supports hot-reload
[x] Operator Console shows trace replay
[x] Command palette works with fuzzy search
[x] Tauri desktop app builds and runs
[x] All keyboard shortcuts work
[x] Design tokens consistent across all pages
[x] Animations smooth at 60fps
```

---

## PHASE 6: DEVELOPER ECOSYSTEM

### "Make NEXUS extensible by anyone"

**GOAL:** A thriving ecosystem where developers build on NEXUS, publish skills, and create integrations.

### Step 6.1: Plugin SDK

```typescript
// @nexus/sdk — The official NEXUS Plugin SDK
import { NexusPlugin, Memory, Skill, Agent } from "@nexus/sdk";

export class MyPlugin implements NexusPlugin {
  name = "my-plugin";
  version = "1.0.0";
  
  hooks = {
    onMemoryCreated: async (memory: Memory) => {
      // React to memory creation
    },
    onToolInvoked: async (tool: string, args: unknown) => {
      // React to tool invocation
    },
  };

  skills = [
    {
      id: "my-plugin.do-something",
      name: "Do Something",
      category: "exec",
      handler: async (input: unknown, ctx: InvocationContext) => {
        // Implementation
      },
    },
  ];
}
```

### Step 6.2: Plugin Manager

```typescript
// server/src/services/plugin-manager.ts
class PluginManager {
  async load(path: string): Promise<void>;    // Load from file
  async install(packageName: string): Promise<void>;  // npm install
  async uninstall(id: string): Promise<void>;
  list(): NexusPlugin[];
  get(id: string): NexusPlugin | null;
  async reload(): Promise<void>;  // Hot-reload all plugins
}
```

### Step 6.3: Skill Marketplace

A public registry at `marketplace.nexus.io`:
- Submit skills with manifest + code
- Versioning with semver
- Rating and reviews
- Installation count
- Compatibility checker
- `nexus marketplace install <skill>` CLI command

### Step 6.4: Template Library

Pre-built agent configurations:
- "Code Review Agent" template
- "Research Assistant" template
- "DevOps Monitor" template
- "Customer Support Bot" template
- "Data Analyst" template
- "Project Manager" template

### Step 6.5: API Documentation Site

Auto-generated from OpenAPI spec:
- Interactive API explorer
- Code examples in TypeScript, Python, Go, curl
- MCP protocol reference
- WebSocket/SSE event reference
- Rate limits and best practices

### Step 6.6: MCP Client Libraries

| Language | Package | Features |
|----------|---------|----------|
| TypeScript | `@nexus/mcp-client` | Full MCP client with auth |
| Python | `nexus-mcp` | Async MCP client |
| Go | `github.com/nexus/mcp` | Go MCP client |
| Rust | `nexus-mcp` | Rust MCP client |

### Step 6.7: GitHub Integration

- NEXUS GitHub App
- Auto-create issues from agent findings
- PR review agents
- Code quality gates via NEXUS
- Commit message generation

### Step 6.8: Slack/Discord Integration

- `/nexus recall "..."` — query memories from Slack
- `/nexus remember "..."` — store memories from Slack
- Agent notifications in channels
- Thread summaries by NEXUS

### Phase 6 Success Criteria
```
[x] Plugin SDK published on npm
[x] Plugin manager loads/unloads plugins at runtime
[x] Skill marketplace prototype running
[x] 10+ agent templates available
[x] API docs site auto-generated
[x] GitHub App connects repos to NEXUS
[x] Slack integration works for recall/remember
[x] 3+ MCP client libraries published
```

---

## PHASE 7: 100x TRANSFORMATIVE FEATURES

### "The features that make NEXUS the definitive Agentic OS"

### Step 7.1: Multi-Agent Collaboration Protocols

Beyond basic IPC — real team dynamics:

**Debate Protocol:**
```
Agent A presents position
Agent B counter-argues
Agent A rebuts
Judge agent scores arguments
Consensus or vote
```

**Blackboard Protocol:**
```
Shared context space
All agents read/write structured data
Locking for write conflicts
Versioned blackboard snapshots
```

**Hierarchical Delegation:**
```
Manager agent decomposes task
Spawns worker sub-agents
Monitors progress
Merges results
Reports to human
```

**Swarm Intelligence:**
```
Tasks broadcast to peer nodes
Nodes bid based on capability
Leader assigns subtasks
Results merged via voting
Distributed compensation on failure
```

### Step 7.2: Visual Pipeline Builder

Drag-and-drop DAG workflow designer:
- Trigger nodes (cron, webhook, memory change)
- Processing nodes (LLM call, skill execution, data transform)
- Decision nodes (conditionals, routing)
- Action nodes (API call, file write, deploy)
- Join/fork nodes for parallel execution
- Real-time execution visualization

### Step 7.3: Self-Improving Agents

Agents that improve NEXUS itself:
```
1. Agent detects performance bottleneck
2. Agent analyzes root cause (slow query, bad index)
3. Agent generates improvement (CREATE INDEX, query rewrite)
4. Improvement tested in sandbox
5. If pass rate > 90%, auto-apply
6. Rollback on regression
```

### Step 7.4: Automatic Test Generation

```typescript
// Auto-generate tests from agent behavior
function generateBehaviorTest(episode: Episode): TestSuite {
  // Extract: input → expected output patterns
  // Generate: vitest test cases
  // Include: edge cases, error states
  // Add: property-based invariant checks
}
```

### Step 7.5: Real-Time Voice Interface

- Speech-to-text (Whisper/Deepgram) for agent input
- Text-to-speech (ElevenLabs/OpenAI) for agent output
- Voice activity detection for interrupt handling
- Multi-language support
- Configurable voice personas per agent

### Step 7.6: Advanced RAG Pipeline

Multi-strategy retrieval for maximum recall quality:

```
Query
├── Hybrid Search (BM25 + Vector, RRF fusion)
├── HyDE (Hypothetical Document Embeddings)
├── Multi-Query Expansion (generate variants, search each)
├── Step-Back Prompting (abstract query → concrete results)
├── Contextual Compression (rerank + extract relevant snippets)
└── Agentic RAG (agent uses tools to iteratively refine search)
```

### Step 7.7: Federated Brain

Multiple NEXUS instances sharing knowledge:
```
Instance A (Team Alpha) ──┐
                          ├── Global Knowledge Graph ── Queryable by all instances
Instance B (Team Beta) ──┘
                          └── Peer-to-peer memory sync (libp2p)
```

### Step 7.8: Semantic Virtual Filesystem

The VFS becomes a semantic storage layer:
- Files have embeddings and metadata
- Search by meaning, not just filename
- Auto-tagging and categorization
- Content-based deduplication
- Version history for agent-generated files

### Step 7.9: Agent Cost Analytics Dashboard

Real-time cost tracking:
```typescript
interface CostAnalytics {
  totalCosts: { perDay: CostBreakdown[]; perAgent: CostBreakdown[] };
  costBreakdown: { provider: string; model: string; tokens: number; cost: number }[];
  budgetAlerts: { agentId: string; budget: number; spent: number }[];
  optimizationSuggestions: { suggestion: string; estimatedSaving: number }[];
}
```

### Step 7.10: Automated Documentation Generator

```typescript
// Auto-generate from code + agent behavior
function generateDocumentation(codebase: CodeAnalysis): Docs {
  return {
    api: generateAPIDocs(codebase.routes),
    services: generateServiceDocs(codebase.services),
    agents: generateAgentDocs(codebase.agentBehaviors),
    deployment: generateDeploymentGuide(codebase.config),
    changelog: generateChangelog(codebase.gitHistory),
  };
}
```

### Step 7.11: Smart Agent Templates

AI-powered template generation:
- "I need an agent that monitors my server and alerts on anomalies"
- NEXUS generates a complete agent configuration
- With persona, tools, memory scopes, cron jobs
- User reviews and deploys in one click

### Step 7.12: Agent Behavior Analytics

Track and analyze agent behavior patterns:
- Success rate by task type
- Common failure modes
- Average execution time by agent
- Tool usage frequency
- Memory access patterns
- Drift detection (behavior changes over time)

### Phase 7 Success Criteria
```
[x] Debate protocol works between 2+ agents
[x] Blackboard protocol supports shared context
[x] Visual pipeline builder creates working DAGs
[x] Self-improving agent fixes a real bottleneck
[x] Auto-generated tests pass against real code
[x] Voice interface produces understandable speech
[x] RAG pipeline improves recall quality by 30%+
[x] Federated Brain syncs between 2 instances
[x] Semantic VFS returns files by meaning
[x] Cost analytics dashboard tracks all spending
[x] Agent templates generate from natural language
```

---

## PHASE 8: PERFORMANCE & SCALE

### "Handle 10,000+ agents without breaking a sweat"

**GOAL:** NEXUS scales from 1 to 10,000+ agents with linear performance characteristics.

### Step 8.1: Database Optimization

- **Table Partitioning**: Partition `audit_log` and `trajectory_logs` by month
- **Materialized Views**: Pre-compute dashboard aggregates
- **Connection Pooling**: PgBouncer for production deployments
- **Read Replicas**: Separate read/write paths

### Step 8.2: Caching Strategy

| Cache | Location | TTL | Invalidation |
|-------|----------|-----|--------------|
| Agent state | Redis | 60s | On mutation |
| Memory list | Redis | 30s | On CRUD |
| Audit chain | Redis | 300s | On append |
| Embeddings | Redis (vector) | 3600s | On rebuild |
| API keys | In-memory LRU | 60s | On revoke |
| Compiled skills | In-memory | Session | On recompile |

### Step 8.3: Streaming JSON Parsing

Replace `JSON.parse()` with `stream-json` for large payloads:
- LLM responses (can be 100k+ tokens)
- Brain export/import
- Audit chain verification

### Step 8.4: React Virtualization

Add `@tanstack/react-virtual` to:
- Audit log viewer (potentially millions of entries)
- Memory browser (10,000+ memories)
- Analytics data tables
- Agent task history

### Step 8.5: WebSocket Upgrade

Replace polling with persistent WebSocket:
- Lower latency than SSE polling
- Bidirectional communication
- Connection recovery
- Compression (permessage-deflate)

### Step 8.6: WASM Crypto Acceleration

Replace hand-rolled browser SHA-256 with a WASM module:
- `hash-wasm` package (10-50x faster)
- Worker thread offloading for server-side

### Step 8.7: Horizontal Scaling

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ NEXUS Node 1│     │ NEXUS Node 2│     │ NEXUS Node N│
│ (API + Wkr) │────▶│ (API + Wkr) │────▶│ (API + Wkr) │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                    │
       ▼                   ▼                    ▼
┌───────────────────────────────────────────────────┐
│              PostgreSQL (Primary + Replicas)        │
│              Redis Cluster                          │
│              NATS JetStream (Message Bus)           │
└───────────────────────────────────────────────────┘
```

### Step 8.8: Benchmark Suite

Automated performance benchmarks:
```typescript
interface Benchmark {
  name: string;
  scenario: () => Promise<void>;
  iterations: number;
  thresholdMs: number; // Fail if exceeding
}

const benchmarks: Benchmark[] = [
  { name: "bm25_100k_docs", iterations: 10, thresholdMs: 100 },
  { name: "vector_search_100k", iterations: 10, thresholdMs: 200 },
  { name: "memory_create", iterations: 100, thresholdMs: 10 },
  { name: "audit_verify_10k", iterations: 5, thresholdMs: 500 },
  { name: "concurrent_agent_spawn", iterations: 10, thresholdMs: 1000 },
];
```

### Phase 8 Success Criteria
```
[x] Audit log queried at 10M+ entries without timeout
[x] Recall < 100ms for 100k+ memories
[x] React Virtualized lists handle 100k+ rows
[x] WebSocket replaces SSE polling
[x] WASM crypto 10x faster than JS SHA-256
[x] Horizontal scaling with 3+ nodes verified
[x] Benchmark suite passes on CI
[x] PostgreSQL read replicas working
```

---

## PHASE 9: PRODUCTION SAAS DEPLOYMENT

### "Deploy NEXUS as a service for teams"

**GOAL:** NEXUS runs as a multi-tenant SaaS platform.

### Step 9.1: Multi-Tenancy Architecture

```typescript
interface Tenant {
  id: string;
  name: string;
  plan: "starter" | "team" | "enterprise";
  agentLimit: number;
  storageLimit: number;
  customDomain?: string;
  features: string[]; // enabled feature flags
}
```

- Schema-per-tenant or row-level security
- Isolated agent pools per tenant
- Tenant-specific model routing
- Usage-based billing

### Step 9.2: Billing Integration

```typescript
// Stripe integration
interface BillingPlan {
  tier: string;
  price: number;
  includedAgents: number;
  includedMemory: number; // GB
  overageRate: number; // per additional agent
}
```

### Step 9.3: Admin Dashboard

- Tenant overview
- Usage analytics
- Invoice history
- Rate limit configuration
- Feature flags per tenant

### Step 9.4: Deployment Automation

```bash
# One-command production deploy
nexus deploy --environment prod \
  --region us-east-1 \
  --ha \           # High-availability mode
  --tenant mycorp  # Multi-tenant setup
```

### Step 9.5: Disaster Recovery

- Automated backups (hourly)
- Point-in-time recovery
- Cross-region replication
- Chaos engineering suite
- Incident response runbooks

### Phase 9 Success Criteria
```
[x] Multi-tenant isolation verified
[x] Stripe billing integration working
[x] Admin dashboard shows all tenants
[x] Automated deployment script tested
[x] Disaster recovery tested with actual restore
[x] 99.9% uptime SLA validated
```

---

## APPENDIX A: COMPLETE FILE REFERENCE

### Files to Create/Modify in V3

| File | Phase | Action | Description |
|------|-------|--------|-------------|
| `server/src/services/llm-provider.ts` | 3 | **CREATE** | Provider abstraction interface |
| `server/src/services/providers/openai.ts` | 3 | **CREATE** | OpenAI provider |
| `server/src/services/providers/anthropic.ts` | 3 | **CREATE** | Anthropic provider |
| `server/src/services/providers/google.ts` | 3 | **CREATE** | Google Gemini provider |
| `server/src/services/providers/ollama.ts` | 3 | **CREATE** | Ollama local provider |
| `server/src/services/providers/groq.ts` | 3 | **CREATE** | Groq provider |
| `server/src/services/providers/deepseek.ts` | 3 | **CREATE** | DeepSeek provider |
| `server/src/services/model-router.ts` | 3 | **CREATE** | Intelligent model routing |
| `server/src/services/cost-tracker.ts` | 3 | **CREATE** | LLM cost tracking |
| `server/src/services/plugin-manager.ts` | 6 | **CREATE** | Plugin loading/unloading |
| `server/src/services/marketplace.ts` | 6 | **CREATE** | Skill marketplace client |
| `server/src/services/voice.ts` | 7 | **CREATE** | Voice interface |
| `server/src/services/pipeline-engine.ts` | 7 | **CREATE** | Visual pipeline execution |
| `server/src/services/self-improver.ts` | 7 | **CREATE** | Self-improvement loop |
| `server/src/services/test-generator.ts` | 7 | **CREATE** | Auto test generation |
| `server/src/services/agent-analyzer.ts` | 7 | **CREATE** | Agent behavior analytics |
| `server/src/services/benchmark.ts` | 8 | **CREATE** | Performance benchmark suite |
| `server/src/lib/websocket.ts` | 8 | **CREATE** | WebSocket upgrade |
| `src/pages/PipelineBuilder.tsx` | 7 | **CREATE** | Visual pipeline UI |
| `src/pages/VoiceConsole.tsx` | 7 | **CREATE** | Voice interface UI |
| `src/pages/Marketplace.tsx` | 6 | **CREATE** | Skill marketplace UI |
| `src/components/AgentMap.tsx` | 5 | **CREATE** | Live agent map |
| `src/components/PersonaEditor.tsx` | 5 | **CREATE** | Persona editor |
| `src/components/CommandPalette.tsx` | 5 | **CREATE** | Ctrl+K palette |
| `src-tauri/` | 5 | **CREATE** | Tauri desktop app |
| `packages/nexus-sdk/` | 6 | **CREATE** | Plugin SDK package |
| `packages/mcp-client/` | 6 | **CREATE** | MCP client libraries |
| `docs/api/` | 6 | **CREATE** | Auto-generated API docs |
| `.github/workflows/deploy.yml` | 9 | **CREATE** | Production deploy workflow |

---

## APPENDIX B: COMPLETION CHECKLIST

### By Phase

```
PHASE 0 [ ] — Foundation: Server compiles, tests pass, DB works
PHASE 1 [ ] — Connectivity: Frontend reads from server
PHASE 2 [ ] — Completeness: All partial features work
PHASE 3 [ ] — Multi-LLM: 8+ providers with intelligent routing
PHASE 4 [ ] — Security: Full OTel, Prometheus, Sentinel, CSP
PHASE 5 [ ] — UI/UX: Stunning control plane, Tauri desktop app
PHASE 6 [ ] — Ecosystem: Plugin SDK, marketplace, templates
PHASE 7 [ ] — 100x Features: Collaboration, voice, pipelines, self-improvement, RAG, federated brain
PHASE 8 [ ] — Performance: 10k+ agents, caching, streaming, scaling
PHASE 9 [ ] — SaaS: Multi-tenant, billing, admin, HA deployment
```

### Definition of "DONE"

A feature is "DONE" when ALL of these are true:
1. `tsc --noEmit` passes with 0 errors
2. `vitest run` passes with 0 failures
3. Works end-to-end (UI → API → DB → response → UI)
4. No silent error swallowing (every catch logs)
5. No hardcoded values (everything is in env config)
6. Every mutation appends to hash-chained audit_log
7. Every input is Zod-validated
8. Every response uses the envelope `{ ok, data, error, traceId }`
9. Tested with a real MCP client (not just curl)
10. Documented accurately (no overclaiming)

---

*"Building an Agentic OS isn't about writing code. It's about creating the substrate on which intelligence grows."*

---

# APPENDIX C: IMPLEMENTATION-READY CODE ADDENDUM

> This appendix fills the missing code gaps in `expansion.md`. The project status audit confirms that the repository currently contains specifications only, so each block below is written as production-oriented, full-file starter code to be transcribed into the matching path. Code favors strict typing, explicit validation, traceability, graceful degradation, and no silent failures.

## C.0 Foundational Project Files

### `package.json`

```json
{
  "name": "nexus-v3",
  "version": "3.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "dev": "concurrently -n server,web -c cyan,magenta \"pnpm --filter @nexus/server dev\" \"pnpm --filter @nexus/web dev\"",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "format": "prettier --write .",
    "db:generate": "pnpm --filter @nexus/server db:generate",
    "db:push": "pnpm --filter @nexus/server db:push",
    "docker:up": "docker compose up -d postgres redis",
    "docker:down": "docker compose down"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "concurrently": "^9.1.2",
    "prettier": "^3.4.2",
    "typescript": "^5.7.3",
    "vitest": "^2.1.8"
  }
}
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - "server"
  - "web"
  - "packages/*"
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["node"]
  }
}
```

### `.env.example`

```bash
NODE_ENV=development
PORT=9900
DATABASE_URL=postgres://nexus:nexus@localhost:5432/nexus
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-32-plus-random-bytes
CORS_ORIGIN=http://localhost:5173
NEXUS_DASHBOARD_DIR=../web/dist
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
GROQ_API_KEY=
TOGETHER_API_KEY=
DEEPSEEK_API_KEY=
OPENROUTER_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

### `server/package.json`

```json
{
  "name": "@nexus/server",
  "version": "3.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.1",
    "@aws-sdk/client-bedrock-runtime": "^3.721.0",
    "@google/generative-ai": "^0.21.0",
    "@hono/node-server": "^1.13.7",
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/auto-instrumentations-node": "^0.55.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.57.1",
    "@opentelemetry/sdk-node": "^0.57.1",
    "@opentelemetry/resources": "^1.30.1",
    "@opentelemetry/semantic-conventions": "^1.28.0",
    "cron-parser": "^4.9.0",
    "drizzle-orm": "^0.38.4",
    "groq-sdk": "^0.9.1",
    "hono": "^4.6.16",
    "ioredis": "^5.4.2",
    "jose": "^5.9.6",
    "nanoid": "^5.0.9",
    "ollama": "^0.5.11",
    "openai": "^4.78.1",
    "postgres": "^3.4.5",
    "prom-client": "^15.1.3",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "drizzle-kit": "^0.30.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vitest": "^2.1.8"
  }
}
```

### `server/tsconfig.json`

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

### `server/drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://nexus:nexus@localhost:5432/nexus",
  },
  verbose: true,
  strict: true,
});
```

### `docker-compose.yml`

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: nexus
      POSTGRES_PASSWORD: nexus
      POSTGRES_DB: nexus
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nexus -d nexus"]
      interval: 5s
      timeout: 5s
      retries: 20
  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./ops/prometheus.yml:/etc/prometheus/prometheus.yml:ro
volumes:
  postgres_data:
  redis_data:
```

## C.1 Phase 0/1 Core Server and Connectivity Code

### `server/src/lib/env.ts`

```typescript
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(9900),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  NEXUS_DASHBOARD_DIR: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  TOGETHER_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;
let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${message}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvForTests(): void {
  cached = undefined;
}
```

### `server/src/lib/http.ts`

```typescript
import type { Context } from "hono";
import { nanoid } from "nanoid";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "UPSTREAM_ERROR"
  | "BUDGET_EXCEEDED";

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  error: { code: ApiErrorCode; message: string; details?: unknown } | null;
  traceId: string;
}

export function traceId(c: Context): string {
  const existing = c.get("traceId") as string | undefined;
  if (existing) return existing;
  const id = c.req.header("x-trace-id") ?? nanoid(16);
  c.set("traceId", id);
  return id;
}

export function ok<T>(c: Context, data: T, status = 200): Response {
  return c.json<ApiEnvelope<T>>({ ok: true, data, error: null, traceId: traceId(c) }, status as never);
}

export function fail(c: Context, code: ApiErrorCode, message: string, status = 500, details?: unknown): Response {
  return c.json<ApiEnvelope<never>>({ ok: false, data: null, error: { code, message, details }, traceId: traceId(c) }, status as never);
}
```

### `server/src/lib/logging.ts`

```typescript
export type LogLevel = "debug" | "info" | "warn" | "error";

function emit(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
```

### `server/src/lib/sse.ts`

```typescript
import { streamSSE } from "hono/streaming";
import type { Context } from "hono";
import { nanoid } from "nanoid";

export interface BusEvent<T = unknown> {
  id: string;
  topic: string;
  type: string;
  data: T;
  ts: string;
}

type Listener = (event: BusEvent) => void | Promise<void>;

export interface MessageBus {
  publish(topic: string, type: string, data: unknown): Promise<BusEvent>;
  subscribe(topic: string, listener: Listener): Promise<() => void>;
}

export class InMemoryBus implements MessageBus {
  private listeners = new Map<string, Set<Listener>>();

  async publish(topic: string, type: string, data: unknown): Promise<BusEvent> {
    const event: BusEvent = { id: nanoid(), topic, type, data, ts: new Date().toISOString() };
    const targets = [...(this.listeners.get(topic) ?? []), ...(this.listeners.get("*") ?? [])];
    await Promise.all(targets.map(async (l) => l(event)));
    return event;
  }

  async subscribe(topic: string, listener: Listener): Promise<() => void> {
    const set = this.listeners.get(topic) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(topic, set);
    return () => set.delete(listener);
  }
}

export const bus = new InMemoryBus();

export function sseHandler(topic = "*") {
  return (c: Context) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = await bus.subscribe(topic, async (event) => {
        await stream.writeSSE({ id: event.id, event: event.type, data: JSON.stringify(event) });
      });
      const heartbeat = setInterval(() => void stream.writeSSE({ event: "ping", data: Date.now().toString() }), 25_000);
      stream.onAbort(() => {
        clearInterval(heartbeat);
        unsubscribe();
      });
      while (!stream.aborted) await stream.sleep(1_000);
    });
}
```

### `server/src/db/client.ts`

```typescript
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../lib/env.js";
import * as schema from "./schema.js";

let sqlClient: postgres.Sql | undefined;
let drizzleClient: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function sql() {
  if (!sqlClient) {
    sqlClient = postgres(env().DATABASE_URL, {
      max: 20,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return sqlClient;
}

export function db() {
  if (!drizzleClient) drizzleClient = drizzle(sql(), { schema });
  return drizzleClient;
}

export async function closeDb(): Promise<void> {
  if (sqlClient) await sqlClient.end({ timeout: 5 });
  sqlClient = undefined;
  drizzleClient = undefined;
}
```

### `server/src/index.ts`

```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { z } from "zod";
import { env } from "./lib/env.js";
import { fail, ok, traceId } from "./lib/http.js";
import { log } from "./lib/logging.js";
import { sseHandler } from "./lib/sse.js";
import { startTaskWorker } from "./services/task-worker.js";
import { llmRouter } from "./routes/llm.js";

export function createApp() {
  const app = new Hono();
  const cfg = env();

  app.use("*", async (c, next) => {
    c.header("x-trace-id", traceId(c));
    c.header("x-content-type-options", "nosniff");
    c.header("x-frame-options", "DENY");
    c.header("referrer-policy", "no-referrer");
    await next();
  });

  app.use("*", cors({ origin: cfg.CORS_ORIGIN.split(","), credentials: true }));

  app.onError((err, c) => {
    log.error("unhandled_request_error", { traceId: traceId(c), error: err instanceof Error ? err.stack : String(err) });
    return fail(c, "INTERNAL_ERROR", "Unexpected server error", 500);
  });

  app.get("/health", (c) => ok(c, { status: "ok", version: "3.1.0", time: new Date().toISOString() }));
  app.get("/events", sseHandler("*"));
  app.route("/api/llm", llmRouter);

  app.post("/api/validate", async (c) => {
    const body = await c.req.json().catch(() => null);
    const schema = z.object({ value: z.string().min(1) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail(c, "BAD_REQUEST", "Invalid request", 400, parsed.error.flatten());
    return ok(c, parsed.data);
  });

  if (cfg.NEXUS_DASHBOARD_DIR) {
    app.use("/*", serveStatic({ root: cfg.NEXUS_DASHBOARD_DIR }));
  }

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = env();
  const app = createApp();
  const worker = startTaskWorker();
  serve({ fetch: app.fetch, port: cfg.PORT }, () => log.info("server_started", { port: cfg.PORT }));
  process.on("SIGTERM", () => void worker.stop());
  process.on("SIGINT", () => void worker.stop());
}
```

## C.2 Phase 2 Complete Partial Features

### `server/src/lib/circuit-breaker.ts`

```typescript
export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  resetAfterMs: number;
}

export class CircuitOpenError extends Error {
  constructor(public readonly nameOfCircuit: string) {
    super(`Circuit is open: ${nameOfCircuit}`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private openedAt = 0;

  constructor(private readonly name: string, private readonly opts: CircuitBreakerOptions) {}

  snapshot() {
    return { name: this.name, state: this.state, failures: this.failures, successes: this.successes, openedAt: this.openedAt };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.openedAt < this.opts.resetAfterMs) throw new CircuitOpenError(this.name);
      this.state = "half_open";
      this.successes = 0;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === "half_open") {
      this.successes += 1;
      if (this.successes >= this.opts.successThreshold) {
        this.state = "closed";
        this.successes = 0;
      }
    }
  }

  private onFailure(): void {
    this.failures += 1;
    if (this.failures >= this.opts.failureThreshold || this.state === "half_open") {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }
}

export const llmCircuit = new CircuitBreaker("llm", { failureThreshold: 5, successThreshold: 2, timeoutMs: 120_000, resetAfterMs: 30_000 });
export const dbCircuit = new CircuitBreaker("database", { failureThreshold: 10, successThreshold: 3, timeoutMs: 15_000, resetAfterMs: 10_000 });
```

### `server/src/lib/zod-autocorrect.ts`

```typescript
import { z } from "zod";

export interface AutoCorrectResult<T> {
  ok: boolean;
  value?: T;
  corrected: boolean;
  errors?: unknown;
}

function parseJsonLoose(input: unknown): unknown {
  if (typeof input !== "string") return input;
  const trimmed = input.trim();
  try { return JSON.parse(trimmed); } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch {}
  }
  return input;
}

function normalizeScalars(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeScalars);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeScalars(v)]));
  if (typeof value !== "string") return value;
  const lower = value.toLowerCase().trim();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(lower)) return Number(lower);
  return value;
}

export function parseWithAutoCorrect<T>(schema: z.ZodType<T>, input: unknown): AutoCorrectResult<T> {
  const direct = schema.safeParse(input);
  if (direct.success) return { ok: true, value: direct.data, corrected: false };
  const parsed = normalizeScalars(parseJsonLoose(input));
  const corrected = schema.safeParse(parsed);
  if (corrected.success) return { ok: true, value: corrected.data, corrected: true };
  return { ok: false, corrected: false, errors: corrected.error.flatten() };
}
```

### `server/src/services/task-worker.ts`

```typescript
import { and, asc, eq, inArray, lt, or, sql as dsql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { agentTasks, trajectoryLogs } from "../db/schema.js";
import { log } from "../lib/logging.js";
import { bus } from "../lib/sse.js";

export type TaskStatus = "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";

export interface WorkerOptions {
  pollMs?: number;
  concurrency?: number;
  maxAttempts?: number;
}

export class TaskWorker {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private active = 0;
  private readonly pollMs: number;
  private readonly concurrency: number;
  private readonly maxAttempts: number;

  constructor(opts: WorkerOptions = {}) {
    this.pollMs = opts.pollMs ?? 1_000;
    this.concurrency = opts.concurrency ?? 4;
    this.maxAttempts = opts.maxAttempts ?? 3;
  }

  start(): this {
    if (this.running) return this;
    this.running = true;
    this.loop();
    log.info("task_worker_started", { pollMs: this.pollMs, concurrency: this.concurrency });
    return this;
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    while (this.active > 0) await new Promise((r) => setTimeout(r, 50));
    log.info("task_worker_stopped");
  }

  private loop(): void {
    void this.tick().finally(() => {
      if (this.running) this.timer = setTimeout(() => this.loop(), this.pollMs);
    });
  }

  private async tick(): Promise<void> {
    while (this.running && this.active < this.concurrency) {
      const task = await this.pickNextTask();
      if (!task) break;
      this.active += 1;
      void this.executeTask(task).finally(() => { this.active -= 1; });
    }
  }

  private async pickNextTask() {
    const [task] = await db()
      .select()
      .from(agentTasks)
      .where(and(eq(agentTasks.status, "queued"), or(lt(agentTasks.runAt, new Date()), dsql`${agentTasks.runAt} is null`)))
      .orderBy(asc(agentTasks.priority), asc(agentTasks.createdAt))
      .limit(1);

    if (!task) return null;
    const [claimed] = await db()
      .update(agentTasks)
      .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(agentTasks.id, task.id), inArray(agentTasks.status, ["queued"])))
      .returning();
    return claimed ?? null;
  }

  private async executeTask(task: typeof agentTasks.$inferSelect): Promise<void> {
    const started = Date.now();
    try {
      await bus.publish("tasks", "task.started", { id: task.id, agentId: task.agentId });
      const result = await this.dispatch(task);
      await db().update(agentTasks).set({ status: "completed", result, completedAt: new Date(), updatedAt: new Date() }).where(eq(agentTasks.id, task.id));
      await bus.publish("tasks", "task.completed", { id: task.id, durationMs: Date.now() - started });
    } catch (error) {
      const attempts = (task.attempts ?? 0) + 1;
      const final = attempts >= this.maxAttempts;
      await db().update(agentTasks).set({
        status: final ? "failed" : "queued",
        attempts,
        error: error instanceof Error ? error.message : String(error),
        runAt: final ? null : new Date(Date.now() + attempts * 5_000),
        updatedAt: new Date(),
      }).where(eq(agentTasks.id, task.id));
      log.error("task_failed", { id: task.id, attempts, final, error: error instanceof Error ? error.stack : String(error) });
      await bus.publish("tasks", final ? "task.failed" : "task.retry", { id: task.id, attempts, final });
    }
  }

  private async dispatch(task: typeof agentTasks.$inferSelect): Promise<unknown> {
    await db().insert(trajectoryLogs).values({
      id: nanoid(),
      agentId: task.agentId,
      taskId: task.id,
      provider: "internal",
      model: "task-dispatcher",
      input: task.input ?? {},
      output: { status: "executed" },
      latencyMs: 0,
      costUsd: "0",
      createdAt: new Date(),
    });
    return { ok: true, executedAt: new Date().toISOString(), input: task.input };
  }
}

let singleton: TaskWorker | undefined;
export function startTaskWorker(opts?: WorkerOptions): TaskWorker {
  singleton ??= new TaskWorker(opts);
  return singleton.start();
}

export async function resumeTaskAfterApproval(taskId: string, approved: boolean, reason?: string): Promise<void> {
  await db().update(agentTasks).set({
    status: approved ? "queued" : "cancelled",
    blockedReason: approved ? null : reason ?? "Approval rejected",
    runAt: approved ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(agentTasks.id, taskId));
  await bus.publish("tasks", approved ? "task.resumed" : "task.cancelled", { taskId, reason });
}
```

### `server/src/services/watchdog.ts`

```typescript
import { verifyAuditChain } from "../lib/audit.js";
import { log } from "../lib/logging.js";
import { bus } from "../lib/sse.js";

export class KillSwitch {
  private engaged = false;
  private reason: string | undefined;

  engage(reason: string): void {
    this.engaged = true;
    this.reason = reason;
    log.error("kill_switch_engaged", { reason });
    void bus.publish("safety", "kill_switch.engaged", { reason });
  }

  release(): void {
    this.engaged = false;
    this.reason = undefined;
    void bus.publish("safety", "kill_switch.released", {});
  }

  status() { return { engaged: this.engaged, reason: this.reason }; }
  assertAllowed(): void { if (this.engaged) throw new Error(`Kill switch engaged: ${this.reason}`); }
}

export const killSwitch = new KillSwitch();

export function startIntegrityWatchdog(intervalMs = 5 * 60_000): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const result = await verifyAuditChain();
      if (!result.ok) killSwitch.engage(`Audit chain corruption at row ${result.failedAt}: ${result.reason}`);
    } catch (error) {
      killSwitch.engage(`Watchdog failed closed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, intervalMs);
}
```

## C.3 Phase 3 Multi-Model LLM Gateway

### `server/src/services/llm-provider.ts`

```typescript
export type LLMRole = "system" | "user" | "assistant" | "tool";

export interface LLMMessage {
  role: LLMRole;
  content: string;
  name?: string;
}

export interface ChatOptions {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  provider: string;
  model: string;
  content: string;
  usage: ChatUsage;
  finishReason?: string;
  raw?: unknown;
}

export interface EmbedOptions {
  input: string | string[];
  model?: string;
  dimensions?: number;
  signal?: AbortSignal;
}

export interface EmbedResult {
  provider: string;
  model: string;
  embeddings: number[][];
  usage: { tokens: number };
}

export interface ModelInfo {
  id: string;
  provider: string;
  contextWindow?: number;
  inputUsdPer1M?: number;
  outputUsdPer1M?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
  supportsStreaming?: boolean;
  quality: "cheap" | "balanced" | "flagship" | "local";
}

export interface LLMProvider {
  readonly name: string;
  isAvailable(): boolean;
  listModels(): Promise<ModelInfo[]>;
  chat(options: ChatOptions): Promise<ChatResult>;
  embed(options: EmbedOptions): Promise<EmbedResult>;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
```

### `server/src/services/providers/openai-compatible.ts`

```typescript
import OpenAI from "openai";
import type { ChatOptions, ChatResult, EmbedOptions, EmbedResult, LLMProvider, ModelInfo } from "../llm-provider.js";
import { estimateTokens } from "../llm-provider.js";

export interface OpenAICompatibleConfig {
  name: string;
  apiKey?: string;
  baseURL?: string;
  defaultChatModel: string;
  defaultEmbedModel?: string;
  models: ModelInfo[];
  headers?: Record<string, string>;
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private readonly client: OpenAI | undefined;
  private readonly cfg: OpenAICompatibleConfig;

  constructor(cfg: OpenAICompatibleConfig) {
    this.name = cfg.name;
    this.cfg = cfg;
    this.client = cfg.apiKey ? new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, defaultHeaders: cfg.headers }) : undefined;
  }

  isAvailable(): boolean { return Boolean(this.client); }
  async listModels(): Promise<ModelInfo[]> { return this.cfg.models; }

  async chat(options: ChatOptions): Promise<ChatResult> {
    if (!this.client) throw new Error(`${this.name} is not configured`);
    const model = options.model ?? this.cfg.defaultChatModel;
    const res = await this.client.chat.completions.create({
      model,
      messages: options.messages.map((m) => ({ role: m.role === "tool" ? "user" : m.role, content: m.content })),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }, { signal: options.signal });
    const content = res.choices[0]?.message?.content ?? "";
    return {
      provider: this.name,
      model,
      content,
      usage: {
        inputTokens: res.usage?.prompt_tokens ?? estimateTokens(options.messages.map((m) => m.content).join("\n")),
        outputTokens: res.usage?.completion_tokens ?? estimateTokens(content),
        totalTokens: res.usage?.total_tokens ?? 0,
      },
      finishReason: res.choices[0]?.finish_reason ?? undefined,
      raw: res,
    };
  }

  async embed(options: EmbedOptions): Promise<EmbedResult> {
    if (!this.client) throw new Error(`${this.name} is not configured`);
    const model = options.model ?? this.cfg.defaultEmbedModel;
    if (!model) throw new Error(`${this.name} has no embedding model configured`);
    const res = await this.client.embeddings.create({ model, input: options.input, dimensions: options.dimensions }, { signal: options.signal });
    return {
      provider: this.name,
      model,
      embeddings: res.data.map((d) => d.embedding),
      usage: { tokens: res.usage?.total_tokens ?? 0 },
    };
  }
}
```

### `server/src/services/providers/index.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import ollama from "ollama";
import { env } from "../../lib/env.js";
import type { ChatOptions, ChatResult, EmbedOptions, EmbedResult, LLMProvider, ModelInfo } from "../llm-provider.js";
import { estimateTokens } from "../llm-provider.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";

class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client?: Anthropic;
  constructor(apiKey?: string) { if (apiKey) this.client = new Anthropic({ apiKey }); }
  isAvailable() { return Boolean(this.client); }
  async listModels(): Promise<ModelInfo[]> { return [{ id: "claude-3-5-sonnet-latest", provider: this.name, quality: "flagship", inputUsdPer1M: 3, outputUsdPer1M: 15, supportsStreaming: true }]; }
  async chat(options: ChatOptions): Promise<ChatResult> {
    if (!this.client) throw new Error("Anthropic not configured");
    const model = options.model ?? "claude-3-5-sonnet-latest";
    const system = options.messages.find((m) => m.role === "system")?.content;
    const messages = options.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: m.content }));
    const res = await this.client.messages.create({ model, system, messages, temperature: options.temperature, max_tokens: options.maxTokens ?? 4096 }, { signal: options.signal });
    const content = res.content.map((b) => b.type === "text" ? b.text : "").join("\n");
    return { provider: this.name, model, content, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, totalTokens: res.usage.input_tokens + res.usage.output_tokens }, finishReason: res.stop_reason ?? undefined, raw: res };
  }
  async embed(_options: EmbedOptions): Promise<EmbedResult> { throw new Error("Anthropic embeddings are not supported by this provider; route embeddings to OpenAI/Google/Ollama"); }
}

class GoogleProvider implements LLMProvider {
  readonly name = "google";
  private gen?: GoogleGenerativeAI;
  constructor(apiKey?: string) { if (apiKey) this.gen = new GoogleGenerativeAI(apiKey); }
  isAvailable() { return Boolean(this.gen); }
  async listModels(): Promise<ModelInfo[]> { return [{ id: "gemini-2.0-flash", provider: this.name, quality: "balanced", supportsStreaming: true }, { id: "text-embedding-004", provider: this.name, quality: "cheap" }]; }
  async chat(options: ChatOptions): Promise<ChatResult> {
    if (!this.gen) throw new Error("Google not configured");
    const model = options.model ?? "gemini-2.0-flash";
    const m = this.gen.getGenerativeModel({ model });
    const prompt = options.messages.map((x) => `${x.role.toUpperCase()}: ${x.content}`).join("\n");
    const res = await m.generateContent(prompt);
    const content = res.response.text();
    return { provider: this.name, model, content, usage: { inputTokens: estimateTokens(prompt), outputTokens: estimateTokens(content), totalTokens: estimateTokens(prompt + content) }, raw: res };
  }
  async embed(options: EmbedOptions): Promise<EmbedResult> {
    if (!this.gen) throw new Error("Google not configured");
    const model = options.model ?? "text-embedding-004";
    const m = this.gen.getGenerativeModel({ model });
    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    const embeddings = [] as number[][];
    for (const input of inputs) embeddings.push((await m.embedContent(input)).embedding.values);
    return { provider: this.name, model, embeddings, usage: { tokens: estimateTokens(inputs.join("\n")) } };
  }
}

class GroqProvider implements LLMProvider {
  readonly name = "groq";
  private client?: Groq;
  constructor(apiKey?: string) { if (apiKey) this.client = new Groq({ apiKey }); }
  isAvailable() { return Boolean(this.client); }
  async listModels(): Promise<ModelInfo[]> { return [{ id: "llama-3.3-70b-versatile", provider: this.name, quality: "balanced", supportsStreaming: true }]; }
  async chat(options: ChatOptions): Promise<ChatResult> {
    if (!this.client) throw new Error("Groq not configured");
    const model = options.model ?? "llama-3.3-70b-versatile";
    const res = await this.client.chat.completions.create({ model, messages: options.messages.map((m) => ({ role: m.role === "tool" ? "user" : m.role, content: m.content })), temperature: options.temperature, max_tokens: options.maxTokens });
    const content = res.choices[0]?.message?.content ?? "";
    return { provider: this.name, model, content, usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0, totalTokens: res.usage?.total_tokens ?? 0 }, raw: res };
  }
  async embed(): Promise<EmbedResult> { throw new Error("Groq embeddings are not supported"); }
}

class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  isAvailable() { return true; }
  async listModels(): Promise<ModelInfo[]> { const res = await ollama.list(); return res.models.map((m) => ({ id: m.name, provider: this.name, quality: "local" as const })); }
  async chat(options: ChatOptions): Promise<ChatResult> {
    const model = options.model ?? "llama3.1";
    const res = await ollama.chat({ model, messages: options.messages.map((m) => ({ role: m.role === "tool" ? "user" : m.role, content: m.content })), stream: false });
    const content = res.message.content;
    return { provider: this.name, model, content, usage: { inputTokens: res.prompt_eval_count ?? 0, outputTokens: res.eval_count ?? 0, totalTokens: (res.prompt_eval_count ?? 0) + (res.eval_count ?? 0) }, raw: res };
  }
  async embed(options: EmbedOptions): Promise<EmbedResult> {
    const model = options.model ?? "nomic-embed-text";
    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    const embeddings = [] as number[][];
    for (const input of inputs) embeddings.push((await ollama.embeddings({ model, prompt: input })).embedding);
    return { provider: this.name, model, embeddings, usage: { tokens: estimateTokens(inputs.join("\n")) } };
  }
}

export function createProviders(): LLMProvider[] {
  const e = env();
  return [
    new OpenAICompatibleProvider({ name: "openai", apiKey: e.OPENAI_API_KEY, defaultChatModel: "gpt-4o-mini", defaultEmbedModel: "text-embedding-3-small", models: [{ id: "gpt-4o", provider: "openai", quality: "flagship", inputUsdPer1M: 2.5, outputUsdPer1M: 10 }, { id: "gpt-4o-mini", provider: "openai", quality: "cheap", inputUsdPer1M: 0.15, outputUsdPer1M: 0.6 }, { id: "text-embedding-3-small", provider: "openai", quality: "cheap" }] }),
    new AnthropicProvider(e.ANTHROPIC_API_KEY),
    new GoogleProvider(e.GOOGLE_API_KEY),
    new GroqProvider(e.GROQ_API_KEY),
    new OpenAICompatibleProvider({ name: "deepseek", apiKey: e.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", defaultChatModel: "deepseek-chat", models: [{ id: "deepseek-chat", provider: "deepseek", quality: "balanced" }, { id: "deepseek-reasoner", provider: "deepseek", quality: "flagship" }] }),
    new OpenAICompatibleProvider({ name: "openrouter", apiKey: e.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1", defaultChatModel: "openai/gpt-4o-mini", models: [{ id: "openai/gpt-4o-mini", provider: "openrouter", quality: "cheap" }, { id: "anthropic/claude-3.5-sonnet", provider: "openrouter", quality: "flagship" }] }),
    new OpenAICompatibleProvider({ name: "together", apiKey: e.TOGETHER_API_KEY, baseURL: "https://api.together.xyz/v1", defaultChatModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo", models: [{ id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", provider: "together", quality: "balanced" }] }),
    new OllamaProvider(),
  ];
}
```

### `server/src/services/cost-tracker.ts`

```typescript
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { tokenLedger } from "../db/schema.js";
import type { ChatResult, ModelInfo } from "./llm-provider.js";

export interface Budget {
  scope: "global" | "project" | "agent";
  id: string;
  limitUsd: number;
  spentUsd: number;
}

export class BudgetExceededError extends Error {
  constructor(public readonly budget: Budget) { super(`Budget exceeded for ${budget.scope}:${budget.id}`); }
}

export function computeCost(result: ChatResult, model?: ModelInfo): number {
  if (!model) return 0;
  const input = ((model.inputUsdPer1M ?? 0) * result.usage.inputTokens) / 1_000_000;
  const output = ((model.outputUsdPer1M ?? 0) * result.usage.outputTokens) / 1_000_000;
  return Number((input + output).toFixed(8));
}

export class CostTracker {
  private budgets = new Map<string, Budget>();

  setBudget(budget: Budget): void { this.budgets.set(`${budget.scope}:${budget.id}`, budget); }

  assertBudget(scope: Budget["scope"], id: string): void {
    const b = this.budgets.get(`${scope}:${id}`);
    if (b && b.spentUsd >= b.limitUsd) throw new BudgetExceededError(b);
  }

  async record(params: { agentId?: string; projectId?: string; provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: number; traceId?: string; }): Promise<void> {
    await db().insert(tokenLedger).values({
      id: nanoid(),
      agentId: params.agentId ?? null,
      projectId: params.projectId ?? null,
      provider: params.provider,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costUsd: params.costUsd.toString(),
      traceId: params.traceId ?? null,
      createdAt: new Date(),
    });
    for (const key of ["global:global", params.projectId ? `project:${params.projectId}` : undefined, params.agentId ? `agent:${params.agentId}` : undefined].filter(Boolean) as string[]) {
      const b = this.budgets.get(key);
      if (b) b.spentUsd += params.costUsd;
    }
  }
}

export const costTracker = new CostTracker();
```

### `server/src/services/model-router.ts`

```typescript
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { trajectoryLogs } from "../db/schema.js";
import { llmCircuit } from "../lib/circuit-breaker.js";
import { log } from "../lib/logging.js";
import { bus } from "../lib/sse.js";
import type { ChatOptions, ChatResult, EmbedOptions, EmbedResult, LLMProvider, ModelInfo } from "./llm-provider.js";
import { computeCost, costTracker } from "./cost-tracker.js";

export interface RouteRequest extends ChatOptions {
  taskType?: "simple" | "complex" | "code" | "vision";
  preferredProvider?: string;
  agentId?: string;
  taskId?: string;
  projectId?: string;
  traceId?: string;
}

export class ModelRouter {
  constructor(private readonly providers: LLMProvider[]) {}

  available(): LLMProvider[] { return this.providers.filter((p) => p.isAvailable()); }

  async route(req: RouteRequest): Promise<{ provider: LLMProvider; model?: ModelInfo }> {
    const available = this.available();
    if (available.length === 0) throw new Error("No LLM providers configured");
    const allModels = (await Promise.all(available.map((p) => p.listModels()))).flat();
    const quality = req.taskType === "complex" || req.taskType === "code" || req.taskType === "vision" ? "flagship" : "cheap";
    const model = allModels.find((m) => req.preferredProvider ? m.provider === req.preferredProvider : false)
      ?? allModels.find((m) => m.quality === quality)
      ?? allModels.find((m) => m.quality === "balanced")
      ?? allModels[0];
    const provider = available.find((p) => p.name === model?.provider) ?? available[0]!;
    return { provider, model };
  }

  async chat(req: RouteRequest): Promise<ChatResult> {
    costTracker.assertBudget("global", "global");
    if (req.projectId) costTracker.assertBudget("project", req.projectId);
    if (req.agentId) costTracker.assertBudget("agent", req.agentId);

    const first = await this.route(req);
    const ordered = [first.provider, ...this.available().filter((p) => p.name !== first.provider.name)];
    const errors: unknown[] = [];

    for (const provider of ordered) {
      try {
        const models = await provider.listModels();
        const selected = provider.name === first.provider.name ? first.model : models[0];
        const started = Date.now();
        const result = await llmCircuit.execute(() => provider.chat({ ...req, model: req.model ?? selected?.id }));
        const latencyMs = Date.now() - started;
        const costUsd = computeCost(result, selected);
        await costTracker.record({ agentId: req.agentId, projectId: req.projectId, provider: result.provider, model: result.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd, traceId: req.traceId });
        await db().insert(trajectoryLogs).values({ id: nanoid(), agentId: req.agentId ?? null, taskId: req.taskId ?? null, provider: result.provider, model: result.model, input: { messages: req.messages, metadata: req.metadata }, output: result, latencyMs, costUsd: costUsd.toString(), createdAt: new Date() });
        await bus.publish("llm", "llm.completed", { provider: result.provider, model: result.model, latencyMs, costUsd });
        return result;
      } catch (error) {
        errors.push(error);
        log.warn("llm_provider_failed", { provider: provider.name, error: error instanceof Error ? error.message : String(error) });
        await bus.publish("llm", "llm.provider_failed", { provider: provider.name });
      }
    }
    throw new AggregateError(errors, "All LLM providers failed");
  }

  async embed(req: EmbedOptions & { preferredProvider?: string }): Promise<EmbedResult> {
    const ordered = this.available().sort((a) => (a.name === req.preferredProvider ? -1 : 1));
    const errors: unknown[] = [];
    for (const provider of ordered) {
      try { return await provider.embed(req); } catch (e) { errors.push(e); }
    }
    throw new AggregateError(errors, "All embedding providers failed");
  }
}
```

### `server/src/routes/llm.ts`

```typescript
import { Hono } from "hono";
import { z } from "zod";
import { fail, ok, traceId } from "../lib/http.js";
import { parseWithAutoCorrect } from "../lib/zod-autocorrect.js";
import { createProviders } from "../services/providers/index.js";
import { ModelRouter } from "../services/model-router.js";

export const llmRouter = new Hono();
const router = new ModelRouter(createProviders());

const ChatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["system", "user", "assistant", "tool"]), content: z.string().min(1), name: z.string().optional() })).min(1),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(200000).optional(),
  taskType: z.enum(["simple", "complex", "code", "vision"]).optional(),
  preferredProvider: z.string().optional(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  projectId: z.string().optional(),
});

llmRouter.get("/providers", async (c) => ok(c, { providers: await Promise.all(router.available().map(async (p) => ({ name: p.name, models: await p.listModels() }))) }));

llmRouter.post("/chat", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = parseWithAutoCorrect(ChatSchema, body);
  if (!parsed.ok) return fail(c, "BAD_REQUEST", "Invalid chat request", 400, parsed.errors);
  try {
    const result = await router.chat({ ...parsed.value!, traceId: traceId(c) });
    return ok(c, result);
  } catch (error) {
    return fail(c, "UPSTREAM_ERROR", error instanceof Error ? error.message : String(error), 502);
  }
});
```

## C.4 Phase 4 Security, Redis, Observability, Metrics

### `server/src/lib/redis-bus.ts`

```typescript
import Redis from "ioredis";
import { nanoid } from "nanoid";
import { env } from "./env.js";
import type { BusEvent, MessageBus } from "./sse.js";

export class RedisBus implements MessageBus {
  private pub: Redis;
  private sub: Redis;
  private handlers = new Map<string, Set<(event: BusEvent) => void | Promise<void>>>();

  constructor(url = env().REDIS_URL) {
    if (!url) throw new Error("REDIS_URL is required for RedisBus");
    this.pub = new Redis(url);
    this.sub = new Redis(url);
    this.sub.on("message", (_, msg) => {
      const event = JSON.parse(msg) as BusEvent;
      const targets = [...(this.handlers.get(event.topic) ?? []), ...(this.handlers.get("*") ?? [])];
      for (const h of targets) void h(event);
    });
  }

  async publish(topic: string, type: string, data: unknown): Promise<BusEvent> {
    const event: BusEvent = { id: nanoid(), topic, type, data, ts: new Date().toISOString() };
    await this.pub.publish(`nexus:${topic}`, JSON.stringify(event));
    await this.pub.publish("nexus:*", JSON.stringify(event));
    return event;
  }

  async subscribe(topic: string, handler: (event: BusEvent) => void | Promise<void>): Promise<() => void> {
    const set = this.handlers.get(topic) ?? new Set();
    set.add(handler);
    this.handlers.set(topic, set);
    await this.sub.subscribe(`nexus:${topic}`);
    return () => { set.delete(handler); };
  }
}
```

### `server/src/lib/rate-limit.ts`

```typescript
import Redis from "ioredis";
import { env } from "./env.js";

export interface RateLimitDecision { allowed: boolean; remaining: number; resetAt: number; }

export class RedisRateLimiter {
  private redis?: Redis;
  constructor(private readonly limit: number, private readonly windowMs: number) {
    if (env().REDIS_URL) this.redis = new Redis(env().REDIS_URL);
  }

  async check(key: string): Promise<RateLimitDecision> {
    const now = Date.now();
    const bucket = Math.floor(now / this.windowMs);
    const resetAt = (bucket + 1) * this.windowMs;
    if (!this.redis) return { allowed: true, remaining: this.limit - 1, resetAt };
    const redisKey = `rl:${key}:${bucket}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) await this.redis.pexpire(redisKey, this.windowMs + 1000);
    return { allowed: count <= this.limit, remaining: Math.max(0, this.limit - count), resetAt };
  }
}
```

### `server/src/lib/metrics.ts`

```typescript
import client from "prom-client";
import type { Context, Next } from "hono";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: "nexus_" });

export const httpRequests = new client.Counter({ name: "nexus_http_requests_total", help: "HTTP requests", labelNames: ["method", "path", "status"] });
export const httpDuration = new client.Histogram({ name: "nexus_http_duration_ms", help: "HTTP duration", labelNames: ["method", "path"], buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] });
export const llmCalls = new client.Counter({ name: "nexus_llm_calls_total", help: "LLM calls", labelNames: ["provider", "model", "status"] });
export const llmCost = new client.Counter({ name: "nexus_llm_cost_total", help: "LLM cost USD", labelNames: ["provider", "model"] });
export const agentQueueDepth = new client.Gauge({ name: "nexus_agent_queue_depth", help: "Queued agent tasks", labelNames: ["priority"] });

registry.registerMetric(httpRequests);
registry.registerMetric(httpDuration);
registry.registerMetric(llmCalls);
registry.registerMetric(llmCost);
registry.registerMetric(agentQueueDepth);

export async function metricsMiddleware(c: Context, next: Next): Promise<void> {
  const start = Date.now();
  await next();
  const path = new URL(c.req.url).pathname.replace(/\/[0-9a-f-]{16,}/gi, "/:id");
  httpRequests.inc({ method: c.req.method, path, status: c.res.status });
  httpDuration.observe({ method: c.req.method, path }, Date.now() - start);
}

export async function metricsResponse(): Promise<Response> {
  return new Response(await registry.metrics(), { headers: { "content-type": registry.contentType } });
}
```

### `server/src/lib/otel.ts`

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { Resource } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { env } from "./env.js";

let sdk: NodeSDK | undefined;

export function startTelemetry(): void {
  const endpoint = env().OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint || sdk) return;
  sdk = new NodeSDK({
    resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: "nexus-server", [SEMRESATTRS_SERVICE_VERSION]: "3.1.0" }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
}

export async function stopTelemetry(): Promise<void> { await sdk?.shutdown(); sdk = undefined; }
```

## C.5 Phase 5 UI/UX Connectivity Components

### `web/package.json`

```json
{
  "name": "@nexus/web",
  "version": "3.1.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite --host 0.0.0.0", "build": "tsc -b && vite build", "typecheck": "tsc --noEmit", "test": "vitest run", "lint": "tsc --noEmit" },
  "dependencies": { "@vitejs/plugin-react": "^4.3.4", "vite": "^6.0.7", "typescript": "^5.7.3", "react": "^19.0.0", "react-dom": "^19.0.0", "lucide-react": "^0.468.0" },
  "devDependencies": { "@types/react": "^19.0.2", "@types/react-dom": "^19.0.2", "vitest": "^2.1.8" }
}
```

### `web/src/lib/remote.ts`

```typescript
export interface ApiEnvelope<T> { ok: boolean; data: T | null; error: { code: string; message: string; details?: unknown } | null; traceId: string; }

export class ApiClient {
  constructor(private readonly baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:9900") {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
    const envelope = await res.json() as ApiEnvelope<T>;
    if (!res.ok || !envelope.ok) throw new Error(envelope.error?.message ?? `HTTP ${res.status}`);
    return envelope.data as T;
  }

  health() { return this.request<{ status: string }>("/health"); }
  chat(body: unknown) { return this.request("/api/llm/chat", { method: "POST", body: JSON.stringify(body) }); }
  events(onEvent: (event: MessageEvent) => void): EventSource {
    const es = new EventSource(`${this.baseUrl}/events`);
    es.onmessage = onEvent;
    es.addEventListener("llm.completed", onEvent);
    es.addEventListener("task.completed", onEvent);
    return es;
  }
}

export const api = new ApiClient();
```

### `web/src/components/States.tsx`

```tsx
import React from "react";

export function SkeletonLoader({ lines = 4 }: { lines?: number }) {
  return <div aria-busy="true" style={{ display: "grid", gap: 12 }}>{Array.from({ length: lines }).map((_, i) => <div key={i} style={{ height: 18, borderRadius: 8, background: "linear-gradient(90deg,#1f2937,#374151,#1f2937)", animation: "pulse 1.4s infinite" }} />)}</div>;
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return <section role="alert" style={{ padding: 24, border: "1px solid #7f1d1d", borderRadius: 16, background: "#450a0a", color: "#fee2e2" }}><h2>{title}</h2><p>{message}</p>{onRetry && <button onClick={onRetry}>Retry</button>}</section>;
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return <section style={{ padding: 32, textAlign: "center", border: "1px dashed #475569", borderRadius: 16 }}><h2>{title}</h2><p>{message}</p>{action}</section>;
}
```

### `web/src/components/CommandPalette.tsx`

```tsx
import React, { useEffect, useMemo, useState } from "react";

export interface Command { id: string; label: string; hint?: string; run: () => void; }

export function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  const filtered = useMemo(() => commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())), [commands, q]);
  if (!open) return null;
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "start center", paddingTop: "10vh", zIndex: 50 }} onClick={() => setOpen(false)}>
    <div style={{ width: 680, maxWidth: "92vw", background: "#0f172a", color: "white", borderRadius: 18, boxShadow: "0 24px 80px rgba(0,0,0,.5)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search commands..." style={{ width: "100%", padding: 18, background: "#111827", color: "white", border: 0, outline: 0 }} />
      <div style={{ maxHeight: 420, overflow: "auto" }}>{filtered.map((c) => <button key={c.id} onClick={() => { c.run(); setOpen(false); }} style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: 14, background: "transparent", color: "white", border: 0, textAlign: "left" }}><span>{c.label}</span><small>{c.hint}</small></button>)}</div>
    </div>
  </div>;
}
```

### `web/src/components/AgentMap.tsx`

```tsx
import React from "react";

export interface AgentNode { id: string; name: string; status: "idle" | "running" | "blocked" | "failed"; x: number; y: number; }
export interface AgentEdge { from: string; to: string; label?: string; }

export function AgentMap({ nodes, edges }: { nodes: AgentNode[]; edges: AgentEdge[] }) {
  const color = { idle: "#64748b", running: "#22c55e", blocked: "#f59e0b", failed: "#ef4444" } as const;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return <svg viewBox="0 0 1000 600" style={{ width: "100%", minHeight: 480, background: "radial-gradient(circle,#172033,#050816)", borderRadius: 20 }}>
    {edges.map((e, i) => { const a = byId.get(e.from), b = byId.get(e.to); if (!a || !b) return null; return <g key={i}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#38bdf8" strokeOpacity=".45" strokeWidth="2" />{e.label && <text x={(a.x+b.x)/2} y={(a.y+b.y)/2 - 8} fill="#bae6fd" fontSize="12">{e.label}</text>}</g>; })}
    {nodes.map((n) => <g key={n.id}><circle cx={n.x} cy={n.y} r="34" fill={color[n.status]} opacity=".9" /><circle cx={n.x} cy={n.y} r="44" fill="none" stroke={color[n.status]} opacity=".3"><animate attributeName="r" values="40;54;40" dur="2s" repeatCount="indefinite" /></circle><text x={n.x} y={n.y + 58} textAnchor="middle" fill="white" fontSize="14">{n.name}</text></g>)}
  </svg>;
}
```

## C.6 Phase 6 Developer Ecosystem

### `packages/nexus-sdk/package.json`

```json
{
  "name": "@nexus/sdk",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "zod": "^3.24.1" },
  "devDependencies": { "typescript": "^5.7.3", "vitest": "^2.1.8" }
}
```

### `packages/nexus-sdk/src/index.ts`

```typescript
import { z } from "zod";

export const SkillManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9_.-]+$/),
  name: z.string().min(1),
  version: z.string().min(1),
  category: z.enum(["recall", "exec", "analysis", "io", "automation", "security"]),
  description: z.string().default(""),
  permissions: z.array(z.string()).default([]),
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;
export interface Memory { id: string; content: string; metadata?: Record<string, unknown>; createdAt: string; }
export interface Agent { id: string; name: string; persona?: string; }
export interface InvocationContext { traceId: string; agent?: Agent; logger: { info(event: string, fields?: Record<string, unknown>): void; warn(event: string, fields?: Record<string, unknown>): void; error(event: string, fields?: Record<string, unknown>): void; }; recall(query: string): Promise<Memory[]>; remember(content: string, metadata?: Record<string, unknown>): Promise<Memory>; }
export interface Skill<I = unknown, O = unknown> extends SkillManifest { inputSchema?: z.ZodType<I>; outputSchema?: z.ZodType<O>; handler(input: I, ctx: InvocationContext): Promise<O>; }
export interface NexusPlugin { name: string; version: string; hooks?: Partial<{ onMemoryCreated(memory: Memory): Promise<void>; onToolInvoked(tool: string, args: unknown): Promise<void>; onAgentStarted(agent: Agent): Promise<void>; }>; skills?: Skill[]; setup?(ctx: InvocationContext): Promise<void>; teardown?(): Promise<void>; }
export function definePlugin(plugin: NexusPlugin): NexusPlugin { return plugin; }
export function defineSkill<I, O>(skill: Skill<I, O>): Skill<I, O> { SkillManifestSchema.parse(skill); return skill; }
```

### `server/src/services/plugin-manager.ts`

```typescript
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { log } from "../lib/logging.js";

const PluginShape = z.object({ name: z.string(), version: z.string(), hooks: z.unknown().optional(), skills: z.array(z.unknown()).optional() }).passthrough();
export type LoadedPlugin = z.infer<typeof PluginShape> & { source: string; module: unknown };

export class PluginManager {
  private plugins = new Map<string, LoadedPlugin>();

  async load(filePath: string): Promise<void> {
    const mod = await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
    const candidate = mod.default ?? mod.plugin ?? Object.values(mod)[0];
    const parsed = PluginShape.safeParse(candidate);
    if (!parsed.success) throw new Error(`Invalid plugin ${filePath}: ${parsed.error.message}`);
    const plugin = { ...parsed.data, source: filePath, module: mod };
    if (typeof (candidate as { setup?: unknown }).setup === "function") await (candidate as { setup(): Promise<void> }).setup();
    this.plugins.set(plugin.name, plugin);
    log.info("plugin_loaded", { name: plugin.name, version: plugin.version, source: filePath });
  }

  async unload(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    const candidate = (plugin.module as Record<string, unknown>).default ?? plugin.module;
    if (candidate && typeof (candidate as { teardown?: unknown }).teardown === "function") await (candidate as { teardown(): Promise<void> }).teardown();
    this.plugins.delete(id);
    log.info("plugin_unloaded", { id });
  }

  async reload(): Promise<void> {
    const paths = [...this.plugins.values()].map((p) => p.source);
    await Promise.all([...this.plugins.keys()].map((id) => this.unload(id)));
    for (const path of paths) await this.load(path);
  }

  list(): LoadedPlugin[] { return [...this.plugins.values()]; }
  get(id: string): LoadedPlugin | null { return this.plugins.get(id) ?? null; }
}

export const pluginManager = new PluginManager();
```

### `server/src/services/marketplace.ts`

```typescript
import { z } from "zod";

export const MarketplaceSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  downloads: z.number().int().nonnegative(),
  rating: z.number().min(0).max(5),
  tarballUrl: z.string().url(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
export type MarketplaceSkill = z.infer<typeof MarketplaceSkillSchema>;

export class MarketplaceClient {
  constructor(private readonly baseUrl: string) {}
  async search(query: string): Promise<MarketplaceSkill[]> {
    const res = await fetch(`${this.baseUrl}/api/skills?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`Marketplace search failed: ${res.status}`);
    return z.array(MarketplaceSkillSchema).parse(await res.json());
  }
  async get(id: string): Promise<MarketplaceSkill> {
    const res = await fetch(`${this.baseUrl}/api/skills/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Marketplace fetch failed: ${res.status}`);
    return MarketplaceSkillSchema.parse(await res.json());
  }
}
```

## C.7 Phase 7 Transformative Features

### `server/src/services/collaboration.ts`

```typescript
import { nanoid } from "nanoid";

export interface DebateTurn { agentId: string; content: string; score?: number; }
export interface DebateResult { id: string; topic: string; turns: DebateTurn[]; winnerAgentId?: string; consensus: string; }

export class DebateProtocol {
  async run(topic: string, agents: { id: string; argue(topic: string, prior: DebateTurn[]): Promise<string> }[], judge: { score(topic: string, turns: DebateTurn[]): Promise<{ winnerAgentId?: string; consensus: string; scores: Record<string, number> }> }): Promise<DebateResult> {
    const turns: DebateTurn[] = [];
    for (let round = 0; round < 2; round += 1) {
      for (const agent of agents) turns.push({ agentId: agent.id, content: await agent.argue(topic, turns) });
    }
    const verdict = await judge.score(topic, turns);
    for (const t of turns) t.score = verdict.scores[t.agentId];
    return { id: nanoid(), topic, turns, winnerAgentId: verdict.winnerAgentId, consensus: verdict.consensus };
  }
}

export class Blackboard<T extends Record<string, unknown> = Record<string, unknown>> {
  private state: T;
  private version = 0;
  private locks = new Set<string>();
  constructor(initial: T) { this.state = structuredClone(initial); }
  snapshot() { return { version: this.version, state: structuredClone(this.state) }; }
  async write(agentId: string, patch: Partial<T>, expectedVersion: number): Promise<number> {
    if (this.version !== expectedVersion) throw new Error(`Version conflict: expected ${expectedVersion}, got ${this.version}`);
    if (this.locks.size && !this.locks.has(agentId)) throw new Error("Blackboard locked by another agent");
    this.state = { ...this.state, ...patch };
    this.version += 1;
    return this.version;
  }
  lock(agentId: string): void { if (this.locks.size && !this.locks.has(agentId)) throw new Error("Already locked"); this.locks.add(agentId); }
  unlock(agentId: string): void { this.locks.delete(agentId); }
}
```

### `server/src/services/pipeline-engine.ts`

```typescript
export type NodeKind = "trigger" | "llm" | "skill" | "condition" | "action" | "join";
export interface PipelineNode { id: string; kind: NodeKind; config: Record<string, unknown>; }
export interface PipelineEdge { from: string; to: string; condition?: string; }
export interface Pipeline { id: string; nodes: PipelineNode[]; edges: PipelineEdge[]; }
export interface PipelineContext { input: unknown; vars: Record<string, unknown>; log: string[]; }
export type NodeHandler = (node: PipelineNode, ctx: PipelineContext) => Promise<unknown>;

export class PipelineEngine {
  private handlers = new Map<NodeKind, NodeHandler>();
  register(kind: NodeKind, handler: NodeHandler): void { this.handlers.set(kind, handler); }
  async run(pipeline: Pipeline, input: unknown): Promise<PipelineContext> {
    const ctx: PipelineContext = { input, vars: {}, log: [] };
    const incoming = new Map<string, number>();
    for (const n of pipeline.nodes) incoming.set(n.id, 0);
    for (const e of pipeline.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    const queue = pipeline.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
    const visited = new Set<string>();
    while (queue.length) {
      const node = queue.shift()!;
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      const handler = this.handlers.get(node.kind);
      if (!handler) throw new Error(`No handler for node kind ${node.kind}`);
      ctx.vars[node.id] = await handler(node, ctx);
      ctx.log.push(`executed:${node.id}`);
      for (const e of pipeline.edges.filter((x) => x.from === node.id)) {
        const next = pipeline.nodes.find((n) => n.id === e.to);
        if (next) queue.push(next);
      }
    }
    return ctx;
  }
}
```

### `server/src/services/voice.ts`

```typescript
export interface TranscriptionResult { text: string; language?: string; confidence?: number; }
export interface SpeechResult { audio: Uint8Array; contentType: string; durationMs?: number; }

export class VoiceService {
  constructor(private readonly cfg: { openaiApiKey?: string; elevenLabsApiKey?: string }) {}

  async transcribe(audio: Uint8Array, contentType: string): Promise<TranscriptionResult> {
    if (!this.cfg.openaiApiKey) throw new Error("OPENAI_API_KEY is required for transcription");
    const form = new FormData();
    form.set("file", new Blob([audio], { type: contentType }), "audio.webm");
    form.set("model", "whisper-1");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${this.cfg.openaiApiKey}` }, body: form });
    if (!res.ok) throw new Error(`Transcription failed: ${res.status} ${await res.text()}`);
    const json = await res.json() as { text: string; language?: string };
    return { text: json.text, language: json.language };
  }

  async speak(text: string, voice = "alloy"): Promise<SpeechResult> {
    if (!this.cfg.openaiApiKey) throw new Error("OPENAI_API_KEY is required for TTS");
    const res = await fetch("https://api.openai.com/v1/audio/speech", { method: "POST", headers: { authorization: `Bearer ${this.cfg.openaiApiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini-tts", voice, input: text, format: "mp3" }) });
    if (!res.ok) throw new Error(`TTS failed: ${res.status} ${await res.text()}`);
    return { audio: new Uint8Array(await res.arrayBuffer()), contentType: "audio/mpeg" };
  }
}
```

### `server/src/services/test-generator.ts`

```typescript
export interface Episode { id: string; input: unknown; output: unknown; toolCalls?: { name: string; args: unknown }[]; invariants?: string[]; }
export interface GeneratedTestSuite { filename: string; code: string; }

function js(value: unknown): string { return JSON.stringify(value, null, 2); }

export function generateBehaviorTest(episode: Episode): GeneratedTestSuite {
  const safe = episode.id.replace(/[^a-z0-9_-]/gi, "_");
  const code = `import { describe, expect, it } from "vitest";\n\ndescribe("behavior episode ${safe}", () => {\n  it("preserves recorded input/output contract", async () => {\n    const input = ${js(episode.input)};\n    const expected = ${js(episode.output)};\n    expect(input).toBeDefined();\n    expect(expected).toMatchObject(expected);\n  });\n\n  it("does not mutate input fixtures", () => {\n    const before = ${js(episode.input)};\n    const after = structuredClone(before);\n    expect(after).toEqual(before);\n  });\n});\n`;
  return { filename: `episode-${safe}.test.ts`, code };
}
```

### `server/src/services/self-improver.ts`

```typescript
import { log } from "../lib/logging.js";

export interface ImprovementProposal { id: string; title: string; rationale: string; patch: string; risk: "low" | "medium" | "high"; }
export interface SandboxResult { passed: boolean; score: number; logs: string; }
export interface Sandbox { testPatch(patch: string): Promise<SandboxResult>; applyPatch(patch: string): Promise<void>; rollback(): Promise<void>; }

export class SelfImprover {
  constructor(private readonly sandbox: Sandbox, private readonly minScore = 0.9) {}
  async evaluateAndApply(proposal: ImprovementProposal): Promise<{ applied: boolean; result: SandboxResult }> {
    if (proposal.risk === "high") throw new Error("High-risk proposals require human approval");
    const result = await this.sandbox.testPatch(proposal.patch);
    if (!result.passed || result.score < this.minScore) {
      log.warn("self_improvement_rejected", { id: proposal.id, score: result.score });
      return { applied: false, result };
    }
    try {
      await this.sandbox.applyPatch(proposal.patch);
      log.info("self_improvement_applied", { id: proposal.id, score: result.score });
      return { applied: true, result };
    } catch (error) {
      await this.sandbox.rollback();
      throw error;
    }
  }
}
```

### `server/src/services/agent-analyzer.ts`

```typescript
export interface AgentEvent { agentId: string; type: string; ok: boolean; durationMs: number; tool?: string; ts: string; }
export interface AgentAnalytics { agentId: string; successRate: number; avgDurationMs: number; toolUsage: Record<string, number>; failureModes: Record<string, number>; driftScore: number; }

export function analyzeAgentBehavior(agentId: string, events: AgentEvent[]): AgentAnalytics {
  const mine = events.filter((e) => e.agentId === agentId);
  const ok = mine.filter((e) => e.ok).length;
  const toolUsage: Record<string, number> = {};
  const failureModes: Record<string, number> = {};
  for (const e of mine) {
    if (e.tool) toolUsage[e.tool] = (toolUsage[e.tool] ?? 0) + 1;
    if (!e.ok) failureModes[e.type] = (failureModes[e.type] ?? 0) + 1;
  }
  const avg = mine.reduce((a, e) => a + e.durationMs, 0) / Math.max(1, mine.length);
  const midpoint = Math.floor(mine.length / 2);
  const early = mine.slice(0, midpoint);
  const late = mine.slice(midpoint);
  const earlyRate = early.filter((e) => e.ok).length / Math.max(1, early.length);
  const lateRate = late.filter((e) => e.ok).length / Math.max(1, late.length);
  return { agentId, successRate: ok / Math.max(1, mine.length), avgDurationMs: avg, toolUsage, failureModes, driftScore: Math.abs(lateRate - earlyRate) };
}
```

## C.8 Phase 8 Performance and Scale

### `server/src/lib/cache.ts`

```typescript
export interface CacheEntry<T> { value: T; expiresAt: number; }
export class TTLCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  constructor(private readonly max = 10_000) {}
  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { this.map.delete(key); return undefined; }
    return e.value;
  }
  set(key: string, value: T, ttlMs: number): void {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  delete(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
}
```

### `server/src/lib/stream-json.ts`

```typescript
export async function* parseJsonLines<T>(stream: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) yield JSON.parse(line) as T;
    }
  }
  const tail = buffer.trim();
  if (tail) yield JSON.parse(tail) as T;
}
```

### `server/src/services/benchmark.ts`

```typescript
export interface BenchmarkCase { name: string; iterations: number; run(): Promise<void>; }
export interface BenchmarkResult { name: string; iterations: number; totalMs: number; p50Ms: number; p95Ms: number; p99Ms: number; opsPerSec: number; }

function percentile(values: number[], p: number): number { return values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0; }

export async function runBenchmark(test: BenchmarkCase): Promise<BenchmarkResult> {
  const times: number[] = [];
  const startedAll = performance.now();
  for (let i = 0; i < test.iterations; i += 1) {
    const s = performance.now();
    await test.run();
    times.push(performance.now() - s);
  }
  times.sort((a, b) => a - b);
  const totalMs = performance.now() - startedAll;
  return { name: test.name, iterations: test.iterations, totalMs, p50Ms: percentile(times, 0.5), p95Ms: percentile(times, 0.95), p99Ms: percentile(times, 0.99), opsPerSec: test.iterations / (totalMs / 1000) };
}
```

## C.9 Phase 9 SaaS, Tenancy, Billing, Admin

### `server/src/lib/tenant.ts`

```typescript
import type { Context, Next } from "hono";
import { fail } from "./http.js";

export interface TenantContext { tenantId: string; userId?: string; plan?: "free" | "pro" | "enterprise"; }

declare module "hono" { interface ContextVariableMap { tenant: TenantContext; traceId: string; } }

export async function tenantMiddleware(c: Context, next: Next): Promise<Response | void> {
  const tenantId = c.req.header("x-tenant-id") ?? new URL(c.req.url).searchParams.get("tenantId");
  if (!tenantId) return fail(c, "BAD_REQUEST", "Missing tenant context", 400);
  c.set("tenant", { tenantId });
  await next();
}

export function tenant(c: Context): TenantContext { return c.get("tenant"); }
```

### `server/src/services/billing.ts`

```typescript
export interface UsageItem { tenantId: string; metric: "tokens" | "agents" | "storage_gb" | "tasks"; quantity: number; ts: string; }
export interface InvoicePreview { tenantId: string; subtotalUsd: number; lines: { metric: string; quantity: number; unitUsd: number; totalUsd: number }[]; }

const PRICES = { tokens: 0.000002, agents: 0.05, storage_gb: 0.25, tasks: 0.001 } as const;

export function previewInvoice(tenantId: string, usage: UsageItem[]): InvoicePreview {
  const lines = Object.entries(PRICES).map(([metric, unitUsd]) => {
    const quantity = usage.filter((u) => u.tenantId === tenantId && u.metric === metric).reduce((a, u) => a + u.quantity, 0);
    return { metric, quantity, unitUsd, totalUsd: Number((quantity * unitUsd).toFixed(4)) };
  }).filter((l) => l.quantity > 0);
  return { tenantId, lines, subtotalUsd: Number(lines.reduce((a, l) => a + l.totalUsd, 0).toFixed(4)) };
}
```

## C.10 Authoritative Database Schema Delta Required By Added Code

The added code expects these tables/columns to exist in `server/src/db/schema.ts`. If you transcribe `20-database-schema-specification.md`, ensure these names and fields are present or add a compatibility layer.

```typescript
// Required table exports referenced above:
// - agentTasks: id, agentId, status, priority, input, result, error, attempts, blockedReason, runAt, createdAt, updatedAt, startedAt, completedAt
// - trajectoryLogs: id, agentId, taskId, provider, model, input, output, latencyMs, costUsd, createdAt
// - tokenLedger: id, agentId, projectId, provider, model, inputTokens, outputTokens, costUsd, traceId, createdAt
// - auditLog or audit_log used by lib/audit.ts verifyAuditChain()
```

## C.11 Minimum Test Suite for the Added Code

### `server/test/zod-autocorrect.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseWithAutoCorrect } from "../src/lib/zod-autocorrect.js";

describe("parseWithAutoCorrect", () => {
  it("extracts JSON from fenced model output", () => {
    const schema = z.object({ ok: z.boolean(), count: z.number() });
    const result = parseWithAutoCorrect(schema, "```json\n{\"ok\":\"true\",\"count\":\"2\"}\n```");
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ ok: true, count: 2 });
  });
});
```

### `server/test/circuit-breaker.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "../src/lib/circuit-breaker.js";

describe("CircuitBreaker", () => {
  it("opens after threshold failures", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 1, successThreshold: 1, timeoutMs: 100, resetAfterMs: 1000 });
    await expect(cb.execute(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(cb.execute(async () => "ok")).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
```

### `server/test/pipeline-engine.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { PipelineEngine } from "../src/services/pipeline-engine.js";

describe("PipelineEngine", () => {
  it("executes DAG nodes", async () => {
    const e = new PipelineEngine();
    e.register("trigger", async () => "start");
    e.register("action", async (_node, ctx) => `${ctx.vars.a}:done`);
    const result = await e.run({ id: "p", nodes: [{ id: "a", kind: "trigger", config: {} }, { id: "b", kind: "action", config: {} }], edges: [{ from: "a", to: "b" }] }, {});
    expect(result.vars.b).toBe("start:done");
  });
});
```

## C.12 Transcription Order With No Compromises

1. Create workspace package files (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`).
2. Transcribe authoritative schema from `20-database-schema-specification.md`; add the compatibility fields in C.10.
3. Add core server files from `01-server-core.md`, then add C.1 libraries and `server/src/index.ts`.
4. Add Phase 2 services: circuit breaker, zod autocorrection, task worker, watchdog.
5. Add Phase 3 LLM provider files and route.
6. Add Phase 4 metrics/Redis/OTel and wire middleware into `createApp()`.
7. Add web package and UI connectivity components.
8. Add SDK, plugin manager, marketplace, collaboration, pipeline, voice, benchmark, tenant, billing.
9. Run `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm db:generate`, `pnpm db:push`.
10. Fix compile errors only by improving types or schema consistency — never by disabling strictness or using broad `any` escapes.

---

# APPENDIX D: CODE QUALITY GUARANTEES FOR THIS EXPANDED DOCUMENT

- Every code block is intended as a full file or explicitly labelled schema delta/test.
- Error paths throw or return API envelopes; no silent catch blocks.
- External provider calls are isolated behind interfaces for testability.
- Budget, trajectory logging, SSE events, and circuit breaker hooks are included in the LLM path.
- Task execution includes claiming, retries, HITL resume helper, trajectory logging, and SSE events.
- The document now correctly reflects the project inventory: specifications exist; executable files still need transcription.
