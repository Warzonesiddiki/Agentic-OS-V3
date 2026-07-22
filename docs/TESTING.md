# Testing — NEXUS 2.0 / Agentic OS V3

> Vitest 3.2.6, globals, node env. Coverage provider v8 thresholds 60% branches/functions/lines/statements. Last reconciled 2026-07-22.

## Runners

```bash
cd server
npm test                    # vitest run (unit + component, no DB)
npm run test:watch          # vitest watch
npm run test:integration    # vitest --config vitest.integration.config.ts (needs DATABASE_URL Postgres+pgvector)
npm run test:coverage       # vitest run --coverage (text, json, html, lcov)
npm run validate            # lint + typecheck + test + integration gate + build
```

Root: `pnpm -r test` runs workspace members (packages/*, server). Frontend `src/` uses jsdom + @testing-library/react.

## Directory Structure

```
server/tests/
├── helpers/                # createTestDb, mock-llm, etc – clean DB per suite
├── lib/                    # errors.test.ts, auth-context.test.ts, envelope.test.ts, security-headers.test.ts
├── services/               # kernel.test.ts (40+ cases), llm-gateway-v2.test.ts (20+), agent-runtime, recall (12+), embeddings (10+), brain (10+), scheduler (20+), sse-bus (6+), etc
├── routes/                 # agents.test.ts, automation.test.ts, sse.test.ts, v3-upgrade.test.ts, agent-lifecycle.test.ts
├── e2e/system.e2e.test.ts  # no stub assertions – all real
├── migration.test.ts       # SQL migration creates expected tables
├── mcp-server.test.ts      # drives real Nexus MCP server over InMemoryTransport
└── integration/            # requires DATABASE_URL
```

Naming: `*.test.ts`, `*.spec.ts`. Mocks via `vi.mock()` + `vi.fn()`.

## Mocking Strategy

- DB boundary: `createTestDb` (SQLite in-memory) via `better-sqlite3` – note Node ABI mismatch env issue (see AGENTS.md) – use `pnpm rebuild better-sqlite3` on runner.
- LLM: `mock-llm.ts` helper – no real HTTP.
- Services: `vi.mock('../src/services/memory.service.js')` etc – matches import specifiers after Phase 2.1 split (no `services.js` barrel).
- Security: constant-time auth tested via `timingSafeEqual`, scrypt.

## SQLite Isolation

Each suite gets clean DB via `createTestDb`. FTS5 virtual tables for memories/skills/notes (client.ts) are created on first connect. Transactions use mutex + timeout 30s + exponential backoff for SQLITE_BUSY.

## Integration Prerequisites

- `DATABASE_URL=postgresql://postgres:password@localhost:5432/nexus_test` reachable
- `pgvector` extension: `CREATE EXTENSION vector;`
- CI uses `pgvector/pgvector:pg16` service container with healthcheck.

## CI Pipeline

- `.github/workflows/ci.yml`: `pnpm -r lint` → `pnpm -r typecheck` (fresh `--incremental false`) → `pnpm -r test` → `pnpm -r build` → Rust `cargo check/clippy/test` → integration-tests job (pgvector) → security-scan (CodeQL) → docker-build-push (GHCR) → CODEOWNERS coverage.
- Merge gate (Quill): full `cd server && npm run validate` must be green.

## Coverage

`server/vitest.config.ts`:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text','json','html','lcov'],
  exclude: ['node_modules/','dist/','tests/'],
  thresholds: { branches: 60, functions: 60, lines: 60, statements: 60 },
}
```

Current thresholds enforced via `--coverage` – CI fails below 60%. Per AGENTS.md Perfection Bar: new agents ≥80% for own area.

## Coverage Map

- Kernel: spawnAgent ring enforcement, privilege escalation denial, get/list/update/pause/resume/terminate/quarantine, incrementTokenUsage, enqueueTask idempotency, pickNextTask starvation, failTask retry + dead-letter, completeTask, checkACL all rings, authorizeToolCall allowed/denied/quarantined, recoverAgentProcesses, schedulerStatus – mocked `appendAudit`.
- LLM Gateway v2: pickProvider force/preferred/fallback/none, canCallProvider closed/open/half_open, recordSuccess threshold to closed, recordFailure to open, chargeBudget within/exceeded/expired/hard_kill, setBudget, killSession, estimateTokens, callLLMGateway with OmniRoute fallback – mocked provider adapters.
- Recall: empty corpus, BM25-only, semantic mode, RRF fusion boost, importance/recency/feedback, token budget packing, cursor pagination, FTS5 fallback, corpus proportional limits, ledger side effects.
- Embeddings: available check, rebuild (no provider/done/dim mismatch/API error/success), embedQuery.
- Brain: export, import valid/duplicate/invalid schema/empty, compress.
- Scheduler: CronParser valid/invalid/multiple/matches, scheduleJob valid/invalid cron, cancelJob existing/nonexistent, tick no due/one due, runWithRetry success/exhausted, triggerEvent matching/no matching, stop/start idempotency.
- SSE bus: add/remove client, broadcast all, writer removal on error, empty set, message format.

## Existing Gaps (tracked)

- better-sqlite3 Node-ABI mismatch blocks `pnpm run validate` in some shells – env issue, not code defect, fix via `pnpm rebuild better-sqlite3`.
- Frontend component tests in `src/` (AgentDrawer, AgentNode, Console, EventTicker) exist but need expansion.
- E2E Playwright for critical flows pending (Phase P2-06).

## Manual Verification (still useful)

- API Console: `POST /memories` no key → 401, invalid → 401, valid → 201, oversized → 413.
- Audit page: chain valid, verified count.
- Safety: kill-switch HTTP 423 on mutations.
