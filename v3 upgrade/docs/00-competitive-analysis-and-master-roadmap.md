# NEXUS V3 — Competitive Analysis & Master Roadmap
## Zero-Guessing. Every Decision Researched. Every Feature Sourced from Market Leaders.

> **Core mission:** Build the most stable, fastest, and most feature-complete AI Agent Operating System on the market. Every feature below already exists in at least one competitor. We are not innovating — we are **consolidating** the best of every platform into one unified experience.

---

## PART 0: SPECIFICATION DOCUMENTS INDEX

This roadmap is supported by four companion specification documents. **Every AI executing tasks MUST read the relevant spec document before starting work.**

| # | Document | Purpose |
|---|---|---|
| **19** | `19-phase-0-execution-plan.md` | Ultra-detailed Phase 0 — every command, every file, every recovery procedure |
| **20** | `20-database-schema-specification.md` | Complete Drizzle schema — all 19 tables, columns, indexes, relationships |
| **21** | `21-api-route-specification.md` | Complete API contract — all routes, methods, types, auth, error codes |
| **22** | `22-dependency-graph-and-test-plan.md` | Task dependency graph, test specs per phase, CI config, benchmark targets |

**Execution rule:** Before touching any code for a task, read the corresponding phase section in this roadmap + the relevant spec document.

---

## PART 1: COMPETITIVE LANDSCAPE (30+ Platforms Analyzed)

### Tier 1: Direct Competitors (Multi-Agent Orchestration Platforms)

| Platform | GitHub Stars | Language | Core Paradigm | Key Features We Must Match |
|---|---|---|---|---|
| **LangChain / LangGraph** | 100K+ | Python/JS | Graph-based state machines | LangSmith observability, LangServe deployment, graph orchestration, human-in-the-loop, checkpointing |
| **CrewAI** | 52K+ | Python | Role-based agent crews | Role-based agents, hierarchical process, manager agent auto-generation, visual designer, A2A support |
| **AutoGen / Microsoft Agent Framework** | 50K+ | Python/.NET | Multi-agent conversation | Group chat, debate patterns, handoff orchestration, checkpointing, MCP + A2A support |
| **AutoGPT** | 165K+ | Python | Autonomous task decomposition | Multi-step reasoning, plugin ecosystem, memory (vector DB), internet browsing, code execution |
| **OpenAI Agents SDK** | 30K+ | Python | Lightweight primitives | Handoffs, guardrails, agent-as-tool concept, tracing |
| **Google ADK** | 20K+ | Python/Go/Java/TS | Cross-language agents | A2A protocol (Linux Foundation), multi-lingual SDK, Agent Studio, service registry |

### Tier 2: Visual Workflow & Low-Code Platforms

| Platform | Primary Use | Key Features We Must Match |
|---|---|---|
| **Dify** | LLM app builder | Visual prompt engineering, built-in RAG engine, hybrid search, re-ranking, knowledge base management, team collaboration, published API, embed widget |
| **n8n** | Workflow automation | 400+ integrations, pin-output debugging, cron scheduling, webhook triggers, retry policies, error handling |
| **Flowise** | LangChain visual builder | Drag-drop nodes, LangChain native, multi-agent flows, API deployment, playground |
| **PraisonAI** | Multi-agent YAML config | YAML-defined agents, 140+ built-in tools, Telegram/Discord/Slack/WhatsApp connectors, 13-page dashboard, cron jobs, guardrails |
| **Langflow** | Visual DAG builder | Drag-drop workflows, Python code export, DataStax managed cloud, LangSmith integration |
| **Coze** | Bot building | Plugin marketplace, knowledge base, workflow builder, published API |

### Tier 3: AI Software Engineers (Coding Agents)

| Platform | Key Differentiators |
|---|---|
| **Devin** | IDE integration, PR review, visual QA, fine-tuning capability, browser/desktop use |
| **OpenHands (OpenDevin)** | 75K+ stars, Docker sandbox, MIT license, CLI + GUI + Python SDK + Cloud tiers |
| **Devika** | Planning-breakdown, research-code-debug cycle, project-based organization, web browsing |

### Tier 4: Agent Memory Infrastructure

| Platform | Approach | Key Features We Must Match |
|---|---|---|
| **Mem0** | Fact extraction | 14M+ downloads, 3-line integration, fact extraction + forgetting, used by CrewAI/Flowise natively |
| **Letta (MemGPT)** | OS-style tiering | Core/Recall/Archival memory, agent self-manages memory, tool-based editing, sleep-time compute |
| **Zep** | Temporal knowledge graphs | Time-anchored memory, Graphiti library, open-domain temporal queries |
| **LangMem** | LangChain native | Semantic + episodic + procedural memory, LangGraph integration |

### Tier 5: Enterprise & Governance Platforms

| Platform | Key Differentiators |
|---|---|
| **Vertex AI Agent Platform** | 200+ foundation models, Agent Identity (granular permissions), Agent Gateway, Model Armor |
| **Microsoft Agent Framework** | SOC 2, HIPAA, session-based state management, middleware, telemetry |
| **SmythOS** | Constrained alignment, IP control, data lakes, staging/production domains |

---

## PART 2: COMPLETE FEATURE REQUIREMENT (Every Feature from Every Competitor)

### 1. Agent Architecture & Core Engine

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 1.1 | **Role-based agent system** — agents have role, goal, backstory, tools | CrewAI | P0 | Medium |
| 1.2 | **Graph-based workflow orchestration** — DAG with conditional edges, branching, parallel execution | LangGraph, ADK | P0 | High |
| 1.3 | **Sequential workflow** — agents execute one after another in order | CrewAI | P0 | Low |
| 1.4 | **Hierarchical workflow** — manager agent auto-created to delegate tasks | CrewAI | P0 | Medium |
| 1.5 | **Handoff orchestration** — agent A passes control to agent B based on context | OpenAI SDK, MS Agent | P0 | Medium |
| 1.6 | **Group chat** — orchestrator decides who speaks next, agents build on responses | AutoGen, MS Agent | P1 | High |
| 1.7 | **Debate/consensus patterns** — agents argue positions then converge | AutoGen | P1 | High |
| 1.8 | **Blackboard architecture** — shared state space agents read/write to | Multiple | P1 | Medium |
| 1.9 | **Swarm patterns** — agents discover each other, form ephemeral teams | OpenAI Swarm, ADK | P2 | High |
| 1.10 | **Long-running agents** — hours/days of execution with checkpointing | LangGraph, MS Agent | P0 | High |

### 2. Multi-LLM Provider Support

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 2.1 | **Provider abstraction** — unified interface across all LLMs | LangChain, LiteLLM | P0 | Medium |
| 2.2 | **Intelligent model routing** — route based on task complexity, cost, latency | Requesty, OpenRouter | P0 | High |
| 2.3 | **Automatic failover** — secondary model if primary fails/timeout | Requesty | P0 | Medium |
| 2.4 | **Cost tracking per agent/per model** — real-time token/cost dashboard | LangSmith, Requesty | P0 | Medium |
| 2.5 | **Budget enforcement** — max spend per agent/session/day | Custom | P0 | Low |
| 2.6 | **Multi-provider support** — OpenAI, Anthropic, Google, Ollama, Groq, DeepSeek, Together, Azure, AWS Bedrock, Mistral, Cohere | All | P0 | High |
| 2.7 | **Open-source model support** — run local models via Ollama/vLLM | AutoGPT, ADK | P1 | Medium |

### 3. Memory System (4 Types)

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 3.1 | **Working memory** — current session context window | All | P0 | Low |
| 3.2 | **Episodic memory** — specific past events, conversations, timestamps | Mem0, Letta, Zep | P0 | High |
| 3.3 | **Semantic memory** — extracted facts, preferences, knowledge | Mem0, LangMem | P0 | High |
| 3.4 | **Procedural memory** — agent's learned behaviors, instructions | LangMem | P1 | High |
| 3.5 | **OS-style tiering** — core (always in context) + recall + archival | Letta/MemGPT | P0 | High |
| 3.6 | **Forgetting policy** — automatically expire/consolidate old memories | Mem0 | P1 | Medium |
| 3.7 | **Vector store backend** — Pinecone, Qdrant, Chroma, Weaviate | All | P0 | Medium |
| 3.8 | **Memory graph** — entity-relationship knowledge graph | Zep | P2 | High |
| 3.9 | **Message compression/summarization** — condense history to save tokens | Mem0, Letta | P1 | Medium |
| 3.10 | **Cross-session persistence** — memory spans days/weeks of conversations | All memory platforms | P0 | High |

### 4. RAG & Knowledge Base

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 4.1 | **Built-in RAG engine** — ingest documents, chunk, embed, retrieve | Dify, Flowise | P0 | High |
| 4.2 | **Hybrid search** — keyword + vector + semantic re-ranking | Dify | P0 | High |
| 4.3 | **Multiple document formats** — PDF, DOCX, TXT, HTML, Markdown, CSV, images (OCR) | Dify, RAGFlow | P0 | Medium |
| 4.4 | **Knowledge base management UI** — upload, categorize, update, delete | Dify, Coze | P0 | Medium |
| 4.5 | **Automatic knowledge refresh** — re-index on schedule or webhook | Dify | P1 | Medium |
| 4.6 | **Web crawling** — scrape websites into knowledge base | Dify, n8n | P1 | Medium |
| 4.7 | **Multi-knowledge-base routing** — choose KB based on query | Dify, RAGFlow | P1 | High |

### 5. Plugin & Developer Ecosystem

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 5.1 | **Plugin SDK** — write plugins with manifest, hooks, skills | AutoGPT, Dify | P0 | High |
| 5.2 | **Plugin marketplace** — search, install, rate, review | SuperAGI, Coze | P1 | High |
| 5.3 | **Plugin sandbox** — isolated execution, permission system | OpenHands Docker | P0 | High |
| 5.4 | **Plugin store (persistence per plugin)** | AutoGPT | P1 | Medium |
| 5.5 | **Plugin hot-reload** — load/unload without restart | Custom | P1 | Medium |
| 5.6 | **100+ built-in tools** — web search, file ops, code exec, email, DB | PraisonAI (140+), n8n (400+) | P0 | High |
| 5.7 | **OpenAPI tool integration** — import any REST API as a tool | ADK, MS Agent | P0 | Low |
| 5.8 | **MCP protocol support** — Model Context Protocol tool server | MS Agent, ADK, LangChain | P0 | Medium |
| 5.9 | **Custom tool builder** — UI to define tools without code | Dify, Flowise | P2 | High |

### 6. Visual Workflow Builder

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 6.1 | **Drag-and-drop DAG canvas** | Langflow, Flowise, Dify | P1 | High |
| 6.2 | **Node palette** — pre-built agent, tool, LLM, memory, RAG nodes | Langflow, n8n | P1 | High |
| 6.3 | **Real-time execution visualization** — see each node execute live | n8n | P1 | High |
| 6.4 | **Pin output debugging** — freeze output at any node for testing | n8n | P1 | Medium |
| 6.5 | **Export as code** — convert visual flow to Python/TypeScript | Langflow | P2 | Medium |
| 6.6 | **JSON/YAML flow definition** — define flows as config files | PraisonAI, n8n | P0 | Low |

### 7. Agent Collaboration & Communication

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 7.1 | **Within-instance agent-to-agent messaging** | CrewAI, AutoGen | P0 | Medium |
| 7.2 | **Cross-instance agent communication (federated)** — NEXUS-to-NEXUS | OpenAgents, A2A | P2 | High |
| 7.3 | **A2A protocol** — Agent-to-Agent standard (Linux Foundation) | ADK, MS Agent | P1 | High |
| 7.4 | **Human-in-the-loop** — agent pauses, asks human, resumes | LangGraph, MS Agent | P0 | Medium |
| 7.5 | **Human approval gates** — require approval before destructive actions | n8n, LangGraph | P0 | Medium |
| 7.6 | **Shared task queue** — agents pick up work from shared queue | AutoGen | P1 | Medium |
| 7.7 | **Delegation** — agent sends subtask to another agent | CrewAI, OpenAI SDK | P0 | Medium |

### 8. Observability & Debugging

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 8.1 | **Full tracing** — trace every LLM call, tool call, agent decision | LangSmith | P0 | High |
| 8.2 | **Token & cost dashboard** — real-time usage per agent/session/user | LangSmith, Requesty | P0 | Medium |
| 8.3 | **Agent run timeline** — step-by-step replay of any agent run | LangSmith | P1 | High |
| 8.4 | **Audit log** — every action is logged with timestamp, actor, payload | Dify, SmythOS | P0 | Low |
| 8.5 | **Alerting** — threshold alerts on cost, errors, latency | Custom | P1 | Medium |
| 8.6 | **Debug mode** — step-through agent execution with variable inspection | Custom | P1 | High |

### 9. Deployment & Infrastructure

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 9.1 | **CLI** — full control via terminal commands | All | P0 | Medium |
| 9.2 | **REST API** — every operation available via HTTP | Dify, Flowise | P0 | Medium |
| 9.3 | **Python SDK** — import and use NEXUS from Python | PraisonAI, CrewAI | P0 | High |
| 9.4 | **Docker deployment** — one-command docker-compose | All | P0 | Low |
| 9.5 | **SaaS/cloud deployment** — managed hosting option | Dify, n8n, Flowise | P1 | High |
| 9.6 | **Scheduled/cron agents** — run agents on a timer | n8n, PraisonAI | P0 | Medium |
| 9.7 | **Webhook triggers** — agent activates on external event | n8n | P0 | Medium |

### 10. UI & User Experience

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 10.1 | **Chat interface** — talk to agents individually | All | P0 | Medium |
| 10.2 | **Dashboard** — overview of agents, memory, tools, runs | Dify, PraisonAI | P0 | High |
| 10.3 | **13+ dashboard pages** — Chat, Agents, Memory, Knowledge, Channels, Guardrails, Cron, Logs, Settings, Team, Billing, API, Plugins | PraisonAI | P1 | High |
| 10.4 | **Agent detail view** — agent config, logs, memory, skills | Dify | P0 | Medium |
| 10.5 | **Embeddable chat widget** — embed agent on any website | Dify, Coze | P1 | Medium |
| 10.6 | **Real-time streaming** — SSE/WebSocket for live agent responses | All | P0 | Medium |
| 10.7 | **Multi-user / team** — invite members, role-based access | Dify | P1 | High |

### 11. External Integrations & Developer Tools

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 11.1 | **Slack integration** — post/receive messages | n8n, PraisonAI | P1 | Medium |
| 11.2 | **Discord integration** — agent in Discord channels | PraisonAI | P1 | Medium |
| 11.3 | **Telegram integration** — agent responds in Telegram | PraisonAI | P1 | Medium |
| 11.4 | **WhatsApp integration** — agent conversations on WhatsApp | PraisonAI | P2 | Medium |
| 11.5 | **Email integration** — send/receive emails | n8n | P1 | Medium |
| 11.6 | **GitHub integration** — issues, PRs, code search | AutoGPT, Devin | P1 | Medium |
| 11.7 | **Google Drive/Calendar/Gmail** | n8n | P2 | Medium |
| 11.8 | **400+ connector library** — match n8n's breadth | n8n | P2 | Very High |
| 11.9 | **Web search (Tavily/SerpAPI)** | AutoGPT, PraisonAI | P0 | Low |

### 12. Security & Governance

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 12.1 | **API key authentication** | All | P0 | Low |
| 12.2 | **Permission system** — granular scopes per agent/user | Vertex AI Agent Platform | P0 | High |
| 12.3 | **Guardrails** — content filtering, input/output validation | OpenAI SDK, Nvidia NeMo | P0 | High |
| 12.4 | **Audit trail** — immutable log of all actions | SmythOS, Dify | P0 | Low |
| 12.5 | **Docker sandbox** — agents execute in isolated containers | OpenHands, Devin | P0 | High |
| 12.6 | **Rate limiting** — prevent runaway agent loops | Custom | P0 | Low |
| 12.7 | **Secrets management** — encrypted storage for API keys | n8n, Dify | P0 | Medium |

### 13. Self-Improvement & Learning

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 13.1 | **Agent learns from feedback** — improves behavior over time | AutoGPT, Mem0 | P1 | High |
| 13.2 | **Automatic prompt optimization** — refines prompts based on success | Custom | P2 | High |
| 13.3 | **Tool-use learning** — agent discovers and adds new tools | AutoGPT | P2 | High |

### 14. Voice & Multimodal

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 14.1 | **Voice input (STT)** — speech-to-text for agent interaction | OpenAI Realtime | P2 | High |
| 14.2 | **Voice output (TTS)** — text-to-speech with voice personas | OpenAI Realtime | P2 | High |
| 14.3 | **Image understanding** — agents process images | AutoGPT (multi-modal) | P1 | Medium |
| 14.4 | **Real-time voice conversation** — low-latency speech pipeline | OpenAI Realtime API | P2 | Very High |

### 15. Code Intelligence & Analysis

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|---|
| 15.1 | **Context Engine** — semantic code graph mapping what calls what, active/deprecated status, cross-service deps | Augment Code | P1 | High |
| 15.2 | **Microservices blast radius analysis** — dependency graph showing every downstream service a PR touches | Augment Code | P2 | Very High |
| 15.3 | **Change Stack PR review** — reorganize flat file diffs into logical cohorts/layers with per-range AI summaries + Mermaid diagrams | CodeRabbit | P1 | High |
| 15.4 | **Learn from human review feedback** — natural language feedback trains future reviews per-repo | CodeRabbit | P1 | Medium |
| 15.5 | **CI/CD pipeline analysis** — read build/test/lint failures, post inline fix suggestions on offending lines | CodeRabbit | P1 | High |
| 15.6 | **Pre-merge quality gates** — natural language defined conditions that block merges | CodeRabbit | P1 | Medium |
| 15.7 | **IDE inline reviews** — review staged/unstaged commits inside VS Code/Cursor before PR | CodeRabbit | P2 | High |
| 15.8 | **Stacked PR support** — review chains of dependent PRs with dependency-aware merge queue | Graphite | P1 | High |
| 15.9 | **Merge queue with bisection** — parallel CI for stacks, auto-bisect to find failing PR, evict only failing + dependents | Graphite | P2 | Very High |
| 15.10 | **Review workload balance** — who reviews most, who waits longest, surface bottlenecks | Graphite | P1 | Medium |
| 15.11 | **Doc Health Scorecard** — per-repo doc health (0-100%) updated on every merge | Swimm | P1 | Medium |
| 15.12 | **Auto-sync documentation** — detect staleness via histogram algorithm, auto-update code-coupled docs | Swimm | P1 | High |
| 15.13 | **Swimm Verify CI check** — non-zero exit if docs stale, can auto-approve doc fixes to PR branch | Swimm | P2 | Medium |

### 16. Advanced Orchestration & Enterprise

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|---|
| 16.1 | **Missions** — multi-day autonomous project orchestration, dispatches parallel worker sessions, validates milestones, does computer-use QA | Factory.ai | P2 | Very High |
| 16.2 | **Software Factory** — 24/7 autonomous SDLC pipeline (Triage → Code-gen → Validate → Release → Document → Monitor) | Factory.ai | P2 | Very High |
| 16.3 | **Droid Exec** — non-interactive headless execution in CI/CD pipelines with fine-grained permissions | Factory.ai | P2 | High |
| 16.4 | **Agent Readiness Score** — measure repo maturity toward autonomy, track progress | Factory.ai | P2 | Medium |
| 16.5 | **Sprint risk analysis** — AI scans sprint, identifies at-risk issues, blockers, recommended actions | SuperNinja | P1 | Medium |
| 16.6 | **Retro data packages** — velocity, estimation accuracy, cycle time distribution, blocker frequency auto-generated | SuperNinja | P1 | Medium |
| 16.7 | **SRE Agent** — virtual responder added to on-call schedules, auto-triggers triage via Incident Workflows | PagerDuty AI | P2 | High |
| 16.8 | **Workflow intelligence** — recommends which runbook to run based on incident context | PagerDuty AI | P2 | High |
| 16.9 | **Linear Agent** — workspace participant assignable to issues, writes specs, drafts changelogs, closes tickets | Linear AI | P1 | High |
| 16.10 | **Triage Intelligence** — LLM auto-suggestion of teams, projects, assignees based on history; semantic duplicate detection | Linear AI | P1 | Medium |
| 16.11 | **Skills System** — save repeatable workflows as slash-invokable or auto-triggered skills | Linear AI | P1 | Medium |
| 16.12 | **Coding Sessions** — Linear Agent writes code using Claude Code/Codex, ~30% bug auto-fix rate | Linear AI | P2 | Very High |
| 16.13 | **Renovate Dependency Dashboard** — single issue summarizing all pending updates with approval workflow | Renovate | P2 | Medium |
| 16.14 | **Renovate intelligent grouping** — cross-ecosystem groups (npm + Docker) in one PR via packageRules | Renovate | P2 | Medium |
| 16.15 | **Agent Identity (SPIFFE)** — every agent gets unique cryptographic identity with auto-provisioned x509 certs | Vertex AI | P2 | Very High |
| 16.16 | **Multi-environment deployment** — staging/prod/local/enterprise domains with versioned restores | SmythOS | P1 | High |
| 16.17 | **Log redaction** — regex-based PII masking in audit logs | SmythOS | P2 | Medium |

### 17. Agent Marketplace

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 15.1 | **Marketplace of pre-built agents** | SuperAGI, Coze | P2 | High |
| 15.2 | **Template library** — starting templates for common use cases | Dify, n8n | P1 | Medium |
| 15.3 | **Share/export agent configurations** | Dify, PraisonAI | P1 | Low |

### 18. Mobile

| # | Feature | Source Competitors | Priority | Difficulty |
|---|---|---|---|---|
| 16.1 | **Responsive web app** — works on mobile browsers | All | P1 | Medium |
| 16.2 | **Push notifications** — agent alerts on mobile | Custom | P2 | Medium |
| 16.3 | **Mobile app** — native iOS/Android agent experience | None of the OSS competitors have this | P3 | Very High |

---

## PART 3: PHASED ROADMAP (17 Phases, No Guessing)

### Phase 0: Foundation Audit & Stability (Weeks 1-2)
**Goal:** Understand exactly what exists, what works, what's broken.

| Task | Deliverable | Owner |
|---|---|---|
| 0.1 | Compile server/src/ (8,700 lines) — list every file, module, table, route | Discovery doc |
| 0.2 | Compile frontend src/ (4,000 lines) — list every component, API call, hook | Discovery doc |
| 0.3 | Try to compile server — fix all TypeScript/build errors | Working server build |
| 0.4 | Try to start server — fix all runtime errors | Running server |
| 0.5 | Try npm run dev — fix all frontend errors | Running frontend |
| 0.6 | Map all API routes — compare frontend calls vs actual server routes | Route coverage matrix |
| 0.7 | Document all DB tables — map Drizzle schema to actual DB | DB schema doc |
| 0.8 | Identify all broken/feature-flagged code — tag for Phase 1 | Issue list |

### Phase 1: Core Stabilization (Weeks 3-4)
**Goal:** Every existing feature works reliably. No crashes, no dead ends.

| Task | Feature Requirement # | Deliverable |
|---|---|---|
| 1.1 | Fix server compilation errors — strict tsconfig, path aliases, import resolution | Clean build |
| 1.2 | Fix DB initialization — Drizzle migrations, seed data, connection pooling | Working DB |
| 1.3 | Wire all 13 existing features — connect FE → BE → DB for each | Working features |
| 1.4 | Fix auth flow — login, session, JWT verification | Working auth |
| 1.5 | Add error boundaries on every frontend component — no white screens | Stable UI |
| 1.6 | Write basic integration tests for all API routes | 100+ passing tests |
| 1.7 | Implement proper logging — structured logs with Pino | Observability |

### Phase 2: Agent Engine Foundation (Weeks 5-7)
**Goal:** Core agent lifecycle works. Agents can think, act, observe, remember.

**Spec documents to read before starting:**
- `20-database-schema-specification.md` — Tables 14 (agents), 15 (agent_tasks)
- `21-api-route-specification.md` — Section 2 (Agent Routes)
- `22-dependency-graph-and-test-plan.md` — Phase 2 task ordering, test specs

#### Task 2.1: Agent Lifecycle Engine (Days 1-3)
**Files to modify:**
- `server/src/services/agent-runtime.ts` — Core agent loop (10,432 bytes existing)
- `server/src/services/brain.ts` — Agent reasoning (4,791 bytes existing)
- `server/src/db/schema.ts` — agents, agent_tasks tables (already exist)

**Implementation spec:**
```typescript
// The agent loop: THINK → ACT → OBSERVE → REPEAT
// Must handle: tool calls, errors, timeouts, token limits, human interruptions

interface AgentContext {
  agentId: string;
  taskId: string;
  input: Record<string, any>;
  messages: LLMMessage[];
  maxSteps: number;           // Default: 25
  currentStep: number;
  tokensUsed: { input: number; output: number };
  startTime: number;
  status: 'running' | 'awaiting_input' | 'completed' | 'failed' | 'timed_out';
}

// Core loop pseudocode:
async function runAgent(context: AgentContext): Promise<AgentResult> {
  while (context.currentStep < context.maxSteps && context.status === 'running') {
    // Check timeout
    if (Date.now() - context.startTime > MAX_EXECUTION_TIME_MS) {
      context.status = 'timed_out';
      break;
    }
    
    // THINK: Call LLM with current context
    const llmResponse = await callLLM(context.messages, context.agentConfig);
    
    // ACT: Parse response for tool calls
    if (llmResponse.toolCall) {
      const toolResult = await executeTool(llmResponse.toolCall);
      context.messages.push({ role: 'tool', content: toolResult });
      emitEvent('tool_call', { tool: llmResponse.toolCall.name, result: toolResult });
    } else if (llmResponse.content) {
      // OBSERVE: Agent has final answer
      context.status = 'completed';
      context.result = llmResponse.content;
      emitEvent('complete', { result: llmResponse.content });
    }
    
    context.currentStep++;
  }
  
  return { status: context.status, result: context.result, tokensUsed: context.tokensUsed };
}
```

**Error handling:**
- LLM timeout → retry with same provider (max 1), then failover to alternative provider
- Tool execution error → add error to message history, let agent decide next action (don't crash)
- Token limit reached → truncate oldest messages, continue
- Context.status === 'awaiting_input' → pause loop, emit SSE event, wait for human response via `continueTask()` endpoint
- Parse error on LLM response → retry LLM call with instruction "respond in valid JSON format"

**Tests (see `22-dependency-graph-and-test-plan.md` Phase 2 specs):**
1. Agent completes task successfully
2. Agent handles tool errors gracefully
3. Agent times out on long-running tasks
4. Agent pauses and resumes on human input
5. Agent stops at max steps

#### Task 2.2: Single-Agent Execution (Days 4-5)
**Files to modify:**
- `server/src/services/task-worker.ts` — Task queue processor (18,183 bytes existing)
- `server/src/routes/agents.ts` — Agent API routes (7,690 bytes existing)

**Implementation spec:**
```typescript
// Receive task → validate → create agent context → run → store result → return

async function handleTaskExecution(req: { agentId: string; input: any; stream?: boolean }): Promise<ExecutionResult> {
  // 1. Load agent configuration from DB (table: agents)
  const agentConfig = await db.select().from(agents).where(eq(agents.id, req.agentId)).limit(1);
  if (!agentConfig) throw new NotFoundError('Agent not found');
  
  // 2. Create task record in DB (table: agent_tasks)
  const task = await db.insert(agentTasks).values({
    agentId: req.agentId,
    input: req.input,
    status: 'pending',
  }).returning();
  
  // 3. Build initial messages array from system prompt + user input
  const messages = buildMessages(agentConfig.systemPrompt, req.input);
  
  // 4. Create agent context
  const context: AgentContext = {
    agentId: req.agentId,
    taskId: task.id,
    input: req.input,
    messages,
    maxSteps: 25,
    currentStep: 0,
    tokensUsed: { input: 0, output: 0 },
    startTime: Date.now(),
    status: 'running',
  };
  
  // 5. Execute (streaming or blocking)
  if (req.stream) {
    return runAgentStreaming(context); // Emits SSE events
  } else {
    const result = await runAgent(context);
    
    // 6. Update task record
    await db.update(agentTasks).set({
      status: result.status,
      output: result.result,
      completedAt: new Date(),
    }).where(eq(agentTasks.id, task.id));
    
    return result;
  }
}
```

**API route for this:**
- `POST /api/v1/agents/:id/run` — See `21-api-route-specification.md` Section 2 for full spec
- `GET /api/v1/events?token=JWT` — SSE stream for real-time agent output

#### Task 2.3: Sequential Multi-Agent (Day 6)
**Files to modify:**
- `server/src/services/agent-runtime.ts` — Add sequential execution mode
- `server/src/routes/agents.ts` — Add workflow execution endpoint

**Implementation spec:**
```typescript
// Agent A output → Agent B input → Agent C input

async function runSequential(agents: AgentConfig[], initialInput: any): Promise<SequentialResult> {
  let currentInput = initialInput;
  const steps: StepResult[] = [];
  
  for (const agent of agents) {
    const result = await runAgent({
      agentId: agent.id,
      input: currentInput,
      messages: buildMessages(agent.systemPrompt, currentInput),
      maxSteps: agent.maxSteps,
      // ...
    });
    
    steps.push({ agentId: agent.id, input: currentInput, output: result.result });
    currentInput = result.result; // Pass output to next agent
  }
  
  return { status: 'completed', steps, finalOutput: currentInput };
}
```

#### Task 2.4: Role-Based Agent Definition (Day 6)
**Files to modify:**
- `server/src/db/schema.ts` — agents table (already has role, goal, backstory columns)
- `server/src/routes/agents.ts` — CRUD routes for agents
- `src/pages/os/LiveAgents.tsx` — Agent creation UI (4,258 bytes)
- `src/lib/api.ts` — API client functions (16,734 bytes)

**Agent roles (built-in):**
| Role | Goal | Default Tools |
|---|---|---|
| `researcher` | Find and synthesize information | web_search, web_fetch, browser |
| `coder` | Write, review, and debug code | code_execution, file_ops, git |
| `reviewer` | Review code and provide feedback | code_review, diff_analysis |
| `planner` | Decompose tasks into steps | task_decomposition, dependency_mapping |
| `assistant` | General-purpose helper | all basic tools |

#### Task 2.5: Tool Execution System (Days 6-7)
**Files to create/modify:**
- `server/src/services/tools/` → NEW directory for tool implementations
- `server/src/services/tools/registry.ts` → Tool registry
- `server/src/services/tools/web-search.ts` → Web search tool
- `server/src/services/tools/code-exec.ts` → Code execution tool
- `server/src/services/tools/file-ops.ts` → File operations tool

**Tool interface:**
```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;    // Zod schema for input validation
  execute(input: any, context: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  agentId: string;
  taskId: string;
  workspacePath?: string;
  allowedPaths?: string[];
  networkAllowed: boolean;
}
```

**20 built-in tools to implement (P0):**
1. `web_search` — Search web via Tavily/SerpAPI/Brave
2. `web_fetch` — Fetch and extract content from URL
3. `code_execute` — Execute code in sandbox (js/ts/py/bash)
4. `file_read` — Read file contents
5. `file_write` — Write content to file
6. `file_list` — List directory contents
7. `git_diff` — Get git diff for changes
8. `git_log` — Get git history
9. `git_commit` — Create git commit
10. `memory_search` — Search agent memory
11. `memory_store` — Store in agent memory
12. `knowledge_search` — Search knowledge base
13. `knowledge_store` — Add to knowledge base
14. `llm_complete` — Call another LLM model
15. `http_request` — Make HTTP requests
16. `database_query` — Run DB queries (read-only)
17. `text_analyze` — Analyze text (sentiment, entities, etc.)
18. `json_transform` — Transform JSON data
19. `math_calculate` — Run calculations
20. `datetime` — Get current date/time, format dates

**Test spec for each tool:**
1. Happy path: correct input → correct output
2. Error path: invalid input → meaningful error
3. Permission check: restricted operation → permission denied
4. Timeout: long operation → timeout error

#### Task 2.6: Streaming Responses via SSE (Day 7)
**Files to modify:**
- `server/src/services/sse.ts` — SSE event emitter (1,613 bytes existing)
- `server/src/routes/sse.ts` — SSE route handler (2,922 bytes existing)
- `src/lib/sse-client.ts` — Frontend SSE client (3,322 bytes existing)

**See `21-api-route-specification.md` Section 11 for full SSE event format.**

#### Task 2.7: Basic Memory — Session Persistence (Day 7)
**Files to modify:**
- `server/src/services/recall.ts` — Memory storage/retrieval (12,349 bytes existing)
- `src/lib/recall.ts` — Frontend memory client (6,008 bytes)

**Memory operations for Phase 2 (minimal):**
```typescript
// Working memory = current session context (stored in task context, not DB)
// Session memory = conversation history persisted to DB

async function storeSessionMemory(agentId: string, sessionId: string, messages: LLMMessage[]) {
  // Store conversation as a single episodic memory entry
  await db.insert(memories).values({
    type: 'working',
    agentId,
    content: JSON.stringify(messages),
    metadata: { sessionId },
    importance: 5,
  });
}

async function loadSessionMemory(agentId: string, sessionId: string): Promise<LLMMessage[]> {
  const records = await db.select()
    .from(memories)
    .where(and(
      eq(memories.agentId, agentId),
      sql`${memories.metadata}->>'sessionId' = ${sessionId}`,
      eq(memories.type, 'working'),
      isNull(memories.deletedAt)
    ))
    .orderBy(desc(memories.createdAt))
    .limit(1);
  
  return records.length > 0 ? JSON.parse(records[0].content) : [];
}
```

#### Task 2.8: Agent Persistence (Day 7)
**Files to modify:**
- `server/src/services/agent-runtime.ts` — Save/load agent state

```typescript
// Agents persist across server restarts via DB:
// - Agent config in `agents` table
// - Pending tasks in `agent_tasks` table 
// - Task state in `state_snapshots` table (Phase 5)
// On server restart: reload all enabled agents, resume pending tasks
// On agent config change: hot-reload without restart

async function loadAllAgents(): Promise<AgentConfig[]> {
  return db.select().from(agents).where(and(
    eq(agents.enabled, true),
    isNull(agents.deletedAt)
  ));
}
```

### Phase 3: Multi-LLM Gateway & Cost Control (Weeks 8-9)
**Goal:** NEXUS works with any LLM. Costs are visible and controllable.

**Spec documents to read:** `21-api-route-specification.md` Section 13, `20-database-schema-specification.md` Table 8 (token_ledger)

#### Task 3.1: Provider Abstraction Layer (Days 1-2)
**Files to create/modify:**
- `server/src/services/llm.ts` — LLM interface (10,684 bytes existing)
- `server/src/services/llm-client.ts` — Client factory (4,032 bytes existing)
- `server/src/services/llm-router.ts` — Router (2,554 bytes existing)

**Interface:**
```typescript
interface LLMProvider {
  name: string;                               // 'openai' | 'anthropic' | 'google' | ...
  models: string[];                           // Available models
  defaultModel: string;
  
  complete(params: CompletionParams): Promise<CompletionResult>;
  stream?(params: CompletionParams): AsyncIterable<CompletionChunk>;
  embed?(params: EmbeddingParams): Promise<EmbeddingResult>;
}

interface CompletionParams {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  temperature?: number;      // 0-2
  maxTokens?: number;
  stop?: string[];
  tools?: ToolDef[];         // For tool-calling models
  stream?: boolean;
}

interface CompletionResult {
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, any> }>;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  provider: string;
  latencyMs: number;
}
```

#### Task 3.2-3.10: Provider Implementations
**Each provider file follows this pattern:**
```
server/src/services/providers/openai.ts
server/src/services/providers/anthropic.ts
server/src/services/providers/google.ts
server/src/services/providers/ollama.ts
server/src/services/providers/groq.ts
server/src/services/providers/deepseek.ts
server/src/services/providers/together.ts
server/src/services/providers/azure.ts
server/src/services/providers/bedrock.ts
```

**Each provider must handle:**
1. Authentication (API key from env vars / secrets manager)
2. Request formatting (convert NEXUS message format → provider format)
3. Response parsing (convert provider response → NEXUS format)
4. Error mapping (provider errors → NEXUS error codes)
5. Retry logic (exponential backoff for 429/503)
6. Token counting (accurately report input/output tokens)
7. Streaming support (SSE-compatible chunks)

**Env vars needed:**
```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=...
TOGETHER_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://...
AZURE_OPENAI_KEY=...
BEDROCK_ACCESS_KEY=...
BEDROCK_SECRET_KEY=...
```

#### Task 3.11: Model Routing (Day 6)
**File to create:** `server/src/services/model-router.ts`

**Routing logic:**
```typescript
// Route based on task type:
// - Simple Q&A → cheap/fast model (Groq Llama 70B, GPT-4o-mini)
// - Code generation → capable model (Claude Sonnet, GPT-4o)
// - Complex reasoning → best model (Claude Opus, o3)
// - Embedding → embedding model (text-embedding-3-small)
// - Images → multimodal model (GPT-4o, Claude Sonnet)

const ROUTING_TABLE = {
  chat: { provider: 'openai', model: 'gpt-4o-mini', maxTokens: 2048 },
  code: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', maxTokens: 8192 },
  reasoning: { provider: 'openai', model: 'o3-mini', maxTokens: 4096 },
  analysis: { provider: 'google', model: 'gemini-2.5-pro', maxTokens: 8192 },
  embedding: { provider: 'openai', model: 'text-embedding-3-small' },
  vision: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', maxTokens: 4096 },
};

function selectModel(task: TaskAnalysis): RouteConfig {
  const route = ROUTING_TABLE[task.type] || ROUTING_TABLE.chat;
  // Check budget: if over budget, downgrade model
  if (budgetManager.isOverBudget()) {
    return downgradeModel(route);
  }
  return route;
}
```

#### Task 3.12: Automatic Failover (Day 6)
```typescript
// If primary provider fails:
// 1. Wait 1 second → retry (for transient errors)
// 2. Wait 2 seconds → retry with different model on same provider
// 3. Wait 4 seconds → switch to alternative provider with equivalent model
// 4. After 3 fails → return error to agent, let agent decide

const FAILOVER_CHAIN: Record<string, string[]> = {
  'openai': ['anthropic', 'google', 'groq'],
  'anthropic': ['openai', 'google', 'together'],
  'google': ['anthropic', 'openai', 'groq'],
};
```

#### Task 3.13-3.15: Cost Tracking & Budget Enforcement (Days 7-9)
**Files to create/modify:**
- `server/src/lib/cost-tracker.ts` — NEW
- `server/src/db/schema.ts` — token_ledger table (already exists)
- `server/src/routes.ts` — Cost dashboard endpoint

**Cost tracking:**
```typescript
// Every LLM call records to token_ledger:
await db.insert(tokenLedger).values({
  projectId: context.projectId,
  agentId: context.agentId,
  model: result.model,
  provider: result.provider,
  inputTokens: result.usage.inputTokens,
  outputTokens: result.usage.outputTokens,
  costUsd: calculateCost(result.provider, result.model, result.usage),
  durationMs: result.latencyMs,
});
```

**Pricing table (hardcoded, updated monthly):**
```typescript
const PRICING: Record<string, { inputPer1K: number; outputPer1K: number }> = {
  'openai:gpt-4o': { inputPer1K: 0.0025, outputPer1K: 0.01 },
  'openai:gpt-4o-mini': { inputPer1K: 0.00015, outputPer1K: 0.0006 },
  'anthropic:claude-sonnet-4-20250514': { inputPer1K: 0.003, outputPer1K: 0.015 },
  // ... etc
};
```

**Budget enforcement:**
```typescript
// Per-agent budget: max $X per day/week/month
// If exceeded → downgrade model, slow down requests, or block execution
if (await budgetManager.isOverBudget(agentId, 'daily')) {
  throw new BudgetExceededError('Daily budget exceeded for this agent');
}
```

### Phase 4: Memory & RAG System (Weeks 10-12)
**Goal:** Agents remember everything. Knowledge bases are first-class citizens.

**Spec docs:** `20-database-schema-specification.md` Tables 1 (memories), 4 (notes); `21-api-route-specification.md` Sections 3 (Memory), 4 (Knowledge)

#### Task 4.1-4.3: Three-Tier Memory Architecture (Days 1-4)
**Files to modify:**
- `server/src/services/recall.ts` — Memory orchestrator (12,349 bytes existing)
- `server/src/lib/recall.ts` — Frontend memory client (6,008 bytes existing)

```typescript
// Three memory tiers:
// 1. CORE (always in context): System prompt, agent identity, current task, critical preferences
// 2. RECALL (relevant retrieved): Episodic + semantic memories retrieved via similarity search
// 3. ARCHIVAL (full history): All past conversations, compressed + summarized

// Memory retrieval:
async function recall(context: RecallContext): Promise<RecallResult> {
  // 1. Get core memories (always included)
  const coreMemories = await this.getCoreMemories(context.agentId);
  
  // 2. Semantic search for relevant recall memories
  const recallMemories = await this.semanticSearch({
    query: context.currentQuery,
    agentId: context.agentId,
    limit: 20,
    minScore: 0.7,
    types: ['episodic', 'semantic']
  });
  
  // 3. Compress archival memories into summaries
  const archivalSummary = context.needsArchival 
    ? await this.summarizeArchival(context.agentId, context.timeRange)
    : null;
  
  return { core: coreMemories, recall: recallMemories, archival: archivalSummary };
}
```

#### Task 4.4-4.7: Vector Store + RAG Pipeline (Days 5-7)
**Files to create/modify:**
- `server/src/services/embeddings.ts` — Embedding service (7,336 bytes existing)
- `server/src/services/rag.ts` — NEW: RAG pipeline
- `server/src/services/document-parser.ts` — NEW: Document chunking/parsing

**Document ingestion pipeline:**
```
Upload PDF/DOCX/TXT/MD/HTML/CSV
  → Parse text content (pdf-parse, mammoth for DOCX)
  → Chunk by: tokens (512), sentences (10), paragraphs (5), or markdown headers
  → Generate embedding for each chunk (OpenAI/Google/Ollama embedding model)
  → Store in memories table with metadata (source file, page, chunk index)
  → Index with HNSW for fast similarity search
```

**Hybrid search:**
```sql
-- Combined keyword + vector search with re-ranking:
SELECT id, content, 
  ts_rank(to_tsvector('english', content), plainto_tsquery('english', $query)) AS text_score,
  1 - (embedding <=> $query_embedding) AS vector_score,
  (0.3 * ts_rank(...) + 0.7 * (1 - embedding <=> ...)) AS combined_score
FROM memories
WHERE type = 'semantic'
  AND (to_tsvector('english', content) @@ plainto_tsquery('english', $query)
       OR embedding IS NOT NULL)
ORDER BY combined_score DESC
LIMIT 10;
```

#### Task 4.8-4.10: KB UI, Cross-Session, Consolidation (Days 7-9)
**Knowledge Base UI:** Upload documents via drag-drop or file picker, view chunked content, search across KBs, see source attribution in agent responses.

**Cross-session persistence:** Every session's memories tagged with `agentId` + `projectId`. When agent runs in new session, previous sessions' memories are automatically retrieved.

**Memory consolidation (cron job, runs daily):**
1. Find memories older than 7 days with importance < 3
2. Group by topic/entity
3. Generate summary for each group: "User asked about auth 5 times → common concern: JWT token expiry"
4. Delete individual low-importance memories
5. Store the summary as a new semantic memory with importance = 6
6. Estimated: saves 60%+ of storage while preserving useful signal

### Phase 5: Orchestration & Collaboration (Weeks 13-15)
**Goal:** Complex multi-agent workflows. Agents collaborate like teams.

**Spec documents:** `21-api-route-specification.md` Section 6 (Workflow Routes), `20-database-schema-specification.md` Table 18 (state_snapshots)

#### Task 5.1: Graph Orchestration Engine (Days 1-5)
**Files to create:**
- `server/src/services/workflow-engine.ts` — NEW (core DAG executor)
- `server/src/services/workflow-types.ts` — NEW (type definitions)
- `server/src/routes/workflows.ts` — NEW (CRUD routes)
- `server/src/db/schema.ts` — Add workflows table if not present

**Workflow data model:**
```typescript
interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  config: { maxRetries?: number; timeout?: number; };
  createdAt: string;
}

interface WorkflowNode {
  id: string;                    // Unique node ID
  type: 'agent' | 'tool' | 'condition' | 'parallel' | 'transform' | 'human_input' | 'subworkflow';
  label: string;
  config: {
    agentId?: string;            // For agent nodes
    toolName?: string;           // For tool nodes
    condition?: string;          // JS expression for condition nodes
    input?: Record<string, any>; // Static input or template
    transform?: string;          // JSONata/JS expression for transform nodes
    timeout?: number;
    retries?: number;
  };
  position?: { x: number; y: number }; // For visual editor
}

interface WorkflowEdge {
  id: string;
  source: string;                // Source node ID
  target: string;                // Target node ID
  label?: string;                // 'true' / 'false' for condition branches
  condition?: string;            // Optional condition expression
}
```

**DAG Executor (core):**
```typescript
class WorkflowEngine {
  async execute(workflow: WorkflowDef, input: any, context: ExecutionContext): Promise<ExecutionResult> {
    const dag = this.buildDAG(workflow);     // Topological sort
    const results = new Map<string, any>();
    
    for (const nodeId of dag.executionOrder) {
      const node = workflow.nodes.find(n => n.id === nodeId)!;
      const nodeInputs = this.resolveInputs(node, input, results);
      
      // Execute based on node type
      switch (node.type) {
        case 'agent':
          results.set(nodeId, await this.executeAgent(node, nodeInputs, context));
          break;
        case 'tool':
          results.set(nodeId, await this.executeTool(node, nodeInputs, context));
          break;
        case 'condition': {
          const conditionResult = evaluateCondition(node.config.condition!, nodeInputs);
          results.set(nodeId, { condition: conditionResult });
          break;
        }
        case 'parallel': {
          const parallelResults = await Promise.all(
            node.config.subNodes!.map(sub => this.executeNode(sub, nodeInputs, context))
          );
          results.set(nodeId, parallelResults);
          break;
        }
        case 'transform':
          results.set(nodeId, applyTransform(node.config.transform!, nodeInputs));
          break;
        case 'human_input':
          results.set(nodeId, await this.waitForHumanInput(node, nodeInputs));
          break;
      }
      
      // Checkpoint after each node
      await this.saveCheckpoint(workflow.id, nodeId, results.get(nodeId));
    }
    
    return { status: 'completed', results: Object.fromEntries(results) };
  }
  
  private buildDAG(workflow: WorkflowDef): { executionOrder: string[]; adjacency: Map<string, string[]> } {
    // Build adjacency list from edges
    // Perform topological sort (Kahn's algorithm)
    // Detect cycles → throw error if cycle found
  }
}
```

**Cycle detection (critical):**
```typescript
function detectCycle(workflow: WorkflowDef): string | null {
  // Use Kahn's algorithm: if not all nodes visited, there's a cycle
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  
  // ... standard Kahn's algorithm
  
  if (visited.size !== workflow.nodes.length) {
    return `Cycle detected: nodes ${unvisited.join(', ')} are in a cycle`;
  }
  return null;
}
```

#### Task 5.2: Conditional Branching (Day 6)
```typescript
// After condition node execution, follow 'true' or 'false' edge
// Edge label determines which branch to take

function getNextNode(conditionResult: boolean, edges: WorkflowEdge[], currentNodeId: string): string | null {
  const outboundEdges = edges.filter(e => e.source === currentNodeId);
  const matchingEdge = outboundEdges.find(e => 
    e.label === String(conditionResult) || 
    (!e.label && outboundEdges.length === 1) // Default edge
  );
  return matchingEdge?.target || null;
}
```

#### Task 5.3: Parallel Execution (Day 6)
```typescript
// Parallel node contains sub-nodes that execute concurrently
// Results merged after all complete
// If any sub-node fails → fail the entire parallel block (configurable)

async function executeParallel(subNodes: WorkflowNode[], input: any): Promise<any[]> {
  const results = await Promise.allSettled(
    subNodes.map(node => executeNode(node, input))
  );
  
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    // Log failures, continue with successful results
    // Or fail entire parallel block based on config
  }
  
  return results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason });
}
```

#### Task 5.4: Hierarchical Workflow (Day 7)
```typescript
// Manager agent receives task, delegates subtasks to specialist agents
// Manager monitors progress, handles exceptions, synthesizes final output

class HierarchicalWorkflow {
  async execute(managerAgent: AgentConfig, specialistAgents: AgentConfig[], task: any): Promise<any> {
    // 1. Manager analyzes task → creates subtask plan
    const plan = await managerAgent.run({ task: task, instruction: 'Decompose this into subtasks' });
    
    // 2. For each subtask, find best specialist using capability matching
    const subtaskResults = await Promise.all(
      plan.subtasks.map(async (subtask: Subtask) => {
        const specialist = this.findBestSpecialist(subtask, specialistAgents);
        return specialist.run(subtask);
      })
    );
    
    // 3. Manager synthesizes results
    const finalResult = await managerAgent.run({
      subtaskResults,
      instruction: 'Synthesize these results into a final answer'
    });
    
    return finalResult;
  }
}
```

#### Task 5.5-5.9: Handoff, HITL, Task Queue, YAML, Checkpointing
**Handoff (5.5):** Agent A calls `agent_handoff` tool with target agent ID and message. Target agent receives context and continues.

**Human-in-the-loop (5.6):** Agent pauses execution, emits `awaiting_input` SSE event, waits for `POST /api/v1/workflows/:id/continue` with human input. Resumes with input injected into message history.

**Shared task queue (5.7):** PostgreSQL-backed FIFO queue in `agent_tasks` table. Workers poll for pending tasks ordered by priority DESC, scheduled_at ASC. `SELECT ... FOR UPDATE SKIP LOCKED` for concurrent worker safety.

**YAML/JSON def (5.8):**
```yaml
name: "Code Review Pipeline"
nodes:
  - id: "lint-check"
    type: "tool"
    config: { toolName: "code_lint" }
  - id: "security-scan"
    type: "agent"
    config: { agentId: "security-reviewer" }
  - id: "decide"
    type: "condition"
    config: { condition: "results['lint-check'].passed && results['security-scan'].approved" }
edges:
  - { source: "lint-check", target: "security-scan" }
  - { source: "security-scan", target: "decide" }
  - { source: "decide", target: "merge", label: "true" }
  - { source: "decide", target: "reject", label: "false" }
```

**Checkpointing (5.9):** After each node execution, save full state to `state_snapshots` table. On crash/restart, find latest snapshot and resume from there. Snapshot includes: workflow ID, completed node IDs, partial results map, execution context.

### Phase 6: Plugin SDK & Ecosystem (Weeks 16-18)
**Goal:** Any developer can extend NEXUS. Core tools are done.

**Spec documents:** `21-api-route-specification.md` Section 5 (Skill & Tool Routes), `20-database-schema-specification.md` Table 2 (skills), Table 19 (compiled_scripts)

#### Task 6.1: Plugin SDK Package (Days 1-3)
**Files to create:**
- `sdk/` — NEW directory at project root
- `sdk/package.json` — Package definition
- `sdk/src/index.ts` — Main exports
- `sdk/src/plugin.ts` — Plugin base class
- `sdk/src/manifest.ts` — Manifest schema
- `sdk/src/hooks.ts` — Hook system
- `sdk/src/sandbox.ts` — Sandbox API
- `sdk/src/store.ts` — KV store API
- `sdk/README.md` — SDK documentation

**Plugin interface:**
```typescript
// @nexus/sdk — published to npm

export abstract class NexusPlugin {
  abstract manifest: PluginManifest;
  
  // Lifecycle hooks
  onLoad?(context: PluginContext): Promise<void>;
  onUnload?(): Promise<void>;
  onConfigChange?(config: Record<string, any>): Promise<void>;
  onAgentBeforeRun?(agentId: string, input: any): Promise<any>;    // Modify input
  onAgentAfterRun?(agentId: string, result: any): Promise<any>;    // Modify result
  onToolBeforeCall?(toolName: string, input: any): Promise<any>;   // Modify tool input
  onToolAfterCall?(toolName: string, result: any): Promise<any>;   // Modify tool result
  onMemoryStore?(memory: MemoryEntry): Promise<MemoryEntry>;       // Modify memory
  onMemoryRecall?(query: RecallQuery): Promise<RecallQuery>;       // Modify recall query
  onError?(error: Error, context: ErrorContext): Promise<boolean>;  // true = handled
  
  // Skills the plugin provides
  getSkills?(): SkillDef[];
  
  // Tools the plugin provides
  getTools?(): ToolDef[];
}

export interface PluginManifest {
  name: string;                    // Unique package name
  version: string;                 // semver
  description: string;
  author: string;
  license: string;
  permissions: string[];           // e.g. ['network:all', 'files:read', 'files:write']
  hooks: string[];                 // Which hooks this plugin uses
  skills: string[];                // Skill names
  tools: string[];                 // Tool names
  configSchema?: Record<string, any>; // JSON Schema for plugin config
  minNexusVersion?: string;        // e.g. '>=3.0.0'
}

export interface PluginContext {
  logger: Logger;
  store: KVStore;                  // Persistent KV store scoped to this plugin
  config: Record<string, any>;     // Plugin configuration
  api: NexusAPI;                   // NEXUS internal API client
}
```

#### Task 6.2: Plugin Manifest System (Day 3)
```typescript
// Every plugin MUST have a manifest.json or export manifest from index.ts
// Validated on load against JSON Schema

const MANIFEST_SCHEMA = {
  type: 'object',
  required: ['name', 'version', 'description', 'permissions'],
  properties: {
    name: { type: 'string', pattern: '^[a-z0-9-]+$' },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    description: { type: 'string', maxLength: 500 },
    permissions: { type: 'array', items: { type: 'string' } },
    hooks: { type: 'array', items: { type: 'string' } },
    // ...
  }
};
```

#### Task 6.3: Plugin Hook System (Day 4)
**20+ lifecycle hooks across the agent runtime:**
| Hook | Trigger | Allows Modification |
|---|---|---|
| `onLoad` | Plugin loaded | — |
| `onUnload` | Plugin unloaded | — |
| `onConfigChange` | Plugin config updated | — |
| `onAgentBeforeRun` | Agent receives task | Modify task input |
| `onAgentAfterRun` | Agent completes task | Modify agent output |
| `onToolBeforeCall` | Tool about to execute | Modify tool input, block execution |
| `onToolAfterCall` | Tool completed | Modify tool result |
| `onMemoryStore` | Memory being stored | Modify content, block storage |
| `onMemoryRecall` | Memory being queried | Modify query, filter results |
| `onLLMBeforeCall` | LLM about to be called | Modify messages, model selection |
| `onLLMAfterCall` | LLM returned response | Modify response |
| `onTaskCreated` | New task added to queue | Modify task |
| `onTaskCompleted` | Task finished | — |
| `onAgentError` | Agent encountered error | Handle error, retry |
| `onWorkflowStart` | Workflow execution begins | — |
| `onWorkflowEnd` | Workflow execution ends | — |
| `onUserLogin` | User authenticates | — |
| `onUserAction` | User performs action | Modify action |
| `onSchedulerTick` | Scheduler tick | — |
| `onMetricsEmit` | Metrics being collected | Add custom metrics |

#### Task 6.4: Plugin Skill System (Day 5)
```typescript
// Plugin can expose skills that agents can use
// Skills are loaded into the agent's skill registry at runtime

interface SkillDef {
  name: string;
  description: string;
  inputSchema: Record<string, any>;  // JSON Schema
  outputSchema: Record<string, any>;
  execute(input: any, context: ExecutionContext): Promise<any>;
  examples?: Array<{ input: any; output: any }>;
  category?: string;
}
```

#### Task 6.5: Plugin Loader (Day 6)
```typescript
class PluginLoader {
  private plugins: Map<string, NexusPlugin> = new Map();
  
  async loadFromDirectory(dirPath: string): Promise<void> {
    // 1. Scan directory for plugin packages
    // 2. For each: read package.json → if nexus-plugin field, load it
    // 3. Validate manifest against schema
    // 4. Check permissions against allowlist
    // 5. Create sandboxed require() context
    // 6. Instantiate plugin class
    // 7. Call plugin.onLoad()
    // 8. Register skills and tools
    // 9. Register hooks
  }
  
  async unload(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    await plugin?.onUnload?.();
    this.unregisterSkills(pluginName);
    this.unregisterTools(pluginName);
    this.unregisterHooks(pluginName);
    this.plugins.delete(pluginName);
  }
  
  async reload(pluginName: string): Promise<void> {
    await this.unload(pluginName);
    await this.loadFromDirectory(this.pluginDir + '/' + pluginName);
  }
}
```

#### Task 6.6: Plugin Sandbox (Days 6-7)
```typescript
// Execution isolation strategies (configurable per plugin):

// Level 1: Process isolation (default)
// - Plugin runs in child_process with restricted env vars
// - Filesystem: only plugin directory is writable
// - Network: controlled by permissions manifest

// Level 2: Docker container (for untrusted plugins)
// - Plugin runs in ephemeral Docker container
// - Container has: only plugin code, no network (unless permitted)
// - Resource limits: CPU 0.5, RAM 256MB, no disk quota
// - Timeout: 30 seconds per call

// Level 3: VM isolation (for enterprise, Phase 10)
// - gVisor or Firecracker microVM
// - Full kernel isolation
```

#### Task 6.7-6.10: Plugin Store, 50+ Tools, MCP, OpenAPI
**Plugin store (6.7):** Each plugin gets a scoped KV store backed by `system_meta` table with prefix `plugin:{name}:`. Simple get/set/delete/keys API.

**50+ built-in tools (6.8):** Expand from 20 (Phase 2) to 50+ by adding: `slack_send`, `discord_send`, `email_send`, `jira_create`, `linear_create`, `github_pr`, `notion_page`, `google_drive`, `aws_s3`, `docker_exec`, `redis_get`, `redis_set`, `sql_query`, `pdf_extract`, `image_analyze`, `csv_parse`, `json_schema_validate`, `date_calc`, `uuid_gen`, `hash_compute`, `encrypt`, `decrypt`, `xml_parse`, `yaml_parse`, `rate_limiter`, `circuit_breaker`, `cache_get`, `cache_set`.

**MCP protocol support (6.9):** Implement MCP client that connects to any MCP tool server. See `server/src/mcp.ts` (12,699 bytes existing) for existing implementation. The MCP client: connects via stdio or HTTP, discovers tools, converts MCP tool calls to NEXUS tool format, handles transport errors, supports multiple simultaneous MCP servers.

**OpenAPI tool import (6.10):** Parse OpenAPI 3.x spec → generate tool definitions for each endpoint. Map paths to tool names, parameters to input schema, responses to output schema. Handle auth via API key or OAuth2 configured at import time.

### Phase 7: Frontend & Dashboard (Weeks 19-21)
**Goal:** Beautiful, functional UI. Everything configurable from the browser.

| Task | Feature Ref | Deliverable |
|---|---|---|
| 7.1 | **Main dashboard** — overview, stats, recent runs | 10.2 | Dashboard |
| 7.2 | **Agent management page** — create, configure, monitor agents | 10.4 | Agent UI |
| 7.3 | **Chat interface** — talk to any agent | 10.1 | Chat |
| 7.4 | **Memory browser** — view/edit agent memory, knowledge bases | 10.2 | Memory UI |
| 7.5 | **Knowledge base UI** — upload, categorize, search documents | 4.8 | KB UI |
| 7.6 | **Tool management** — enable/disable/configure tools per agent | 10.2 | Tool UI |
| 7.7 | **Workflow visualizer** — see agent workflows as DAG | 10.2 | Workflow view |
| 7.8 | **Settings/configuration** | 10.2 | Settings |
| 7.9 | **Cost dashboard** — token usage, costs, budgets | 3.13 | Cost UI |
| 7.10 | **Plugin management** — install/enable/disable plugins | 10.2 | Plugin UI |
| 7.11 | **Audit log viewer** — searchable, filterable event log | 8.4 | Audit UI |
| 7.12 | **Scheduled jobs UI** — create/manage cron agents | 9.6 | Cron UI |
| 7.13 | **Cron/scheduling UI** — create recurring agent runs | 9.6 | Scheduler UI |
| 7.14 | **Webhook configuration UI** | 9.7 | Webhook UI |
| 7.15 | **API key management** — create/revoke API tokens | 12.1 | API keys |
| 7.16 | **Team/user management** — invite members, set roles | 10.7 | Team UI |

### Phase 8: External Integrations (Weeks 22-24)
**Goal:** NEXUS connects to everything. Agents reach any service.

**Spec docs:** `21-api-route-specification.md` Section 9 (Webhooks), MCP spec in `server/src/mcp.ts`

#### Task 8.1-8.7: Core Connectors (Days 1-10)
**Each connector follows the MCP tool pattern:**
```typescript
interface ConnectorConfig {
  name: string;
  auth: { type: 'oauth2' | 'api_key' | 'bot_token'; credentials: Record<string, string> };
  tools: ToolDef[];   // Tools this connector provides
  events: string[];    // Events this connector subscribes to
}

// Each connector is an MCP server that NEXUS connects to
// Connectors can be:
// 1. Built-in (shipped with NEXUS) — in server/src/connectors/
// 2. Installed from marketplace (Phase 12) — loaded via plugin system
// 3. External MCP servers — connected via MCP protocol
```

**Slack connector (8.1):**
- Auth: Bot token (xoxb-...) with scopes: chat:write, channels:history, users:read
- Tools: `slack_send_message`, `slack_search_messages`, `slack_list_channels`, `slack_get_thread`
- Events: `message_received` (agent joins channel and listens)
- File: `server/src/connectors/slack.ts` — NEW

**GitHub connector (8.5):**
- Auth: GitHub PAT or OAuth app
- Tools: `github_list_issues`, `github_create_issue`, `github_list_prs`, `github_get_pr_diff`, `github_create_pr_comment`, `github_search_code`, `github_get_actions`
- Events: `pr_opened`, `pr_merged`, `issue_created`, `ci_completed`
- File: `server/src/connectors/github.ts` — NEW

#### Task 8.8: 100+ Connector Library (Day 11-12)
**Strategy:** Create a connector catalog as YAML/JSON manifests. Each connector is a thin wrapper: name, auth type, tool list, and an MCP server or REST API mapping. Priority order:
1. Developer tools: GitHub, GitLab, Bitbucket, Linear, Jira, Notion, Confluence, Sentry, Datadog, PagerDuty, Vercel, AWS, GCP, Cloudflare
2. Communication: Slack, Discord, Telegram, WhatsApp, Email, Microsoft Teams, Zoom, Google Meet
3. Productivity: Google Drive, Google Calendar, Gmail, Outlook, Notion, Airtable, Trello, Asana, Monday.com
4. AI/ML: OpenAI, Anthropic, Hugging Face, Replicate, Fal.ai, Stability AI
5. Data: PostgreSQL, MySQL, SQLite, MongoDB, Redis, Elasticsearch, BigQuery, Snowflake
6. Other: Shopify, Stripe, Salesforce, HubSpot, Zendesk, Jira Service Desk, PagerDuty

#### Task 8.9-8.11: Web Search, DB Connectors, Cron (Days 13-15)
**Web search:** Three providers via abstraction: Tavily (best for AI agents, $0.50/1k calls), SerpAPI (Google results), Brave Search (free tier). Agent selects based on: rate limits remaining, cost budget, required freshness.

**DB connectors:** Read-only by default. Agent can query: `SELECT * FROM users WHERE email LIKE '%@example.com'`. Writes require explicit human approval. Connection strings stored in secrets manager, never exposed to agent.

**Cron engine:** Worker process polls `cron_jobs` table every 60 seconds. Uses `cron-parser` to compute next run time. On trigger: creates `agent_tasks` entry with the cron's `taskInput`. Handles: missed runs (catch-up or skip based on config), retries (exponential backoff), notifications on repeated failures.

### Phase 9: Observability & Debugging (Weeks 25-26)
**Goal:** Full visibility into every agent decision. Debug anything.

**Spec docs:** `21-api-route-specification.md` Section 8 (Audit & Observability), `20-database-schema-specification.md` Table 12 (trajectory_logs), Table 13 (tool_receipts)

#### Task 9.1: Full Tracing (Days 1-3)
**How tracing works:**
```typescript
// Every agent execution generates a trace with spans:
// Trace = one agent run
// Span = one LLM call, one tool call, one decision step

interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;                  // 'llm.call' | 'tool.call' | 'agent.think' | 'agent.decide'
  startTime: number;
  endTime: number;
  status: 'ok' | 'error';
  attributes: Record<string, any>;  // model name, tokens, tool input/output, etc.
  events: Array<{ name: string; time: number; attributes: Record<string, any> }>;
}

// Stored in trajectory_logs table as JSONB
// Visualized in dashboard as a Gantt chart / flame graph
```

#### Task 9.2-9.3: Timeline & Debug Mode (Days 4-5)
**Agent Run Timeline:**
```typescript
// GET /api/v1/trajectory?agentId=X&taskId=Y
// Returns ordered list of steps with:
// - Input/output at each step
// - Tokens used per step
// - Duration per step  
// - Errors/warnings per step
// - Side-by-side comparison: "Show me what happened on step 3"

// Debug Mode:
// POST /api/v1/agents/:id/debug
// { input: "...", breakpoints: ["step:3", "tool:web_search", "llm:before"] }
// Agent pauses at each breakpoint, emits SSE event with full state
// Developer inspects state, modifies input, continues
// Frontend shows: LLM response viewer, tool call inspector, variable browser
```

#### Task 9.4-9.6: Dashboards, Alerts, Logs (Days 6-10)
**Cost dashboard:** Real-time spend per agent, per model, per user. Daily/weekly/monthly trends. Budget alerts when approaching limits.

**Alerting rules:**
```typescript
interface AlertRule {
  metric: 'cost_spike' | 'error_rate' | 'latency_p95' | 'token_usage' | 'agent_failure';
  condition: '>' | '<' | '>=' | '<=' | '==';
  threshold: number;
  window: '5m' | '15m' | '1h' | '24h';
  severity: 'warning' | 'critical';
  actions: Array<{ type: 'slack' | 'email' | 'webhook'; target: string }>;
}
```

**Logs explorer:** Structured log search with: time range filter, log level filter, agent/task/user filter, full-text search on log messages. Logs stored in PostgreSQL with daily rotation (30-day hot retention).

### Phase 10: Security & Governance (Weeks 27-28)
**Goal:** Production-ready security. Enterprise compliance.

**Spec docs:** `20-database-schema-specification.md` Tables 5 (audit_log), 6 (merkle_checkpoints), 11 (api_keys), 17 (sandbox_executions)

#### Task 10.1: Docker Sandbox (Days 1-3)
```typescript
// Every untrusted execution runs in an ephemeral Docker container:
// 1. Pull image: node:20-slim, python:3.12-slim, or custom
// 2. Create container with: read-only root FS, tmpfs for /tmp, no network (unless permitted)
// 3. Copy agent code into container
// 4. Execute with resource limits: CPU 0.5, RAM 256MB, timeout 120s
// 5. Capture stdout/stderr/exit code
// 6. Destroy container (enforced by --rm flag)
// 7. Log to sandbox_executions table

// Supported sandbox types:
// - docker: Full isolation (default for untrusted code)
// - wasm: WebAssembly sandbox (faster, for JS/TS only) — future
// - process: Direct child_process (for trusted/verified plugins only)
```

#### Task 10.2: Permission System (Days 4-5)
```typescript
// Roles:
enum Role {
  ADMIN = 'admin',       // Full access: manage agents, users, billing, settings
  EDITOR = 'editor',     // Create/run agents, manage knowledge, view all
  VIEWER = 'viewer',     // View dashboards, read agents, no modifications
  API = 'api',           // API key access (scoped to specific permissions)
}

// Scopes (for API keys):
// agents:read, agents:write, agents:execute
// memories:read, memories:write
// knowledge:read, knowledge:write
// tools:read, tools:execute
// audit:read
// settings:read, settings:write

// Permission check (middleware):
// 1. Extract token from Authorization header
// 2. Decode JWT → get userId, role, projectIds
// 3. For API keys: look up key_hash, check scopes
// 4. Check if user/agent has required scope
// 5. If not → 403 FORBIDDEN
```

#### Task 10.3: Guardrails (Day 6)
```typescript
// Input guardrails (before LLM call):
// - PII detection: prevent sending SSN, credit cards, API keys to LLM
// - Prompt injection: detect "ignore previous instructions" patterns
// - Content policy: block profanity, hate speech, dangerous content
// - Token limit: reject inputs over max_tokens

// Output guardrails (before returning to user):
// - PII leak prevention: check if LLM leaked sensitive data
// - Hallucination detection: check factual claims against knowledge base
// - Format validation: ensure output matches expected schema
// - Safety check: reject dangerous instructions (how to build weapons, etc.)

// Guardrail implementation:
// - Regex-based fast checks (PII, tokens, patterns) — <1ms
// - ML-based checks (prompt injection, content safety) — ~100ms
// - LLM-based checks (factual accuracy, tone) — ~500ms (used for critical paths)
```

#### Task 10.4-10.7: Rate Limiting, Secrets, Audit, Auth (Days 7-10)
**Rate limiting:** Token bucket algorithm per: IP, user, agent, API key. Headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Stored in Redis for fast access. PostgreSQL fallback.

**Secrets management:** All API keys encrypted at rest using AES-256-GCM. Encryption key stored in env var (NEXUS_ENCRYPTION_KEY). Secrets never logged, never exposed to agents raw. Agents get a token that references the secret.

**Audit trail:** Every API call, every agent action, every config change logged to `audit_log` table. Hash chain integrity: each row's SHA-256 = `SHA256(previousHash + payload + timestamp)`. Tamper detection: periodic Merkle tree checkpoints, compare with independently stored root.

**API authentication:** Three methods: JWT (user sessions), API key (service-to-service with scopes), OAuth2 (planned for enterprise SSO). All validated in middleware before route handler.

### Phase 11: Deployment & DevOps (Weeks 29-30)
**Goal:** One-command deploy. SaaS available.

| Task | Feature Ref | Deliverable |
|---|---|---|
| 11.1 | **Docker Compose** — one-command start with all services | 9.4 | Docker |
| 11.2 | **CLI** — full control via nexus command | 9.1 | CLI |
| 11.3 | **REST API** — every operation available via HTTP | 9.2 | API |
| 11.4 | **Python SDK** — @nexus/sdk-python on PyPI | 9.3 | Python SDK |
| 11.5 | **SaaS deployment** — multi-tenant cloud hosting | 9.5 | Cloud |
| 11.6 | **Health checks** — /health endpoint, status page | 9.4 | Monitoring |
| 11.7 | **Backup/restore** — DB backup, S3 state backup | 9.4 | DR |

### Phase 12: Advanced / 100x Features (Weeks 31-36)
**Goal:** Features that make NEXUS uniquely powerful.

| Task | Feature Ref | Deliverable |
|---|---|---|
| 12.1 | **Visual drag-and-drop workflow builder** | 6.1-6.5 | Visual builder |
| 12.2 | **Plugin marketplace** | 5.2 | Marketplace |
| 12.3 | **Agent marketplace** — pre-built agent templates | 15.1 | Agent store |
| 12.4 | **A2A protocol support** — cross-platform agent communication | 7.3 | A2A |
| 12.5 | **Federated memory** — NEXUS-to-NEXUS memory sharing | 7.2 | Federation |
| 12.6 | **Voice interface** — STT + TTS pipeline | 14.1, 14.2 | Voice |
| 12.7 | **Multimodal support** — agents see images | 14.3 | Multimodal |
| 12.8 | **Embeddable chat widget** — agent on any website | 10.5 | Widget |
| 12.9 | **Self-improvement loop** — agent learns from feedback | 13.1 | Learning |
| 12.10 | **Template library** — 20+ pre-built agent templates | 15.2 | Templates |
| 12.11 | **300+ connectors** — approach n8n ecosystem breadth | 11.8 | 300 connectors |

### Phase 13: Project Intelligence Layer (Weeks 37-44) ← NEW: THE PRODUCTIVITY DIFFERENTIATOR
**Goal:** NEXUS becomes the intelligent layer over every software project — automating code review, documentation, CI/CD, project management, and developer insights.

| Task | Feature Ref | Deliverable |
|---|---|---|
| 13.1 | **Codebase indexer** — full AST, dependency graph, type/symbol database | P1.1 | Codebase understanding |
| 13.2 | **Git history analyzer** — blame, log, diff, authorship analysis | P1.2 | Git intelligence |
| 13.3 | **Basic codebase Q&A** — "where is X?" "what does Y do?" | P1.3 | Codebase answers |
| 13.4 | **PR auto-review (MVP)** — bug detection, inline comments, severity | P1.4 | AI code review |
| 13.5 | **Linear MCP connector** — read/write tickets, comments, projects | P2.1 | Linear integration |
| 13.6 | **GitHub MCP connector** — PRs, issues, commits, actions | P2.2 | GitHub integration |
| 13.7 | **Project Manager Agent** — auto-triage, status updates, release notes | P2.3 | PM automation |
| 13.8 | **Standup summarizer** — daily summary from commits + PRs + tickets | P2.4 | Standup automation |
| 13.9 | **Security scanning in PRs** — SAST, secrets, dependency vulns | P3.1 | Security review |
| 13.10 | **Test coverage analysis in PRs** — coverage diff, untested paths | P3.2 | Coverage gates |
| 13.11 | **Change impact analysis** — what else will this change break? | P3.3 | Impact analysis |
| 13.12 | **Learn from human review feedback** — noise reduction over time | P3.4 | Learning |
| 13.13 | **Build log analysis** — read CI output, identify root cause of failures | P4.1 | CI intelligence |
| 13.14 | **Deploy health check** — smoke tests, error rate monitoring post-deploy | P4.2 | Deploy verification |
| 13.15 | **Dependency update PRs** — auto-open PRs for outdated/vulnerable deps | P4.3 | Dep management |
| 13.16 | **Incident triage** — on-call alert → gather context → identify cause | P4.4 | Incident response |
| 13.17 | **Auto-documentation** — generate docs from code, keep in sync | P5.1 | Documentation |
| 13.18 | **Architecture diagram generation** — system diagrams from code | P5.2 | Architecture |
| 13.19 | **ADR generation** — auto-draft ADRs on significant decisions | P5.3 | Decision records |
| 13.20 | **Full codebase Q&A** — natural language questions about any part | P5.4 | Code QA |
| 13.21 | **Ticket → Code → PR → Deploy super-flow** (end-to-end) | P6.1 | Main loop |
| 13.22 | **Bug → Root Cause → Fix → Deploy super-flow** | P6.2 | Bug squash |
| 13.23 | **Feature spec → Implementation → Docs super-flow** | P6.3 | Feature factory |
| 13.24 | **New developer onboarding agent** — personalized ramp guide | P6.4 | Onboarding |
| 13.25 | **Technical debt tracking + refactoring PRs** | P6.5 | Debt reduction |
| 13.26 | **Incident response automation** — full runbook execution | P6.6 | Firefighter |
| 13.27 | **DORA metrics dashboard** — deploy frequency, lead time, MTTR, change failure rate | 5.1 | Insights |
| 13.28 | **Developer productivity dashboard** — cycle time, bottlenecks, estimation accuracy | 5.2-5.10 | Analytics |

### Phase 14: Agent Interoperability (Weeks 45-50) ← NEW: CROSS-PLATFORM AGENTS
**Goal:** NEXUS agents talk to Hermes agents, Claude Code, OpenAI agents — any A2A-compliant system.

| Task | Feature Ref | Deliverable |
|---|---|---|
| 14.1 | A2A Agent Card generation — every NEXUS agent publishes discoverable card | 2.2.1 | Agent Cards |
| 14.2 | A2A Agent Card discovery — find agents from other platforms | 2.2.2 | Discovery |
| 14.3 | A2A task submission — NEXUS sends tasks to Hermes/other agents | 2.2.3 | Cross-platform tasks |
| 14.4 | A2A task receipt — NEXUS receives tasks from Hermes/other agents | 2.2.4 | Cross-platform handlers |
| 14.5 | Streaming results via SSE between platforms | 2.2.5 | Streaming |
| 14.6 | Multi-turn interaction — agents from different platforms clarify, iterate | 2.2.6 | Multi-turn |
| 14.7 | A2A authentication — OAuth2, API keys, mTLS between platforms | 2.2.7 | Auth |
| 14.8 | Capability negotiation — "I can do X, can you do Y?" | 2.2.8 | Negotiation |
| 14.9 | Cross-platform audit trail | 2.2.10 | Audit |
| 14.10 | NEXUS ↔ Hermes bidirectional bridge | 6.3 | Hermes bridge |
| 14.11 | Shared MCP server pool — both platforms use same tool servers | 6.3 | Shared tools |
| 14.12 | ACP protocol support (IBM standard) | 2.1 | ACP |

### Phase 15: Self-Improvement Engine (Weeks 51-56) ← NEW: AGENTS THAT EVOLVE
**Goal:** Agents improve their prompts, tools, and workflows autonomously.

| Task | Feature Ref | Deliverable |
|---|---|---|
| 15.1 | Self-improvement loop: execute → evaluate → improve | 3.1 | Evolution loop |
| 15.2 | Prompt evolution (GEPA algorithm — ICLR 2026, 35x fewer rollouts) | 3.3 | Prompt optimizer |
| 15.3 | DSPy MIPROv2 integration for structured prompt optimization | 3.3 | DSPy |
| 15.4 | Reflexion loop — agent reflects on failures, generates fix | 3.3 | Reflexion |
| 15.5 | Tool selection learning — bandit learning for optimal tool choice | 3.2 | Tool learning |
| 15.6 | Workflow discovery — MCTS over workflow variants (AFlow pattern) | 3.5 | Workflow evolution |
| 15.7 | Self-repair protocol — crash detection, diagnosis, auto-fix | 3.4 | Self-repair |
| 15.8 | A/B testing framework for agent versions | 4.2 | Canary deploy |
| 15.9 | Regression detection — metric drop triggers auto-rollback | 4.3 | Regression guard |
| 15.10 | Meta-learning — agent optimizes its own evaluation criteria | 3.2 | Meta-eval |

### Phase 16: Global Agent Registry & Discovery (Weeks 57-60) ← NEW: FIND ANY AGENT
**Goal:** Any NEXUS instance can discover any agent anywhere.

| Task | Feature Ref | Deliverable |
|---|---|---|
| 16.1 | Local agent registry (per NEXUS instance) | 7.1 | Local registry |
| 16.2 | Global agent registry cloud service (agent-registry.nexus.io) | 7.1 | Global registry |
| 16.3 | Capability-based routing engine — find best agent for any task | 7.3 | Smart routing |
| 16.4 | Cross-platform discovery — find Hermes, Claude Code, OpenAI agents | 7.1 | Cross-platform search |
| 16.5 | Agent reputation scoring — success rate, reliability, speed, cost | 7.3 | Reputation |
| 16.6 | Federated registry option (self-hosted, no cloud dependency) | 7.1 | Federated mode |
| 16.7 | Agent Cards as Well-Known URLs (/.well-known/agent.json) | 2.2.1 | Well-known standard |

### Phase 17: Architecture Intelligence & Code Ownership (Weeks 61-64) ← NEW: PROJECT DEEP UNDERSTANDING
**Goal:** NEXUS understands your project's architecture, code ownership, and drift.

| Task | Feature Ref | Deliverable |
|---|---|---|
| 17.1 | Architecture drift detection — compare code vs declared architecture | 8.1 | Drift detection |
| 17.2 | Code ownership mapping — git history analysis per module | 8.2 | Ownership map |
| 17.3 | Expertise heatmap — who knows what, with confidence score | 8.2 | Expertise |
| 17.4 | Bus factor identification — single-owner modules flagged | 8.2 | Bus factor |
| 17.5 | Architecture health score + trend dashboard | 8.1 | Health score |
| 17.6 | Natural language project querying: "What's blocking the auth refactor?" | 8.2 | NL querying |
| 17.7 | Autonomous drift-fix PRs — agent fixes architecture violations | 8.1 | Auto-fix drift |

---

## PART 4: CRITICAL DECISIONS

### Technology Stack (Locked)

| Layer | Choice | Why |
|---|---|---|
| Backend runtime | **Node.js + TypeScript** | Existing codebase (8,700 lines already written) |
| Database | **PostgreSQL + Drizzle ORM** | Already chosen, best ORM for TypeScript |
| Frontend framework | **React + Vite** | Already chosen |
| UI library | **Tailwind CSS + Radix UI** | Modern, accessible, fast |
| LLM providers | **LiteLLM-style abstraction** | Industry standard, multiple providers |
| Vector store | **PostgreSQL pgvector** | No additional infrastructure |
| Containerization | **Docker + Docker Compose** | Industry standard |
| Package manager | **pnpm** | Fast, disk-efficient |
| Auth | **JWT + sessions** | Simple, stateless |
| API style | **REST + SSE streaming** | Universal compatibility |

### What NOT to Build (Avoid)

| Feature | Why Skip | Alternative |
|---|---|---|
| Native iOS/Android app | Too early, huge maintenance cost | Responsive web app (works on mobile) |
| Full visual drag-drop builder (Phase 12) | 4-6 weeks of frontend work | JSON/YAML workflow definition first |
| Proprietary model training | Outside scope | LLM provider abstraction |
| Native desktop app (Tauri) | Extra build complexity | Web app works everywhere |
| Own vector database | pgvector already solves this | Use pgvector for now |
| Own message queue | Use PostgreSQL + polling | Simpler than RabbitMQ/Kafka |
| Own blockchain | Outside scope | Use existing chains for anchoring |
| Custom LLM fine-tuning | Cost-prohibitive, rapid model evolution | Prompt engineering + model routing |
| Multi-region SaaS (Phase 11) | Premature optimization | Single-region, scale later |
| Real-time voice (Phase 12) | Very high latency/cost reqs | Async voice: record → transcribe → respond → TTS |
| gVisor/Firecracker sandbox (Phase 10) | Too complex, Docker is sufficient | Docker container sandbox for v1 |
| Native mobile push notifications | No mobile app yet | Web push notifications (PWAs) |

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Server code doesn't compile at all | High | Critical | Phase 0 is dedicated to fixing this |
| Frontend hardcodes vs localStorage | High | High | Add API client layer with localStorage fallback |
| DB schema mismatch with code | High | Critical | Drizzle migrations + seed data |
| Plugin sandbox bypass | Medium | Critical | Docker isolation + capability tokens |
| Cost explosion on LLM API calls | Medium | High | Strict budget enforcement + alerts |
| Feature creep (too many things to build) | High | High | Phased roadmap with P0/P1/P2 prioritization |
| Drizzle ORM version conflicts | Medium | High | Pin exact Drizzle version in package.json |
| pgvector not available on hosting | Medium | Medium | dev-schema.ts with jsonb fallback for vector |
| LLM provider API changes breaking routing | Medium | Medium | Provider abstraction with isolated adapters |
| PostgreSQL connection pool exhaustion | Medium | High | Connection pooling via PgBouncer, max 20 connections |
| Frontend bundle size too large | Low | Medium | Code splitting, lazy loading for dashboard pages |
| Memory consolidation deletes important data | Medium | Medium | Importance-weighted retention, user confirmation for bulk delete |
| A2A protocol specification changes | Medium | Low | Implement against stable A2A spec version |
| Hermes Agent breaking changes | Medium | Medium | Version-pin Hermes bridge, integration tests |
| Self-improvement loop causes regression | High | Medium | A/B testing, canary deployment, auto-rollback |
| Global registry becomes SPOF | Medium | High | Federated registry option, offline fallback |

### Technical Decision Log

| Decision | Options | Chosen | Rationale |
|---|---|---|---|
| Memory backend | pgvector / Qdrant / Pinecone / Chroma | **pgvector** | No extra infra, already in PostgreSQL |
| SSE vs WebSocket for streaming | SSE / WebSocket | **SSE** | Simpler, HTTP-native, auto-reconnect, works with all proxies |
| Plugin sandbox | child_process / Docker / gVisor | **Docker** + child_process for simple plugins | Balanced security vs complexity |
| Workflow orchestration | Custom DAG / Temporal / Airflow | **Custom DAG** | Full control, no infra dependency, specific to agent domain |
| LLM abstraction | LiteLLM / Custom | **Custom** | Full control over routing, failover, cost tracking |
| Task queue | PostgreSQL / Redis / Bull / RabbitMQ | **PostgreSQL + SKIP LOCKED** | No extra infra, ACID, good enough for v1 |
| Auth | JWT / sessions / OAuth | **JWT** | Stateless, simple, works with API keys |
| Frontend state | Zustand / Redux / Jotai / Context | **Zustand** (already in store.ts) | Simple, TypeScript-friendly, no boilerplate |
| Vector dimensions | 1536 / 3072 / configurable | **1536** (OpenAI ada-002 default) | Best balance of accuracy vs performance |
| API style | REST / GraphQL / tRPC | **REST + SSE** | Universal compatibility, simple tool integration |
| Package manager | npm / pnpm / yarn | **pnpm** (already chosen) | Fast, disk-efficient, strict |
| Frontend CSS | Tailwind / CSS modules / styled-components | **Tailwind CSS** (already chosen) | Fast development, consistent design |
| AI code generation tool for dev | Claude Code / Codex / Cursor | **Defer to Phase 13** | NEXUS should eventually use its own tooling |

---

## PART 5: COMPETITIVE GAP ANALYSIS — NEXUS vs THE MARKET

| Capability | LangGraph | CrewAI | AutoGen | Factory.ai | CodeRabbit | Graphite | Linear AI | NEXUS (Target) |
|---|---|---|---|---|---|---|---|---|
| Multi-agent orchestration | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Visual workflow builder | ❌ | ✅ | Studio | ❌ | ❌ | ❌ | ❌ | ✅ (P12) |
| 10+ LLM providers | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (P3) |
| Agent memory | LangMem | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (P4) |
| RAG engine | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P4) |
| Plugin ecosystem | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P6) |
| Cost tracking | LangSmith | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P3) |
| Human-in-the-loop | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (P5) |
| Docker sandbox | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ (P10) |
| PR auto-review | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ (P13) |
| Codebase Q&A | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ (Code Intel) | ✅ (P13) |
| Doc auto-sync | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P13) |
| DORA metrics | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ (P13) |
| Incident triage | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P13) |
| Ticket → PR → Deploy | ❌ | ❌ | ❌ | ✅ (Missions) | ❌ | ❌ | ❌ | ✅ (P13) |
| A2A Protocol | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P14) |
| Self-improving agents | ❌ | ❌ | ❌ | ❌ | ✅ (Learnings) | ❌ | ❌ | ✅ (P15) |
| A/B testing agents | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P15) |
| Agent registry | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P16) |
| Architecture drift detect | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P17) |
| Code ownership mapping | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P17) |
| Context Engine / code graph | ❌ | ❌ | ❌ | ❌ | ✅ (Change Stack) | ❌ | ❌ | ✅ (P13) |
| Stacked PR support | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ (P13) |
| Merge queue | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ (P13) |

**Legend:** ✅ Full support | 🟡 Partial support | ❌ Not supported

---

## PART 6: WEEK-BY-WEEK EXECUTION PLAN

### Month 1: Foundation — Phase 0-1 (Weeks 1-4)
- **Week 1:** Follow `19-phase-0-execution-plan.md` Task 0.0-0.3 — Verify toolchain, install deps, compile server + frontend, catalog errors
- **Week 2:** Follow `19-phase-0-execution-plan.md` Task 0.4-0.8 — Map routes, map DB, discover 13 features, document findings, tag issues
- **Week 3:** Phase 1 — Fix server compilation errors (tsconfig, path aliases, missing imports), fix DB init (Drizzle push, migrations), wire auth route
- **Week 4:** Phase 1 — Wire remaining 12 features frontend-to-backend, add error boundaries, write 100+ integration tests, implement Pino logging

**REFERENCE DOCS:** `19-phase-0-execution-plan.md`, `20-database-schema-specification.md`, `21-api-route-specification.md`, `22-dependency-graph-and-test-plan.md`
**Milestone M1 (Week 4):** Server compiles and runs. 10+ API endpoints work. Frontend connects to backend. 100+ tests pass.

### Month 2: Agent Engine + Multi-LLM — Phase 2-3 (Weeks 5-9)
- **Week 5:** Phase 2.1-2.2 — Agent lifecycle engine (think→act→observe→repeat), single-agent execution via `POST /api/v1/agents/:id/run`
- **Week 6:** Phase 2.3-2.5 — Sequential multi-agent, role-based agent system, 20 built-in tools (web_search, file_ops, code_exec, git, etc.)
- **Week 7:** Phase 2.6-2.8 — SSE streaming, basic session memory, agent persistence (save/load from DB)
- **Week 8:** Phase 3.1-3.4 — Provider abstraction layer, OpenAI, Anthropic, Google providers
- **Week 9:** Phase 3.5-3.15 — Ollama, Groq, DeepSeek, Together, Azure, Bedrock; model routing, failover, cost tracking, budget enforcement

**REFERENCE DOCS:** `21-api-route-specification.md` Sections 2, 11, 13; `20-database-schema-specification.md` Tables 14, 15, 8
**Milestone M2 (Week 9):** Agents run with any of 10+ LLMs. Costs tracked. Budget enforced. Basic multi-agent pipelines work.

### Month 3: Memory + Collaboration — Phase 4-5 (Weeks 10-15)
- **Week 10-11:** Phase 4.1-4.4 — Episodic + semantic memory, three-tier architecture (core/recall/archival), pgvector integration
- **Week 12:** Phase 4.5-4.10 — RAG pipeline: document ingestion (PDF/DOCX/TXT/MD/HTML/CSV), chunking, embedding, hybrid search, KB management UI, memory consolidation
- **Week 13-14:** Phase 5.1-5.3 — Graph orchestration engine: DAG definition, topological sort, conditional branching, parallel execution, cycle detection
- **Week 15:** Phase 5.4-5.9 — Hierarchical workflows, handoff patters, HITL, shared task queue (SKIP LOCKED), YAML workflow def, checkpointing

**REFERENCE DOCS:** `20-database-schema-specification.md` Tables 1, 4, 18; `21-api-route-specification.md` Sections 3, 4, 6
**Milestone M3 (Week 15):** Agents remember across sessions. Complex DAG workflows work. Human can approve/deny steps.

### Month 4: Plugin Ecosystem + Dashboard — Phase 6-7 (Weeks 16-21)
- **Week 16-17:** Phase 6.1-6.4 — @nexus/sdk npm package, PluginManifest schema, 20+ lifecycle hooks, plugin skill system
- **Week 18:** Phase 6.5-6.10 — Plugin loader (hot-reload), plugin sandbox (child_process/Docker), KV store per plugin, 50+ built-in tools expanded, MCP protocol client, OpenAPI tool import
- **Week 19-20:** Phase 7.1-7.8 — Main dashboard, agent management UI, chat interface, memory browser, KB UI, tool management, workflow DAG visualizer, settings
- **Week 21:** Phase 7.9-7.16 — Cost dashboard, plugin management, audit log viewer, scheduled jobs UI, webhook config, API key management, team/user management

**REFERENCE DOCS:** `21-api-route-specification.md` Sections 5, 7, 12; `20-database-schema-specification.md` Tables 2, 19
**Milestone M4 (Week 21):** Plugin system works. Full dashboard (16 views) functional. 50+ tools available.

### Month 5: Integrations + Security — Phase 8-10 (Weeks 22-28)
- **Week 22-23:** Phase 8.1-8.7 — Slack, Discord, Telegram, Email (IMAP/SMTP), GitHub, Google (Drive/Calendar/Gmail), WhatsApp MCP connectors
- **Week 24:** Phase 8.8-8.11 — 100+ connector library, web search (Tavily/SerpAPI/Brave), DB connectors (PostgreSQL/MySQL/SQLite/MongoDB), cron job engine
- **Week 25-26:** Phase 9.1-9.6 — Full tracing (every LLM call, tool call, decision), agent run timeline, debug mode (step-through execution), cost/performance dashboards, alerting rules (cost spike, error rate), logs explorer
- **Week 27-28:** Phase 10.1-10.7 — Docker sandbox (agent isolation), RBAC (role-based access control), guardrails (input/output validation, content filtering), rate limiting, secrets management (encrypted API key storage), immutable audit trail, JWT/OAuth/API key auth

**REFERENCE DOCS:** `21-api-route-specification.md` Sections 8, 10, 12; `20-database-schema-specification.md` Tables 5, 6, 11, 17
**Milestone M5 (Week 28):** NEXUS connects to Slack/Discord/Telegram/GitHub/Google. Full tracing and observability. Enterprise security (RBAC, sandbox, audit).

### Month 6: Production + Advanced Features — Phase 11-12 (Weeks 29-36)
- **Week 29-30:** Phase 11.1-11.7 — Docker Compose (one-command start), CLI (`nexus` command), REST API (full coverage), Python SDK (`@nexus/sdk-python` on PyPI), SaaS deployment (multi-tenant cloud), health checks (`/health` endpoint), backup/restore (S3 state backup)
- **Week 31-36:** Phase 12.1-12.11 — Visual drag-and-drop workflow builder (React Flow), plugin marketplace UI, agent marketplace (pre-built templates), A2A protocol (Agent Card generation), federated memory (NEXUS-to-NEXUS), voice interface (STT → agent → TTS), multimodal support (images input/output), embeddable chat widget (iframe), self-improvement loop (basic: feedback → prompt adjust), 20+ pre-built agent templates, 300+ connectors

**REFERENCE DOCS:** E2E test spec in `22-dependency-graph-and-test-plan.md` Part 4 (Phase 11)
**Milestone M6 (Week 36):** Production-ready. One-command Docker deploy. SaaS launched. Visual builder live. Voice and multimodal working.

### Months 7-10: Project Intelligence Layer — Phase 13 (Weeks 37-44)
- **Week 37-38:** Codebase indexer (AST parse every file, dependency graph), git history analyzer (blame/log/diff/authorship), basic codebase Q&A
- **Week 39-40:** PR auto-review MVP (inline comments, severity classification), Linear MCP connector, GitHub MCP connector
- **Week 41:** Project Manager Agent (auto-triage tickets, status updates, release notes), standup summarizer (from commits + PRs + tickets)
- **Week 42:** Security scanning (SAST patterns, secrets detection, dependency vulns), test coverage analysis (coverage diff, untested paths), change impact analysis
- **Week 43:** CI/CD intelligence (build log analysis → root cause), deploy health check (smoke tests, error rate monitoring), dependency update PRs (auto-open for outdated/vuln deps), incident triage (on-call alert → context → cause)
- **Week 44:** Auto-documentation (function/module level, stays in sync), architecture diagram generation (from code structure), ADR auto-generation (on significant decisions), full codebase Q&A (NL interface), all 7 super-flows, DORA metrics dashboard, developer productivity dashboard

**REFERENCE DOCS:** `17-project-efficiency-layer.md` (all 5 agents, 7 super-flows, 44 features)
**Milestone M7 (Week 44):** NEXUS understands the entire project lifecycle. PRs auto-reviewed. Docs auto-synced. Tickets auto-managed. Incidents auto-triaged. Ticket-to-deploy in hours.

### Months 11-12: Agent Interoperability — Phase 14 (Weeks 45-50)
- **Week 45-46:** A2A Agent Card generation (/.well-known/agent.json for every agent), Agent Card discovery (find agents from other platforms)
- **Week 47-48:** A2A task submission (NEXUS sends tasks to Hermes/other agents), A2A task receipt (NEXUS receives tasks), streaming results via SSE
- **Week 49-50:** Multi-turn interaction (agents from different platforms clarify/iterate), A2A authentication (OAuth2, API keys, mTLS), capability negotiation ("I can do X, can you do Y?"), cross-platform audit trail, NEXUS ↔ Hermes bidirectional bridge, shared MCP server pool, ACP protocol support

**REFERENCE DOCS:** `18-agent-protocols-self-improvement-and-hermes-integration.md` Sections 2, 6
**Milestone:** NEXUS agents discover and talk to Hermes agents. Any A2A-compliant platform interoperable.

### Months 13-14: Self-Improvement — Phase 15 (Weeks 51-56)
- **Week 51-52:** Self-improvement loop (execute → evaluate → improve), prompt evolution via GEPA (ICLR 2026 algorithm), DSPy MIPROv2 integration
- **Week 53-54:** Reflexion loop (agent reflects on failures, generates fix strategy), tool selection learning (bandit learning for optimal tool choice)
- **Week 55-56:** Workflow discovery (MCTS over workflow variants — AFlow pattern), self-repair protocol (crash detection → diagnosis → auto-fix), A/B testing framework (canary deploy agent versions), regression detection (metric drop → auto-rollback), meta-learning (agent optimizes its own eval criteria)

**REFERENCE DOCS:** `18-agent-protocols-self-improvement-and-hermes-integration.md` Section 3
**Milestone:** Agents evolve prompts, tools, and workflows autonomously. Canary deployments with auto-rollback.

### Months 14-15: Global Agent Registry — Phase 16 (Weeks 57-60)
- **Week 57-58:** Local agent registry (per NEXUS instance — SQLite/PostgreSQL), global agent registry cloud service (agent-registry.nexus.io), capability-based routing engine (score = weight × confidence × match)
- **Week 59-60:** Cross-platform discovery (find Hermes, Claude Code, OpenAI agents), agent reputation scoring (success rate, reliability, speed, cost), federated registry option (self-hosted, no cloud dependency), Agent Cards as Well-Known URLs

**REFERENCE DOCS:** `18-agent-protocols-self-improvement-and-hermes-integration.md` Section 7
**Milestone:** Any NEXUS instance discovers any agent anywhere. Federated registry for air-gapped deployments.

### Months 15-16: Architecture Intelligence — Phase 17 (Weeks 61-64)
- **Week 61-62:** Architecture drift detection (compare code structure vs declared architecture in docs/ADRs), code ownership mapping (git history analysis per module)
- **Week 63-64:** Expertise heatmap (who knows what with confidence score), bus factor identification (single-owner modules flagged), architecture health score + trend dashboard, NL project querying ("What's blocking the auth refactor?"), autonomous drift-fix PRs (agent fixes violations)

**REFERENCE DOCS:** `18-agent-protocols-self-improvement-and-hermes-integration.md` Section 8
**Milestone M8 (Week 64):** NEXUS knows every module, every owner, every architecture decision. Drift detected and fixed automatically. "What's blocking X?" answered in seconds.

---

## PART 7: SUCCESS CRITERIA (How We Know We Won)

| Metric | Current | Month 1 | Month 3 | Month 6 | Month 10 | Month 16 |
|---|---|---|---|---|---|---|---|
| Server compilation | ❌ Breaks | ✅ Clean build | ✅ Clean build | ✅ Clean build | ✅ Clean build | ✅ Clean build |
| API endpoints working | ~0 | 10+ | 50+ | 100+ | 200+ | 300+ |
| LLM providers supported | 0 | 0 | 5+ | 10+ | 15+ | 20+ |
| Agent types | 0 | 1 single | 5+ role types | 20+ templates | 50+ templates | 100+ marketplace |
| Plugin count | 0 | 0 | 0 | 50+ built-in | 200+ tools | 400+ connectors |
| External integrations | 0 | 0 | 5+ | 100+ | 300+ connectors | 400+ connectors |
| Dashboard views | 0 | 1 basic | 5+ | 13+ | 20+ (incl. project insights) | 30+ (incl. registry, drift) |
| Integration tests passing | 0 | 100+ | 300+ | 500+ | 1000+ | 2000+ |
| Docker deploy | ❌ | ❌ | ✅ | ✅ One command | ✅ One command | ✅ One command + SaaS |
| SaaS available | ❌ | ❌ | ❌ | ✅ | ✅ Multi-tenant | ✅ Enterprise |
| **PR auto-review** | ❌ | ❌ | ❌ | ❌ | ✅ Inline comments on every PR | ✅ Stacked PR + Change Stack |
| **Codebase Q&A** | ❌ | ❌ | ❌ | ❌ | ✅ Ask "where is X?" get answer in 2s | ✅ Context Engine (400K+ files) |
| **Project PM automation** | ❌ | ❌ | ❌ | ❌ | ✅ Auto-triage, release notes, standup | ✅ Sprint risk analysis, retro data |
| **DORA metrics** | ❌ | ❌ | ❌ | ❌ | ✅ Full dashboard | ✅ Anomaly alerts, trend analysis |
| **Docs auto-sync** | ❌ | ❌ | ❌ | ❌ | ✅ Regenerated on every commit | ✅ Doc Health Scorecard CI gate |
| **Ticket-to-deploy cycle** | Weeks | Weeks | Days | Days | **Hours** | **Minutes (autonomous)** |
| **A2A protocol support** | ❌ | ❌ | ❌ | ❌ | ✅ Bidirectional | ✅ + ACP + cross-registry |
| **Hermes agent integration** | ❌ | ❌ | ❌ | ❌ | ✅ NEXUS ↔ Hermes | ✅ NEXUS ↔ Any A2A platform |
| **Self-improving agents** | ❌ | ❌ | ❌ | ❌ | ✅ Prompts evolve nightly | ✅ + Tool learning + Workflow MCTS |
| **Agent A/B testing** | ❌ | ❌ | ❌ | ❌ | ✅ Canary + rollback | ✅ Automated canary with regression detect |
| **Global agent registry** | ❌ | ❌ | ❌ | ❌ | ✅ Discover any agent | ✅ Federated self-hosted + reputation |
| **Architecture drift detection** | ❌ | ❌ | ❌ | ❌ | ✅ Auto-detect + auto-fix | ✅ Bus factor + expertise heatmap |

---

**This document supersedes all previous roadmaps. Every feature listed is sourced from a real competitor. Every phase has a clear deliverable. No guessing.**
