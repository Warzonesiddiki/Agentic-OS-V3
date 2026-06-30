# Architecture

## Two deliverables

NEXUS 2.0 ships two independent applications in one repo:

1. **Browser dashboard** (`/src`) — a React + Vite + Tailwind single-file app that runs the full domain logic in-browser against `localStorage`. This is the interactive demo and the control plane UI.
2. **Server** (`/server/`) — a Node.js + Hono + PostgreSQL + Drizzle backend with a real MCP server, CLI, and vitest test suite.

The two share **zero runtime code paths**. The browser app has a `remote.ts` client that can connect to the server, but the default mode is fully local.

```
┌──────────────────────┐     ┌──────────────────────────┐
│  Browser (src/)      │     │  Server (server/)         │
│                      │     │                           │
│  React + Vite        │     │  Hono + Postgres + Drizzle│
│  localStorage        │     │  MCP SDK (Streamable HTTP)│
│  engine.ts           │     │  services.ts              │
│  operations.ts       │     │  services/recall.ts       │
│  recall.ts           │     │  services/brain.ts        │
│  os/kernel.ts        │     │  routes.ts                │
│  api.ts (simulation) │     │  mcp.ts                   │
│  mcp.ts (simul.)     │     │  cli.ts                   │
└──────────┬───────────┘     └──────────┬────────────────┘
           │                            │
           └── remote.ts (optional) ────┘
```

## Browser architecture

```
main.tsx → ErrorBoundary → App.tsx → Shell.tsx
  ├── store.ts (brain store: useSyncExternalStore + localStorage)
  ├── osStore.ts (OS store: useSyncExternalStore + localStorage)
  ├── lib/engine.ts (NexusState, pub/sub, prune, audit hash chain)
  ├── lib/operations.ts (CRUD, session capture, transfer, safety utils)
  ├── lib/recall.ts (BM25 + importance/recency/feedback, token-budget pack)
  ├── lib/brain.ts (export/import/compress, audit verify, vault bridge)
  ├── lib/api.ts (browser-side perimeter guard — used by Console only)
  ├── lib/mcp.ts (MCP tool definitions — no transport in browser)
  ├── lib/os/kernel.ts (syscalls, scheduler, saga, bus, VFS, supervisor)
  ├── lib/os/lifecycle.ts (hooks: session-start, post-tool-use, session-end)
  ├── lib/os/diagnostics.ts (doctor, evals, drift, connectors)
  └── lib/os/policy.ts (tool registry, execution rings, approval gates)
```

## Server architecture

```
index.ts → bootstrap()
  ├── app.ts → Hono (proxy.ts perimeter + routes.ts)
  ├── mcp-http.ts → StreamableHTTPServerTransport (real MCP)
  ├── setup.ts → schema verification
  └── services.ts → domain operations (transactional + audit)

proxy.ts middleware chain:
  requestId → CORS → securityHeaders → payloadLimit → rateLimit → authBackstop

services.ts: every mutation runs in a single DB transaction with its audit entry.
services/recall.ts: BM25 + importance/recency + token-budget packing.
services/brain.ts: export/import (Zod-validated, deduped) + compress.
services/vault.ts: filesystem scan + markdown parse + path safety.
services/embeddings.ts: SSRF-safe optional LLM provider call.
```

## Key design decisions

- **Audit hash chain**: SHA-256 (browser: hand-rolled with NIST vectors; server: `node:crypto`), entries chained by previous-hash, advisory-locked appends (server).
- **Session capture invariant**: raw transcript is ALWAYS preserved on distillation failure — never lost.
- **Token-budgeted recall**: BM25 blended with importance/recency/feedback; greedily packed under budget; never exceeds it.
- **Auth**: scrypt (server) or SHA-256 domain-separated (browser); constant-time comparison; bounded cache; scoped principals.
- **Typed memory graph** (browser OS layer): cards with evidence[], confidence, stability, decay, contradiction states + graph edges.
