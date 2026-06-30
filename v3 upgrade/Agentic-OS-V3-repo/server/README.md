# NEXUS 2.0 — Server (production-grade)

This directory is the **real, runnable backend**: a Node HTTP server (Hono) with
PostgreSQL (Drizzle ORM), Zod validation, a `proxy.ts` perimeter guard, a real
MCP server, the `nexus` CLI surface, and vitest tests.

> The repository also ships an **interactive dashboard** (`/src`, the Vite app).
> This `server/` package is the deployable system the dashboard simulates.

## Quick start

```bash
cd server
cp .env.example .env
docker compose up -d postgres      # Postgres on :5432
npm install
npm run db:push                    # Create tables from Drizzle schema
npm run dev                        # http://localhost:9900
```

The server verifies the schema is present at boot (`setup.ts` checks
`information_schema.tables`) and **fails loud** if tables are missing. Run
`npm run db:push` (or `db:migrate`) before first boot. On first boot, if no
operator key exists, one is generated and **printed once** — store it; use it
as `Authorization: Bearer <key>`.

### CLI

```bash
npm run cli -- status
npm run cli -- recall "connection pooling"
npm run cli -- remember --type fact --title "Use strict TS" "no any"
npm run cli -- capture --file transcript.txt --project my-app
npm run cli -- export > backup.json
npm run cli -- import backup.json
npm run cli -- audit
npm run cli -- doctor
npm run cli -- mcp-config
```

After `npm run build`, the CLI is also installable as the `nexus` binary.

### Serving the dashboard

Set `NEXUS_DASHBOARD_DIR` to a built dashboard (`../dist` by default) and the
API server will serve it at `/`, so the server + UI deploy as one unit at one
origin (no CORS).

## Validation

```bash
npm run typecheck   # strict tsc --noEmit
npm run test        # pure unit tests (security, recall, audit) — no DB needed
npm run test:integration  # HTTP + Postgres integration tests (needs db:push on test DB)
npm run build       # emit dist/
npm run validate    # lint + typecheck + test + integration + build
```

## Architecture

```
HTTP ─▶ proxy.ts (request id · CORS · payload limit · rate limit · security headers · auth backstop)
        └─▶ /api/v1/*  routes.ts (Zod validation · auth/scope · envelope · audit)
        └─▶ /api/mcp   mcp.ts     (MCP tools → same services)
services.ts / services/recall.ts  ─▶ db/client.ts (Drizzle, pooled, statement timeout)
lib/audit.ts  (node:crypto sha256, transactional, advisory-locked hash chain)
```

## Security model

- Keys hashed with **scrypt** (Node audited KDF); never stored raw.
- **Constant-time** comparison (`crypto.timingSafeEqual`).
- Every mutation requires auth (proxy backstop + per-route scope checks).
- All input validated with Zod; payload-size rejected before body parse.
- Rate limiting (token bucket, per IP); CORS configurable (no `*` in prod).
- Brain export **never** includes API keys or hashes.
- SSRF (private/loopback/link-local), path-traversal, prompt-injection & secret
  detection in `lib/guards.ts`.
- Audit append is **transactional + advisory-locked** so the chain is monotonic;
  critical failures throw (never swallowed).

## Key endpoints

```
GET  /api/v1/health                 (public)
GET  /api/v1/system
CRUD /api/v1/memories[/:id]
GET  /api/v1/recall?q=&budget=
CRUD /api/v1/skills[/:id]            POST /skills/:id/outcome
POST /api/v1/sessions/capture        (never loses transcript)
GET  /api/v1/projects                GET /api/v1/brain/export
GET  /api/v1/audit                   GET /api/v1/ledger
GET  /api/v1/safety                  POST /api/v1/safety/kill-switch
POST /api/mcp                        (MCP JSON-RPC, auth required)
```

## Known limitations (honest)

- MCP runs in **stateless** Streamable-HTTP mode (no resumable SSE sessions);
  sufficient for tool calls, but stateful sessions need `sessionIdGenerator`.
- Recall is BM25 lexical; the embeddings/LLM path is a documented fallback.
- Integration tests require a reachable Postgres test DB (they skip otherwise,
  with a visible warning).
- Rate limiting is per-process (use a shared store like Redis for multi-instance).
- This server folder is verified correct **by inspection** — run `npm run validate`
  in an environment with Node + Postgres to confirm.
