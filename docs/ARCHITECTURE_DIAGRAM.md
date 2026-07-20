# NEXUS 2.0 Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Agents Layer                            │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│   │ Claude  │ │ Codex   │ │ Cursor  │ │ Gemini  │ │ Custom  │    │
│   │ Code    │ │         │ │         │ │ CLI     │ │ Agents  │    │
│   └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘    │
└────────┼───────────┼───────────┼───────────┼───────────┼─────────┘
         │           │           │           │           │
         │           │           │           │           │
         └───────────┴───────────┼───────────┴───────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    │   REST / MCP / SSE      │
                    │                         │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Browser UI     │    │  Backend API    │    │  MCP Server     │
│  (React+Vite)   │    │  (Hono/Node)    │    │  (:9900/api/mcp)│
│  (:5173)        │    │  (:9900)        │    │                 │
│                 │    │                 │    │                 │
│  • PGlite       │    │  • REST API     │    │  • Tools        │
│  • Agent Tree   │    │  • SSE Events   │    │  • Resources    │
│  • Console      │    │  • Worker       │    │  • Prompts      │
│  • Event Ticker │    │  • Auth/Scopes  │    │                 │
└────────┬────────┘    └────────┬────────┘    └─────────────────┘
         │                      │
         │              ┌───────┴───────┐
         │              │               │
         │              ▼               ▼
         │    ┌─────────────────┐ ┌─────────────────┐
         │    │   PostgreSQL    │ │     Redis       │
         │    │   + pgvector   │ │   (optional)    │
         │    │   (:5432)      │ │   (:6379)       │
         │    │                 │ │                 │
         │    │  • Memories     │ │  • Pub/Sub      │
         │    │  • Skills       │ │  • Message Bus  │
         │    │  • Audit Log    │ │  • Sessions     │
         │    │  • Agents      │ │                 │
         │    │  • Tokens      │ │                 │
         │    └─────────────────┘ └─────────────────┘
         │
         └──────────────────────────────────────┐
                                                │
                              ┌─────────────────┴─────────────────┐
                              │         Agentic OS Kernel           │
                              │                                     │
                              │  ┌─────────────────────────────────┐│
                              │  │  Ring Model (0-4)               ││
                              │  │  • Ring 0: Kernel               ││
                              │  │  • Ring 1: System               ││
                              │  │  • Ring 2: Sub-agents           ││
                              │  │  • Ring 3: User                 ││
                              │  └─────────────────────────────────┘│
                              │                                     │
                              │  ┌─────────────────────────────────┐│
                              │  │  Services                       ││
                              │  │  • Memory System                ││
                              │  │  • Recall Engine                ││
                              │  │  • Scheduler                   ││
                              │  │  • LLM Router                  ││
                              │  │  • Sandbox                     ││
                              │  │  • Audit Engine                ││
                              │  └─────────────────────────────────┘│
                              │                                     │
                              │  ┌─────────────────────────────────┐│
                              │  │  Security                       ││
                              │  │  • API Key Auth (scrypt)       ││
                              │  │  • Hash-Chained Audit          ││
                              │  │  • Kill Switch                 ││
                              │  │  • Rate Limiting               ││
                              │  └─────────────────────────────────┘│
                              └─────────────────────────────────────┘
```

## Data Flow

```
User Query
    │
    ▼
┌─────────┐
│ Router  │ (Hono)
└────┬────┘
     │
     ▼
┌─────────────┐    ┌─────────────┐
│   Auth      │───▶│   Scope     │
│   Middleware│    │   Check     │
└──────┬──────┘    └─────────────┘
       │
       ▼
┌─────────────┐
│   Service   │
│   Handler   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Database  │
│   (Drizzle) │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Response  │
│   Envelope  │
└─────────────┘
```

## Key Components

| Component | Description | File(s) |
|-----------|-------------|---------|
| Kernel | Agent lifecycle, syscalls | `services/kernel.ts` |
| Scheduler | Cron/event scheduling | `services/scheduler.ts` |
| Recall | Semantic search (RRF) | `services/recall.ts` |
| Memory | Memory CRUD operations | `services/memory-*.ts` |
| LLM | LLM provider abstraction | `services/llm*.ts` |
| Audit | Hash-chained audit log | `services/audit-*.ts` |
| Sandbox | Code execution isolation | `services/sandbox.ts` |
| MCP | Model Context Protocol | `mcp.ts` |
