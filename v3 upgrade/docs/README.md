# 🌌 NEXUS V3 — COMPLETE IMPLEMENTATION GUIDE
## For: High-Capability AI Agent (3T+ Parameters)

> **MISSION:** Transform the NEXUS V2 codebase into a fully functional, production-grade Agentic OS.
> **METHOD:** Follow these documents in order. Each document contains complete, copy-pasteable code.
> **RULE:** No phase starts until the previous passes ALL success criteria.

---

## 📂 DOCUMENT INDEX

| # | Document | Phase | What It Contains |
|---|----------|-------|------------------|
| 0 | [00-database-schema.md](./00-database-schema.md) | 0 | Complete Drizzle schema for ALL 16 tables with pgvector, HNSW indexes, FKs |
| 1 | [01-server-core.md](./01-server-core.md) | 0 | Server bootstrap, env validation, DB client, health endpoint |
| 2 | [02-auth-security.md](./02-auth-security.md) | 0 | Scrypt auth, scope enforcement, rate limiting, perimeter guard |
| 3 | [03-audit-engine.md](./03-audit-engine.md) | 0 | Hash-chained audit, worker thread, trajectory logs, tool receipts |
| 4 | [04-memory-services.md](./04-memory-services.md) | 1 | Memory CRUD, skills, session capture, brain import/export |
| 5 | [05-recall-engine.md](./05-recall-engine.md) | 1 | RRF recall (BM25 + pgvector), embeddings pipeline, token budgeting |
| 6 | [06-rest-routes.md](./06-rest-routes.md) | 1 | ALL REST endpoints with Zod validation + auth + audit |
| 7 | [07-mcp-server.md](./07-mcp-server.md) | 1 | MCP tools, resources, prompts, StreamableHTTP transport |
| 8 | [08-task-worker.md](./08-task-worker.md) | 2 | Background task execution loop, handler dispatch |
| 9 | [09-llm-client.md](./09-llm-client.md) | 3 | LLM API client, trajectory logging, dynamic routing, fallback |
| 10 | [10-kernel-agents.md](./10-kernel-agents.md) | 2 | Multi-agent registry, scheduler, ACL, saga, HITL approvals |
| 11 | [11-frontend-store.md](./11-frontend-store.md) | 1 | Unified data source (local/remote switch), SSE hooks |
| 12 | [12-ui-components.md](./12-ui-components.md) | 5 | AgentNode, AgentDrawer, EventTicker, HoldToConfirm, DynamicComponent |
| 13 | [13-security-hardening.md](./13-security-hardening.md) | 4 | Redis bus, SSE tokens, CSP, OTel, Prometheus, sandbox execution |
| 14 | [14-advanced-features.md](./14-advanced-features.md) | 6 | VLM, Shadow Cognition, Swarm, Neural Compiler, Blockchain Anchor |
| 15 | [15-cli-connector.md](./15-cli-connector.md) | 1 | nexus CLI, Hermes connector, workspace sync |
| 16 | [16-docker-deploy.md](./16-docker-deploy.md) | 0 | Dockerfile, docker-compose, CI workflow |
| 17 | [17-testing.md](./17-testing.md) | 0 | Vitest unit + integration test patterns |

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NEXUS V3 — COMPLETE SYSTEM                        │
│                                                                     │
│  External Clients:                                                   │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ MCP Client │  │ Browser   │  │ CLI       │  │ Ambient Webhook  │  │
│  │ (Claude)  │  │ Dashboard │  │ (nexus)   │  │ (OMI/Voice)     │  │
│  └─────┬─────┘  └─────┬────┘  └─────┬─────┘  └────────┬─────────┘  │
│        │              │             │                 │            │
│        ▼              ▼             ▼                 ▼            │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │              Hono Server (Node.js 20) on :9900                │ │
│  │                                                               │ │
│  │  Perimeter: requestId → CORS → securityHeaders → payloadLimit │ │
│  │              → rateLimit → authBackstop                       │ │
│  │                                                               │ │
│  │  REST API (/api/v1/*)     MCP Server (/api/mcp)              │ │
│  │  SSE Stream (/api/v1/events)  Dashboard (/*)                  │ │
│  │                                                               │ │
│  │  Services:                                                    │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────────┐ │ │
│  │  │Memory  │ │Recall  │ │Skills  │ │Audit   │ │Task Worker│ │ │
│  │  │CRUD    │ │(RRF)   │ │Library │ │Chain   │ │(Loop)     │ │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └───────────┘ │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────────┐ │ │
│  │  │Kernel  │ │LLM     │ │Browser │ │Cron    │ │Skill      │ │ │
│  │  │(Agents)│ │Client  │ │(Playw.)│ │Daemons │ │Compiler   │ │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └───────────┘ │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               │                                     │
│  ┌────────────────────────────▼──────────────────────────────────┐ │
│  │         PostgreSQL 16 + pgvector + HNSW Indexes               │ │
│  │  16 tables: memories, skills, notes, audit_log, agents, ...  │ │
│  │  + Redis (message bus + rate limiting, optional)              │ │
│  │  + Docker-in-Docker (ephemeral sandboxes, optional)           │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📋 EXECUTION ORDER

```
Phase 0 (Days 1-2): Foundation Verification
  └→ 00-database-schema.md → Create all tables
  └→ 01-server-core.md → Boot server, verify health
  └→ 02-auth-security.md → Verify auth + scopes
  └→ 03-audit-engine.md → Verify hash chain
  └→ 16-docker-deploy.md → Docker Compose works
  └→ 17-testing.md → All tests pass

Phase 1 (Days 3-5): Full Connectivity  
  └→ 04-memory-services.md → CRUD works end-to-end
  └→ 05-recall-engine.md → RRF recall returns results
  └→ 06-rest-routes.md → All endpoints respond
  └→ 07-mcp-server.md → MCP client connects
  └→ 11-frontend-store.md → Dashboard reads from server
  └→ 15-cli-connector.md → CLI + Hermes work

Phase 2 (Days 6-10): Complete Features
  └→ 08-task-worker.md → Tasks execute
  └→ 10-kernel-agents.md → Multi-agent works

Phase 3 (Days 11-13): LLM Integration
  └→ 09-llm-client.md → Real distillation

Phase 4 (Days 14-18): Security
  └→ 13-security-hardening.md → Redis, OTel, sandbox

Phase 5 (Days 19-23): UI/UX
  └→ 12-ui-components.md → All new components

Phase 6 (Days 24-38): V2.5 Extensions
  └→ 14-advanced-features.md → VLM, Swarm, etc.

Phase 7 (Days 39-45): Performance
  └→ Pagination, tsvector, streaming
```

---

## ✅ COMPLETION CRITERIA

A feature is "DONE" when ALL of these are true:

1. ✅ `tsc --noEmit` passes with 0 errors
2. ✅ `vitest run` passes with 0 failures  
3. ✅ Works end-to-end (UI → API → DB → response → UI)
4. ✅ No silent error swallowing (every catch logs)
5. ✅ No hardcoded values (everything is in env config)
6. ✅ Every mutation appends to hash-chained audit_log
7. ✅ Every input is Zod-validated
8. ✅ Every response uses the envelope `{ ok, data, error, traceId }`
9. ✅ Tested with a real MCP client (not just curl)
10. ✅ Documented accurately (no overclaiming)
