# Agentic OS V3 — Architecture & Integration Plan

## Vision

**Agentic OS is an operating system for AI agents.** Any agentic CLI (Claude Code, OpenCode, OpenClaude, Cursor, etc.) connects to it as a shell connects to a kernel. The OS provides shared process management, memory, IPC, scheduling, security, and device drivers that work across all CLIs.

```
┌─────────────────────────────────────────────────┐
│                 User Interfaces                  │
│  Claude Code │ OpenCode │ OpenClaude │ Cursor    │
└──────────────────────┬──────────────────────────┘
                       │  (any CLI = shell)
┌──────────────────────▼──────────────────────────┐
│         Agentic OS Kernel (this project)          │
│                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Process  │ │ Memory   │ │ IPC / Message Bus │  │
│  │ Manager  │ │ Manager  │ │ (pub/sub, RPC)    │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Resource │ │ Security │ │ Device Drivers   │  │
│  │Scheduler │ │   ACL    │ │ (Tool Hub, MCP)   │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │Observab. │ │Scheduler │ │ Package Manager  │  │
│  │ / Tracing│ │(cron/evt)│ │ (Agent Registry)  │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
└──────────────────────────────────────────────────┘
```

## User Benefit

| Problem today | OS solves it |
|---|---|
| Every CLI has its own config | `/etc/` — shared agent manifests, tool registry, secrets |
| No shared memory between sessions | **Virtual memory** — federated recall persists across any CLI |
| Can't coordinate agents | **IPC/signals** — agents message each other regardless of CLI |
| No scheduling | **cron/systemd** — "run daily at 9am" works across CLIs |
| No audit trail | **`/var/log`** — immutable hash chain from any CLI action |
| Tool config per agent | **Device drivers** — one Composio-style tool hub all CLIs share |
| Can't pause/resume | **Process mgmt** — `kill -STOP`/`CONT` for long-running agent tasks |
| No resource limits | **`ulimit`** — shared rate limiting/quotas across all agent processes |

---

## 10 Kernel Services

### 1. Process Manager (Agent Lifecycle)
| OS Concept | Our Implementation | Inspiration |
|---|---|---|
| `ps` / `kill` | Agent spawn/pause/resume/kill REST API | CrewAI Agent lifecycle |
| Process table | YAML agent manifests (systemd-style `.agent.yaml`) | CrewAI `agents.yaml` |
| Process groups | Teams / GroupChat orchestration | AutoGen GroupChatManager |
| `fork()` | Agent cloning (`clone agent --with-overrides`) | OpenAI SDK `agent.clone()` |
| Signals | Lifecycle hooks: `on_agent_start`, `on_tool_end` | OpenAI SDK RunHooks |
| Context switch | Guarded handoff with history filtering | OpenAI SDK handoff protocol |
| `exec()` | Swap agent persona mid-session | Eliza character switching |

### 2. IPC / Message Bus
| OS Concept | Our Implementation | Inspiration |
|---|---|---|
| pipes | Agent-to-agent message passing | AutoGen RoutedAgent |
| signals | Event system (`MESSAGE_RECEIVED`, etc.) | Eliza events |
| pub/sub | Topic-based routing | AutoGen Core API topics |
| RPC | Request-response between agents | AutoGen `@rpc` decorator |
| shared memory | Federated recall system | Already built in V3 |
| message queues | FIFO priority queue | Haystack PipelineBase |

### 3. Memory Manager (Virtual Memory)
| OS Concept | Our Implementation | Inspiration |
|---|---|---|
| RAM | Short-term conversation context | LangGraph channel state |
| swap | Long-term vector memory | Eliza MemoryManager |
| page table | Federated recall (BM25 + embeddings) | Already built in V3 |
| cache | LRU state cache | LangGraph / Eliza state cache |
| core dump | Checkpointing / time travel resume | LangGraph Checkpointer |
| mmap | Knowledge sources mapped into agent context | CrewAI KnowledgeSources |

### 4. Resource Scheduler (LLM + Compute)
| OS Concept | Our Implementation | Inspiration |
|---|---|---|
| CPU scheduler | LLM call priority/quotas/user budgets | Composio rate limits |
| `ulimit` | Tool call budget, max iterations per agent | CrewAI `max_iter`, OpenAI SDK `max_turns` |
| device drivers | Multi-provider LLM gateway | Already built in V3 |
| GPU scheduling | Concurrent model calls | LangGraph Pregel parallel execution |
| OOM killer | Context overflow → auto-summarize | CrewAI `respect_context_window` |

### 5. Agent File System
| OS Concept | Our Implementation | Inspiration |
|---|---|---|
| `/proc` | Agent runtime introspection (`/agents/{id}/state`) | LangGraph `get_state()` |
| chroot | Per-agent workspace sandbox | AutoGPT workspaces |
| tmpfs | Ephemeral pipeline intermediate data | Haystack component outputs |
| mount ns | Per-agent config + secrets | Eliza Character.settings, Composio ConnectedAccounts |

### 6. Security / Permissions
| OS Concept | Our Implementation | Inspiration |
|---|---|---|
| kernel/user | Ring-based ACL | Already built in V3 |
| capabilities | Fine-grained tool permissions per agent | Eliza Action.validate() |
| audit log | Immutable audit hash chain | Already built in V3 |
| syscalls | Action Registry (registerable, not hardcoded) | Eliza Action interface |
| ASLR | Context isolation between concurrent agents | New |
| signed binaries | Plugin/agent receipts (Ed25519) | Already built in V3 |

### 7. Device Drivers (Tool/Protocol Hub)
| OS Concept | Our Implementation | Inspiration |
|---|---|---|
| VFS | Unified tool registry + discovery API | Composio app registry |
| device tree | MCP server registry + auto-connect | OpenAI SDK MCP integration |
| plug-and-play | Agent auto-discovers available tools | Eliza Plugin system |
| ioctl | Tool input/output validation & transform | Eliza Handler/Validator |
| DMA | Parallel tool execution (batch 50) | Composio multi-execute |
| driver model | Auth scheme abstraction (OAuth/API Key/Basic) | Composio AuthScheme |

### 8. Observability / Kernel Log
| OS Concept | Our Implementation | Inspiration |
|---|---|---|
| `dmesg` | Structured trace spans per run | OpenAI SDK tracing |
| `top` | Live agent process tree + resource usage | AutoGen Studio |
| `perf` | Token usage + cost tracking per agent | CrewAI TokenUsage |
| `strace` | Tool call trace with timing per call | Composio audit log |
| `/var/log` | Persistent run history with time travel | LangGraph state history |

### 9. Scheduler (Time + Event Driven)
| OS Concept | Our Implementation | Inspiration |
|---|---|---|
| cron | Recurring agent execution (daily reports, etc.) | CrewAI Flow scheduling |
| systemd timers | Webhook-triggered agent runs | AutoGPT continuous triggers |
| `at` | One-shot delayed agent tasks | New |
| init.d | Boot-time agent auto-start on server boot | New |

### 10. Package Manager (Agent Distribution)
| OS Concept | Our Implementation | Inspiration |
|---|---|---|
| apt/yum | Plugin/agent marketplace with search | AutoGPT Marketplace |
| RPM | Versioned agent templates with deps | CrewAI `@CrewBase` templates |
| dependency resolution | Plugin dependency graph | Eliza plugin.dependencies |
| repository | Public agent registry + gallery | AutoGen Studio Gallery |
| one-click install | `POST /api/plugins/install` from catalog | Eliza plugin bootstrap |

---

## Phased Implementation Roadmap

### Phase 1 ✅ Done — Boot Sequence + Kernel Stable
- System audit (153/153 tests pass)
- CI workflow fixed
- Ed25519 signing fix (crypto.sign(null, ...))
- Orphan migration cleanup
- All 5 Pillar routes mounted (29 V3 endpoints)

### Phase 2 — Process Manager + System Calls (High Impact, Low Effort)

**2a: YAML Agent Manifests (systemd for agents)**
- New: `server/src/services/agent-config.ts` — parse `.agent.yaml` files
- Schema: `role`, `goal`, `backstory`, `model`, `tools[]`, `max_iter`, `allow_delegation`
- CLI: Load from `agents/` directory, validate with Zod
- Source: CrewAI `agents.yaml`

**2b: Action Registry (syscalls)**
- Refactor: `server/src/services/agent-runtime.ts` — replace hardcoded `AVAILABLE_TOOLS` switch
- Interface: `Action { name, description, schema, validate(), handler(), similes[] }`
- Register: `runtime.registerAction(myAction)`
- Source: Eliza Action interface

**2c: Agent Lifecycle API (process mgmt)**
- New routes: `POST /api/v3/agents/spawn`, `POST /api/v3/agents/{id}/pause`, `/resume`, `/kill`
- State machine: `CREATED → RUNNING → PAUSED → RUNNING → TERMINATED`
- Source: OpenAI SDK Runner, CrewAI kickoff

**2d: Signal Hooks (event system)**
- Events: `on_agent_start`, `on_agent_end`, `on_tool_start`, `on_tool_end`, `on_handoff`
- Implementation: typed event emitter (like Node EventEmitter but async)
- Source: OpenAI SDK RunHooks, CrewAI callbacks

### Phase 3 — Device Drivers + IPC (Tool Hub + Message Bus)

**3a: Tool Integration Hub (device drivers)**
- New: `server/src/services/tool-hub.ts` + `tool_connections` / `toolkits` tables
- Schemas: `toolkits { slug, name, auth_scheme, logo, version }`
- Schemas: `tool_connections { user_id, toolkit_slug, encrypted_credentials, status }`
- Auth schemes: OAuth2 flow, API key, Bearer token, Basic auth
- API: `GET /api/v3/tools/search`, `POST /api/v3/tools/execute`, `POST /api/v3/connections/link`
- Source: Composio app registry + connected accounts

**3b: IPC Message Bus (pub/sub + RPC)**
- New: `server/src/services/message-bus.ts`
- Topics: `agent:<id>`, `team:<id>`, `system:<event>`
- Patterns: publish/subscribe, request/response (RPC), fire-and-forget (event)
- Source: AutoGen Core API (topic-based routing, `@message_handler`, `@rpc`, `@event`)

**3c: MCP Server Registry (device discovery)**
- New: `server/src/services/mcp-registry.ts`
- Register MCP servers: stdio, HTTP/SSE, Streamable HTTP
- Auto-discover tools from MCP servers
- Source: OpenAI SDK MCPServer, Composio MCP integration

### Phase 4 — Memory + Scheduling

**4a: StateGraph + Checkpointer (core dump)**
- New: `server/src/services/graph-engine.ts`
- State → Node → Edge → CompiledGraph execution model
- Checkpoint state after every superstep
- Resume from any prior checkpoint (time travel)
- Source: LangGraph StateGraph, Checkpointer

**4b: Federated Recall Enhancements (virtual memory)**
- Enhance: `server/src/services/federated-recall.ts`
- Add recency scoring, importance weighting, cross-session persistence
- LRU state cache for composed agent state
- Source: Eliza MemoryManager, CrewAI Unified Memory

**4c: LLM Scheduler (resource scheduling)**
- New: `server/src/services/llm-scheduler.ts`
- Per-user rate limits, priority queues, model routing
- Source: Composio rate limiting, CrewAI `max_rpm`

**4d: Cron/Event Scheduler (systemd timers)**
- New: `server/src/services/scheduler.ts`
- Cron syntax: `0 9 * * *` = run daily at 9am
- Event triggers: webhook, agent completion, signal
- Source: AutoGPT continuous triggers, CrewAI Flow scheduling

### Phase 5 — Observability + Package Manager

**5a: Trace/Telemetry System (kernel log)**
- New: `server/src/services/tracing.ts` + `traces` / `spans` tables
- Span types: `agent_span`, `tool_span`, `llm_span`, `handoff_span`
- Zero-config: auto-traced for all agent operations
- Source: OpenAI SDK tracing (TraceProvider, Span, BatchProcessor)

**5b: Agent Process Tree Dashboard (top/htop)**
- New: `src/pages/ProcessExplorer.tsx`
- Live view: agent tree, resource usage, status, logs
- Controls: pause, resume, kill, attach to log stream
- Source: AutoGen Studio, CrewAI AMP

**5c: Plugin Marketplace + Registry (apt/yum)**
- Enhance: `src/pages/Plugins.tsx`
- Catalog browser with search, categories, install counts
- One-click install from registry
- Source: AutoGPT Marketplace, Eliza plugin system

**5d: Pipeline YAML Serialization (config persistence)**
- New: `server/src/services/pipeline-io.ts`
- Export/import pipeline graphs as YAML
- Source: Haystack Pipeline.to_dict() / from_dict()

### Phase 6 — Advanced Composition

**6a: Multi-Agent DAG via StateGraph (subgraphs)**
- Compose agents hierarchically (one agent calls another as tool)
- Subgraph isolation + shared state passing
- Source: LangGraph subgraph composition, OpenAI SDK AgentTool

**6b: Guardrails + Content Filters**
- Input guardrails (block bad input before agent)
- Output guardrails (validate/sanitize agent output)
- Tool guardrails (validate before/after tool calls)
- Source: OpenAI SDK InputGuardrail, OutputGuardrail

**6c: Visual Pipeline Builder (no-code agent assembly)**
- New: `src/pages/PipelineBuilder.tsx`
- Drag-and-drop block composition (React Flow)
- Source: AutoGen Studio Team Builder, AutoGPT Block system

---

## Competitor Feature Matrix

| Feature | Eliza | Composio | CrewAI | LangGraph | OpenAI SDK | AutoGen | AutoGPT | Haystack | **OS V3 Plan** |
|---|---|---|---|---|---|---|---|---|---|
| YAML agent config | character.json | — | agents.yaml | — | — | — | — | — | ✅ Phase 2a |
| Plugin registry | ✅ | — | — | — | — | — | ✅ | — | ✅ Phase 5c |
| Action interface | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | ✅ Phase 2b |
| Tool auth hub | — | ✅ | — | — | — | — | — | — | ✅ Phase 3a |
| Memory system | ✅ | — | ✅ | ✅ | — | ✅ | — | — | ✅ Phase 4b |
| State checkpointer | — | — | — | ✅ | — | — | — | — | ✅ Phase 4a |
| Agent lifecycle hooks | ✅ | — | ✅ | — | ✅ | — | — | — | ✅ Phase 2d |
| IPC/pub-sub | — | — | — | — | — | ✅ | — | — | ✅ Phase 3b |
| MCP support | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | — | ✅ Phase 3c |
| Multi-provider LLM | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ Already built |
| Pipeline serialization | — | — | — | — | — | — | — | ✅ | ✅ Phase 5d |
| Trace/observability | — | ✅ | ✅ | — | ✅ | ✅ | — | — | ✅ Phase 5a |
| Agent handoff | — | — | — | — | ✅ | — | — | — | ✅ Phase 6a |
| Guardrails | — | — | ✅ | — | ✅ | — | — | — | ✅ Phase 6b |
| Visual builder | — | — | ✅ | ✅ | — | ✅ | ✅ | — | ✅ Phase 6c |
| Marketplace | — | — | — | — | — | ✅ | ✅ | — | ✅ Phase 5c |
| Code execution | — | — | ✅ | — | ✅ | ✅ | ✅ | — | ✅ Phase 2a (allow_code_exec) |
| Rate limiting | — | ✅ | ✅ | — | — | — | — | — | ✅ Phase 4c |
| Scheduling | — | — | ✅ | — | — | — | ✅ | — | ✅ Phase 4d |

---

## Key Design Principles

1. **CLI-agnostic**: Every API endpoint, config file, and service works identically whether the client is Claude Code, OpenCode, OpenClaude, curl, or any HTTP client. The OS doesn't care which shell you use.

2. **Declarative over imperative**: Agent configs are YAML files, not code. An agent declared in `.agent.yaml` can be spawned by any CLI.

3. **All state is inspectable**: `/api/v3/agents/{id}/state` returns full agent state at any point. Checkpoints enable time-travel debugging.

4. **Composable by default**: Every agent can be a tool for another agent. Every pipeline step can be inspected independently.

5. **Secure by default**: OAuth tokens encrypted at rest, audit hash chain immutable, tool calls gated by validate() checks.

6. **Minimal core, swappable drivers**: The kernel is ~10 services. Everything else (tools, models, memory backends) is a pluggable driver.

---

## Current Progress

### Done
- Phase 1: Boot sequence, audit (153/153 tests), CI fix, Ed25519 fix, migration cleanup, 29 V3 routes

### In Progress
- None — awaiting implementation start

### Next Up
- Phase 2a: YAML agent manifest parser
- Phase 2b: Action Registry refactor
- Phase 2c: Agent lifecycle API
- Phase 2d: Signal/event hooks

---

## Architecture Files

All integration targets are in the existing codebase:

| File | Purpose | Phase |
|---|---|---|
| `server/src/services/agent-runtime.ts` | Action Registry refactor target | 2b |
| `server/src/routes/v3-upgrade.ts` | New lifecycle routes | 2c |
| `server/src/db/schema.ts` | New tables (tool_connections, toolkits, etc.) | 3a |
| `server/src/services/federated-recall.ts` | Enhancements | 4b |
| `src/pages/Plugins.tsx` | Marketplace UI upgrade | 5c |
| `server/.env` | Config (NEXUS_LOG_LEVEL) | — |
| `.github/workflows/ci.yml` | CI pipeline | ✅ Fixed |

Nexus — never just an agent, always the kernel.
