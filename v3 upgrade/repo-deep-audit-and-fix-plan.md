# NEXUS / Agentic-OS-V3 — Deep Repository Audit and Precision Fix Plan

> Repository audited: `https://github.com/Warzonesiddiki/Agentic-OS-V3`  
> Audit date: 2026-06-29  
> Auditor: Arena.ai Agent Mode  
> Goal: make the expansion documentation and implementation path match the real repository with zero-compromise code quality.

---

## 1. Executive Summary

The live GitHub repository is **not** specification-only. It contains a substantial runnable codebase:

- **~20,319 lines** of TypeScript/TSX across **117 source files** under `src/`, `server/src/`, and `shared/`.
- A React/Vite browser dashboard at the repository root.
- A Node/Hono/Drizzle/PostgreSQL server under `server/`.
- 19 Drizzle tables in `server/src/db/schema.ts`.
- REST routes, MCP transport, SSE, task worker, Redis-capable bus, Prometheus metrics, OpenTelemetry hooks, sandbox execution, pgvector-aware schema, multi-agent routes, and browser local-mode engine.

The earlier `expansion-complete-with-code.md` I generated was based on the uploaded `23-project-status-and-file-inventory.md`, which claimed **zero executable source files**. That claim is false for the current GitHub repo. Therefore the expansion document must be treated as a **migration/additive plan**, not a fresh greenfield file-transcription plan.

### Validation commands run locally

| Area | Command | Result |
|---|---|---|
| Frontend install/build | `npm ci && npm run build` | ✅ Passed. Produced single-file `dist/index.html`. |
| Frontend typecheck | `npx tsc --noEmit` | ✅ Passed. |
| Server install | `cd server && npm ci` | ✅ Installed, but Node 20 shows an engine warning from transitive `p-retry@8` requiring Node >=22. |
| Server typecheck | `npm run typecheck` | ✅ Passed before and after targeted fixes. |
| Server build | `npm run build` | ✅ Passed. |
| Server lint | `npm run lint` | ❌ Failed on one test unused variable before targeted fix. ✅ Passed after targeted fix. |
| Server unit tests | `npm test` | ❌ Failed/hung; details below. |
| Safe subset tests | `vitest run guards/env/llm/audit/tokens/vault/metrics/otel` | ✅ 64/64 passed after targeted guard/env-laziness fixes. |
| Drizzle generate | `npm run db:generate` | ❌ Failed before targeted schema fix. ✅ Generated migration after targeted fix. |
| Root production audit | `npm audit --omit=dev` | ✅ 0 vulnerabilities. |
| Server production audit | `npm audit --omit=dev` | ✅ 0 vulnerabilities in final re-run. |

---

## 2. Current Repository Architecture — What Actually Exists

### 2.1 Frontend

Root application:

- `src/App.tsx`
- `src/store.ts`
- `src/lib/engine.ts` — browser local persistence engine using `localStorage`.
- `src/lib/remote.ts` — typed REST client for server mode.
- `src/lib/api.ts` — in-browser REST/MCP simulator/perimeter.
- `src/lib/os/*` — Browser OS kernel/store/policy/lifecycle/diagnostics.
- Pages: dashboard, memories, recall, projects, skills, vault, audit, safety, sessions, docs, settings, plus OS pages.

Frontend build is healthy.

### 2.2 Server

Server application:

- `server/src/index.ts` — bootstrap, schema verification, MCP path split, worker start, graceful shutdown.
- `server/src/app.ts` — Hono app with perimeter guard, API routing, SPA fallback guard.
- `server/src/routes.ts` — core API routes.
- `server/src/routes/agents.ts` — agents/tasks/worker/cron/ambient APIs.
- `server/src/mcp.ts`, `server/src/mcp-http.ts` — MCP server/HTTP transport.
- `server/src/db/schema.ts` — 19-table Drizzle schema.
- `server/src/services/task-worker.ts` — background worker loop.
- `server/src/services/kernel.ts` — agents/tasks/scheduler state.
- `server/src/services/operations-ext.ts` — cron, ambient ingest, HITL resume, circuit breaker, Zod validation retry.
- `server/src/services/llm.ts`, `llm-client.ts`, `llm-router.ts` — OpenAI-compatible LLM client, trajectory logging, routing tiers.
- `server/src/services/bus.ts`, `sse.ts` — in-memory/Redis bus abstraction for SSE.
- `server/src/services/metrics.ts` — Prometheus registry and `/api/v1/metrics` endpoint.
- `server/src/services/sandbox.ts` — Docker or Node `vm.Script` sandbox.
- `server/src/services/recall.ts`, `embeddings.ts`, `brain.ts`, `vault.ts`, etc.

### 2.3 Database

`server/src/db/schema.ts` exports 19 tables:

1. `memories`
2. `skills`
3. `projects`
4. `notes`
5. `auditLog`
6. `merkleCheckpoints`
7. `anchoredRoots`
8. `tokenLedger`
9. `feedback`
10. `systemMeta`
11. `apiKeys`
12. `trajectoryLogs`
13. `toolReceipts`
14. `agents`
15. `agentTasks`
16. `cronJobs`
17. `sandboxExecutions`
18. `stateSnapshots`
19. `compiledScripts`

This means the expansion document’s schema code must not replace the current schema wholesale. Any new schema must be expressed as a migration/delta against these 19 tables.

---

## 3. Critical Findings and Exact Fixes

## P0-1 — Server unit test suite is not green

### Evidence

Running `cd server && npm test` initially produced:

- 6 failing assertions in `tests/guards-extended.test.ts`:
  - IPv6 loopback `::1` not blocked.
  - IPv6 link-local `fe80::1` not blocked.
  - IPv6 unique-local `fc00::1` not blocked.
  - Bracketed IPv6 `[::1]` / `[fe80::1]` not blocked.
  - Absolute vault paths under root such as `/vault/notes.md` accepted.
  - Literal escaped null-byte path strings such as `safe\0evil.md` accepted.
- 4 test files failed at import time because `DATABASE_URL` was read too early through `logging.ts` / schema import chains.
- After fixing import-time env access and guard logic, a targeted safe subset passed 64/64 tests, but full `npm test` still hung in `sandbox.test.ts` because one test invokes a synchronous infinite loop function outside the `vm.Script` timeout boundary.

### Root causes

1. `isPrivateHost()` normalized hosts by stripping brackets and then splitting on `:`, which breaks IPv6. `::1` becomes an empty string.
2. `safeVaultPath()` accepted absolute paths that resolved inside the vault root. The tests and safer security posture require **only vault-relative paths**.
3. `safeVaultPath()` only rejected actual NUL bytes, not the literal two-character escaped form `\0`.
4. `logging.ts` computed `const THRESHOLD = LEVELS[env.NEXUS_LOG_LEVEL]` at module import time. Because `env` is a Proxy, this defeats lazy validation and causes unrelated pure tests to require `DATABASE_URL`.
5. `schema.ts` imported `env` and read `env.NEXUS_EMBEDDING_DIM` while Drizzle Kit loads the schema. Because `drizzle-kit` transpiles the TypeScript schema in a CommonJS context, importing `../lib/env.js` from a `.ts` source file caused module resolution failure and also unnecessary env coupling.
6. `sandbox.test.ts` expects `script.runInContext(..., { timeout })` to protect the later call to the returned function. In Node `vm`, the timeout protects execution during `runInContext`, not arbitrary later invocation of a function returned from that context.

### Required fixes

#### Fix `server/src/lib/guards.ts`

```ts
const PRIVATE_IPV4_RE = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|169\.254\.|0\.)/i;
const PRIVATE_IPV6_RE = /^(::1$|::$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:|fec0:|ff0[0-9a-f]:)/i;

function normalizeHost(host: string): string {
  return host.trim().replace(/^\[|\]$/g, "").toLowerCase();
}

export function isPrivateHost(host: string): boolean {
  if (!host) return false;
  const normalized = normalizeHost(host);
  if (!normalized) return false;
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;

  if (normalized.includes(":")) {
    return PRIVATE_IPV6_RE.test(normalized);
  }

  const ipv4OrHostname = normalized.split(":")[0] ?? normalized;
  return PRIVATE_IPV4_RE.test(ipv4OrHostname);
}

export function safeVaultPath(rawPath: string, root: string): { ok: boolean; resolved?: string; reason?: string } {
  if (rawPath.includes("\0") || rawPath.includes("\\0")) return { ok: false, reason: "Null byte detected." };
  if (path.isAbsolute(rawPath)) return { ok: false, resolved: rawPath, reason: "Absolute paths are not accepted; provide a vault-relative path." };
  const resolved = path.resolve(root, rawPath);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false, resolved, reason: "Path escapes vault root." };
  return { ok: true, resolved };
}
```

#### Fix `server/src/lib/logging.ts`

Do not dereference `env` at import time:

```ts
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
function threshold(): number { return LEVELS[env.NEXUS_LOG_LEVEL]; }

function emit(level: keyof typeof LEVELS, msg: string, fields?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold()) return;
  // existing body
}
```

#### Fix `server/src/db/schema.ts`

Remove the import of runtime env from schema definition and use `process.env` directly in a pure helper so Drizzle Kit can load the schema:

```ts
function embeddingDimension(): number {
  const parsed = Number(process.env.NEXUS_EMBEDDING_DIM ?? 1536);
  return Number.isInteger(parsed) && parsed >= 64 && parsed <= 8192 ? parsed : 1536;
}

export const vector = (dimension?: number) =>
  customType<{ data: number[]; driverData: string; config: { dimension: number } }>({
    dataType(config) {
      const dim = config?.dimension ?? embeddingDimension();
      return `vector(${dim})`;
    },
    // existing mapper
  })(`embedding`, { dimension: dimension ?? embeddingDimension() });
```

#### Fix `server/tests/bus.test.ts`

Either call the unsubscribe or name it with underscore consistently:

```ts
const _unsub = addSSEClient(writer);
```

#### Fix `server/tests/sandbox.test.ts`

Replace the incorrect timeout test with execution inside `runInContext`:

```ts
it("vm.Script enforces timeout", async () => {
  const vm = await import("node:vm");
  const context = vm.createContext({});
  const script = new vm.Script("while(true) {}");
  expect(() => script.runInContext(context, { timeout: 100 })).toThrow(/Script execution timed out/);
});
```

Or better, test the actual sandbox service API instead of raw `vm` behavior.

### Verification after targeted fixes

- `npm run typecheck` ✅
- `npm run lint` ✅
- `vitest run guards/env/llm/audit/tokens/vault/metrics/otel` ✅ 64 tests passed
- `npm run db:generate` ✅ generated a migration after schema import fix

Full `npm test` still requires the sandbox test timeout correction above.

---

## P0-2 — Drizzle migrations are inconsistent and db:generate was broken

### Evidence

Before the schema import fix:

```bash
cd server
DATABASE_URL=postgres://postgres:postgres@localhost:5432/nexus_test npm run db:generate
```

failed with:

```text
Error: Cannot find module '../lib/env.js'
Require stack:
- server/src/db/schema.ts
- drizzle-kit/bin.cjs
```

After removing the runtime env import from `schema.ts`, Drizzle Kit successfully detected all 19 tables and generated `drizzle/0003_bizarre_blindfold.sql`.

### Additional migration concerns

- `server/drizzle/0002_audit_partitions.sql` exists in the folder but is **not listed** in `server/drizzle/meta/_journal.json`. Drizzle migrations may not apply it in the expected order.
- There are two `0002_*` SQL files: `0002_audit_partitions.sql` and `0002_smooth_tony_stark.sql`. Duplicate numeric prefixes are confusing and can cause operator mistakes.
- Current Docker Compose uses `postgres:16-alpine`, but pgvector-aware code and docs expect `pgvector/pgvector:pg16` if semantic vector indexes are required.
- `with-pgvector.sql` is a separate manual schema file and not part of the canonical Drizzle migration journal.

### Required solution

1. Keep `server/src/db/schema.ts` as the single source of truth.
2. Rename/adopt the audit partition migration into the Drizzle journal properly, or document it as an optional manual DBA migration. Do not leave a silent orphan SQL file with a duplicate prefix.
3. Use `pgvector/pgvector:pg16` in dev/prod compose if vector recall is a required feature.
4. Add a boot-time schema mode warning:
   - pgvector installed + vector columns/indexes present: semantic recall enabled.
   - pgvector missing: lexical fallback only.
5. In CI, run `npm run db:generate -- --check` or an equivalent drift check to ensure schema and committed migrations do not diverge.

---

## P0-3 — CI is currently expected to fail

### Evidence

`.github/workflows/ci.yml` runs:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run db:push`
4. `npm test`
5. integration tests
6. build

Before fixes:

- `lint` fails on `tests/bus.test.ts` unused variable.
- `npm test` fails/hangs as described above.
- `db:push` may fail if pgvector vector columns require the extension but the CI service uses plain `postgres:16-alpine`.

### Required solution

- Apply the P0-1 fixes.
- Change CI PostgreSQL service image to `pgvector/pgvector:pg16` if pgvector is part of the schema path.
- Add a setup step before `db:push`:

```bash
psql "$DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS vector;'
```

- Pin Node version to the actual supported runtime. Since npm install warns about a transitive package requiring Node >=22, either:
  - move CI/Docker to Node 22, or
  - pin/override dependency versions so Node 20 is truly supported.

Recommended: standardize on **Node 22 LTS** for server CI/runtime unless there is a hard reason to stay on Node 20.

---

## P0-4 — Expansion document must be corrected for this repo

### Problem

The generated `expansion-complete-with-code.md` says to create files that already exist, including:

- `server/src/index.ts`
- `server/src/lib/env.ts`
- `server/src/db/client.ts`
- `server/src/services/task-worker.ts`
- `server/src/services/llm-router.ts` / LLM routing equivalents
- `src/lib/remote.ts`
- loading/error UI components

If followed literally, it would overwrite working code and introduce duplicate abstractions.

### Required solution

Create a corrected repo-specific companion document named:

`expansion-repo-aligned-implementation-plan.md`

Rules for that document:

1. Never instruct to overwrite existing files unless a diff is shown.
2. For existing modules, provide **patch-level changes**.
3. For new features, name new files only where there is no existing equivalent.
4. Treat current repo as NEXUS 2.x working codebase, not a blank V3 repo.
5. Replace generic LLM code with adapters that integrate with existing `server/src/services/llm.ts`, `llm-client.ts`, and `llm-router.ts`.
6. Replace generic task worker code with patches to existing `server/src/services/task-worker.ts` and `operations-ext.ts`.
7. Use the current API envelope and routes under `/api/v1`, not newly invented `/api/llm` routes unless explicitly added.

---

## 4. High-Impact Design Findings

## P1-1 — Multi-LLM gateway is still too OpenAI-compatible-centric

### Current state

`server/src/services/llm.ts` supports an OpenAI-compatible `/chat/completions` endpoint. `server/src/services/llm-router.ts` classifies simple/medium/complex tasks but does not actually select different provider clients. It also calculates model tiers but does not pass selected model into `callLLM()` because `LLMRequest` has no model override.

### Risk

The expansion goal says 8+ providers with failover, cost optimization, prompt caching, and embeddings. The current code only supports one configured OpenAI-compatible endpoint at a time.

### Solution

Add provider abstraction **without replacing existing LLM call sites**:

- Create `server/src/services/llm/providers.ts` with provider interface.
- Update `LLMRequest` to allow `model?: string` and `provider?: string`.
- Update `callLLM()` to use explicit request model when provided.
- Update `llm-router.ts` to pass selected model.
- Add failover in `callLLMWithTrajectory()` or a new `callGatewayWithTrajectory()`.
- Reuse existing `trajectoryLogs` schema instead of inventing a new one.
- Reuse `tokenLedger` only after adding appropriate cost columns or create a separate `llm_usage_ledger` migration.

### Minimum safe patch

```ts
export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}
```

Inside `callLLM()`:

```ts
const model = req.model || env.NEXUS_LLM_MODEL;
```

Inside `callRoutedLLM()`:

```ts
const selectedModel = complexity === "simple"
  ? cfg.simpleModel
  : complexity === "medium"
    ? cfg.mediumModel
    : cfg.complexModel;

return callLLMWithTrajectory({ messages, model: selectedModel, maxTokens, temperature }, opts);
```

---

## P1-2 — Remote frontend routing is optimistic and can diverge

### Current state

`src/store.ts` uses:

```ts
function route<T>(local: () => T, remoteFn: () => Promise<unknown>): T {
  if (remoteEnabled()) {
    remoteFn().then(() => syncFromRemote()).catch(() => {});
    return local();
  }
  return local();
}
```

### Risk

In remote mode, writes update localStorage immediately even if the server rejects the mutation. Errors are silently swallowed. This creates split-brain UI state.

### Solution

Introduce two explicit modes:

1. **Local mode**: local mutation only.
2. **Remote authoritative mode**: await remote mutation, then sync/update local mirror. Do not locally commit first unless using an explicit optimistic update with rollback and visible toast.

Recommended API:

```ts
async function routeRemote<TLocal, TRemote>(local: () => TLocal, remoteFn: () => Promise<TRemote>, reconcile: (remote: TRemote) => void): Promise<TLocal | TRemote> {
  if (!remoteEnabled()) return local();
  const result = await remoteFn();
  await syncFromRemote();
  return result;
}
```

Because React pages may currently expect synchronous return values, this is a larger frontend refactor. At minimum, stop swallowing errors:

```ts
remoteFn()
  .then(() => syncFromRemote())
  .catch((error) => {
    toast.error(error instanceof Error ? error.message : String(error));
    void syncFromRemote();
  });
```

---

## P1-3 — Auth verification scans active keys and cannot use the unique hash index

### Current state

`server/src/lib/security.ts` stores salted scrypt records. This is secure, but lookup requires loading all active principals and trying scrypt verification on each.

### Risk

O(N) scrypt checks on cache misses can become expensive with many API keys. However, direct DB lookup by `key_hash` is impossible because salts make the stored hash non-deterministic.

### Solution

Add a deterministic lookup prefix/fingerprint separate from the scrypt verifier:

- Add column: `key_lookup_hash text unique not null`.
- Compute `HMAC-SHA256(server_secret, rawKey)` or SHA-256 if no HMAC secret is available.
- Query by lookup hash first, then verify scrypt record constant-time.

This preserves salted KDF security and enables indexed lookup.

---

## P1-4 — Metrics exist but request instrumentation is incomplete

### Current state

`server/src/services/metrics.ts` defines counters/histograms and `/api/v1/metrics` exists, but `app.ts` does not visibly record HTTP request counters/durations globally.

### Solution

Add middleware after request ID and before route dispatch:

```ts
app.use("*", async (c, next) => {
  const started = performance.now();
  await next();
  const path = c.req.path.replace(/\/[0-9a-f-]{16,}/gi, "/:id");
  httpRequestsTotal.inc({ method: c.req.method, path, status: String(c.res.status) });
  httpRequestDuration.observe({ method: c.req.method, path, status: String(c.res.status) }, (performance.now() - started) / 1000);
});
```

---

## P1-5 — Sandbox fallback is safer than `new Function`, but still not a security boundary

### Current state

`server/src/services/sandbox.ts` uses Docker when enabled and Node `vm.Script` fallback otherwise.

### Risk

Node `vm` is isolation, not a hardened security boundary for hostile code. The comments should not imply it is equivalent to Docker/WASM.

### Solution

- In production, require `NEXUS_SANDBOX_ENABLED=true` for untrusted skill execution.
- If Docker is unavailable in production, fail closed.
- Keep `vm.Script` fallback only for development and trusted tests.
- Add Docker image hardening: non-root user, read-only FS, pids limit, no-new-privileges, dropped caps.

---

## P1-6 — Dockerfile lacks Playwright browser installation

### Current state

`server/src/services/browser.ts` lazy-loads Playwright. Server package includes `playwright`, but Dockerfile does not install Chromium/system dependencies.

### Risk

Browser automation routes/tasks fail in container runtime.

### Solution

Either:

- Use `mcr.microsoft.com/playwright:v1.49.0-jammy` as base for the runtime image, or
- Add browser install during build:

```dockerfile
RUN npx playwright install --with-deps chromium
```

Alpine is not ideal for Playwright; Debian/Ubuntu base is recommended.

---

## P1-7 — Root/server package strategy is split, not a workspace

### Current state

There are separate `package-lock.json` files at root and `server/`. CI handles this with two jobs.

### Risk

This is workable, but cross-package shared types and scripts can drift.

### Solution

Option A — keep split packages and document it.  
Option B — migrate to pnpm/npm workspaces.  
Do not partially introduce a workspace in the expansion doc unless migration is planned and tested.

For zero-risk near-term, keep current npm split-package structure.

---

## 5. Repo-Aligned Code Addendum for Expansion Document

These patches should replace the greenfield code blocks in the earlier expansion document where overlapping files already exist.

### 5.1 LLM model override patch

File: `server/src/services/llm.ts`

```ts
export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export async function callLLM(req: LLMRequest): Promise<LLMResponse> {
  if (!llmConfigured()) throw new Error("LLM provider not configured...");
  const env = getEnv();
  const model = req.model || env.NEXUS_LLM_MODEL;
  // rest unchanged
}
```

File: `server/src/services/llm-router.ts`

```ts
const model = complexity === "simple"
  ? cfg.simpleModel
  : complexity === "medium"
    ? cfg.mediumModel
    : cfg.complexModel;

return callLLMWithTrajectory(
  {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${query}\n\nContext:\n${contextText}` },
    ],
    maxTokens,
    temperature: complexity === "simple" ? 0.3 : 0.7,
  },
  { ...opts, circuitBreakerKey: `routed:${opts.agentId}:${complexity}` },
);
```

Note: current `callRoutedLLM()` receives `contextText` but does not include it in the LLM messages. That is likely a functional bug.

### 5.2 Test-safe sandbox timeout patch

File: `server/tests/sandbox.test.ts`

```ts
it("vm.Script enforces timeout", async () => {
  const vm = await import("node:vm");
  const context = vm.createContext({});
  const script = new vm.Script("while(true) {}");
  expect(() => script.runInContext(context, { timeout: 100 })).toThrow();
});
```

### 5.3 Schema import fix

Use the `embeddingDimension()` helper shown in P0-1.

### 5.4 Guard fix

Use the `isPrivateHost()` and `safeVaultPath()` patch shown in P0-1.

### 5.5 Logging laziness fix

Use the `threshold()` patch shown in P0-1.

---

## 6. Updated Roadmap Based on Real Repo

### Phase A — Stabilize current codebase

1. Apply P0-1 fixes.
2. Fix sandbox test hang.
3. Make `npm test` green.
4. Run integration tests with real Postgres/pgvector.
5. Fix CI to use pgvector image or lexical-only schema.
6. Clean Drizzle migration journal.

### Phase B — Make frontend remote mode authoritative

1. Stop silent remote write failures.
2. Add visible toast/error state for failed server writes.
3. Convert remote mutations to async authoritative flow.
4. Add e2e tests for local vs remote mode.

### Phase C — Extend existing LLM layer, do not replace it

1. Add model override bug fix.
2. Add provider registry behind existing `callLLM()` API.
3. Add failover and cost ledger migration.
4. Add provider health checks.
5. Add streaming route if not already exposed.

### Phase D — Production hardening

1. Require Docker sandbox in production for untrusted skill code.
2. Add Playwright-compatible server image.
3. Add key lookup fingerprint migration.
4. Add global HTTP metrics middleware.
5. Add Redis-backed rate limiter tests.
6. Add load tests for recall/task worker/SSE.

### Phase E — V3 expansion features

Only after A-D are green:

1. Plugin SDK/package.
2. Marketplace client/routes.
3. Visual pipeline engine/UI.
4. Voice service/UI.
5. Collaboration protocols.
6. Self-improvement engine with mandatory HITL gates.
7. Multi-tenant SaaS controls.

---

## 7. Final No-Compromise Acceptance Gates

A change is acceptable only when all pass:

```bash
# Frontend
npm ci
npx tsc --noEmit
npm run build

# Server
cd server
npm ci
npm run lint
npm run typecheck
npm run db:generate
npm test
npm run db:push
npm run test:integration
npm run build
npm audit --omit=dev
```

Additionally:

- No `catch {}` unless accompanied by a comment explaining why best-effort is safe.
- No broad `any` unless isolated to third-party dynamic imports and documented.
- No route returns raw errors outside the envelope.
- No schema change without a migration and test.
- No remote UI mutation silently swallows server failure.
- No production untrusted-code execution through Node `vm` fallback.
- No overwrite of existing repo files from the expansion doc without a diff.

---

## 8. Bottom Line

The repo is much further along than the uploaded status document claimed. The priority is not to transcribe a fresh codebase; it is to **stabilize, patch, and extend** the current implementation.

The highest-confidence immediate fixes are:

1. Guard IPv6/path fixes.
2. Lazy logging env access.
3. Schema env decoupling for Drizzle Kit.
4. Sandbox timeout test correction.
5. CI pgvector alignment.
6. LLM router model/context bug fix.
7. Remote frontend error handling.

Once these are applied and the validation gates are green, the V3 expansion code can be added safely as incremental modules.
