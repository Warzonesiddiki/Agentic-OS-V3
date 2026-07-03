# REFINEMENT R3 — Gap Analysis: Phases 11-15
## Phase Completeness Audit for MASTER_INTEGRATION_PLAN_30_PHASES_P3.md

**Date:** 2026-07-02
**Round:** 3 of 30

---

## Executive Summary

This audit analyzes Phases 11-15 against the **actual source code** available in the repository. The plan extensively references source files from 6 external projects (litellm, 9Router, Portkey, new-api, Goose, OmniRoute2) but **critical source code is missing** — those directories exist as empty placeholders. Meanwhile, **existing code** in the Agentic OS V3 server (guardrails.ts, audit-engine.ts, rate-limit.ts, semanticCache.ts, cacheLayer.ts) and **gemini-cli's actual source** (in `packages/core/src/` rather than the referenced doc paths) is **not referenced** in the plan.

**Gap Severity:** PHASE 14 (Guardrails) — Existing code completely overlooked
**Gap Severity:** PHASE 13 (Auth) — Wrong gemini-cli source paths referenced  
**Gap Severity:** PHASE 15 (Billing) — Existing rate-limiter and quota cache ignored
**Gap Severity:** PHASE 11 (Caching) — Existing semantic cache ignored

---

## Phase 11 — Caching & Performance Layer

### What the Plan Claims
- **11.2:** Imports litellm's semantic cache from `litellm/litellm/caching/semantic_cache.py` and `litellm/litellm/caching/embeddings.py`
- **11.3:** Imports Portkey caching strategies from `portkey/src/caching/strategies/*` and `portkey/src/middlewares/cache.ts`
- **11.4:** Imports RTK compression from `9router/src/rtk/compression/caveman.js`, `ponytail.js`, `dictionary.js`

### What Actually Exists Locally

| Source Project | Local Status | Actual Files Present |
|---------------|-------------|---------------------|
| litellm caching/ | **EMPTY** — subdirectories have 0 files | Only root-level Python files (`__init__.py`, `_redis.py`, `main.py`, `router.py`, `utils.py`) |
| 9Router | **NOT AVAILABLE** — all subdirs empty | Only `dashboardGuard.js` and `proxy.js` |
| Portkey | **NOT AVAILABLE** — all subdirs empty | Only `globals.ts`, `index.ts`, `start-server.ts`, `utils.ts` |
| **Existing V3 cache code** | **AVAILABLE but not referenced** | `server/src/lib/lru-cache.ts`, `server/src/lib/perf-cache.ts`, `server/src/services/omniroute/cache/semanticCache.ts`, `cacheLayer.ts`, `cacheControlSettings.ts` |

### Gap Details

**GAP 11-A: Missing source files for 11.2 (Semantic Cache)**
The plan claims to copy from `litellm/litellm/caching/semantic_cache.py` and `litellm/litellm/caching/embeddings.py` — these paths **do not exist** in the local repo. The litellm directory only contains top-level Python stubs; the `caching/` subdirectory is empty.

**Fix:** Replace litellm references with the **existing V3 implementation** at `server/src/services/omniroute/cache/semanticCache.ts` which already implements embedding-based semantic caching. Augment this, don't replace.

**GAP 11-B: Missing source files for 11.3 (Portkey Strategies)**
Portkey's caching middleware and strategy files at `portkey/src/middlewares/cache.ts` and `portkey/src/caching/strategies/*` are **not present** in the local repo.

**Fix:** Remove "Copy-Paste Source Project" references to non-existent Portkey files. Note these must be **built from scratch** using the Portkey documentation and architecture as reference only.

**GAP 11-C: Missing source files for 11.4 (RTK Compression)**
9Router's Caveman/Ponytail compression algorithm files at `9router/src/rtk/compression/*` are **not present**. The `compression/` directory under omniroute is empty.

**Fix:** The compression algorithms must be **implemented from scratch** based on the algorithm descriptions in the plan. Remove copy-paste references to non-existent 9Router files.

**GAP 11-D: Disk tier has no implementation source**
The plan describes a SQLite-based disk tier for 11.1 but no source code for this exists anywhere. The existing `cacheLayer.ts` and `lru-cache.ts` only handle in-memory caching.

**Fix:** Add a note that the disk tier (SQLite persistent cache using better-sqlite3) must be **built from scratch** rather than ported.

---

## Phase 12 — Streaming Engine

### What the Plan Claims
- **12.2:** SSE handler from `9router/open-sse/handlers/chatCore/` and `litellm/litellm/proxy/streaming_handler.py`
- **12.3:** WebSocket streaming from `9router/open-sse/handlers/ws-handler.js` and `litellm/litellm/proxy/realtime/`
- **12.4:** TCP/gRPC from `goose/crates/goose/src/streaming/tcp.rs` and `litellm/litellm/proxy/grpc/`
- **12.5:** Streaming transformation pipeline referencing Phase 14.4 guardrails

### What Actually Exists Locally

| Source | Local Status |
|--------|-------------|
| 9Router chatCore SSE | **NOT AVAILABLE** — all subdirs empty |
| litellm proxy/streaming/ | **NOT AVAILABLE** — all subdirs empty |
| litellm proxy/realtime/ | **NOT AVAILABLE** — empty |
| litellm proxy/grpc/ | **NOT AVAILABLE** — empty |
| Goose streaming/tcp.rs | **NOT AVAILABLE** — Goose project not in repo |
| **Existing V3 SSE code** | **AVAILABLE but not referenced** — `routes/sse.ts`, `services/sse.ts`, `services/sse-bus.ts` |
| new-api websocket.go | **PARTIALLY AVAILABLE** — `unified-gateway/new-api/websocket.go` (46 lines, Go stub) |

### Gap Details

**GAP 12-A: All 9Router chatCore SSE source files missing**
The plan references `9router/open-sse/handlers/chatCore/` and `9router/open-sse/handlers/sse-parser.js` — **none of these exist** in the local repo.

**Fix:** Replace references with the existing `routes/sse.ts` and `services/sse.ts`/`sse-bus.ts`. The existing code handles SSE streaming with Hono and can be extended rather than replaced.

**GAP 12-B: litellm streaming handler not available**
`litellm/litellm/proxy/streaming_handler.py` and `streaming_chunk_processor.py` don't exist locally.

**Fix:** The token counting and chunk processing logic referenced from litellm must be **built from scratch** in TypeScript, using the existing `llm-client.ts` and `embeddings.ts` as foundation.

**GAP 12-C: Goose streaming not available (Goose project absent)**
The plan references `goose/crates/goose/src/streaming/tcp.rs` and `goose/crates/goose/src/streaming/ws.rs` — **Goose project is not in the repo**.

**Fix:** Remove all "Copy-Paste" references to Goose Rust files. Note these must be ported from the upstream Goose repository as a separate dependency integration step.

**GAP 12-D: Existing SSE code overlooked**
The existing `routes/sse.ts` handles SSE connections, and `services/sse.ts`/`services/sse-bus.ts` provide SSE event distribution. These are not mentioned in the plan.

**Fix:** Add the existing SSE infrastructure as the foundation, especially the SSE bus event distribution pattern.

---

## Phase 13 — Auth & Security (Core)

### What the Plan Claims
- **13.2:** 20+ OAuth provider integrations from `9router/src/auth/oauth/providers/*.js`
- **13.3:** OAuth2 consent system from `gemini-cli/.gemini/config.yaml` and `gemini-cli/docs/core/oauth.md`
- **13.4:** Device flow from `goose/crates/goose/src/auth/device_flow.rs`
- **13.5:** API key management from `new-api/model/api_key.go`, `new-api/controller/api_key.go`, `new-api/service/api_key_service.go`

### What Actually Exists Locally

| Source | Local Status |
|--------|-------------|
| 9Router OAuth providers | **NOT AVAILABLE** — all subdirs empty |
| Goose device flow | **NOT AVAILABLE** — Goose not present |
| new-api model/controller/service | **NOT AVAILABLE** — only `handler/` files exist (Go stubs for relay) |
| **gemini-cli OAuth source** | **AVAILABLE at WRONG path referenced** — actual code at `packages/core/src/utils/oauth-flow.ts`, `packages/core/src/mcp/oauth-provider*.ts`, `oauth-token-*.ts`, `oauth-utils.ts`, `packages/core/src/agents/auth-provider*.ts` |
| gemini-cli docs/core/oauth.md | **DOES NOT EXIST at referenced path** — gemini-cli docs are organized differently |
| gemini-cli .gemini/config.yaml | **EXISTS but is EMPTY** — directory has no files |
| **Existing V3 auth code** | `auth-context.ts`, `security.ts`, `tokens.ts`, `verify.ts` available but not referenced |

### Gap Details

**GAP 13-A: 9Router OAuth providers not available (Critical for 13.2)**
The plan claims 20+ OAuth provider integrations from 9Router. The 9Router directory is **empty** — no provider files exist.

**Fix:** Change 13.2 from "Import" to "Build from specification." Note that the OAuth provider framework must be built using standard OAuth2 libraries (openid-client, passport) rather than ported from 9Router. Use gemini-cli's MCP OAuth provider implementation (`packages/core/src/mcp/oauth-provider*.ts`) as a reference template.

**GAP 13-B: gemini-cli source files referenced at WRONG paths (Critical for 13.3)**
The plan says the consent system comes from `gemini-cli/.gemini/config.yaml` (empty directory) and `gemini-cli/docs/core/oauth.md` (doesn't exist at that path). The **actual** gemini-cli OAuth implementation is in:
- `packages/core/src/utils/oauth-flow.ts` — OAuth flow logic
- `packages/core/src/mcp/mcp-oauth-provider*.ts` — MCP OAuth provider
- `packages/core/src/mcp/oauth-provider*.ts` — OAuth provider implementation
- `packages/core/src/mcp/oauth-token-*.ts` — Token management
- `packages/core/src/mcp/oauth-utils.ts` — OAuth utilities
- `packages/core/src/agents/auth-provider*.ts` — Auth provider types

**Fix:** Update all references to point to the correct gemini-cli source paths. The consent system architecture should be extracted from the OAuth flow and MCP provider code, not from config files and documentation.

**GAP 13-C: Goose device flow not available (Critical for 13.4)**
Goose is not in the repository. The device flow must be implemented from scratch.

**Fix:** Change to "Build from RFC 8628 (OAuth 2.0 Device Authorization Grant) specification." Remove copy-paste references to Goose Rust files.

**GAP 13-D: new-api API key management not available (Critical for 13.5)**
The plan references `new-api/model/api_key.go`, `new-api/controller/api_key.go`, and `new-api/service/api_key_service.go` — these directories **do not exist** in the local new-api folder.

**Fix:** The API key management system must be built from scratch. The existing `tokens.ts` and `security.ts` provide a foundation (token generation/validation, security utilities).

---

## Phase 14 — Auth & Security (Advanced)

### What the Plan Claims
- **14.1:** RBAC from `new-api/model/rbac.go`, `new-api/controller/auth.go`, `new-api/service/auth_service.go`
- **14.2:** Multi-tenant from `new-api/model/tenant.go`, `new-api/service/tenant_isolation.go`
- **14.3:** SSO/SAML from `new-api/controller/sso.go`, `new-api/service/saml_service.go`
- **14.4:** Guardrails from `litellm/litellm/guardrails/`, `portkey/src/middlewares/guardrails/`, `gemini-cli/docs/reference/core/safety-checkers.md`
- **14.5:** Audit from `new-api/service/audit_service.go`, `new-api/model/audit.go`

### What Actually Exists Locally

| Source | Local Status |
|--------|-------------|
| new-api RBAC (model/controller/service) | **NOT AVAILABLE** — only handler Go files exist |
| new-api multi-tenant | **NOT AVAILABLE** |
| new-api SSO/SAML | **NOT AVAILABLE** |
| litellm guardrails/ | **NOT AVAILABLE** — empty subdirectories |
| Portkey guardrails/ | **NOT AVAILABLE** — empty subdirectories |
| **Existing V3 guardrails.ts** | **AVAILABLE but not referenced** — full guardrail pipeline at `server/src/services/guardrails.ts` (690 lines) |
| **Existing V3 audit-engine.ts** | **AVAILABLE but not referenced** — `server/src/services/audit-engine.ts` (170 lines), `audit-worker.ts` (141 lines) |
| **Existing V3 audit.ts/auditing.ts** | **AVAILABLE but not referenced** — `server/src/lib/audit.ts` (316 lines), `server/src/lib/auditing.ts` (223 lines) |
| **gemini-cli safety source** | **AVAILABLE at WRONG path** — actual code at `packages/core/src/safety/` (9 files: conseca.ts, built-in.ts, checker-runner.ts, registry.ts, protocol.ts, etc.) |
| gemini-cli docs/reference/core/safety-checkers.md | **DOES NOT EXIST** at referenced path |

### Gap Details

**GAP 14-A: new-api RBAC, multi-tenant, SSO/SAML all not available (Critical for 14.1-14.3)**
None of the new-api Go files referenced by the plan exist locally. The new-api directory only contains relay handler Go files.

**Fix:** 
- **14.1 (RBAC):** Change to "Build from scratch using Casbin.js." Remove references to non-existent new-api Go files.
- **14.2 (Multi-Tenant):** Note this must be built from scratch. Reference new-api's architecture only as design pattern.
- **14.3 (SSO/SAML):** Note this must be built from scratch using Node.js libraries (openid-client, samlify).

**GAP 14-B: litellm/Portkey guardrail source files not available (Critical for 14.4)**
The plan claims to port guardrails from litellm (`litellm/litellm/guardrails/`) and Portkey (`portkey/src/middlewares/guardrails/`) — both directories are **empty**.

**Fix:** The plan **completely overlooks** the existing `server/src/services/guardrails.ts` which is a 690-line production guardrail system. This existing code should be the foundation, augmented with:
1. gemini-cli's safety checker framework at `packages/core/src/safety/` (9 TypeScript files with built-in checkers, conseca policy engine, checker-runner, registry)
2. New guardrail plugins built to match litellm/Portkey capabilities

**GAP 14-C: gemini-cli safety checkers at wrong path**
The plan references `gemini-cli/docs/reference/core/safety-checkers.md` which **does not exist**. The actual gemini-cli safety system is at `packages/core/src/safety/` with TypeScript source code including:
- `built-in.ts` — Built-in safety checkers
- `checker-runner.ts` — Safety checker execution engine
- `registry.ts` — Checker registry
- `conseca/conseca.ts` — Consequence-aware policy engine
- `conseca/policy-enforcer.ts` — Policy enforcement
- `protocol.ts` — Safety checking protocol

**Fix:** Update all references to point to the correct TypeScript source files.

**GAP 14-D: Existing audit system completely overlooked (Critical for 14.5)**
The plan describes building an audit logging system from new-api's Go code, but an **existing audit system** is already running:
- `server/src/services/audit-engine.ts` (170 lines) — Audit event engine
- `server/src/services/audit-worker.ts` (141 lines) — Background audit worker
- `server/src/lib/audit.ts` (316 lines) — Audit utilities
- `server/src/lib/auditing.ts` (223 lines) — Auditing service

**Fix:** The plan should reference the existing audit infrastructure as the foundation, then extend it with tamper-evident logging, SIEM exporters, and compliance reports rather than building from scratch.

---

## Phase 15 — Billing, Quotas & Rate Limiting

### What the Plan Claims
- **15.1:** Channel management from `new-api/model/channel.go`, `new-api/controller/channel.go`, `new-api/service/channel_service.go`
- **15.2:** Usage tracking from `new-api/model/usage.go`, `new-api/service/usage_service.go`; Budgets from `litellm/litellm/proxy/budget_limiter.py`
- **15.3:** Rate limiting from `new-api/middleware/rate_limit.go`, `litellm/litellm/proxy/rate_limit.py`
- **15.4:** Payment integrations from `new-api/controller/billing.go`, `new-api/service/stripe_service.go`, `creem_service.go`, `epay_service.go`, `waffo_service.go`
- **15.5:** Analytics from `new-api/controller/analytics.go`, `new-api/service/analytics_service.go`

### What Actually Exists Locally

| Source | Local Status |
|--------|-------------|
| new-api channel management | **NOT AVAILABLE** — model/controller/service dirs don't exist |
| new-api billing/payments | **NOT AVAILABLE** |
| litellm budget_limiter.py | **NOT AVAILABLE** — only `budget_manager.py` stub (216 lines) exists at root |
| litellm proxy/rate_limit.py | **NOT AVAILABLE** — proxy/ subdirectory empty |
| **Existing V3 rate-limit.ts** | **AVAILABLE but not referenced** — `server/src/lib/rate-limit.ts` (38 lines) |
| **Existing V3 quotaCache.ts** | **AVAILABLE but not referenced** — `server/services/omniroute/domain/quotaCache.ts` (529 lines) |
| **Existing V3 costRules.ts** | **AVAILABLE but not referenced** — `server/services/omniroute/domain/costRules.ts` (631 lines) |

### Gap Details

**GAP 15-A: new-api channel management not available (Critical for 15.1)**
The plan claims to copy from new-api Go files that don't exist locally.

**Fix:** Channel management must be built from scratch. Note that the Provider Registry (Phase 1) should be the foundation for channel definitions.

**GAP 15-B: new-api payment integrations not available (Critical for 15.4)**
None of the payment processor integrations (Stripe, Creem, Epay, Waffo) exist locally. These must be implemented from scratch using their respective Node.js SDKs.

**Fix:** Change to "Build from scratch using Stripe Node.js SDK (primary), with extensible PaymentProcessor interface for additional processors." Remove non-existent Go file references.

**GAP 15-C: litellm budget management not available (15.2)**
`litellm/litellm/proxy/budget_limiter.py` doesn't exist locally. Only the root-level `budget_manager.py` (216-line stub) exists.

**Fix:** The budget management system must be built from scratch. Reference the existing `costRules.ts` (631 lines) for cost calculation patterns.

**GAP 15-D: Existing rate limiter overlooked (Critical for 15.3)**
The plan describes building a rate limiting system but doesn't reference the existing `rate-limit.ts` (38 lines with token bucket implementation) and `quotaCache.ts` (529 lines with Redis-backed quota tracking).

**Fix:** Add the existing rate-limit.ts and quotaCache.ts as foundation. These already implement token-based rate limiting and quota tracking.

---

## Summary of Required Plan Fixes

### High Priority (Source/Path Corrections)

| Gap | Phase | Issue | Fix |
|-----|-------|-------|-----|
| 13-B | 13.3 | Wrong gemini-cli OAuth source paths | Point to `packages/core/src/utils/oauth-flow.ts` and `packages/core/src/mcp/oauth-*.ts` |
| 14-C | 14.4 | Wrong gemini-cli safety checker path | Point to `packages/core/src/safety/` (9 TS files) |
| 14-D | 14.5 | Existing audit system not referenced | Add V3 audit-engine.ts, audit-worker.ts as foundation |
| 14-B | 14.4 | Existing guardrails.ts not referenced | Add V3 guardrails.ts as foundation |
| 13-D | 13.5 | new-api key mgmt not available | Change to build from scratch using tokens.ts + security.ts |
| 12-D | 12.2 | Existing SSE code not referenced | Add routes/sse.ts, services/sse.ts as foundation |
| 11-D | 11.1 | Existing cache code not referenced | Add semanticCache.ts, cacheLayer.ts as foundation |
| 15-D | 15.3 | Existing rate-limit.ts not referenced | Add rate-limit.ts, quotaCache.ts as foundation |

### Medium Priority (Missing Source Files)

| Gap | Phase | Issue | Fix |
|-----|-------|-------|-----|
| 11-A | 11.2 | litellm semantic cache files not available | Reference existing V3 semanticCache.ts instead |
| 11-B | 11.3 | Portkey strategy files not available | Build from scratch; remove copy-paste refs |
| 11-C | 11.4 | 9Router RTK compression not available | Implement from algorithm descriptions |
| 12-A | 12.2 | 9Router chatCore SSE not available | Use existing V3 SSE code as foundation |
| 12-B | 12.2 | litellm streaming handler not available | Build from scratch |
| 12-C | 12.3-4 | Goose streaming not available | Build from scratch or add as dependency |
| 13-A | 13.2 | 9Router OAuth providers not available | Build from scratch using standard libraries |
| 13-C | 13.4 | Goose device flow not available | Build from RFC 8628 spec |
| 14-A | 14.1-3 | new-api Go files not available | Build from scratch with Casbin.js for RBAC |
| 15-A | 15.1 | new-api channels not available | Build from scratch |
| 15-B | 15.4 | new-api payments not available | Build from scratch with Stripe SDK |
| 15-C | 15.2 | litellm budgets not available | Build from scratch |

---

## Expanded Quick Reference Checklist

### Phase 11 — Caching & Performance Layer
- [ ] 11.1 Multi-tier cache operational — **USE EXISTING:** `cacheLayer.ts`, `lru-cache.ts`, `perf-cache.ts` as foundation; disk tier must be built from scratch
- [ ] 11.2 Semantic caching — **USE EXISTING:** `semanticCache.ts` already implements embedding-based caching; extend rather than rebuild
- [ ] 11.3 Portkey caching strategies — **BUILD FROM SCRATCH:** No Portkey source available locally
- [ ] 11.4 RTK Caveman/Ponytail compression — **BUILD FROM SCRATCH:** No 9Router source available; implement from algorithm descriptions
- [ ] 11.5 Cache warming and prediction — **BUILD FROM SCRATCH:** No source code available; ML models needed

### Phase 12 — Streaming Engine
- [ ] 12.1 Unified streaming interface — Design-only; no source dependencies
- [ ] 12.2 SSE streaming handler — **USE EXISTING:** `routes/sse.ts`, `services/sse.ts`, `sse-bus.ts`; extend with provider format translators
- [ ] 12.3 WebSocket streaming handler — **BUILD FROM SCRATCH:** No Goose/litellm source available; new-api/websocket.go is a stub
- [ ] 12.4 Raw TCP/gRPC streaming handler — **BUILD FROM SCRATCH:** No source available
- [ ] 12.5 Streaming transformation pipeline — Depends on guardrails (14.4); build with existing guardrails.ts

### Phase 13 — Auth & Security (Core)
- [ ] 13.1 Unified auth provider interface — Build from scratch; use gemini-cli's `auth-provider*.ts` as reference
- [ ] 13.2 20+ OAuth providers — **BUILD FROM SCRATCH:** Use gemini-cli's `mcp/oauth-provider*.ts` and `utils/oauth-flow.ts` as templates
- [ ] 13.3 OAuth2 consent system — Use gemini-cli's `packages/core/src/utils/oauth-flow.ts` + `mcp/oauth-utils.ts` (CORRECTED PATH)
- [ ] 13.4 Device flow auth — **BUILD FROM RFC 8628:** No Goose source available
- [ ] 13.5 API key management — **USE EXISTING:** `tokens.ts`, `security.ts` as foundation; build key CRUD from scratch

### Phase 14 — Auth & Security (Advanced)
- [ ] 14.1 RBAC — **BUILD FROM SCRATCH** using Casbin.js; no new-api source available
- [ ] 14.2 Multi-tenant isolation — **BUILD FROM SCRATCH**; reference new-api architecture only as pattern
- [ ] 14.3 SSO/SAML — **BUILD FROM SCRATCH** using openid-client, samlify
- [ ] 14.4 Guardrails — **USE EXISTING:** `guardrails.ts` (690 lines) + gemini-cli `packages/core/src/safety/` (9 files); augment with plugin integrations
- [ ] 14.5 Audit logging — **USE EXISTING:** `audit-engine.ts`, `audit-worker.ts`, `audit.ts`, `auditing.ts`; extend with SIEM exporters, tamper-evident logging

### Phase 15 — Billing, Quotas & Rate Limiting
- [ ] 15.1 Channel management — **BUILD FROM SCRATCH**; no new-api source available
- [ ] 15.2 Usage tracking & quotas — **USE EXISTING:** `quotaCache.ts` (529 lines) as foundation; budgets from scratch
- [ ] 15.3 Multi-dimensional rate limiting — **USE EXISTING:** `rate-limit.ts` (token bucket) as foundation; extend with sliding window, adaptive algorithms
- [ ] 15.4 Billing integration — **BUILD FROM SCRATCH** using Stripe Node.js SDK
- [ ] 15.5 Cost analytics — **USE EXISTING:** `costRules.ts` (631 lines) as foundation; build dashboard from scratch

---

## Risk Assessment Updates

### New Risks Not in Original Plan

| Risk | Phase | Probability | Impact | Mitigation |
|------|-------|-------------|--------|------------|
| Caveman/Ponytail compression algorithms must be reverse-engineered from descriptions | 11.4 | High | Medium | Implement standard zstd compression first, add custom algorithms as optimization |
| Goose streaming protocols must be reimplemented without reference code | 12.3-4 | High | High | Focus on SSE and WebSocket first; TCP/gRPC as stretch goals |
| 20+ OAuth providers must be configured manually per provider spec | 13.2 | High | Low | Build generic OAuth2 template; providers added incrementally |
| RBAC has no reference implementation to port from | 14.1 | Medium | Medium | Use Casbin.js standard RBAC model; customize for AI gateway |
| Payment integration without reference implementation increases financial risk | 15.4 | Medium | Critical | Implement Stripe-only first with comprehensive test mode; add others later |

### Downgraded Risks

| Risk | Phase | Rationale |
|------|-------|-----------|
| Semantic cache returns stale/inappropriate responses (was Medium/High) | 11.2 | Existing V3 semantic cache already has guardrail revalidation built in (see `guardrails.ts` integration) |
| Guardrail false positives block legitimate traffic (was Medium/High) | 14.4 | Existing V3 guardrails.ts + gemini-cli safety checkers provide production-tested baseline |
| Cost analytics queries impact database performance (was Low/Medium) | 15.5 | Existing costRules.ts already has pre-aggregated rollup patterns |

---

**END OF REFINEMENT R3 — P3 GAP ANALYSIS**
