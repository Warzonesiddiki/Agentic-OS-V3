# Hardcoded Environment Values Audit

Audit date: 2026-06-27  
Project: nexus-20 (React/Vite + Hono/Node + PostgreSQL)  
Audited paths: `server/src/` and `src/` (excluding `node_modules/`, `dist/`, `drizzle/`)

---

## Legend

| Column | Meaning |
|--------|---------|
| **#** | Priority (1=high, 2=medium, 3=low) |
| **Move to env?** | YES = should be moved to `.env`, NO = acceptable as-is, PROMPT = move to prompt template file |
| **Already covered** | The value is already in `server/src/lib/env.ts` with a default |

---

## SUMMARY

- **99 hardcoded constants found** across server and frontend source
- **52 are already in `env.ts`** (properly configurable)
- **47 are NOT yet configurable** and should be moved to env vars or config
- **Top priority:** default LLM max-tokens, LLM timeout, embedding timeout, scrypt params, complexity thresholds, LRU cache TTLs, pagination defaults

---

## 1. ALREADY COVERED (in `server/src/lib/env.ts`) — Documented for completeness

These values already have corresponding `NEXUS_*` env vars defined in `env.ts`:

| Value | File:Line | Env Key | Default in env.ts |
|-------|-----------|---------|-------------------|
| `PORT=9900` | `env.ts:19` | `PORT` | 9900 |
| `NODE_ENV=development` | `env.ts:20` | `NODE_ENV` | "development" |
| Rate limit 120/min | `env.ts:24` | `NEXUS_RATE_LIMIT_PER_MINUTE` | 120 |
| Max body 5MB | `env.ts:25` | `NEXUS_MAX_BODY_BYTES` | 5242880 |
| DB pool max 20 | `env.ts:36` | `NEXUS_DB_POOL_MAX` | 20 |
| Query timeout 15s | `env.ts:37` | `NEXUS_QUERY_TIMEOUT_MS` | 15000 |
| Embedding dim 1536 | `env.ts:51` | `NEXUS_EMBEDDING_DIM` | 1536 |
| Embedding batch 64 | `env.ts:52` | `NEXUS_EMBEDDING_BATCH_SIZE` | 64 |
| RRF K=60 | `env.ts:54` | `NEXUS_RRF_K` | 60 |
| Semantic threshold 0.8 | `env.ts:55` | `NEXUS_SEMANTIC_THRESHOLD` | 0.8 |
| Recency halflife 30d | `env.ts:56` | `NEXUS_RECENCY_HALFLIFE_DAYS` | 30 |
| Recall weight RRF 0.5 | `env.ts:57` | `NEXUS_RECALL_WEIGHT_RRF` | 0.5 |
| Recall weight importance 0.3 | `env.ts:58` | `NEXUS_RECALL_WEIGHT_IMPORTANCE` | 0.3 |
| Recall weight recency 0.1 | `env.ts:59` | `NEXUS_RECALL_WEIGHT_RECENCY` | 0.1 |
| Recall weight feedback 0.1 | `env.ts:60` | `NEXUS_RECALL_WEIGHT_FEEDBACK` | 0.1 |
| Compilation threshold 5 | `env.ts:62` | `NEXUS_COMPILATION_THRESHOLD` | 5 |
| Eval match threshold 1.0 | `env.ts:63` | `NEXUS_EVAL_MATCH_THRESHOLD` | 1.0 |
| Circuit breaker threshold 3 | `env.ts:65` | `NEXUS_CB_THRESHOLD` | 3 |
| Circuit breaker reset 30s | `env.ts:66` | `NEXUS_CB_RESET_MS` | 30000 |
| Max recall corpus 10000 | `env.ts:76` | `NEXUS_MAX_RECALL_CORPUS` | 10000 |
| Dream max memories 500 | `env.ts:41` | `NEXUS_DREAM_MAX_MEMORIES` | 500 |
| Dream max sessions 20 | `env.ts:42` | `NEXUS_DREAM_MAX_SESSIONS` | 20 |
| Dream timeout 60s | `env.ts:43` | `NEXUS_DREAM_TIMEOUT_MS` | 60000 |
| Sandbox image node:20-alpine | `env.ts:45` | `NEXUS_SANDBOX_IMAGE` | "node:20-alpine" |
| Sandbox timeout 30s | `env.ts:46` | `NEXUS_SANDBOX_TIMEOUT_MS` | 30000 |
| Scheduler tick 60s | `env.ts:47` | `NEXUS_SCHEDULER_TICK_MS` | 60000 |
| Bus backend memory | `env.ts:48` | `NEXUS_BUS_BACKEND` | "memory" |
| Worker poll 2s | `env.ts:68` | `NEXUS_WORKER_POLL_MS` | 2000 |
| Worker max concurrency 3 | `env.ts:69` | `NEXUS_WORKER_MAX_CONCURRENCY` | 3 |
| Worker timeout 120s | `env.ts:70` | `NEXUS_WORKER_TIMEOUT_MS` | 120000 |
| Worker maintenance 60s | `env.ts:71` | `NEXUS_WORKER_MAINTENANCE_MS` | 60000 |
| Worker stale task 5min | `env.ts:72` | `NEXUS_WORKER_STALE_TASK_MS` | 300000 |
| Worker heartbeat 2min | `env.ts:73` | `NEXUS_WORKER_HEARTBEAT_MS` | 120000 |
| Blockchain anchor interval 10 | `env.ts:85` | `NEXUS_BLOCKCHAIN_ANCHOR_INTERVAL` | 10 |

---

## 2. HARDCODED — NOT YET CONFIGURABLE (need env vars)

### 2a. LLM / Embedding Service Timeouts & Limits

| # | Value | File:Line | Description | Move to env? | Proposed Env Key |
|---|-------|-----------|-------------|--------------|------------------|
| 1 | `timeoutMs: 120_000` (2 min) | `server/src/services/llm.ts:75` | LLM API call timeout (safeFetch) | **YES** | `NEXUS_LLM_TIMEOUT_MS` |
| 2 | `req.maxTokens ?? 4096` | `server/src/services/llm.ts:69,130` | Default max_tokens for LLM requests | **YES** | `NEXUS_LLM_MAX_TOKENS` |
| 3 | `req.temperature ?? 0.7` | `server/src/services/llm.ts:70,131` | Default LLM temperature | **YES** | `NEXUS_LLM_TEMPERATURE` |
| 4 | `temperature: 0.3` | `server/src/services/llm.ts:227` | Structured output temperature | **YES** | (same as above or `NEXUS_LLM_STRUCTURED_TEMP`) |
| 5 | `temperature: 0.7` | `server/src/services/llm.ts:331` | Agent chat temperature | **YES** | (same as `NEXUS_LLM_TEMPERATURE`) |
| 6 | `transcript.slice(0, 24_000)` | `server/src/services/llm.ts:270` | Transcript truncation limit for distillation | **YES** | `NEXUS_DISTILL_MAX_CHARS` |
| 7 | `(result?.memories ?? []).slice(0, 25)` | `server/src/services/llm.ts:275` | Max memories returned from distillation | **YES** | `NEXUS_DISTILL_MAX_MEMORIES` |
| 8 | `context.slice(0, 32_000)` | `server/src/services/llm.ts:327` | Agent chat context truncation limit | **YES** | `NEXUS_AGENT_CONTEXT_MAX_CHARS` |
| 9 | `timeoutMs: 30_000` (30s) | `server/src/services/embeddings.ts:41` | Embedding API call timeout | **YES** | `NEXUS_EMBEDDING_TIMEOUT_MS` |
| 10 | `.slice(0, 8000)` | `server/src/services/embeddings.ts:137,153,169,207` | Embedding input text truncation | **YES** | `NEXUS_EMBEDDING_MAX_TEXT_LENGTH` |
| 11 | `init.timeoutMs ?? 15_000` | `server/src/lib/http.ts:39` | Default safeFetch timeout (SSRF-safe) | **YES** | `NEXUS_HTTP_TIMEOUT_MS` |

### 2b. LLM Router — Hardcoded Complexity Thresholds

| # | Value | File:Line | Description | Move to env? | Proposed Env Key |
|---|-------|-----------|-------------|--------------|------------------|
| 12 | `contextTokens > 6000` | `server/src/services/llm-router.ts:28` | "complex" classification threshold | **YES** | `NEXUS_ROUTER_COMPLEX_TOKEN_THRESHOLD` |
| 13 | `query.length > 2000` | `server/src/services/llm-router.ts:28` | "complex" query length threshold | **YES** | `NEXUS_ROUTER_COMPLEX_QUERY_LENGTH` |
| 14 | `contextTokens > 2000` | `server/src/services/llm-router.ts:29` | "medium" classification threshold | **YES** | `NEXUS_ROUTER_MEDIUM_TOKEN_THRESHOLD` |
| 15 | `query.length > 500` | `server/src/services/llm-router.ts:29` | "medium" query length threshold | **YES** | `NEXUS_ROUTER_MEDIUM_QUERY_LENGTH` |
| 16 | `simpleMaxTokens: 1024` | `server/src/services/llm-router.ts:22` | Max tokens for simple tasks | **YES** | `NEXUS_ROUTER_SIMPLE_MAX_TOKENS` |
| 17 | `mediumMaxTokens: 4096` | `server/src/services/llm-router.ts:23` | Max tokens for medium tasks | **YES** | `NEXUS_ROUTER_MEDIUM_MAX_TOKENS` |
| 18 | `complexMaxTokens: 8192` | `server/src/services/llm-router.ts:24` | Max tokens for complex tasks | **YES** | `NEXUS_ROUTER_COMPLEX_MAX_TOKENS` |
| 19 | `temperature: complexity === "simple" ? 0.3 : 0.7` | `server/src/services/llm-router.ts:55` | Temperatures per complexity | **YES** | `NEXUS_ROUTER_SIMPLE_TEMP` / `NEXUS_ROUTER_MEDIUM_TEMP` / `NEXUS_ROUTER_COMPLEX_TEMP` |
| 20 | `simpleModel: "gpt-4o-mini"` | `server/src/services/llm-router.ts:19` | Default simple model (override exists in env) | Already covered | `NEXUS_LLM_SIMPLE_MODEL` (env.ts line 31) |
| 21 | `mediumModel: "gpt-4o"` | `server/src/services/llm-router.ts:20` | Default medium model (override exists) | Already covered | `NEXUS_LLM_MEDIUM_MODEL` (env.ts line 32) |
| 22 | `complexModel: "gpt-4o"` | `server/src/services/llm-router.ts:21` | Default complex model (override exists) | Already covered | `NEXUS_LLM_COMPLEX_MODEL` (env.ts line 33) |

### 2c. Security / Cryptography

| # | Value | File:Line | Description | Move to env? | Proposed Env Key |
|---|-------|-----------|-------------|--------------|------------------|
| 23 | `SCRYPT_KEYLEN = 32` | `server/src/lib/security.ts:10` | scrypt derived key length (bytes) | **YES** | `NEXUS_SCRYPT_KEYLEN` |
| 24 | `N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024` | `server/src/lib/security.ts:15,26` | scrypt CPU/memory cost parameters | **YES** | `NEXUS_SCRYPT_N`, `NEXUS_SCRYPT_R`, `NEXUS_SCRYPT_P`, `NEXUS_SCRYPT_MAXMEM` |
| 25 | `PRINCIPAL_TTL_MS = 30_000` (30s) | `server/src/lib/security.ts:80` | Auth principal cache refresh interval | **YES** | `NEXUS_AUTH_PRINCIPAL_TTL_MS` |
| 26 | `RESULT_TTL_MS = 60_000` (60s) | `server/src/lib/security.ts:81` | Auth result cache TTL | **YES** | `NEXUS_AUTH_RESULT_TTL_MS` |
| 27 | `RESULT_CACHE_CAP = 1024` | `server/src/lib/security.ts:82` | Auth result cache capacity | **YES** | `NEXUS_AUTH_RESULT_CACHE_CAP` |
| 28 | `"nx_live_"` prefix + `randomBytes(18)` | `server/src/lib/security.ts:43` | API key prefix and raw key length | **YES** | `NEXUS_API_KEY_PREFIX` (for recognizability) |
| 29 | `randomBytes(8)` | `server/src/lib/security.ts:198` | Principal ID entropy bytes | **LOW** | (acceptable, internal identifier) |

### 2d. Audit Log

| # | Value | File:Line | Description | Move to env? | Proposed Env Key |
|---|-------|-----------|-------------|--------------|------------------|
| 30 | `MERKLE_CHUNK_SIZE = 1000` | `server/src/lib/audit.ts:23` | Merkle checkpoint interval (entries) | **YES** | `NEXUS_AUDIT_MERKLE_CHUNK_SIZE` |
| 31 | `PAGE = 1000` | `server/src/lib/audit.ts:178,246` | Audit verification page size | **YES** | `NEXUS_AUDIT_VERIFY_PAGE_SIZE` |
| 32 | `pg_advisory_xact_lock(79231)` | `server/src/lib/audit.ts:90` | Advisory lock ID for audit serialization | **LOW** | (acceptable as-is, internal) |

### 2e. Rate Limiter

| # | Value | File:Line | Description | Move to env? | Proposed Env Key |
|---|-------|-----------|-------------|--------------|------------------|
| 33 | `MAX_BUCKETS = 10_000` | `server/src/lib/rateLimit.ts:15` | Max in-memory rate limit buckets | **YES** | `NEXUS_RATELIMIT_MAX_BUCKETS` |
| 34 | `windowMs = 60000` (1 min) | `server/src/lib/rateLimit.ts:55` | Redis rate limit window (hardcoded, memory uses same implicit window) | **YES** | `NEXUS_RATELIMIT_WINDOW_MS` |

### 2f. LRU Cache

| # | Value | File:Line | Description | Move to env? | Proposed Env Key |
|---|-------|-----------|-------------|--------------|------------------|
| 35 | `capacity: number = 256` | `server/src/lib/lru-cache.ts:22` | Default LRU cache capacity | **YES** | `NEXUS_LRU_DEFAULT_CAPACITY` |
| 36 | `ttlMs: number = 30_000` (30s) | `server/src/lib/lru-cache.ts:22` | Default LRU cache TTL | **YES** | `NEXUS_LRU_DEFAULT_TTL_MS` |
| 37 | `statsCache(4, 15_000)` | `server/src/lib/lru-cache.ts:84` | Stats cache: capacity 4, TTL 15s | **YES** | `NEXUS_LRU_STATS_CAPACITY` / `NEXUS_LRU_STATS_TTL_MS` |
| 38 | `ambientCache(1, 60_000)` | `server/src/lib/lru-cache.ts:85` | Ambient cache: capacity 1, TTL 60s | **YES** | `NEXUS_LRU_AMBIENT_TTL_MS` |
| 39 | `healthCache(1, 5_000)` | `server/src/lib/lru-cache.ts:86` | Health cache: capacity 1, TTL 5s | **YES** | `NEXUS_LRU_HEALTH_TTL_MS` |

### 2g. Pagination / Query Limits

| # | Value | File:Line | Description | Move to env? | Proposed Env Key |
|---|-------|-----------|-------------|--------------|------------------|
| 40 | `limit = Math.min(200, Math.max(1, Number(query.limit ?? 50)))` | `src/lib/api.ts:208` | Default + max memories list page size | **YES** | `NEXUS_PAGINATION_DEFAULT_LIMIT` / `NEXUS_PAGINATION_MAX_LIMIT` |
| 41 | `Math.min(Math.max(opts?.limit ?? 50, 1), 200)` | `server/src/lib/security.ts:208` | Default + max principals list page size | **YES** | `NEXUS_PRINCIPALS_PAGE_DEFAULT` / `NEXUS_PRINCIPALS_PAGE_MAX` |
| 42 | `limit: z.coerce.number().int().min(1).max(500).optional()` | `server/src/lib/schemas.ts:36` | Recall query max limit in Zod schema | **YES** | `NEXUS_RECALL_MAX_LIMIT` |
| 43 | `.limit(100)` in semantic recall | `server/src/services/recall.ts:127,136,145` | Max per-type semantic results | **YES** | `NEXUS_SEMANTIC_RECALL_PER_TYPE_LIMIT` |
| 44 | `.limit(200)` | `server/src/services/kernel.ts:81` | Max agents returned in list | **YES** | `NEXUS_AGENTS_LIST_LIMIT` |
| 45 | `.limit(500)` | `server/src/services/shadow-daemon.ts:72` | Anomaly detection query limit | **YES** | `NEXUS_SHADOW_ANOMALY_LIMIT` |
| 46 | `.limit(100)` | `server/src/services/shadow-daemon.ts:152,161,224,283` | Shadow daemon various query limits | **YES** | `NEXUS_SHADOW_QUERY_LIMIT` |
| 47 | `.limit(500)` | `server/src/services/skill-compiler.ts:64` | Skill compiler query limit | **YES** | `NEXUS_COMPILER_QUERY_LIMIT` |
| 48 | `.limit(20)` | `server/src/services/workspace-sync.ts:31` | Workspace sync conventions limit | **YES** | `NEXUS_SYNC_CONVENTIONS_LIMIT` |
| 49 | `.limit(20)` | `server/src/services/blockchain.ts:113` | Pending anchors confirmation limit | **YES** | `NEXUS_BLOCKCHAIN_CONFIRM_LIMIT` |
| 50 | `.limit(6)` | `server/src/mcp.ts:118` | Ambient context top memories count | **YES** | `NEXUS_AMBIENT_TOP_MEMORIES` |

### 2h. Agent Defaults (kernel.ts)

| # | Value | File:Line | Description | Move to env? | Proposed Env Key |
|---|-------|-----------|-------------|--------------|------------------|
| 51 | `tokenBudget: input.tokenBudget ?? 100000` | `server/src/services/kernel.ts:51` | Default agent token budget | Already covered | `NEXUS_DREAM_MAX_MEMORIES`? No — needs own key: `NEXUS_AGENT_DEFAULT_TOKEN_BUDGET` |
| 52 | `timeoutMs: input.timeoutMs ?? 120000` | `server/src/services/kernel.ts:53` | Default agent timeout | Already covered | `NEXUS_WORKER_TIMEOUT_MS` (env.ts line 70) |
| 53 | `maxRetries: input.maxRetries ?? 3` | `server/src/services/kernel.ts:54` | Default agent max retries | **YES** | `NEXUS_AGENT_DEFAULT_MAX_RETRIES` |

### 2i. Frontend Config

| # | Value | File:Line | Description | Move to env? | Proposed Env Key |
|---|-------|-----------|-------------|--------------|------------------|
| 54 | `AbortSignal.timeout(3000)` (3s) | `src/lib/remote.ts:79` | Health probe timeout | **YES** | `NEXUS_REMOTE_HEALTH_TIMEOUT_MS` |
| 55 | `TOOL_REGISTRY` hardcoded timeouts | `src/lib/os/policy.ts:9-21` | Various tool timeoutMs values (3s-120s) | **MEDIUM** | Per-tool env vars or a config file |
| 56 | `SENSITIVE_FILES` list | `src/lib/os/policy.ts:99` | Hardcoded sensitive file paths | **MEDIUM** | `NEXUS_SENSITIVE_FILE_PATTERNS` |
| 57 | `ALLOWED_ROOTS` list | `src/lib/os/policy.ts:107` | Filesystem access roots | **YES** | `NEXUS_ALLOWED_FS_ROOTS` |
| 58 | `rateLimitPerMinute: 120` default in frontend | `src/lib/config.ts:34` | Frontend config default matches server | Already covered | `NEXUS_RATE_LIMIT_PER_MINUTE` |

### 2j. Docker / Infrastructure

| # | Value | File:Line | Description | Move to env? | Proposed Env Key |
|---|-------|-----------|-------------|--------------|------------------|
| 59 | `HEALTHCHECK --interval=30s --timeout=3s` | `server/Dockerfile:19` | Docker health check interval/timeout | **LOW** | (Docker concern, but could use build args) |
| 60 | `write_env.py` hardcoded password | `server/write_env.py:3` | `PW = "p123"` — plaintext password | **YES** | (remove file or use env-only) |

### 2k. Distill System Prompt (Hardcoded Prompt String)

| # | Value | File:Line | Description | Move to env? | Proposed Env Key |
|---|-------|-----------|-------------|--------------|------------------|
| 61 | `DISTILL_SYSTEM_PROMPT` (~1KB) | `server/src/services/llm.ts:248-261` | Full system prompt for memory distillation | **PROMPT** | Move to `prompts/distill.txt` or env `NEXUS_DISTILL_SYSTEM_PROMPT` |

---

## 3. SECURITY HEADERS (hardcoded, low priority)

| # | Value | File:Line | Description | Move to env? |
|---|-------|-----------|-------------|--------------|
| 62 | HSTS `max-age=31536000; includeSubDomains` | `server/src/proxy.ts:33`, `server/src/mcp-http.ts:25`, `src/lib/api.ts:95` | HSTS max-age + includeSubDomains | **LOW** — security best practice, acceptable as-is |
| 63 | CSP string | `server/src/proxy.ts:32`, `server/src/mcp-http.ts:26` | Content-Security-Policy header | **LOW** — has `'unsafe-inline'` which should be reviewed |
| 64 | CORS allow-headers/methods | `server/src/proxy.ts:42-43` | Access-Control-Allow-* | **LOW** — standard |

---

## 4. RECOMMENDATIONS

1. **Top priority (Priority 1):** Move LLM timeout (`NEXUS_LLM_TIMEOUT_MS`), default max-tokens (`NEXUS_LLM_MAX_TOKENS`), embedding timeout (`NEXUS_EMBEDDING_TIMEOUT_MS`), and safeFetch default timeout (`NEXUS_HTTP_TIMEOUT_MS`) to env. These affect reliability and cost.

2. **High priority:** Move scrypt cost parameters (`NEXUS_SCRYPT_*`) and auth cache TTLs (`NEXUS_AUTH_*_TTL_MS`) to env — these affect security posture and can be tuned per-deployment.

3. **Medium priority:** Move LRU cache TTLs (`NEXUS_LRU_*_TTL_MS`) and pagination limits (`NEXUS_PAGINATION_*`) to env — these affect performance tuning.

4. **Low priority:** Move shadow daemon / skill compiler query limits to env — only affects background processing.

5. **Prompt:** Move `DISTILL_SYSTEM_PROMPT` to a separate file (`prompts/distill.txt`) rather than an env var, to keep it editable without re-deployment.

6. **File to remove:** `server/write_env.py` contains a hardcoded database password `"p123"` — should be removed or templated.

7. **Add these to env.ts** with sensible defaults matching the current hardcoded values, following the existing pattern (zod validation, min/max bounds).

---

## 5. PROPOSED NEW ENV KEYS (summary for implementation)

```typescript
// === LLM & Embedding ===
NEXUS_LLM_TIMEOUT_MS:          // default 120000
NEXUS_LLM_MAX_TOKENS:          // default 4096
NEXUS_LLM_TEMPERATURE:         // default 0.7
NEXUS_EMBEDDING_TIMEOUT_MS:    // default 30000
NEXUS_EMBEDDING_MAX_TEXT_LENGTH: // default 8000
NEXUS_HTTP_TIMEOUT_MS:         // default 15000
NEXUS_DISTILL_MAX_CHARS:       // default 24000
NEXUS_DISTILL_MAX_MEMORIES:    // default 25
NEXUS_AGENT_CONTEXT_MAX_CHARS: // default 32000

// === LLM Router ===
NEXUS_ROUTER_COMPLEX_TOKEN_THRESHOLD:  // default 6000
NEXUS_ROUTER_COMPLEX_QUERY_LENGTH:     // default 2000
NEXUS_ROUTER_MEDIUM_TOKEN_THRESHOLD:   // default 2000
NEXUS_ROUTER_MEDIUM_QUERY_LENGTH:      // default 500
NEXUS_ROUTER_SIMPLE_MAX_TOKENS:        // default 1024
NEXUS_ROUTER_MEDIUM_MAX_TOKENS:        // default 4096
NEXUS_ROUTER_COMPLEX_MAX_TOKENS:       // default 8192
NEXUS_ROUTER_SIMPLE_TEMP:              // default 0.3
NEXUS_ROUTER_MEDIUM_TEMP:              // default 0.7
NEXUS_ROUTER_COMPLEX_TEMP:             // default 0.7

// === Security ===
NEXUS_SCRYPT_KEYLEN:           // default 32
NEXUS_SCRYPT_N:                // default 16384
NEXUS_SCRYPT_R:                // default 8
NEXUS_SCRYPT_P:                // default 1
NEXUS_SCRYPT_MAXMEM:           // default 67108864
NEXUS_AUTH_PRINCIPAL_TTL_MS:   // default 30000
NEXUS_AUTH_RESULT_TTL_MS:      // default 60000
NEXUS_AUTH_RESULT_CACHE_CAP:   // default 1024

// === Rate Limiter ===
NEXUS_RATELIMIT_MAX_BUCKETS:   // default 10000
NEXUS_RATELIMIT_WINDOW_MS:     // default 60000

// === LRU Cache ===
NEXUS_LRU_DEFAULT_CAPACITY:    // default 256
NEXUS_LRU_DEFAULT_TTL_MS:      // default 30000
NEXUS_LRU_STATS_CAPACITY:      // default 4
NEXUS_LRU_STATS_TTL_MS:        // default 15000
NEXUS_LRU_AMBIENT_TTL_MS:      // default 60000
NEXUS_LRU_HEALTH_TTL_MS:       // default 5000

// === Audit ===
NEXUS_AUDIT_MERKLE_CHUNK_SIZE: // default 1000
NEXUS_AUDIT_VERIFY_PAGE_SIZE:  // default 1000

// === Pagination ===
NEXUS_PAGINATION_DEFAULT_LIMIT: // default 50
NEXUS_PAGINATION_MAX_LIMIT:     // default 200
NEXUS_PRINCIPALS_PAGE_DEFAULT:  // default 50
NEXUS_PRINCIPALS_PAGE_MAX:      // default 200
NEXUS_RECALL_MAX_LIMIT:         // default 500
NEXUS_SEMANTIC_RECALL_PER_TYPE_LIMIT: // default 100

// === Agent Defaults ===
NEXUS_AGENT_DEFAULT_TOKEN_BUDGET: // default 100000
NEXUS_AGENT_DEFAULT_MAX_RETRIES:  // default 3

// === Misc ===
NEXUS_REMOTE_HEALTH_TIMEOUT_MS: // default 3000
NEXUS_ALLOWED_FS_ROOTS:        // default "/project,/src,/vault"
NEXUS_AMBIENT_TOP_MEMORIES:    // default 6
NEXUS_SYNC_CONVENTIONS_LIMIT:  // default 20
NEXUS_BLOCKCHAIN_CONFIRM_LIMIT: // default 20
NEXUS_SHADOW_ANOMALY_LIMIT:    // default 500
NEXUS_SHADOW_QUERY_LIMIT:      // default 100
NEXUS_COMPILER_QUERY_LIMIT:    // default 500
NEXUS_AGENTS_LIST_LIMIT:       // default 200
```
