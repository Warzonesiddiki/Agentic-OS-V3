# Agentic-OS-V3 — Performance, Tweaks, Optimization & Scale Code Manual

> **Repository:** `https://github.com/Warzonesiddiki/Agentic-OS-V3`  
> **Companion to:** `AGENTIC_OS_V3_PERFECT_AUDIT_AND_CODE_FIX_MANUAL.md`  
> **Purpose:** Provide agent-ready performance improvements, production tuning, indexes, observability, caching, frontend rendering tweaks, and benchmark guidance with copy-pasteable code.

---

## 0. How To Use This Document

Apply the P0 stabilization manual first. Then use this performance manual.

Recommended order:

```text
1. Apply P0 correctness/security fixes from AGENTIC_OS_V3_PERFECT_AUDIT_AND_CODE_FIX_MANUAL.md.
2. Confirm server tests are green: npm run typecheck && npm run lint && npm test.
3. Apply Section 3 metrics instrumentation.
4. Apply Section 4 database performance indexes.
5. Apply Section 5 cache helpers for hot non-mutating reads.
6. Apply Section 6 frontend rendering optimizations.
7. Apply Section 7 runtime/container/DB tuning.
8. Run benchmarks from Section 8.
```

Do not apply every optimization blindly in one commit. The safest sequence is:

```bash
# after each applied section
cd server
npm run typecheck
npm run lint
npm test
npm run build
```

For database changes, test on a copy of production data first.

---

## 1. Performance Audit Summary

### 1.1 Strong areas already present

The repo already has several good foundations:

- `@tanstack/react-virtual` is installed and `src/pages/Audit.tsx` already virtualizes audit rows.
- Server DB pool has bounded `max`, `idle_timeout`, `connect_timeout`, and statement timeout.
- Recall has corpus caps via `NEXUS_MAX_RECALL_CORPUS`.
- SSE event list is bounded by `MAX_EVENTS = 100`.
- In-memory LRU cache helper exists at `server/src/lib/lru-cache.ts`.
- Prometheus metric primitives exist at `server/src/services/metrics.ts`.
- Redis bus option exists.
- Worker has concurrency and timeout config.
- Drizzle schema contains many indexes.

### 1.2 Performance gaps

| Area | Current Risk | Fix |
|---|---|---|
| HTTP metrics | Metrics exist but app does not globally record every request | Add metrics middleware in `app.ts` |
| Prometheus labels | Potential high cardinality if raw paths are used | Normalize paths before labels |
| DB hot paths | Some common filters lack composite/GIN indexes | Add performance index migration |
| Recall | BM25 still loads a capped corpus and scores in process | Add indexes now; later add Postgres full-text search generated vectors |
| Health/system reads | Repeated count/health checks hit DB | Short TTL cache for non-mutating reads |
| Frontend memory grids | Memories page renders full filtered list | Add deferred search and/or virtualization for large collections |
| Remote writes | Silent async failures can create split-brain state | Add toast/error reporting and eventual authoritative remote mode |
| Docker | Node 20 Alpine + Playwright is suboptimal | Node 22 Debian slim + Playwright deps |
| CI | No benchmark/perf smoke tests | Add lightweight autocannon or k6 stage later |

---

# 2. Environment and Config Tweaks

## 2.1 Recommended `.env` performance defaults

Add these to `server/.env.example` or deployment environment:

```bash
# Database pool
NEXUS_DB_POOL_MAX=20
NEXUS_QUERY_TIMEOUT_MS=15000

# Recall
NEXUS_MAX_RECALL_CORPUS=10000
NEXUS_RRF_K=60
NEXUS_SEMANTIC_THRESHOLD=0.8
NEXUS_RECENCY_HALFLIFE_DAYS=30
NEXUS_RECALL_WEIGHT_RRF=0.5
NEXUS_RECALL_WEIGHT_IMPORTANCE=0.3
NEXUS_RECALL_WEIGHT_RECENCY=0.1
NEXUS_RECALL_WEIGHT_FEEDBACK=0.1

# Worker
NEXUS_WORKER_POLL_MS=2000
NEXUS_WORKER_MAX_CONCURRENCY=3
NEXUS_WORKER_TIMEOUT_MS=120000
NEXUS_WORKER_MAINTENANCE_MS=60000
NEXUS_WORKER_STALE_TASK_MS=300000
NEXUS_WORKER_HEARTBEAT_MS=120000

# Bus and rate limit
NEXUS_BUS_BACKEND=redis
NEXUS_REDIS_URL=redis://redis:6379
NEXUS_RATE_LIMIT_PER_MINUTE=120

# Logging
NEXUS_LOG_LEVEL=info
```

### Production tuning guidance

| Workload | Suggested `NEXUS_DB_POOL_MAX` | Notes |
|---|---:|---|
| Single local dev | 5-10 | Avoid exhausting laptop Postgres |
| Small server | 10-20 | Good default |
| Multi-instance behind PgBouncer | 5-10 per instance | Use transaction pooling |
| Heavy recall/LLM workload | 20-50 | Only if DB max connections supports it |

---

# 3. Server Metrics and Low-Overhead Observability

## 3.1 Replace `server/src/services/metrics.ts`

This version adds bounded-label metrics for HTTP, recall, cache, DB, tasks, and LLMs.

```typescript
/**
 * metrics.ts — Prometheus metrics for the NEXUS server.
 *
 * Performance-focused metrics. Keep label cardinality bounded:
 * - route paths must be normalized before being used as labels
 * - ids, hashes, queries, and user input must never be labels
 */
import promClient from "prom-client";

let _registry: promClient.Registry | null = null;

export function getRegistry(): promClient.Registry {
  if (!_registry) {
    _registry = new promClient.Registry();
    promClient.collectDefaultMetrics({ register: _registry, prefix: "nexus_process_" });
  }
  return _registry;
}

export const httpRequestDuration = new promClient.Histogram({
  name: "nexus_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [getRegistry()],
});

export const httpRequestsTotal = new promClient.Counter({
  name: "nexus_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status"],
  registers: [getRegistry()],
});

export const activeConnections = new promClient.Gauge({
  name: "nexus_active_connections",
  help: "Number of active SSE connections",
  registers: [getRegistry()],
});

export const dbQueryDuration = new promClient.Histogram({
  name: "nexus_db_query_duration_seconds",
  help: "Database query duration in seconds",
  labelNames: ["query"],
  buckets: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [getRegistry()],
});

export const taskProcessingDuration = new promClient.Histogram({
  name: "nexus_task_processing_duration_seconds",
  help: "Task processing duration in seconds",
  labelNames: ["kind", "status"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [getRegistry()],
});

export const recallDuration = new promClient.Histogram({
  name: "nexus_recall_duration_seconds",
  help: "Recall request duration in seconds",
  labelNames: ["mode"],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [getRegistry()],
});

export const recallCandidates = new promClient.Histogram({
  name: "nexus_recall_candidates_total",
  help: "Number of recall candidates scored before token packing",
  labelNames: ["mode"],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [getRegistry()],
});

export const cacheHitsTotal = new promClient.Counter({
  name: "nexus_cache_hits_total",
  help: "Application cache hits",
  labelNames: ["cache"],
  registers: [getRegistry()],
});

export const cacheMissesTotal = new promClient.Counter({
  name: "nexus_cache_misses_total",
  help: "Application cache misses",
  labelNames: ["cache"],
  registers: [getRegistry()],
});

export const llmDuration = new promClient.Histogram({
  name: "nexus_llm_duration_seconds",
  help: "LLM call duration in seconds",
  labelNames: ["model", "status"],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [getRegistry()],
});

export const llmTokensTotal = new promClient.Counter({
  name: "nexus_llm_tokens_total",
  help: "LLM token usage",
  labelNames: ["model", "kind"],
  registers: [getRegistry()],
});

export function normalizeMetricPath(path: string): string {
  return path
    .replace(/\/api\/v1\/memories\/[^/]+/g, "/api/v1/memories/:id")
    .replace(/\/api\/v1\/skills\/[^/]+/g, "/api/v1/skills/:id")
    .replace(/\/api\/v1\/agents\/[^/]+/g, "/api/v1/agents/:id")
    .replace(/\/api\/v1\/tasks\/[^/]+/g, "/api/v1/tasks/:id")
    .replace(/\/api\/v1\/cron\/[^/]+/g, "/api/v1/cron/:id")
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:uuid")
    .replace(/\/(mem|skl|prj|agt|tsk|apv|crn|traj)_[A-Za-z0-9_-]+/g, "/:$1_id");
}

export function metricsContentType(): string {
  return getRegistry().contentType;
}

export async function metricsOutput(): Promise<string> {
  return getRegistry().metrics();
}
```

## 3.2 Replace `server/src/app.ts`

This adds global HTTP request instrumentation. It keeps labels bounded through `normalizeMetricPath()`.

```typescript
/**
 * app.ts — the assembled Hono application (perimeter + versioned API + API-404
 * guard + optional dashboard). Extracted from index.ts so the whole perimeter
 * — including the "/api/* must return JSON, never the SPA" guard — is testable.
 */
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "./lib/env.js";
import { requestId, securityHeaders, cors, payloadLimit, rateLimit, authBackstop } from "./proxy.js";
import { api } from "./routes.js";
import { err } from "./lib/envelope.js";
import { log } from "./lib/logging.js";
import type { NexusEnv } from "./lib/hono-env.js";
import { httpRequestDuration, httpRequestsTotal, normalizeMetricPath } from "./services/metrics.js";

export function createApp(): Hono<NexusEnv> {
  const app = new Hono<NexusEnv>();

  // Perimeter guard — order matters.
  app.use("*", requestId);

  // Low-overhead HTTP metrics. This must wrap every downstream middleware/route,
  // and path labels must be normalized to avoid high-cardinality Prometheus data.
  app.use("*", async (c, next) => {
    const started = performance.now();
    await next();
    const elapsedSeconds = (performance.now() - started) / 1000;
    const path = normalizeMetricPath(c.req.path);
    const status = String(c.res.status);
    httpRequestsTotal.inc({ method: c.req.method, path, status });
    httpRequestDuration.observe({ method: c.req.method, path, status }, elapsedSeconds);
  });

  app.use("*", cors);
  app.use("*", securityHeaders);
  app.use("*", payloadLimit);
  app.use("*", rateLimit);
  app.use("*", authBackstop);

  app.route("/", api);

  // API 404 guard: unmatched /api/* returns a JSON envelope, NEVER the SPA.
  app.all("/api/*", (c) =>
    c.json(err("NOT_FOUND", `No route for ${c.req.method} ${c.req.path}`, c.get("requestId") ?? ""), 404)
  );

  // Optional single-file dashboard at the same origin.
  let dashboardHtml: string | null = null;
  try {
    dashboardHtml = readFileSync(resolve(env.NEXUS_DASHBOARD_DIR, "index.html"), "utf8");
    log.info("dashboard_loaded", { dir: env.NEXUS_DASHBOARD_DIR });
  } catch (e) {
    // Only tolerate ENOENT (file doesn't exist). Re-throw permission errors,
    // encoding errors, etc. — those are real problems, not "dashboard absent."
    if (e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT") {
      log.warn("dashboard_absent", { dir: env.NEXUS_DASHBOARD_DIR, note: "API-only mode." });
    } else {
      log.error("dashboard_load_failed", { dir: env.NEXUS_DASHBOARD_DIR, error: e instanceof Error ? e.message : String(e) });
    }
  }
  app.get("/*", (c) =>
    dashboardHtml ? c.html(dashboardHtml) : c.json(err("NOT_FOUND", "No route.", c.get("requestId") ?? ""), 404)
  );

  return app;
}
```

## 3.3 Validation

```bash
cd server
npm run typecheck
npm run lint
npm test
npm run build
```

Expected:

```text
No TypeScript errors.
No lint errors.
Tests continue to pass.
```

---

# 4. Database Performance Index Pack

## 4.1 Add migration file

Create:

`server/drizzle/0004_performance_indexes.sql`

```sql
-- 0004_performance_indexes.sql
-- Performance indexes for hot NEXUS query paths.
-- Safe to run repeatedly. Use CONCURRENTLY manually in production if tables are large.

CREATE INDEX IF NOT EXISTS memories_created_id_idx ON memories (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS memories_updated_id_idx ON memories (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS memories_kind_created_idx ON memories (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_project_created_idx ON memories (project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memories_tags_gin_idx ON memories USING gin (tags);

CREATE INDEX IF NOT EXISTS skills_created_id_idx ON skills (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS skills_category_rating_idx ON skills (category, rating DESC);
CREATE INDEX IF NOT EXISTS skills_tags_gin_idx ON skills USING gin (tags);

CREATE INDEX IF NOT EXISTS notes_indexed_id_idx ON notes (indexed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notes_tags_gin_idx ON notes USING gin (tags);
CREATE INDEX IF NOT EXISTS notes_wikilinks_gin_idx ON notes USING gin (wikilinks);

CREATE INDEX IF NOT EXISTS audit_log_created_seq_idx ON audit_log (created_at DESC, sequence DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_created_idx ON audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_created_idx ON audit_log (actor, created_at DESC);

CREATE INDEX IF NOT EXISTS token_ledger_created_idx ON token_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_item_helpful_idx ON feedback (item_id, helpful);

CREATE INDEX IF NOT EXISTS agents_status_updated_idx ON agents (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_tasks_status_priority_created_idx ON agent_tasks (status, priority ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_tasks_agent_status_idx ON agent_tasks (agent_id, status);
CREATE INDEX IF NOT EXISTS agent_tasks_trace_idx ON agent_tasks (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cron_jobs_enabled_next_idx ON cron_jobs (enabled, next_run_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS trajectory_logs_agent_created_idx ON trajectory_logs (agent_id, created_at DESC);
```

## 4.2 Production application guidance

For a large existing DB, do **not** create all indexes in one blocking migration. Use `CONCURRENTLY` manually:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS memories_created_id_idx ON memories (created_at DESC, id DESC);
```

Important:

- `CREATE INDEX CONCURRENTLY` cannot run inside a normal transaction.
- Drizzle migrations usually run in transaction-like flows depending on driver/tooling. For very large tables, run these indexes through a DBA/manual migration window.
- For local/dev/CI, the provided non-concurrent migration is fine.

## 4.3 Why these indexes matter

| Index | Speeds up |
|---|---|
| `memories_created_id_idx` | newest memory pagination |
| `memories_updated_id_idx` | recall corpus ordering and freshness ranking |
| `memories_kind_created_idx` | kind filters in UI/API |
| `memories_tags_gin_idx` | tag filters |
| `skills_category_rating_idx` | skill category and top-rated lists |
| `notes_tags_gin_idx` | vault tag search |
| `audit_log_created_seq_idx` | newest audit views |
| `audit_log_action_created_idx` | audit action filters |
| `agent_tasks_status_priority_created_idx` | worker queue polling |
| `cron_jobs_enabled_next_idx` | cron tick due-job scan |
| `trajectory_logs_agent_created_idx` | agent LLM trajectory timelines |

---

# 5. Cache Helpers For Hot Non-Mutating Reads

## 5.1 Add `server/src/lib/perf-cache.ts`

```typescript
/**
 * perf-cache.ts — tiny typed TTL cache helpers for hot read paths.
 *
 * This cache is intentionally process-local. It is for cheap short-lived caching
 * of health/system/status style reads, not authoritative business data.
 */
import { cacheHitsTotal, cacheMissesTotal } from "../services/metrics.js";

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache<K, V> {
  private readonly map = new Map<K, CacheEntry<V>>();

  constructor(
    private readonly name: string,
    private readonly maxEntries: number,
    private readonly defaultTtlMs: number,
  ) {}

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      cacheMissesTotal.inc({ cache: this.name });
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      cacheMissesTotal.inc({ cache: this.name });
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    cacheHitsTotal.inc({ cache: this.name });
    return entry.value;
  }

  set(key: K, value: V, ttlMs = this.defaultTtlMs): void {
    if (this.map.size >= this.maxEntries && !this.map.has(key)) {
      const oldest = this.map.keys().next().value as K | undefined;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export const healthStatusCache = new TTLCache<string, unknown>("health_status", 4, 2_000);
export const systemSummaryCache = new TTLCache<string, unknown>("system_summary", 4, 5_000);
```

## 5.2 Optional patch: cache health endpoint briefly

Patch `server/src/routes.ts` health route from:

```typescript
api.get("/api/v1/health", async (c) => {
  const dbOk = await dbReachable();
  const killSwitch = await isKillSwitchOn();
  const status = dbOk && !killSwitch ? "ok" : killSwitch ? "locked" : "degraded";
  const code = dbOk ? 200 : 503;
  return c.json(ok({
    status,
    timestamp: Date.now(),
    components: { db: dbOk ? "ok" : "down", killSwitch },
  }, c.get("requestId") ?? ""), code);
});
```

To:

```typescript
import { healthStatusCache } from "./lib/perf-cache.js";

api.get("/api/v1/health", async (c) => {
  const cached = healthStatusCache.get("health");
  if (cached) return c.json(ok(cached, c.get("requestId") ?? ""));

  const dbOk = await dbReachable();
  const killSwitch = await isKillSwitchOn();
  const status = dbOk && !killSwitch ? "ok" : killSwitch ? "locked" : "degraded";
  const body = {
    status,
    timestamp: Date.now(),
    components: { db: dbOk ? "ok" : "down", killSwitch },
  };
  healthStatusCache.set("health", body, dbOk ? 2_000 : 250);
  const code = dbOk ? 200 : 503;
  return c.json(ok(body, c.get("requestId") ?? ""), code);
});
```

### Warning

Use short TTL only. Health endpoints are often used by load balancers; caching for 1-2 seconds reduces DB pings without hiding outages for long.

---

# 6. Frontend Rendering Optimizations

## 6.1 Add reusable deferred value hook

Create:

`src/lib/useDebouncedValue.ts`

```typescript
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
```

## 6.2 Patch `src/pages/Memories.tsx` search to avoid filtering on every keystroke

Add import:

```typescript
import { useDebouncedValue } from "../lib/useDebouncedValue";
```

Then after state:

```typescript
const debouncedQ = useDebouncedValue(q, 150);
```

Change filter from:

```typescript
if (q && !(m.title + m.content).toLowerCase().includes(q.toLowerCase())) return false;
```

To:

```typescript
if (debouncedQ && !(m.title + m.content).toLowerCase().includes(debouncedQ.toLowerCase())) return false;
```

For large memory counts, also wrap filtered calculation in `useMemo`:

```typescript
const filtered = useMemo(() => s.memories.filter((m) => {
  if (kind && m.kind !== kind) return false;
  if (tag && !m.tags.includes(tag)) return false;
  if (debouncedQ && !(m.title + m.content).toLowerCase().includes(debouncedQ.toLowerCase())) return false;
  return true;
}), [s.memories, kind, tag, debouncedQ]);
```

## 6.3 Virtualize memory list when memory count is high

`@tanstack/react-virtual` is already installed. For a future full refactor, use this structure:

```tsx
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const parentRef = useRef<HTMLDivElement>(null);
const virtualizer = useVirtualizer({
  count: filtered.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 190,
  overscan: 8,
});

return (
  <div ref={parentRef} className="h-[720px] overflow-auto">
    <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
      {virtualizer.getVirtualItems().map((row) => {
        const m = filtered[row.index];
        if (!m) return null;
        return (
          <div
            key={m.id}
            className="absolute left-0 right-0 px-1 py-1"
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {/* existing memory card for m */}
          </div>
        );
      })}
    </div>
  </div>
);
```

Do this only after P0 gates pass because it is a UI refactor.

## 6.4 SSE client memory cap tuning

Current cap is:

```typescript
const MAX_EVENTS = 100;
```

Make configurable:

```typescript
const MAX_EVENTS = Number(import.meta.env.VITE_NEXUS_SSE_MAX_EVENTS ?? 100);
```

Then document in `.env.example`:

```bash
VITE_NEXUS_SSE_MAX_EVENTS=100
```

Avoid setting above 1000 unless you virtualize event displays.

---

# 7. Recall Optimization Strategy

## 7.1 Current behavior

`server/src/services/recall.ts` currently:

- Loads a capped memory/skill/note corpus.
- Scores lexical BM25 in Node.
- Optionally scores semantic pgvector results.
- Blends RRF, importance, recency, and feedback.
- Packs under token budget.

This is good enough for early scale, but it will eventually bottleneck at large corpora.

## 7.2 Near-term safe tuning

Set:

```bash
NEXUS_MAX_RECALL_CORPUS=10000
```

For low-memory servers:

```bash
NEXUS_MAX_RECALL_CORPUS=3000
```

For strong DB/server:

```bash
NEXUS_MAX_RECALL_CORPUS=25000
```

## 7.3 Medium-term: Postgres full-text candidate prefilter

Add generated `tsvector` columns later:

```sql
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
  setweight(to_tsvector('english', array_to_string(tags, ' ')), 'C')
) STORED;

CREATE INDEX IF NOT EXISTS memories_search_vector_gin_idx
ON memories USING gin (search_vector);
```

Then fetch top lexical candidates from Postgres before BM25/RRF:

```typescript
const lexicalCandidates = await db.execute(sql`
  SELECT id, ts_rank_cd(search_vector, websearch_to_tsquery('english', ${query})) AS rank
  FROM memories
  WHERE search_vector @@ websearch_to_tsquery('english', ${query})
  ORDER BY rank DESC
  LIMIT 500
`);
```

This avoids loading the whole capped corpus into Node.

## 7.4 Recall metrics

After replacing metrics.ts, instrument `recall()` around main work:

```typescript
import { recallCandidates, recallDuration } from "./metrics.js";

const started = performance.now();
try {
  // existing recall work
  recallCandidates.observe({ mode: useSemantic ? "semantic" : "lexical" }, allCandidates.size);
  return result;
} finally {
  recallDuration.observe({ mode: useSemantic ? "semantic" : "lexical" }, (performance.now() - started) / 1000);
}
```

Be careful to import from correct relative path. In `server/src/services/recall.ts`, use:

```typescript
import { recallCandidates, recallDuration } from "./metrics.js";
```

---

# 8. Benchmarking and Regression Tests

## 8.1 Add benchmark scripts to `server/package.json`

Install optional dev dependency:

```bash
cd server
npm install -D autocannon
```

Add scripts:

```json
{
  "scripts": {
    "bench:health": "autocannon -d 15 -c 50 http://localhost:9900/api/v1/health",
    "bench:metrics": "autocannon -d 15 -c 20 http://localhost:9900/api/v1/metrics"
  }
}
```

For authenticated endpoints, use autocannon headers:

```bash
autocannon -d 30 -c 20 \
  -H "authorization=Bearer $NEXUS_API_KEY" \
  "http://localhost:9900/api/v1/memories?limit=50"
```

## 8.2 Basic benchmark checklist

Run before/after optimization:

```bash
# terminal 1
cd server
npm run dev

# terminal 2
npm run bench:health
npm run bench:metrics
```

Capture:

- requests/sec
- p50 latency
- p95 latency
- p99 latency
- error count
- memory usage
- CPU usage

## 8.3 Performance budget targets

Local dev targets are approximate:

| Endpoint | Target p95 | Notes |
|---|---:|---|
| `/api/v1/health` | < 25ms | should be cached/cheap |
| `/api/v1/metrics` | < 100ms | Prometheus serialization can vary |
| `/api/v1/memories?limit=50` | < 100ms | DB dependent |
| `/api/v1/recall?q=x&budget=1500` | < 800ms lexical | depends on corpus cap |
| SSE connect | < 250ms | token route dependent |

---

# 9. Production Runtime Tuning

## 9.1 Node flags

For server runtime:

```bash
NODE_OPTIONS="--max-old-space-size=2048 --enable-source-maps"
```

For small VPS:

```bash
NODE_OPTIONS="--max-old-space-size=1024 --enable-source-maps"
```

Do not set memory too high relative to container limit. Leave headroom for Postgres/Redis/OS.

## 9.2 Docker Compose resource limits

Add in compose for local stress testing:

```yaml
services:
  server:
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2g
        reservations:
          memory: 512m
```

Note: `deploy.resources` is honored by Swarm, not always by plain Docker Compose. For local Compose, use runtime flags or Docker Desktop resource limits.

## 9.3 Postgres tuning starter values

For a small dedicated Postgres container with 2-4GB RAM:

```sql
ALTER SYSTEM SET shared_buffers = '512MB';
ALTER SYSTEM SET effective_cache_size = '2GB';
ALTER SYSTEM SET maintenance_work_mem = '256MB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET max_connections = '100';
SELECT pg_reload_conf();
```

These are not universal. Tune based on actual memory and workload.

## 9.4 PgBouncer recommendation

For multi-instance deployment, add PgBouncer. Keep app pool small per instance:

```bash
NEXUS_DB_POOL_MAX=5
```

Use PgBouncer transaction pooling and keep `prepare: false` in `db/client.ts`, which the repo already does.

---

# 10. LLM Performance and Cost Tweaks

## 10.1 Current quick win already in P0 manual

The P0 code manual adds `model?: string` so routed simple/medium/complex model selection actually works.

## 10.2 Add LLM metrics around `callLLMWithTrajectory`

Patch `server/src/services/llm-client.ts`:

```typescript
import { llmDuration, llmTokensTotal } from "./metrics.js";
```

Inside success path after result:

```typescript
llmDuration.observe({ model: result.model, status: "ok" }, latencyMs / 1000);
llmTokensTotal.inc({ model: result.model, kind: "prompt" }, result.usage.prompt);
llmTokensTotal.inc({ model: result.model, kind: "completion" }, result.usage.completion);
```

Inside catch path:

```typescript
llmDuration.observe({ model: "unknown", status: "error" }, latencyMs / 1000);
```

## 10.3 Model routing policy

Suggested env:

```bash
NEXUS_LLM_SIMPLE_MODEL=gpt-4o-mini
NEXUS_LLM_MEDIUM_MODEL=gpt-4o-mini
NEXUS_LLM_COMPLEX_MODEL=gpt-4o
```

For local Ollama/OpenAI-compatible routing:

```bash
NEXUS_LLM_BASE_URL=http://host.docker.internal:11434/v1
NEXUS_LLM_MODEL=qwen2.5:14b
NEXUS_LLM_SIMPLE_MODEL=qwen2.5:7b
NEXUS_LLM_MEDIUM_MODEL=qwen2.5:14b
NEXUS_LLM_COMPLEX_MODEL=qwen2.5:32b
```

Remember: `safeFetch()` blocks private hosts by SSRF policy. For local LLM development, either use a public/proxy endpoint or explicitly add a controlled allowlist feature. Do not weaken SSRF globally.

---

# 11. API Pagination and Payload Tweaks

## 11.1 Keep response payloads small

Current memory list caps `limit` to 500. Recommended defaults:

- UI default: 50-100
- API max: 500
- Export endpoints: stream or paginate for large datasets

## 11.2 Add field selection later

For memory list UI, avoid sending full content when showing cards. Add optional `summary=true` later:

```typescript
/api/v1/memories?limit=100&summary=true
```

Handler idea:

```typescript
const summary = c.req.query("summary") === "true";
if (summary) {
  const items = await db.select({
    id: memories.id,
    kind: memories.kind,
    title: memories.title,
    tags: memories.tags,
    importance: memories.importance,
    source: memories.source,
    updatedAt: memories.updatedAt,
    recallCount: memories.recallCount,
  }).from(memories).limit(limit);
}
```

This can significantly reduce payload size for large memory content.

---

# 12. Final Performance Acceptance Gates

After applying performance sections:

```bash
# server correctness
cd server
npm run typecheck
npm run lint
npm test
npm run build

# database
npm run db:generate
npm run db:push
npm run test:integration

# frontend
cd ..
npx tsc --noEmit
npm run build
```

Then run benchmarks:

```bash
cd server
npm run dev
# separate shell
autocannon -d 15 -c 50 http://localhost:9900/api/v1/health
autocannon -d 15 -c 20 http://localhost:9900/api/v1/metrics
```

Minimum acceptable result:

- No 5xx errors.
- No memory growth trend during short benchmark.
- Health p95 below 25ms on local DB.
- Metrics p95 below 100ms.
- Recall p95 measured and documented for your dataset size.

---

# 13. Priority Matrix

## Apply immediately

1. Metrics middleware and normalized labels.
2. Performance indexes.
3. Health/system short TTL cache.
4. Frontend debounced search.
5. LLM metrics.

## Apply after profiling

1. Full memory list virtualization.
2. Postgres full-text generated columns.
3. PgBouncer.
4. Redis-backed cache for multi-instance hot reads.
5. Streaming export/import.

## Avoid until necessary

1. Complex distributed task queues.
2. Kafka.
3. Heavy ORM abstractions around every query.
4. Premature microservices split.

---

# 14. Summary For Agentic AI

Your performance mission:

```text
1. Keep correctness tests green.
2. Add visibility first: metrics middleware and LLM/recall metrics.
3. Add safe DB indexes.
4. Cache only short-lived non-mutating reads.
5. Reduce frontend render pressure with debounce/virtualization.
6. Benchmark before and after.
7. Do not trade security for speed.
```

