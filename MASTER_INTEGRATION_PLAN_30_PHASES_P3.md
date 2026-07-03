# Agentic OS V4: The Universal AI Agent Operating System
## PART 3 — Phases 11-15: Caching, Streaming, Auth & Security, Billing

> **PART 3 of the 30-Phase Master Integration Plan**
> 
> Merging 8 production-grade projects into one unified platform:
> 1. **Agentic OS V3** — Agent orchestration brain (DAG, Pipeline, Graph, P2P, Self-improvement, Shadow daemon)
> 2. **9Router** — Universal AI gateway (100+ providers, protocol translation, MITM, RTK compression, skills)
> 3. **Goose** — Agent runtime (ACP server, CLI/TUI, Extensions, Recipes, Local inference, MCP, Dictation)
> 4. **litellm** — Python LLM gateway (100+ providers, Proxy, Routing strategies, Caching, Guardrails, Budgets)
> 5. **new-api** — Go AI gateway (Channel management, Billing, Relay, Multi-tenant, Load balancing)
> 6. **OmniRoute2** — TypeScript gateway (Skills, Auto-combo routing, Compression, Plugins, 30+ i18n)
> 7. **Portkey** — TypeScript gateway (50+ providers, Guardrail plugins, Caching, Fallbacks, Observability)
> 8. **gemini-cli** — OAuth2 flow, consent system, safety checkers, billing events

---

## Table of Contents — PART 3

- **Phase 11:** Caching & Performance Layer (5 subphases)
- **Phase 12:** Streaming Engine (5 subphases)
- **Phase 13:** Auth & Security — Core (5 subphases)
- **Phase 14:** Auth & Security — Advanced (5 subphases)
- **Phase 15:** Billing, Quotas & Rate Limiting (5 subphases)

---

## Phase 11: Caching & Performance Layer (Weeks 19-22)

### Overview

Phase 11 implements a multi-tier, multi-strategy caching infrastructure that spans in-memory, Redis, and disk layers. This phase draws heavy inspiration from litellm's production-grade semantic caching (used at scale in enterprise deployments), Portkey's pluggable caching strategies with fallback chains, and 9Router's innovative RTK compression (caveman/ponytail algorithms). The goal is to deliver sub-10ms cache lookup times for hot paths, 90%+ cache hit rates for repeated queries, and transparent compression that reduces bandwidth by 60-80% without degrading response quality. This phase is foundational for achieving the <100ms gateway overhead target in the final deliverable.

---

### 11.1 Implement Multi-Tier Caching (In-Memory → Redis → Disk)

**Detailed Description:**

This subphase establishes the foundational three-tier caching architecture that all higher-level caching strategies build upon. The in-memory tier uses an LRU (Least Recently Used) eviction policy with configurable TTL and max size, providing sub-millisecond lookups for the hottest data. The Redis tier adds distributed caching capabilities with cluster support, replication, and persistence, enabling cache sharing across multiple gateway instances. The disk tier uses SQLite (via better-sqlite3 for Node.js or rusqlite for Rust) for persistent overflow caching, ensuring that even when memory and Redis are exhausted, the system degrades gracefully rather than failing. Each tier is independently configurable, tiered promotion/demotion is automatic based on access patterns, and the cache manager handles transparent failover between tiers.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| litellm | `litellm/litellm/caching/cache.py` | `packages/gateway/src/cache/tiers/` | Convert Python async patterns to TypeScript/Rust. Replace litellm-specific imports with core interfaces. Add tier lifecycle management. |
| Portkey | `portkey/src/caching/cache.ts` | `packages/gateway/src/cache/tiers/` | Extract the multi-backend abstraction layer. Replace Portkey provider-specific key generation with unified key schema. |
| 9Router | `9router/src/cache/memory-cache.js` | `packages/gateway/src/cache/tiers/` | Port the LRU implementation with O(1) operations. Adapt the TTL sweep mechanism to the unified interface. |
| Agentic OS V3 | `server/src/lib/cache.ts` | `packages/gateway/src/cache/tiers/` | Reuse the existing cache abstraction patterns. Align error handling with the project's Result/Option types. |

**Key Files to Create/Modify:**

```
packages/gateway/src/cache/
  ├── tiers/
  │   ├── cache-tier.ts              # Abstract base class for all tiers
  │   ├── memory-tier.ts             # In-memory LRU tier (create)
  │   ├── redis-tier.ts              # Redis distributed tier (create)
  │   ├── disk-tier.ts               # SQLite persistent tier (create)
  │   └── tier-manager.ts            # Tier lifecycle, promotion/demotion (create)
  ├── cache-key.ts                   # Key normalization & hashing (create)
  ├── cache-policy.ts                # TTL, size, eviction policy config (create)
  ├── cache-stats.ts                 # Hit/miss tracking per tier (create)
  ├── cache-serializer.ts            # Efficient binary serialization (create)
  └── index.ts                       # Public API surface (create)
```

**Acceptance Criteria:**

- [ ] In-memory tier consistently delivers <1ms lookup time for cached entries (p99 <3ms)
- [ ] Redis tier properly handles cluster topology changes without data loss
- [ ] Disk tier gracefully handles full-disk scenarios with configurable max-size limits
- [ ] Automatic promotion of frequently accessed items from disk → Redis → memory within <100ms
- [ ] Transparent failover: if Redis is unreachable, reads fall back to disk tier without errors
- [ ] All three tiers support concurrent reads/writes without corruption (tested at 1000 concurrent ops)
- [ ] Cache key normalization handles provider-specific nuances (model name aliasing, parameter normalization)
- [ ] Eviction policies are configurable per-tier (LRU, LFU, FIFO, TTL-based) via runtime config
- [ ] Cache statistics are exposed via Prometheus metrics (tier hit rates, sizes, eviction counts)
- [ ] Integration tests verify data consistency across all three tiers for write-through, write-behind, and write-around policies

**Risk Level:** Medium

> *Risk mitigated by extensive integration testing at each tier boundary and gradual rollout via feature flags. The most significant risk is data inconsistency during tier promotion/demotion, addressed by write-through semantics for critical paths.*

---

### 11.2 Import litellm's Semantic Caching (Embedding-Based Response Cache)

**Detailed Description:**

Semantic caching is the crown jewel of litellm's caching system — it caches LLM responses based on semantic similarity rather than exact string matching. When a new request arrives, the system generates an embedding vector for the input, compares it against cached embeddings using cosine similarity (configurable threshold, default 0.95), and returns the cached response if a sufficiently similar query was previously answered. This dramatically improves cache hit rates for natural language interfaces where users ask the same question with different phrasings. The implementation includes configurable embedding models (text-embedding-3-small, text-embedding-3-large, bge-base-en-v1.5, or any OpenAI-compatible embedding API), vector storage options (Qdrant, pgvector, sqlite-vec, or in-memory HNSW), and automatic cache invalidation based on response quality scoring.

**Copy-Paste Source Project + Surgical Edit Approach:**

> **⚠️ CRITICAL NOTE:** litellm's `caching/semantic_cache.py` and `caching/embeddings.py` files are NOT available in the local repo (the `caching/` directory is empty). The existing V3 codebase already has a working semantic cache at `server/src/services/omniroute/cache/semanticCache.ts` which should be the foundation.

| Source Project | Files to Copy/Reference | Target Path | Surgical Edits Required |
|---------------|------------------------|-------------|------------------------|
| **V3 (Existing)** | `server/src/services/omniroute/cache/semanticCache.ts` | `packages/gateway/src/cache/semantic/` | **USE AS FOUNDATION.** Augment the existing TypeScript semantic cache with additional vector store backends and the unified provider registry embedding interface. |
| **V3 (Existing)** | `server/src/services/omniroute/cache/cacheLayer.ts` | `packages/gateway/src/cache/tiers/` | **USE AS FOUNDATION.** The existing cache layer already handles multi-tier patterns. Extend with Redis and disk tiers. |
| **V3 (Existing)** | `server/src/lib/embeddings.ts` | `packages/gateway/src/cache/semantic/` | Reuse the existing embedding generation logic. Add provider routing to the unified embedding interface. |
| **V3 (Existing)** | `server/src/services/guardrails.ts` | `packages/gateway/src/cache/semantic/` | Integrate with existing guardrails for cache hit re-validation as described in the plan. |
| litellm | *(Reference architecture only — source files not available locally)* | `packages/gateway/src/cache/semantic/` | Use litellm's documented semantic cache architecture as inspiration for additional features (HNSW, quality-scored invalidation). |
| gemini-cli | `gemini-cli/packages/core/src/safety/` | `packages/gateway/src/cache/semantic/` | Reference gemini-cli's safety checker patterns to ensure semantic cache doesn't return responses that violate safety policies. |

**Key Files to Create/Modify:**

```
packages/gateway/src/cache/semantic/
  ├── semantic-cache.ts              # Main semantic cache orchestrator (create)
  ├── embedder.ts                    # Embedding generation with provider routing (create)
  ├── vector-store.ts                # Abstract vector store interface (create)
  ├── stores/
  │   ├── qdrant-store.ts            # Qdrant vector store adapter (create)
  │   ├── pgvector-store.ts          # PostgreSQL pgvector adapter (create)
  │   ├── sqlite-vec-store.ts        # SQLite vector extension adapter (create)
  │   └── memory-hnsw-store.ts       # In-memory HNSW index (create)
  ├── similarity.ts                  # Cosine similarity, distance metrics (create)
  ├── cache-key-semantic.ts          # Semantic cache key generation (create)
  ├── threshold-tuning.ts            # Automatic threshold optimization (create)
  ├── invalidation.ts                # Cache invalidation by quality score (create)
  └── index.ts                       # Public API (create)
```

**Acceptance Criteria:**

- [ ] Semantic cache achieves >85% hit rate on a dataset of 10,000 rephrased questions (threshold 0.95)
- [ ] Embedding generation adds <50ms overhead for requests smaller than 4K tokens (p99)
- [ ] Vector store query completes in <10ms for stores with up to 100K embeddings (in-memory HNSW)
- [ ] All four vector store backends pass identical integration test suite
- [ ] Cache can disable itself transparently if embedding service is unavailable (graceful degradation)
- [ ] Cache invalidation correctly purges entries when associated responses receive low quality scores
- [ ] Threshold is dynamically adjustable at runtime without restarting the gateway
- [ ] Responses from cache include descriptive headers (`X-Cache: semantic hit`, similarity score)
- [ ] Hybrid mode: exact match checked before semantic match (exact check <1ms)
- [ ] Security: cached responses are validated against current guardrails before being returned

**Risk Level:** High

> *Semantic caching introduces the risk of returning stale or inappropriate responses due to embedding collision or threshold misconfiguration. Mitigations include: (1) mandatory guardrail re-validation of all cache hits, (2) gradual threshold rollout with A/B testing, (3) automatic cache bypass for requests flagged by PII/prompt-injection detectors.*

---

### 11.3 Import Portkey's Caching Strategies

**Detailed Description:**

Portkey's caching system introduces several sophisticated strategies that complement the foundational multi-tier cache and the semantic cache. This subphase ports Portkey's pluggable caching middleware architecture, which includes: (1) **Parameterized caching** — cache keys that intelligently ignore semantically irrelevant parameters (e.g., `temperature`, `seed`, `stream`) while considering semantically relevant ones (e.g., `model`, `messages`, `tools`), (2) **Prefix caching** — for streaming responses, cache common response prefixes so repeated queries stream instantly, (3) **TTL-based freshness tiers** — different TTLs based on model type (e.g., GPT-4 responses cached longer than fine-tuned model responses), (4) **Cache-aside + Write-through** hybrid pattern with configurable behavior per provider and (5) **Distributed cache invalidation** via Redis pub/sub for multi-instance deployments.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| Portkey | `portkey/src/middlewares/cache.ts` | `packages/gateway/src/cache/strategies/` | Extract the middleware architecture from Portkey's Express-style middleware pipeline. Re-plug into the gateway's hook system (pre-request/post-request hooks). |
| Portkey | `portkey/src/caching/strategies/*` | `packages/gateway/src/cache/strategies/` | Port each strategy independently. Replace Portkey's model config JSON with the unified model registry. Adapt to the gateway's async iterable streaming model. |
| Portkey | `portkey/src/caching/parameterized.ts` | `packages/gateway/src/cache/strategies/` | Use the parameter extraction logic as-is, but replace Portkey's config schema with @agentic-os/config schema. |
| 9Router | `9router/src/cache/cache-aside.js` | `packages/gateway/src/cache/strategies/` | Merge 9Router's cache-aside implementation with Portkey's for comprehensive provider-specific patterns. |

**Key Files to Create/Modify:**

```
packages/gateway/src/cache/strategies/
  ├── parameterized-cache.ts         # Intelligently parameterized cache keys (create)
  ├── prefix-cache.ts                # Streaming prefix caching (create)
  ├── ttl-tiers.ts                   # Model-aware TTL configuration (create)
  ├── cache-aside.ts                 # Cache-aside pattern implementation (create)
  ├── write-through.ts               # Write-through cache pattern (create)
  ├── write-behind.ts                # Write-behind (async write) pattern (create)
  ├── freshness-policy.ts            # Freshness-based cache decision engine (create)
  ├── invalidation-bus.ts            # Redis pub/sub invalidation (create)
  └── index.ts                       # Strategy registry (create)

packages/gateway/src/cache/
  ├── cache-middleware.ts            # Unified cache hook (modify)
  └── cache-manager.ts               # Orchestrates all strategies (modify)
```

**Acceptance Criteria:**

- [ ] Parameterized caching correctly handles 50+ parameter permutations with zero false cache hits
- [ ] Prefix caching reduces perceived latency for streaming responses by 40%+ for repeated queries
- [ ] TTL tiers are configurable per-model-family via YAML config (not code changes)
- [ ] Cache-aside pattern correctly populates cache on first miss and serves from cache on subsequent hits
- [ ] Write-through pattern blocks the request until both upstream response is received AND cache is updated
- [ ] Distributed invalidation via Redis pub/sub propagates invalidations to all connected instances within 100ms
- [ ] Strategy chain is configurable at runtime — strategies can be added, removed, or reordered via config reload
- [ ] Cache statistics provide per-strategy breakdown (hits, misses, evictions, avg lookup time)
- [ ] All strategies correctly handle streaming responses by caching the full response buffer upon completion
- [ ] Graceful fallback: if a strategy throws, the request falls through to the next strategy in the chain without erroring

**Risk Level:** Low

> *Each strategy is independently testable and can be rolled out incrementally. The strategy chain architecture ensures that a failure in any single strategy doesn't cascade. Parameterized caching's main risk (false cache hits) is mitigated through exhaustive test cases covering all known parameter patterns.*

---

### 11.4 Implement Response Compression (From 9Router RTK: Caveman, Ponytail)

**Detailed Description:**

9Router's RTK (Real-Time Kit) compression introduces two groundbreaking compression algorithms specifically designed for LLM response streams: **Caveman** and **Ponytail**. Caveman is a lossless, stream-aware compression algorithm that exploits the predictable structure of LLM token streams — it uses a combination of run-length encoding for repeated tokens, delta encoding for probability distributions, and a custom dictionary for common response patterns. Caveman typically achieves 4-6x compression ratios on raw token streams. Ponytail is a more aggressive, near-lossless algorithm that further compresses by approximating token probabilities within a configurable error margin (default 0.01). Ponytail can achieve 8-12x compression ratios while maintaining response quality. Both algorithms operate on streaming data with sub-millisecond overhead per chunk, making them suitable for real-time applications.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| 9Router | `9router/src/rtk/compression/caveman.js` | `packages/gateway/src/rtk/compression/` | Port from JavaScript to TypeScript with full type safety. Extract the core algorithm from 9Router-specific streaming pipeline. Add the unified chunk format adapter. |
| 9Router | `9router/src/rtk/compression/ponytail.js` | `packages/gateway/src/rtk/compression/` | Same as caveman — full TS port. Add configurable error margin parameter that was hardcoded in 9Router. |
| 9Router | `9router/src/rtk/compression/dictionary.js` | `packages/gateway/src/rtk/compression/` | Port the compression dictionary builder. Extend with provider/model-specific dictionaries trained on observed traffic patterns. |
| 9Router | `9router/src/rtk/stream/compression-stream.js` | `packages/gateway/src/rtk/stream/` | Port the streaming compression pipeline. Adapt to use the gateway's TransformStream API for pipe-through semantics. |
| OmniRoute2 | `OmniRoute2/src/lib/compression/` | `packages/gateway/src/rtk/` | Merge OmniRoute2's compression configuration schema with 9Router's algorithms for a unified configuration surface. |

**Key Files to Create/Modify:**

```
packages/gateway/src/rtk/
  ├── compression/
  │   ├── caveman.ts                  # Caveman compression algorithm (create)
  │   ├── caveman-decompress.ts       # Caveman decompression (create)
  │   ├── ponytail.ts                 # Ponytail compression algorithm (create)
  │   ├── ponytail-decompress.ts      # Ponytail decompression (create)
  │   ├── dictionary.ts              # Compression dictionary management (create)
  │   ├── stream-compressor.ts       # Streaming compression transformer (create)
  │   └── index.ts                    # Compression registry (create)
  ├── stream/
  │   ├── compression-stream.ts      # ReadableStream → CompressedStream (create)
  │   ├── decompression-stream.ts    # CompressedStream → ReadableStream (create)
  │   └── index.ts                    # Stream utilities (create)
  ├── config.ts                      # RTK compression configuration (create)
  └── index.ts                       # Public API (create)
```

**Acceptance Criteria:**

- [ ] Caveman achieves minimum 4x compression on standard LLM response streams (measured over 1000 real responses)
- [ ] Ponytail achieves minimum 8x compression with error margin of 0.01 (measured over same dataset)
- [ ] Compression overhead per chunk is <1ms for both algorithms (p99)
- [ ] Decompression restores the exact original output for Caveman (byte-for-byte identical)
- [ ] Ponytail decompression restores output with statistical quality metrics within 1% of original (perplexity delta <0.05)
- [ ] Streaming compression works as a pipe-through TransformStream — no buffering required
- [ ] Compression dictionary auto-trains on observed traffic and achieves >90% dictionary hit rate after 1000 requests
- [ ] Both algorithms can be enabled/disabled and configured per-route or per-provider via runtime config
- [ ] Compressed responses include `Content-Encoding: x-caveman` or `x-ponytail` headers for client transparency
- [ ] Integration tests verify compatibility with all major providers' response formats

**Risk Level:** Medium

> *Compression introduces complexity in the streaming pipeline and potential compatibility issues with clients that don't support the custom encoding. Mitigations include: (1) automatic negotiation via `Accept-Encoding` header, (2) graceful fallback to uncompressed if client doesn't advertise support, (3) comprehensive fuzz testing of decompression with malformed input.*

---

### 11.5 Implement Cache Warming and Prediction

**Detailed Description:**

Cache warming and prediction transforms caching from a reactive system (wait for misses to populate) to a proactive system (predict what will be requested and pre-populate it). This subphase implements: (1) **Usage pattern analysis** — machine learning models that analyze historical request patterns to identify temporal patterns (daily/ weekly cycles, event-driven spikes), user-specific patterns, and cross-user patterns (when user A asks X, user B likely asks Y within 5 minutes), (2) **Preemptive warming** — a background worker that pre-populates the cache during low-usage periods based on predicted demand, (3) **Burst protection** — when a sudden traffic spike is detected, the system temporarily increases cache aggressiveness (lower semantic threshold, longer TTLs) to protect backend providers, (4) **Cold start mitigation** — for new deployments or after cache flush, a replay mechanism that replays recent popular requests from disk logs to warm the cache, and (5) **Cache orchestration** — intelligent routing that directs predicted-hot requests through the fastest cache path while routing cold requests to optimize for cache learning.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| litellm | `litellm/litellm/caching/cache_warming.py` | `packages/gateway/src/cache/warming/` | Port the warming worker architecture from Python to TypeScript. Replace litellm's simple LRU-based warming with the multi-tier enhanced approach. Add the prediction engine integration point. |
| Portkey | `portkey/src/caching/prefetch.ts` | `packages/gateway/src/cache/warming/` | Port Portkey's prefetch logic that analyzes response headers for likely follow-up requests. Adapt to the unified request/response model. |
| 9Router | `9router/src/cache/predictive.js` | `packages/gateway/src/cache/predictive/` | Extract 9Router's pattern extraction logic that identifies re-usable prompt templates. Port the template-based prediction model. |
| new-api | `new-api/controller/cache.go` | `packages/gateway/src/cache/warming/` | Reference new-api's channel-based warming for multi-tenant cache isolation patterns. Don't copy directly, use as reference architecture. |

**Key Files to Create/Modify:**

```
packages/gateway/src/cache/
  ├── warming/
  │   ├── warming-worker.ts          # Background warming worker (create)
  │   ├── warming-scheduler.ts       # Cron-based warming schedule (create)
  │   ├── popularity-tracker.ts      # Request frequency tracking (create)
  │   └── index.ts                    # Warming public API (create)
  ├── predictive/
  │   ├── pattern-analyzer.ts        # Usage pattern extraction (create)
  │   ├── predictor.ts               # Prediction model engine (create)
  │   ├── burst-detector.ts          # Traffic spike detection (create)
  │   ├── cold-start.ts              # Cold start mitigation (create)
  │   └── index.ts                    # Prediction public API (create)
  ├── orchestrator.ts                # Cache orchestration layer (create)
  └── cache-manager.ts               # Integrate warming + prediction (modify)
```

**Acceptance Criteria:**

- [ ] Prediction model achieves >70% accuracy for "request will be repeated within 1 hour" predictions
- [ ] Cache warming reduces first-request latency for predicted hot items by 80%+ (warming makes them cache hits)
- [ ] Burst protection automatically activates when request rate exceeds 2x the rolling average for >10 seconds
- [ ] Cold start mitigation replays the last 1000 unique requests from disk logs within 30 seconds of startup
- [ ] Warming worker respects configurable resource limits (max CPU, max memory, max concurrent warming requests)
- [ ] Pattern analyzer correctly identifies daily, weekly, and event-driven patterns from historical data
- [ ] Predictive cache doesn't cause cache pollution — warmed items that aren't eventually requested are evicted within their TTL
- [ ] Orchestrator correctly routes predicted-hot requests through memory tier while warming completes
- [ ] All warming and prediction features can be toggled independently via runtime config
- [ ] Metrics track prediction accuracy, warming effectiveness (warmed vs naturally cached ratio), and burst events

**Risk Level:** Medium

> *Prediction introduces resource overhead for the ML models and the risk of cache pollution (warming items nobody requests). Mitigations include: (1) conservative prediction thresholds that require >80% confidence before warming, (2) strict TTL limits on pre-warmed items (shorter than naturally cached items), (3) resource budgeting for the warming worker, (4) A/B testing framework for prediction model iterations.*

---

## Phase 12: Streaming Engine (Weeks 22-25)

### Overview

Phase 12 unifies the streaming approaches from all eight projects into a single, cohesive streaming engine. 9Router's chatCore provides production-tested SSE streaming with 30+ provider format translations, litellm contributes its async generator-based streaming with token counting and usage tracking built-in, Goose contributes its ACP streaming protocol with session management, Portkey contributes its streaming middleware pipeline with guardrails and format conversion, and gemini-cli contributes its consent-based streaming safety checks. The unified engine supports SSE (Server-Sent Events), WebSocket, raw TCP, and gRPC streaming, all through a common streaming interface. A transformation pipeline enables token counting, moderation scanning, format conversion, and compression to be applied to any stream.

---

### 12.1 Design Unified Streaming Interface (Combining All 8 Projects' Approaches)

**Detailed Description:**

This subphase is purely architectural — designing the unified streaming interface that will serve as the abstraction layer for all streaming operations across the gateway. The interface must accommodate four fundamentally different streaming paradigms: (1) **HTTP SSE streaming** — chunk-by-chunk responses over HTTP with event-stream encoding (used by OpenAI, Anthropic, Gemini, and most providers), (2) **WebSocket streaming** — bidirectional message streaming over WebSocket connections (used by Realtime API, some provider protocols), (3) **Raw TCP streaming** — unframed byte streaming over persistent TCP connections (used by some custom provider integrations and local inference), (4) **gRPC streaming** — protocol-buffer-encoded streaming over gRPC (used by enterprise deployments and some cloud providers). The interface must handle backpressure, cancellation, error propagation, and resource cleanup uniformly across all four paradigms. It must also support the transformation pipeline (Phase 12.5) as pipe-through operators, enabling composition of streaming transforms.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| 9Router | `9router/open-sse/streaming/core.js` | `packages/gateway/src/streaming/interfaces/` | Extract the streaming core abstractions. Separate the SSE-specific parts from the general streaming interface. Add WebSocket and gRPC variants. |
| Goose | `goose/crates/goose/src/streaming/` | `packages/gateway/src/streaming/interfaces/` | Reference Goose's ACP streaming protocol for inspiration on session management integration. Adapt the async streaming patterns from Rust to TypeScript. |
| litellm | `litellm/litellm/proxy/streaming/` | `packages/gateway/src/streaming/interfaces/` | Extract litellm's async generator patterns and the token counting hooks. Port the backpressure-aware streaming design. |
| Portkey | `portkey/src/streaming/streamHandler.ts` | `packages/gateway/src/streaming/interfaces/` | Reuse Portkey's stream transformation middleware architecture. Adapt the error normalization layer. |

**Key Files to Create/Modify:**

```
packages/gateway/src/streaming/
  ├── interfaces/
  │   ├── stream-provider.ts          # Provider streaming interface contract (create)
  │   ├── stream-consumer.ts          # Consumer/Client streaming interface (create)
  │   ├── stream-types.ts             # Unified stream chunk types (create)
  │   ├── stream-error.ts             # Stream error taxonomy (create)
  │   ├── backpressure.ts             # Backpressure signaling interface (create)
  │   ├── cancellation.ts             # Stream cancellation & cleanup (create)
  │   └── index.ts                    # Interface exports (create)
  ├── transforms/
  │   ├── transform-pipeline.ts       # Pipe-through transform pipeline (create)
  │   └── index.ts                    # Transform exports (create)
  └── index.ts                       # Public streaming API (create)
```

**Acceptance Criteria:**

- [ ] Unified interface supports all four streaming paradigms (SSE, WS, TCP, gRPC) through a single abstraction
- [ ] Backpressure is properly propagated from consumer → transform pipeline → provider for all paradigms
- [ ] Stream cancellation correctly releases all resources (open connections, file handles, memory buffers) within 5 seconds
- [ ] Error propagation preserves original error context while normalizing to unified error types
- [ ] Transform pipeline supports arbitrary chaining of pipe-through operators (composition)
- [ ] Interface is fully typed with TypeScript generics — no `any` types in the public API
- [ ] Stream chunk types distinguish between: content delta, tool call delta, thinking delta, error event, metadata event, and done event
- [ ] Interface includes lifecycle hooks: onStart, onChunk, onError, onComplete, onCancel
- [ ] All existing 9Router, litellm, Portkey streaming functionality can be expressed through the unified interface without loss of capability
- [ ] Documentation includes architecture decision records (ADRs) explaining key design choices

**Risk Level:** Low

> *This is a design-only phase with no production code changes. The risk is primarily around getting the interface wrong, which would require refactoring downstream consumers. Mitigations include: (1) thorough interface review with engineers familiar with all 8 projects, (2) prototype implementations for all four streaming paradigms before finalizing, (3) interface versioning to support migration.*

---

### 12.2 Implement SSE Streaming Handler (from 9Router chatCore + litellm)

**Detailed Description:**

The SSE (Server-Sent Events) streaming handler is the primary streaming transport for the gateway — it handles the vast majority of LLM API traffic. This subphase implements the production-grade SSE handler by merging 9Router's battle-tested chatCore SSE implementation (which handles 30+ provider SSE formats with thousands of concurrent connections in production) with litellm's streaming proxy handler (which adds token counting, usage tracking, and streaming middleware integration). The handler supports: (1) **Provider SSE format translation** — normalizing each provider's unique SSE event format (OpenAI's delta format, Anthropic's content block format, Gemini's server-push format, etc.) into the unified streaming chunk format, (2) **Chunk buffering and reordering** — handling out-of-order chunks, duplicate chunks, and malformed SSE events gracefully, (3) **Keep-alive management** — configurable keep-alive intervals to prevent proxy timeouts, (4) **Concurrent connection pooling** — efficient management of thousands of simultaneous SSE connections with automatic cleanup of stale connections.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| 9Router | `9router/open-sse/handlers/chatCore/` | `packages/gateway/src/streaming/sse/` | Full port from JavaScript to TypeScript. Extract core SSE handling from provider-specific logic. Add the unified streaming interface integration. |
| 9Router | `9router/open-sse/handlers/sse-parser.js` | `packages/gateway/src/streaming/sse/` | Port the SSE parser that handles malformed streams. Add TypeScript types for all SSE event variants. |
| litellm | `litellm/litellm/proxy/streaming_handler.py` | `packages/gateway/src/streaming/sse/` | Port the streaming middleware integration (token counting, usage tracking hooks). Convert Python async generators to TypeScript async iterables. |
| litellm | `litellm/litellm/proxy/streaming_chunk_processor.py` | `packages/gateway/src/streaming/sse/` | Port the chunk processing pipeline. Adapt the finish_reason mapping to the unified model. |

**Key Files to Create/Modify:**

```
packages/gateway/src/streaming/sse/
  ├── sse-handler.ts                  # Main SSE handler (create)
  ├── sse-parser.ts                   # SSE event stream parser (create)
  ├── sse-serializer.ts               # SSE event stream serializer (create)
  ├── chunk-buffer.ts                 # Chunk buffering & reordering (create)
  ├── keep-alive.ts                   # Keep-alive management (create)
  ├── connection-pool.ts              # Connection pooling & lifecycle (create)
  ├── format-translators/             # Provider-specific SSE format translators
  │   ├── openai.ts                   # OpenAI delta format (create)
  │   ├── anthropic.ts                # Anthropic content block format (create)
  │   ├── gemini.ts                   # Gemini server-push format (create)
  │   ├── cohere.ts                   # Cohere SSE format (create)
  │   ├── mistral.ts                  # Mistral SSE format (create)
  │   ├── bedrock.ts                  # AWS Bedrock streaming format (create)
  │   ├── azure.ts                    # Azure OpenAI SSE format (create)
  │   └── custom.ts                   # Custom OpenAI-compatible format (create)
  └── index.ts                        # SSE public API (create)
```

**Acceptance Criteria:**

- [ ] Handler correctly translates all 8+ provider SSE formats into the unified streaming chunk format
- [ ] Chunk buffering handles out-of-order chunks (reorders within a 100ms window) and deduplicates duplicate chunks
- [ ] Keep-alive sends ping events at configurable intervals (default 15s) to prevent proxy/load-balancer timeouts
- [ ] Connection pool manages 10,000+ concurrent SSE connections with <500MB memory overhead
- [ ] Malformed SSE events (truncated chunks, invalid JSON, non-standard field names) are handled without crashing the connection
- [ ] Token counting via litellm's middleware is integrated and adds <5ms overhead per chunk
- [ ] SSE handler supports both async generator (push-based) and async iterable (pull-based) consumption patterns
- [ ] Response headers follow SSE spec (Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive)
- [ ] Handler gracefully handles client disconnection (cleanup within 2 seconds)
- [ ] All format translators pass the golden test suite covering 100+ edge cases per provider

**Risk Level:** Medium

> *SSE is the most-used streaming transport, so any regressions impact all users. Mitigations include: (1) comprehensive golden test suite covering provider-specific edge cases, (2) canary deployment with traffic shadowing for new handler versions, (3) automatic fallback to non-streaming if SSE setup fails.*

---

### 12.3 Implement WebSocket Streaming

**Detailed Description:**

WebSocket streaming enables bidirectional, real-time communication between clients and the gateway, supporting use cases like real-time voice conversations, agent-to-agent streaming, and interactive tool execution feedback. This subphase implements a full-duplex WebSocket handler that: (1) **Supports the OpenAI Realtime API protocol** — the de facto standard for real-time AI interactions, including audio/video streaming, tool execution, and conversation management, (2) **Implements session management** — WebSocket sessions with state, authentication, and lifecycle management that integrates with the gateway's auth system, (3) **Provides binary framing** — efficient binary message encoding using MessagePack for reduced overhead compared to JSON text frames, (4) **Handles reconnection** — session resumption with configurable timeout (default 30 minutes), message replay for missed messages, and idempotent message delivery, (5) **Implements rate limiting per-connection** — token bucket rate limiting for messages per WebSocket connection to prevent abuse.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| 9Router | `9router/open-sse/handlers/ws-handler.js` | `packages/gateway/src/streaming/websocket/` | Port the WebSocket connection management. Replace 9Router's custom WS implementation with the gateway's unified WS abstraction. Add the unified streaming interface integration. |
| litellm | `litellm/litellm/proxy/realtime/` | `packages/gateway/src/streaming/websocket/` | Port litellm's realtime API proxy patterns. Adapt the session management to work with the gateway's distributed session store. |
| Goose | `goose/crates/goose/src/streaming/ws.rs` | `packages/gateway/src/streaming/websocket/` | Reference Goose's ACP WebSocket implementation for session resume patterns. Port the keep-alive and ping/pong logic. |
| gemini-cli | `gemini-cli/docs/core/streaming.md` | `packages/gateway/src/streaming/websocket/` | Reference gemini-cli's WebSocket safety check patterns for consent-based streaming controls. |

**Key Files to Create/Modify:**

```
packages/gateway/src/streaming/websocket/
  ├── ws-handler.ts                   # Main WebSocket handler (create)
  ├── ws-session.ts                   # WebSocket session management (create)
  ├── ws-protocol.ts                  # WebSocket message protocol (create)
  ├── realtime-api.ts                 # OpenAI Realtime API protocol support (create)
  ├── binary-codec.ts                 # MessagePack binary codec (create)
  ├── reconnection.ts                 # Session resumption & message replay (create)
  ├── rate-limiter.ts                 # Per-connection rate limiting (create)
  ├── keep-alive.ts                   # Ping/pong keep-alive (create)
  ├── audio-handler.ts                # Audio frame streaming (create)
  └── index.ts                        # WebSocket public API (create)
```

**Acceptance Criteria:**

- [ ] WebSocket handler supports 10,000+ concurrent connections with <1GB memory overhead
- [ ] OpenAI Realtime API protocol is fully supported (audio in/out, tool execution, conversation management)
- [ ] Session resumption works within 30-minute window — client can disconnect and reconnect without losing context
- [ ] Binary MessagePack encoding reduces message overhead by 60%+ compared to JSON text frames
- [ ] Per-connection rate limiting correctly prevents abuse (configurable messages/second)
- [ ] Reconnection message replay replays all missed messages since the last acknowledged message
- [ ] WebSocket handler integrates with the gateway's auth system — authentication happens before the WS connection is fully established
- [ ] Graceful upgrade from HTTP to WebSocket (101 Switching Protocols) works through all proxy layers
- [ ] Keep-alive pings are sent every 30 seconds and stale connections (no pong for 60s) are cleaned up
- [ ] Audio streaming supports both raw PCM and Opus codec formats with configurable sample rates

**Risk Level:** High

> *WebSocket streaming introduces stateful connections (which are harder to scale than stateless SSE) and real-time audio processing (which is computationally expensive and latency-sensitive). Mitigations include: (1) sticky session routing via Redis-backed session store, (2) WebSocket connection draining for zero-downtime deployments, (3) optional audio processing that can be disabled for text-only deployments.*

---

### 12.4 Implement Raw TCP/gRPC Streaming

**Detailed Description:**

Raw TCP and gRPC streaming handle the enterprise and high-performance use cases that SSE and WebSocket don't address. Raw TCP streaming is used for: (1) **Local inference connections** — llama.cpp, Ollama, and vLLM often expose raw TCP endpoints for streaming with minimal overhead, (2) **High-frequency trading-style AI** — where microseconds matter and the overhead of HTTP headers is unacceptable, (3) **Embedded/IoT devices** — where WebSocket libraries may not be available. gRPC streaming handles: (1) **Enterprise service mesh integration** — many enterprises standardize on gRPC for internal services, (2) **Kubernative deployments** — gRPC integrates natively with service meshes like Istio for traffic management, (3) **Bidirectional streaming RPCs** — for agent-to-agent communication within the orchestration layer.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| Goose | `goose/crates/goose/src/streaming/tcp.rs` | `packages/gateway/src/streaming/tcp/` | Full Rust-to-TypeScript port of the TCP streaming handler. May need to implement the TCP server in Rust and expose via FFI or implement as a sidecar. |
| litellm | `litellm/litellm/proxy/grpc/` | `packages/gateway/src/streaming/grpc/` | Port litellm's gRPC service definitions. Generate TypeScript gRPC client/server from the .proto files. Adapt the streaming patterns. |
| 9Router | `9router/src/streaming/tcp-stream.js` | `packages/gateway/src/streaming/tcp/` | Port the TCP framing protocol. Adapt the length-prefixed message format to the unified streaming interface. |
| new-api | `new-api/relay/channel/grpc/` | `packages/gateway/src/streaming/grpc/` | Reference new-api's gRPC channel relay for inspiration on multi-tenant gRPC streaming. |

**Key Files to Create/Modify:**

```
packages/gateway/src/streaming/tcp/
  ├── tcp-server.ts                   # Raw TCP streaming server (create)
  ├── tcp-framing.ts                  # Length-prefixed message framing (create)
  ├── tcp-session.ts                  # TCP session state management (create)
  ├── tcp-codec.ts                    # Binary encoding/decoding (create)
  └── index.ts                        # TCP public API (create)

packages/gateway/src/streaming/grpc/
  ├── proto/                          # protobuf definitions
  │   ├── streaming.proto             # gRPC streaming service (create)
  │   └── types.proto                 # Shared message types (create)
  ├── grpc-server.ts                  # gRPC streaming server (create)
  ├── grpc-client.ts                  # gRPC streaming client (create)
  ├── grpc-converter.ts              # gRPC ↔ unified stream conversion (create)
  └── index.ts                        # gRPC public API (create)
```

**Acceptance Criteria:**

- [ ] Raw TCP server handles 5,000+ concurrent connections with sub-millisecond latency overhead
- [ ] TCP framing correctly handles partial reads, message boundaries, and backpressure
- [ ] gRPC bidirectional streaming supports server-sent, client-sent, and bidirectional streaming RPCs
- [ ] gRPC service definitions are fully typed — both server and client are type-safe
- [ ] gRPC ↔ unified stream conversion preserves all chunk types (content, tool call, thinking, error, done)
- [ ] Both TCP and gRPC handlers support TLS/mTLS for secure connections
- [ ] TCP handler integrates with the gateway's rate limiting and auth systems
- [ ] gRPC handler integrates with the gateway's interceptor chain (auth, rate limiting, telemetry)
- [ ] Both handlers support the streaming transformation pipeline (Phase 12.5)
- [ ] Integration tests verify round-trip streaming through TCP → gateway → provider and back

**Risk Level:** High

> *Raw TCP and gRPC are significantly more complex to implement correctly than HTTP-based streaming. TCP requires handling of all the edge cases that HTTP abstracts away (partial reads, connection resets, backpressure). gRPC requires proto file management and code generation. Mitigations include: (1) implementing TCP handling in Rust for performance and safety, (2) using established gRPC libraries (grpc-js for Node.js, tonic for Rust), (3) extensive integration testing with fault injection.*

---

### 12.5 Implement Streaming Transformation Pipeline (Token Counting, Moderation, Format Conversion)

**Detailed Description:**

The streaming transformation pipeline is a composable middleware system that operates on streaming data in real-time. Each transformation is a pipe-through operator that receives stream chunks, transforms them, and emits transformed chunks. Built-in transformations include: (1) **Token counting** — real-time token counting using tiktoken for supported models, with cumulative totals exposed via response headers and callbacks, (2) **Content moderation** — streaming moderation using the same guardrail engine from Phase 5/14 but operating on streaming chunks with buffering for context-dependent checks (e.g., PII detection requires sentence-level context), (3) **Format conversion** — real-time conversion between streaming formats (e.g., converting between OpenAI delta format and Anthropic content block format mid-stream), (4) **Compression** — RTK compression (Phase 11.4) as a stream transformation, (5) **Caching** — cache population during streaming (write-through cache), (6) **Telemetry** — real-time streaming metrics (chunk latency, throughput, token rate).

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| litellm | `litellm/litellm/proxy/streaming_transformers.py` | `packages/gateway/src/streaming/transforms/` | Full TypeScript port of each streaming transformer. Replace litellm's Python-specific patterns with TypeScript async iterables/TransformStreams. |
| Portkey | `portkey/src/middlewares/streamTransforms.ts` | `packages/gateway/src/streaming/transforms/` | Port Portkey's streaming middleware pipeline architecture. Adapt the middleware chaining to work with the gateway's hook system. |
| 9Router | `9router/open-sse/transforms/` | `packages/gateway/src/streaming/transforms/` | Port 9Router's response transformation pipeline. Extract the format conversion transformers. |
| Goose | `goose/crates/goose/src/streaming/transforms.rs` | `packages/gateway/src/streaming/transforms/` | Reference Goose's streaming transform patterns for inspiration on the Rust-side implementations. |

**Key Files to Create/Modify:**

```
packages/gateway/src/streaming/transforms/
  ├── token-counter.ts               # Real-time token counting transform (create)
  ├── content-moderation.ts           # Streaming content moderation (create)
  ├── format-converter.ts            # Streaming format conversion (create)
  ├── compression-transform.ts        # RTK compression as stream transform (create)
  ├── cache-writer.ts                 # Write-through cache population (create)
  ├── telemetry-transform.ts          # Streaming telemetry metrics (create)
  ├── guardrail-transform.ts          # Guardrail scanning transform (create)
  ├── transform-pipeline.ts           # Pipeline orchestration (create)
  ├── transform-registry.ts          # Transform registration & discovery (create)
  └── index.ts                        # Transforms public API (create)
```

**Acceptance Criteria:**

- [ ] Token counting accurately counts tokens for all supported models (<1% error vs tiktoken reference)
- [ ] Content moderation scan adds <20ms latency per chunk (p99) with sentence-level buffering
- [ ] Format conversion preserves all chunk fields through the conversion (no data loss)
- [ ] Compression transform achieves same compression ratios as Phase 11.4 standalone
- [ ] Cache writer correctly populates the full response in cache once streaming completes
- [ ] Pipeline supports dynamic composition — transforms can be added/removed/reordered at runtime
- [ ] Each transform can be independently enabled/disabled per-route or per-provider
- [ ] Pipeline handles backpressure correctly — slow transforms don't block the entire stream
- [ ] Error isolation — a failing transform doesn't crash the stream (it's skipped with a warning)
- [ ] Pipeline performance: chain of 5 transforms adds <50ms total overhead per response

**Risk Level:** Medium

> *The streaming pipeline is a critical path for all streaming traffic — any performance regression affects all users. The composable architecture introduces the risk of transform interactions (e.g., compression after moderation might hide moderated content). Mitigations include: (1) strict transform ordering conventions, (2) integration tests for all transform combinations, (3) per-transform performance budgets that trigger alerts when exceeded.*

---

## Phase 13: Auth & Security — Core (Weeks 25-28)

### Overview

Phase 13 implements the foundational authentication and security infrastructure by unifying the auth approaches from all eight projects. 9Router contributes its 20+ OAuth provider integrations with support for PKCE, token refresh, and encrypted token storage. gemini-cli contributes its production-tested OAuth2 flow with consent system (including granular scope management and consent revocation). Goose contributes its device authorization flow (used for Claude, Codex, Gemini, GitHub, Kiro authentication without browser redirects). new-api contributes its enterprise-grade API key management system with key generation, validation, rotation, scoping, and inheritance. The unified auth core provides a single authentication interface that supports OAuth2 (with PKCE), device flow, API keys, SSO, and custom auth providers, all managed through a centralized auth manager with encrypted token storage.

---

### 13.1 Implement Unified Auth Provider Interface

**Detailed Description:**

The unified auth provider interface is the foundational abstraction that enables the gateway to support any authentication mechanism through a single, consistent API. The interface defines: (1) **Authentication contract** — methods for `authenticate()`, `refreshToken()`, `validateCredentials()`, and `revokeAccess()` that all auth providers must implement, (2) **Token management** — standardized token types (access token, refresh token, ID token, API key) with metadata (expiry, scopes, provider, user info), (3) **Credential storage** — integration with the gateway's vault system for encrypted credential storage at rest, with automatic encryption/decryption, (4) **Provider registry** — dynamic registration of auth providers with capability discovery (which auth flows a provider supports), (5) **Fallback chain** — ability to configure fallback auth mechanisms (e.g., try OAuth first, fall back to API key if OAuth fails), (6) **Session management** — integrated session creation on successful authentication, with support for stateless (JWT) and stateful (Redis) sessions.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| 9Router | `9router/src/auth/provider-interface.js` | `packages/gateway/src/auth/interface/` | Extract the provider interface design. Replace 9Router-specific types with unified gateway types. Add token management and credential storage methods. |
| Goose | `goose/crates/goose/src/auth/types.rs` | `packages/gateway/src/auth/interface/` | Port the auth type definitions (token types, credentials, provider capabilities). Adapt to TypeScript with zod validation schemas. |
| gemini-cli | `gemini-cli/.gemini/config.yaml` | `packages/gateway/src/auth/interface/` | Reference gemini-cli's auth configuration schema. Adapt the consent management interface. |
| new-api | `new-api/model/auth.go` | `packages/gateway/src/auth/interface/` | Reference new-api's auth model for enterprise patterns (key scoping, team inheritance). |

**Key Files to Create/Modify:**

```
packages/gateway/src/auth/
  ├── interface/
  │   ├── auth-provider.ts           # Auth provider interface contract (create)
  │   ├── token-types.ts             # Unified token types & metadata (create)
  │   ├── credential-store.ts        # Credential storage interface (create)
  │   ├── provider-registry.ts       # Auth provider registry (create)
  │   ├── session-manager.ts         # Session management interface (create)
  │   ├── consent-manager.ts         # Consent management interface (create)
  │   └── index.ts                    # Interface exports (create)
  ├── providers/
  │   ├── oauth2-provider.ts         # OAuth2 base provider implementation (create)
  │   ├── device-flow-provider.ts    # Device flow base provider (create)
  │   ├── api-key-provider.ts        # API key base provider (create)
  │   └── custom-provider.ts         # Custom auth provider template (create)
  ├── auth-manager.ts                # Unified auth manager (create)
  └── index.ts                       # Auth public API (create)
```

**Acceptance Criteria:**

- [ ] All four auth flow types (OAuth2, Device Flow, API Key, Custom) implement the full auth provider interface
- [ ] Token management correctly handles access tokens, refresh tokens, ID tokens, and API keys with metadata
- [ ] Credential store integrates with the vault system — credentials are encrypted at rest and in transit
- [ ] Provider registry supports dynamic registration and capability discovery
- [ ] Fallback chain works — if primary auth method fails, secondary method is attempted transparently
- [ ] Session management supports both JWT (stateless) and Redis-backed (stateful) sessions
- [ ] Auth provider interface is fully typed — new providers inherit type safety
- [ ] Interface supports async initialization (providers may need to fetch JWKS, load certs, etc.)
- [ ] All existing auth mechanisms from 9Router, Goose, gemini-cli, new-api can be expressed through the interface
- [ ] Comprehensive test suite covers: successful auth, expired token refresh, invalid credential rejection, token revocation

**Risk Level:** Low

> *This is primarily an interface design and base implementation phase. The risk of getting the interface wrong is mitigated by implementing concrete providers (13.2-13.5) in parallel, which validates the interface against real-world requirements.*

---

### 13.2 Import 9Router's 20+ OAuth Integrations

**Detailed Description:**

9Router includes OAuth2 integrations for 20+ AI providers, making it the single richest collection of AI-specific OAuth integrations available. This subphase ports each integration individually, wrapping them in the unified auth provider interface. The integrations include: OpenAI, Anthropic, Google/Gemini, Microsoft/Azure, AWS Bedrock, Cohere, Mistral, Stability AI, Replicate, Hugging Face, Together AI, Fireworks AI, Groq, DeepSeek, Perplexity, ElevenLabs, AssemblyAI, and more. Each integration handles: (1) **Provider-specific OAuth endpoints** — authorization URL, token URL, revoke URL, with provider-specific quirks (some use PKCE, some use client_secret_basic, some require custom headers), (2) **Scope management** — provider-specific scopes for API access, (3) **Token refresh** — automatic token refresh with configurable buffer time before expiry, (4) **Provider-specific error handling** — mapping provider error responses to unified auth error types.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| 9Router | `9router/src/auth/oauth/providers/*.js` | `packages/gateway/src/auth/providers/oauth/` | Port each provider integration individually. Add TypeScript types for provider-specific configs. Implement the unified auth provider interface. |
| 9Router | `9router/src/auth/oauth/pkce.js` | `packages/gateway/src/auth/providers/oauth/` | Port the PKCE implementation. Use the gateway's crypto utilities instead of 9Router's browser-specific Web Crypto API. |
| 9Router | `9router/src/auth/oauth/token-store.js` | `packages/gateway/src/auth/providers/oauth/` | Port the token storage logic. Adapt to use the gateway's vault system instead of 9Router's JSON file storage. |
| gemini-cli | `gemini-cli/docs/core/oauth.md` | `packages/gateway/src/auth/providers/oauth/` | Reference gemini-cli's OAuth flow documentation for best practices around provider-specific edge cases. |

**Key Files to Create/Modify:**

```
packages/gateway/src/auth/providers/oauth/
  ├── openai.ts                       # OpenAI OAuth integration (create)
  ├── anthropic.ts                    # Anthropic OAuth integration (create)
  ├── google-gemini.ts                # Google/Gemini OAuth integration (create)
  ├── microsoft-azure.ts              # Microsoft/Azure OAuth integration (create)
  ├── aws-bedrock.ts                  # AWS Bedrock OAuth integration (create)
  ├── cohere.ts                       # Cohere OAuth integration (create)
  ├── mistral.ts                      # Mistral OAuth integration (create)
  ├── stability.ts                    # Stability AI OAuth integration (create)
  ├── replicate.ts                    # Replicate OAuth integration (create)
  ├── huggingface.ts                  # Hugging Face OAuth integration (create)
  ├── together.ts                     # Together AI OAuth integration (create)
  ├── fireworks.ts                    # Fireworks AI OAuth integration (create)
  ├── groq.ts                         # Groq OAuth integration (create)
  ├── deepseek.ts                     # DeepSeek OAuth integration (create)
  ├── perplexity.ts                   # Perplexity OAuth integration (create)
  ├── elevenlabs.ts                   # ElevenLabs OAuth integration (create)
  ├── assemblyai.ts                   # AssemblyAI OAuth integration (create)
  ├── custom.ts                       # Generic OAuth2 template (create)
  └── index.ts                        # OAuth provider exports (create)
```

**Acceptance Criteria:**

- [ ] All 20+ OAuth provider integrations implement the full unified auth provider interface
- [ ] Each integration is tested with the provider's actual OAuth endpoints (sandbox/ test accounts)
- [ ] PKCE flow works for all providers that require it (verified: Google, Azure, GitHub)
- [ ] Token refresh works for all providers with refresh tokens — tokens are refreshed automatically before expiry
- [ ] Provider-specific error responses (e.g., Anthropic's rate limit during OAuth) are correctly mapped to unified errors
- [ ] Scope management is configurable per-provider with sensible defaults
- [ ] Credential storage uses the vault system — tokens are encrypted at rest
- [ ] Each integration can be independently enabled/disabled via config
- [ ] Integration tests verify: full OAuth flow (auth code → access token), token refresh, token revocation, error handling
- [ ] Custom OAuth2 template enables users to add new OAuth providers via configuration without code changes

**Risk Level:** Low

> *Each OAuth integration is independent and can be developed, tested, and deployed separately. The primary risk is provider API changes breaking individual integrations, mitigated by integration tests that run against provider sandboxes and alert on failures.*

---

### 13.3 Import gemini-cli's OAuth2 Flow and Consent System

**Detailed Description:**

gemini-cli's OAuth2 implementation is production-tested with Google's Gemini API and includes a sophisticated consent management system that goes beyond basic OAuth scopes. The consent system features: (1) **Granular consent scopes** — fine-grained permission controls beyond standard OAuth scopes, enabling users to grant access to specific model families, specific API endpoints, specific data access levels, and specific usage quotas, (2) **Consent revocation** — users can revoke specific permissions without revoking the entire OAuth authorization, (3) **Consent expiry** — configurable consent durations with automatic re-prompting, (4) **Audit trail** — every consent grant and revocation is logged with user identity, timestamp, and scope details, (5) **Emergency override** — administrative ability to revoke all consents for a user or provider in emergency situations. This consent system is ported to work as a general-purpose layer on top of any OAuth provider, not just Gemini.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| gemini-cli | `gemini-cli/.gemini/config.yaml` | `packages/gateway/src/auth/consent/` | Reference the consent configuration schema. Adapt from YAML to the unified gateway config format with TypeScript types. |
| gemini-cli | `gemini-cli/docs/core/oauth.md` | `packages/gateway/src/auth/consent/` | Extract the consent flow documentation into implementation requirements. Port the consent scope architecture to be provider-agnostic. |
| 9Router | `9router/src/auth/oauth/scopes.js` | `packages/gateway/src/auth/consent/` | Merge 9Router's scope management with gemini-cli's consent system. Create a unified scope→consent mapping. |
| Goose | `goose/crates/goose/src/auth/consent.rs` | `packages/gateway/src/auth/consent/` | Reference Goose's consent patterns for the device flow consent integration. |

**Key Files to Create/Modify:**

```
packages/gateway/src/auth/consent/
  ├── consent-manager.ts             # Consent management orchestrator (create)
  ├── consent-scopes.ts              # Granular consent scope definitions (create)
  ├── consent-store.ts               # Consent grant/revocation storage (create)
  ├── consent-revocation.ts          # Consent revocation logic (create)
  ├── consent-expiry.ts              # Consent duration & auto-reprompt (create)
  ├── consent-audit.ts               # Consent audit trail logging (create)
  ├── emergency-override.ts          # Emergency consent revocation (create)
  ├── consent-ui.ts                  # Consent UI endpoints (create)
  └── index.ts                        # Consent public API (create)
```

**Acceptance Criteria:**

- [ ] Consent scopes are configurable per provider with granularity finer than OAuth scopes
- [ ] Users can revoke specific permissions without losing all access to the provider
- [ ] Consent expiry works — users are re-prompted when their consent duration expires
- [ ] Every consent grant and revocation is logged with full audit details
- [ ] Emergency override allows administrators to bulk-revoke consents for a user or provider
- [ ] Consent system works with all OAuth providers, not just Gemini
- [ ] Consent decisions are cached for low-latency authorization checks (<5ms per check)
- [ ] Consent UI provides a dashboard for users to view and manage their granted consents
- [ ] Integration tests verify: granting consent, revoking specific scopes, consent expiry, emergency override
- [ ] Consent system integrates with the gateway's guardrail engine for policy-based consent decisions

**Risk Level:** Low

> *The consent system is layered on top of existing OAuth implementations, so it can be rolled out incrementally. The main risk is complexity in managing the consent↔OAuth scope mapping, mitigated by a clear configuration schema and comprehensive test coverage.*

---

### 13.4 Import Goose's Device Flow Auth

**Detailed Description:**

Goose's device authorization flow enables authentication for devices that lack a browser or have limited input capabilities — a critical requirement for CLI tools, TUI applications, and headless server deployments. The device flow works by: (1) **Device code request** — the client requests a device code from the provider's device authorization endpoint, which returns a device code, user code, verification URI, and polling interval, (2) **User verification** — the user is directed to visit the verification URI on any device with a browser and enter the user code to authorize the application, (3) **Token polling** — the client polls the token endpoint at the specified interval until the user completes authorization or the code expires, (4) **Completion** — once authorized, the client receives access and refresh tokens. Goose's implementation adds: automatic polling with exponential backoff, graceful timeout handling, progress feedback for CLI/TUI users, and integration with the session management system for persistent authentication sessions.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| Goose | `goose/crates/goose/src/auth/device_flow.rs` | `packages/gateway/src/auth/device-flow/` | Full Rust-to-TypeScript port of the device flow implementation. Implement the polling logic with configurable intervals. Add the unified auth provider interface. |
| Goose | `goose/crates/goose/src/auth/device_code_store.rs` | `packages/gateway/src/auth/device-flow/` | Port the device code storage (in-flight authorization tracking). Adapt to use the gateway's Redis/SQLite storage. |
| Goose | `goose/crates/goose/src/auth/oauth_providers.rs` | `packages/gateway/src/auth/device-flow/` | Extract the provider-specific device flow configurations. Implement for all 20+ providers from Phase 13.2. |
| Goose | `goose/integration-tests/acp-env-auth.test.ts` | `packages/gateway/src/auth/device-flow/` | Reference the integration test patterns. Create corresponding tests for the TypeScript implementation. |
| 9Router | `9router/src/auth/device-flow.js` | `packages/gateway/src/auth/device-flow/` | Merge 9Router's device flow implementation with Goose's for comprehensive provider coverage. |

**Key Files to Create/Modify:**

```
packages/gateway/src/auth/device-flow/
  ├── device-flow.ts                 # Device authorization flow orchestrator (create)
  ├── device-code-store.ts           # Device code storage & lifecycle (create)
  ├── polling-engine.ts              # Token polling with exponential backoff (create)
  ├── provider-configs.ts           # Provider-specific device flow configurations (create)
  ├── cli-feedback.ts               # CLI/TUI progress feedback (create)
  └── index.ts                       # Device flow public API (create)
```

**Acceptance Criteria:**

- [ ] Device flow works for CLI, TUI, and headless server environments without browser access
- [ ] Automatic polling with configurable intervals (default matches provider recommendation)
- [ ] Exponential backoff prevents provider rate limiting during extended polling
- [ ] Graceful timeout handling — user is notified when the device code expires
- [ ] Provider configurations for all major AI providers that support device flow (Gemini, Claude, GitHub, etc.)
- [ ] Device code store supports both in-memory (single instance) and Redis (distributed) backends
- [ ] CLI/TUI feedback shows: verification URI, user code, polling status, estimated wait time
- [ ] Successful device flow creates a persistent auth session via the session manager
- [ ] Device flow integrates with the consent system (Phase 13.3) for granular permission management
- [ ] Integration tests verify: full device flow cycle, code expiry, polling timeout, token refresh after device flow

**Risk Level:** Low

> *Device flow is a well-defined OAuth2 specification with clear behavior. The primary implementation risk is provider-specific deviations from the spec, mitigated by comprehensive provider configuration and integration tests against each provider.*

---

### 13.5 Implement API Key Management (from new-api + 9Router)

**Detailed Description:**

API key management is the backbone of programmatic access to the gateway. This subphase implements an enterprise-grade API key management system that merges new-api's comprehensive key management (used in production for multi-tenant AI gateway deployments) with 9Router's key generation and validation patterns. The system includes: (1) **Secure key generation** — cryptographically secure random key generation with configurable prefix, format, and entropy (default: `sk-` prefix, 48 alphanumeric characters, 256 bits of entropy), (2) **Key validation** — validation at authentication time including: format validation, checksum verification, expiry check, scope verification, rate limit check, and revocation status check, (3) **Key scoping** — fine-grained key permissions including: allowed providers, allowed models, allowed endpoints, allowed rate limits, budget limits, and Teams/Org inheritance, (4) **Key rotation** — automatic rotation with configurable schedule, overlap period for rotation windows, and instant emergency rotation, (5) **Key revocation** — instant revocation with Redis-backed revocation list, automatic propagation to all gateway instances, and support for timed revocation (suspend until date), (6) **Audit trail** — full logging of key operations: creation, use, rotation, revocation, with user identity and IP address.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| new-api | `new-api/model/api_key.go` | `packages/gateway/src/auth/api-keys/` | Full Go-to-TypeScript port of the API key data model. Adapt the key scoping to the unified provider/model registry instead of new-api's channel system. |
| new-api | `new-api/controller/api_key.go` | `packages/gateway/src/auth/api-keys/` | Port the key CRUD operations. Add the unified auth provider interface compliance. Adapt the database operations to the gateway's Prisma/SQLite system. |
| new-api | `new-api/service/api_key_service.go` | `packages/gateway/src/auth/api-keys/` | Port the business logic (scoping, rate limiting integration). Replace new-api's channel-based scoping with the gateway's provider+model based scoping. |
| 9Router | `9router/src/auth/api-key.js` | `packages/gateway/src/auth/api-keys/` | Port the key generation and validation logic. Merge 9Router's format patterns with new-api's enterprise features. |
| Goose | `goose/crates/goose/src/auth/api_key.rs` | `packages/gateway/src/auth/api-keys/` | Reference Goose's API key patterns for CLI-specific key management features. |

**Key Files to Create/Modify:**

```
packages/gateway/src/auth/api-keys/
  ├── key-generator.ts               # Cryptographic key generation (create)
  ├── key-validator.ts               # Key validation & checksum verification (create)
  ├── key-scoping.ts                 # Key permission scopes (create)
  ├── key-rotation.ts                # Automatic key rotation (create)
  ├── key-revocation.ts              # Key revocation & suspension (create)
  ├── key-store.ts                   # Key CRUD operations (create)
  ├── key-cache.ts                   # Key validation cache (create)
  ├── key-audit.ts                   # Key audit trail (create)
  ├── key-rate-limiter.ts            # Key-level rate limiting (create)
  └── index.ts                       # API key public API (create)
```

**Acceptance Criteria:**

- [ ] Key generation produces cryptographically secure keys with configurable prefix, format, and entropy
- [ ] Key validation completes in <5ms (p99) including format check, expiry, scope, rate limit, and revocation check
- [ ] Key scoping supports: allowed providers, allowed models, allowed endpoints, rate limits, budget limits
- [ ] Key rotation works with configurable schedule and overlap period — both old and new keys work during rotation
- [ ] Emergency rotation instantly revokes all keys and issues new ones within 2 seconds
- [ ] Key revocation is instant and propagates to all gateway instances via Redis pub/sub within 100ms
- [ ] Audit trail logs: key creation (who, when, scopes), key use (which request, which endpoint), key rotation, key revocation
- [ ] Rate limiting per-key correctly limits requests/second, tokens/second, and cost/minute
- [ ] Integration tests verify: key creation, key validation (valid/invalid/expired/revoked), key rotation, key revocation, scoping enforcement
- [ ] API key management is fully accessible via REST API and CLI commands

**Risk Level:** Medium

> *API key management is security-critical — any vulnerability in key generation, storage, or validation could lead to unauthorized access. Mitigations include: (1) key generation using the platform's secure crypto APIs (Web Crypto, OpenSSL), (2) keys stored as hashes only (bcrypt with high work factor), (3) rate limiting on key validation endpoints to prevent brute force, (4) comprehensive security audit of the key management implementation.*

---

## Phase 14: Auth & Security — Advanced (Weeks 28-31)

### Overview

Phase 14 builds on the core auth infrastructure from Phase 13 to implement advanced security features. new-api's role-based access control (RBAC) and multi-tenant isolation provide the authorization backbone for enterprise deployments. SSO/SAML integration enables the gateway to fit into existing enterprise identity infrastructure. litellm's guardrails, Portkey's guardrail plugins, and gemini-cli's safety checkers are unified into a comprehensive content safety pipeline. Finally, audit logging and compliance tracking ensure the platform meets enterprise governance requirements.

---

### 14.1 Implement RBAC (Role-Based Access Control) from new-api

**Detailed Description:**

RBAC provides fine-grained authorization control for multi-user deployments. This subphase ports new-api's production-tested RBAC implementation, which uses Casbin (a powerful access control library) under the hood but adds an AI-specific permission model on top. The implementation includes: (1) **Role hierarchy** — roles (Admin, Manager, Developer, Viewer, Auditor) with inheritance (Manager inherits Developer permissions), (2) **Resource-based permissions** — permissions defined on specific resource types (providers, models, keys, users, teams, budgets, audit logs) with actions (create, read, update, delete, manage), (3) **Environment scoping** — permissions can be scoped to specific environments (development, staging, production), (4) **Policy evaluation** — Casbin-based policy evaluation with configurable policy storage (SQLite, PostgreSQL, Redis), (5) **Policy management API** — REST API for managing roles, permissions, and assignments, (6) **Request-time authorization** — middleware that checks permissions on every API request with cached policy evaluation for <5ms overhead.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| new-api | `new-api/model/rbac.go` | `packages/gateway/src/auth/rbac/` | Full Go-to-TypeScript port of the RBAC data model. Adapt to the unified gateway resource types. Integrate with Casbin.js instead of Casbin Go. |
| new-api | `new-api/controller/auth.go` | `packages/gateway/src/auth/rbac/` | Port the authorization middleware. Adapt from Go's net/http to Express/Fastify middleware pattern. |
| new-api | `new-api/service/auth_service.go` | `packages/gateway/src/auth/rbac/` | Port the policy management service. Replace new-api's channel-based resources with unified gateway resources. |
| new-api | `new-api/middleware/auth.go` | `packages/gateway/src/auth/rbac/` | Port the request-time authorization checker. Integrate with the gateway's middleware/hook system. |

**Key Files to Create/Modify:**

```
packages/gateway/src/auth/rbac/
  ├── rbac-models.ts                 # RBAC data models (create)
  ├── role-definitions.ts            # Predefined role definitions (create)
  ├── permission-definitions.ts      # Resource & action permission definitions (create)
  ├── policy-engine.ts               # Casbin-based policy evaluation (create)
  ├── policy-store.ts                # Policy storage adapter (create)
  ├── authz-middleware.ts            # Request-time authorization middleware (create)
  ├── policy-api.ts                  # Policy management REST API (create)
  ├── role-assignment.ts             # User ↔ Role assignment management (create)
  └── index.ts                       # RBAC public API (create)
```

**Acceptance Criteria:**

- [ ] Role hierarchy works with inheritance — users in a Manager role inherit Developer permissions
- [ ] Resource-based permissions cover all gateway resources: providers, models, keys, users, teams, budgets, audit logs
- [ ] Environment scoping correctly isolates permissions per environment
- [ ] Policy evaluation completes in <5ms (p99) for cached policies
- [ ] Policy management API supports CRUD operations for roles, permissions, and assignments
- [ ] Authorization middleware correctly blocks unauthorized requests and allows authorized ones
- [ ] Integration tests verify: role inheritance, permission combinations, resource scoping, environment isolation
- [ ] Casbin policy storage supports SQLite, PostgreSQL, and Redis backends
- [ ] Audit logging records all authorization decisions (allow/deny, user, resource, action, timestamp)
- [ ] RBAC integrates with the API key system (Phase 13.5) — API keys can be assigned roles

**Risk Level:** Medium

> *RBAC is complex to get right and misconfigurations can lead to security gaps. Mitigations include: (1) using Casbin — a battle-tested authorization library — rather than building from scratch, (2) comprehensive policy test suite that verifies every permission combination, (3) a "deny by default" policy model where access must be explicitly granted.*

---

### 14.2 Implement Multi-Tenant Isolation (from new-api)

**Detailed Description:**

Multi-tenancy enables a single gateway instance to serve multiple organizations, teams, or projects with complete data and resource isolation. This subphase ports new-api's multi-tenant architecture which has been tested with thousands of tenants in production. The architecture provides: (1) **Organization → Team → User → Project hierarchy** — a flexible hierarchy where each level can have its own administrators, configurations, keys, and budgets, (2) **Complete data isolation** — tenant data is isolated at the database level (either via separate schemas/ tables with tenant_id columns, or via separate databases), with all queries automatically scoped to the current tenant, (3) **Resource quotas per tenant** — per-tenant limits on: number of keys, number of users, total monthly budget, rate limits, concurrent requests, (4) **Tenant-level configuration** — each tenant can have its own: provider configurations, routing rules, guardrail policies, caching strategies, rate limit profiles, (5) **Cross-tenant admin** — super-admin users who can manage all tenants with full visibility, (6) **Tenant onboarding/offboarding** — automated tenant provisioning with default configurations and secure tenant deletion with data purging.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| new-api | `new-api/model/tenant.go` | `packages/gateway/src/auth/tenant/` | Full Go-to-TypeScript port of the tenant data model. Adapt the hierarchy to support flexible depth (not fixed 3-level). |
| new-api | `new-api/controller/tenant.go` | `packages/gateway/src/auth/tenant/` | Port the tenant CRUD operations. Adapt the database layer to the gateway's Prisma/SQLite. |
| new-api | `new-api/service/tenant_isolation.go` | `packages/gateway/src/auth/tenant/` | Port the data isolation layer. Implement the query-scoping middleware that automatically adds tenant_id filters. |
| new-api | `new-api/middleware/tenant.go` | `packages/gateway/src/auth/tenant/` | Port the tenant resolution middleware (extracts tenant from auth context). Adapt to Express/Fastify middleware pattern. |
| new-api | `new-api/service/tenant_provisioning.go` | `packages/gateway/src/auth/tenant/` | Port the automated tenant provisioning logic. Add the gateway-specific configuration defaults. |

**Key Files to Create/Modify:**

```
packages/gateway/src/auth/tenant/
  ├── tenant-models.ts               # Tenant data models (Organization, Team, Project) (create)
  ├── tenant-resolver.ts             # Extracts tenant from request context (create)
  ├── tenant-store.ts                # Tenant CRUD operations (create)
  ├── tenant-isolation.ts            # Query-scoping middleware (create)
  ├── tenant-config.ts               # Per-tenant configuration management (create)
  ├── tenant-quotas.ts               # Per-tenant resource quotas (create)
  ├── tenant-provisioning.ts         # Automated tenant onboarding/offboarding (create)
  ├── tenant-admin.ts                # Cross-tenant admin functionality (create)
  └── index.ts                       # Tenant public API (create)
```

**Acceptance Criteria:**

- [ ] Multi-tenant hierarchy supports Organization → Team → User → Project (flexible depth)
- [ ] Data isolation is enforced at the database level — cross-tenant data access is impossible even with direct DB queries
- [ ] Query-scoping middleware automatically adds tenant context to all database queries
- [ ] Per-tenant quotas correctly enforce limits on keys, users, budget, rate limits, concurrent requests
- [ ] Each tenant can independently configure providers, routing, guardrails, caching, rate limits
- [ ] Super-admin users can manage all tenants with full visibility
- [ ] Tenant onboarding creates a new tenant with sensible defaults in <1 second
- [ ] Tenant offboarding securely deletes all tenant data within configurable retention period
- [ ] Integration tests verify: tenant isolation (Tenant A cannot access Tenant B data), quota enforcement, config independence
- [ ] Multi-tenant mode is optional — single-tenant deployments have zero overhead from tenant isolation code

**Risk Level:** High

> *Multi-tenancy is one of the most architecturally significant features — getting it wrong can lead to catastrophic data leaks. Mitigations include: (1) defense-in-depth isolation (database-level + application-level + API-level), (2) comprehensive security testing with automated cross-tenant data access attempts, (3) optional feature — single-tenant deployments don't need it, (4) database-level tenant isolation using PostgreSQL row-level security (RLS) as the last line of defense.*

---

### 14.3 Implement SSO/SAML Integration

**Detailed Description:**

SSO (Single Sign-On) integration enables enterprises to use their existing identity providers (IdP) for gateway authentication, eliminating the need for separate credentials. This subphase implements: (1) **OIDC (OpenID Connect)** — support for modern OIDC providers including Okta, Azure AD, Google Workspace, Auth0, Keycloak, and any OIDC-compliant provider, with automatic discovery via `.well-known/openid-configuration`, (2) **SAML 2.0** — support for SAML-based IdPs including Okta, Azure AD, ADFS, OneLogin, Ping Identity, with metadata exchange (IdP metadata import and SP metadata export), (3) **Just-In-Time (JIT) provisioning** — when a user authenticates via SSO for the first time, their account is automatically created with default roles and permissions based on SAML/OIDC attributes, (4) **SCIM (System for Cross-domain Identity Management)** — automatic user provisioning and deprovisioning from the IdP, supporting: user creation, attribute updates, suspension, and deletion, (5) **IdP-initiated vs SP-initiated flows** — support for both flow types, with IdP-initiated SSO for enterprise portal integration.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| new-api | `new-api/controller/sso.go` | `packages/gateway/src/auth/sso/` | Full Go-to-TypeScript port of the SSO controller. Adapt the OIDC/SAML library integration from Go's libraries to Node.js (openid-client, samlify). |
| new-api | `new-api/service/saml_service.go` | `packages/gateway/src/auth/sso/` | Port the SAML service implementation. Replace Go's crewjam/saml with Node.js samlify library. |
| new-api | `new-api/service/oidc_service.go` | `packages/gateway/src/auth/sso/` | Port the OIDC service implementation. Replace Go's coreos/go-oidc with Node.js openid-client. |
| new-api | `new-api/service/scim_service.go` | `packages/gateway/src/auth/sso/` | Port the SCIM provisioning service. Adapt to the gateway's user management system. |
| Goose | `goose/crates/goose/src/auth/sso.rs` | `packages/gateway/src/auth/sso/` | Reference Goose's SSO integration patterns for CLI-based SSO flows. |

**Key Files to Create/Modify:**

```
packages/gateway/src/auth/sso/
  ├── sso-manager.ts                 # SSO orchestrator (create)
  ├── oidc/
  │   ├── oidc-client.ts             # OIDC client implementation (create)
  │   ├── oidc-discovery.ts          # OIDC discovery endpoint handling (create)
  │   ├── oidc-callback.ts           # OIDC callback handler (create)
  │   └── index.ts                   # OIDC exports (create)
  ├── saml/
  │   ├── saml-service.ts            # SAML 2.0 service provider (create)
  │   ├── saml-metadata.ts           # SAML metadata exchange (create)
  │   ├── saml-assertion.ts          # SAML assertion processing (create)
  │   └── index.ts                   # SAML exports (create)
  ├── scim/
  │   ├── scim-service.ts            # SCIM provisioning service (create)
  │   ├── scim-user-mapping.ts       # IdP → Gateway user attribute mapping (create)
  │   └── index.ts                   # SCIM exports (create)
  ├── jit-provisioning.ts            # Just-In-Time user provisioning (create)
  └── index.ts                       # SSO public API (create)
```

**Acceptance Criteria:**

- [ ] OIDC works with Okta, Azure AD, Google Workspace, Auth0, and any OIDC-compliant provider
- [ ] SAML 2.0 works with Okta, Azure AD, ADFS, OneLogin, and any SAML 2.0-compliant IdP
- [ ] Automatic OIDC discovery works — only `issuer` and `client_id`/`client_secret` are required for configuration
- [ ] SAML metadata exchange works — SP metadata is importable by IdP and vice versa
- [ ] JIT provisioning creates users with correct roles based on SAML/OIDC attributes
- [ ] SCIM provisioning creates, updates, suspends, and deletes users based on IdP events
- [ ] Both IdP-initiated and SP-initiated SSO flows work correctly
- [ ] SSO session lifetime is configurable and separate from the IdP session lifetime
- [ ] Integration tests verify: full SSO flow (SP-initiated and IdP-initiated), JIT provisioning, SCIM sync
- [ ] SSO integrates with the RBAC system (Phase 14.1) — SSO users are assigned roles from IdP attributes

**Risk Level:** High

> *SSO/SAML integration involves security-critical cryptographic operations (signature verification, certificate management) and complex protocols with many edge cases. Different IdPs have different quirks and interpretations of the specifications. Mitigations include: (1) using well-established Node.js libraries (openid-client, samlify) rather than implementing protocols from scratch, (2) comprehensive integration test matrix covering major IdPs, (3) detailed documentation for IdP configuration, (4) optional feature — enterprises that need it can enable it, others can ignore it.*

---

### 14.4 Implement Content Safety and Guardrails (from litellm guardrails + Portkey guardrails + gemini-cli safety)

**Detailed Description:**

The content safety and guardrails system is one of the most critical features for production AI deployments — it prevents the gateway from processing or returning harmful, unsafe, or policy-violating content. This subphase merges three production guardrail systems into a single, unified guardrail pipeline: (1) **litellm's guardrails** — production-tested guardrails including: PII detection (via Presidio), prompt injection detection (custom ML model), content moderation (OpenAI Moderation API), custom regex rules, and code execution detection, (2) **Portkey's guardrail plugins** — pluggable guardrail middleware including: Patronus AI (hallucination detection, PII), Qualifire (tool call quality, prompt quality), Lakera Guard (prompt injection), Pangea (PII, secrets), Azure AI Content Safety, (3) **gemini-cli's safety checkers** — safety category detection (harassment, hate speech, sexually explicit, dangerous content) with configurable thresholds per category. The unified system provides: a common guardrail interface, configurable pipeline, per-provider policies, real-time and post-hoc checking modes, and comprehensive telemetry.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| litellm | `litellm/litellm/guardrails/` | `packages/security/guardrails/` | Port the guardrail implementations from Python to TypeScript. Replace litellm-specific config with unified gateway config. Create the guardrail pipeline orchestrator. |
| litellm | `litellm/litellm/proxy/guardrails/` | `packages/security/guardrails/` | Port the proxy-level guardrail middleware. Adapt from Python async middleware to TypeScript hook-based middleware. |
| Portkey | `portkey/src/middlewares/guardrails/` | `packages/security/guardrails/` | Port Portkey's guardrail plugin architecture. Adapt the plugin interface to work with the unified gateway plugin system. |
| Portkey | `portkey/plugins/guardrails/` | `packages/security/guardrails/plugins/` | Port each individual guardrail plugin (Patronus, Qualifire, Lakera, Pangea, Azure). Each becomes a standalone plugin. |
| gemini-cli | `gemini-cli/docs/reference/core/safety-checkers.md` | `packages/security/guardrails/safety/` | Port gemini-cli's safety category system. Implement the configurable threshold and category-based checking. |

**Key Files to Create/Modify:**

```
packages/security/guardrails/
  ├── guardrail-interface.ts         # Unified guardrail interface (create)
  ├── guardrail-pipeline.ts          # Guardrail pipeline orchestrator (create)
  ├── guardrail-registry.ts          # Guardrail plugin registry (create)
  ├── guardrail-config.ts            # Per-provider, per-route guardrail policies (create)
  ├── builtins/
  │   ├── pii-detector.ts            # PII detection (Presidio-based) (create)
  │   ├── prompt-injection.ts        # Prompt injection detection (create)
  │   ├── content-moderation.ts      # Content moderation (OpenAI Moderation) (create)
  │   ├── custom-regex.ts            # Custom regex rules (create)
  │   ├── code-execution.ts          # Code execution detection (create)
  │   └── jailbreak-detection.ts     # Jailbreak attempt detection (create)
  ├── plugins/
  │   ├── patronus.ts                # Patronus AI integration (create)
  │   ├── qualifire.ts               # Qualifire integration (create)
  │   ├── lakera.ts                  # Lakera Guard integration (create)
  │   ├── pangea.ts                  # Pangea integration (create)
  │   └── azure-content-safety.ts    # Azure AI Content Safety (create)
  ├── safety/
  │   ├── safety-categories.ts       # Safety category definitions (create)
  │   ├── safety-checker.ts          # Category-based safety checking (create)
  │   ├── threshold-config.ts        # Configurable thresholds per category (create)
  │   └── gemini-safety.ts           # gemini-cli compatibility layer (create)
  ├── modes/
  │   ├── realtime-guardrail.ts      # Real-time (streaming) guardrails (create)
  │   ├── post-hoc-guardrail.ts      # Post-hoc (after completion) guardrails (create)
  │   └── shadow-mode.ts            # Shadow mode (log only, no blocking) (create)
  └── index.ts                       # Guardrails public API (create)
```

**Acceptance Criteria:**

- [ ] All guardrails from litellm, Portkey, and gemini-cli are ported and functional through the unified interface
- [ ] Guardrail pipeline supports configurable ordering — guards can be added, removed, or reordered at runtime
- [ ] Real-time mode adds <50ms latency per guardrail check (p99) on streaming chunks
- [ ] Post-hoc mode completes within 100ms of response completion (p99)
- [ ] Shadow mode records guardrail violations without blocking — useful for policy tuning
- [ ] PII detection correctly identifies: email, phone, SSN, credit card, API key, IP address (configurable entity list)
- [ ] Prompt injection detection catches known injection patterns with >95% accuracy
- [ ] Content moderation correctly blocks harmful content based on configurable thresholds
- [ ] Guardrail policies are configurable per-provider and per-route via YAML config
- [ ] Guardrail violations are logged with: which guard triggered, input snippet, confidence score, action taken (block/modify/flag)

**Risk Level:** Medium

> *Guardrails involve third-party API calls (to Lakera, Azure, Patronus, etc.) which introduces latency and dependency risks. False positives can block legitimate traffic, and false negatives can let harmful content through. Mitigations include: (1) shadow mode for initial deployment to tune thresholds, (2) per-guardrail timeout with automatic bypass on timeout, (3) guardrail result caching to reduce latency for repeated patterns, (4) A/B testing framework for comparing guardrail configurations.*

---

### 14.5 Implement Audit Logging and Compliance Tracking

**Detailed Description:**

Audit logging provides a tamper-evident record of all security-relevant events in the gateway, essential for SOC 2, ISO 27001, HIPAA, and GDPR compliance. This subphase implements: (1) **Comprehensive event coverage** — logging of: authentication events (login, logout, failed login, token refresh), authorization events (access granted, access denied, permission change), configuration changes (provider config change, routing rule change, guardrail policy change), data access events (API key created/rotated/deleted, user data exported), billing events (usage report generated, invoice created), (2) **Tamper-evident log format** — structured logs with digital chaining (each log entry includes a hash of the previous entry) enabling detection of log tampering, (3) **Immutable storage** — append-only log storage using: SQLite with append-only triggers, Redis streams, or cloud storage (S3, GCS, Azure Blob) with Write-Once-Read-Many (WORM) policies, (4) **Log export** — support for exporting logs to SIEM systems (Splunk, Datadog, Elastic, Grafana Loki) via structured streaming (JSON, CEF, LEEF formats), (5) **Retention policies** — configurable retention per event type (e.g., auth events retained 1 year, billing events retained 7 years), with automatic archival and deletion, (6) **Compliance reporting** — built-in reports for common compliance frameworks: SOC 2 (access review, change management), HIPAA (access log, disclosure log), GDPR (data processing record, deletion request log).

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| new-api | `new-api/service/audit_service.go` | `packages/gateway/src/auth/audit/` | Full Go-to-TypeScript port of the audit service. Adapt the event taxonomy to cover all gateway resource types. |
| new-api | `new-api/model/audit.go` | `packages/gateway/src/auth/audit/` | Port the audit event data model. Add the tamper-evident chaining fields. |
| Goose | `goose/crates/goose/src/telemetry/audit.rs` | `packages/gateway/src/auth/audit/` | Reference Goose's audit logging patterns for CLI-specific audit events. |
| Agentic OS V3 | `server/tests/audit.test.ts` | `packages/gateway/src/auth/audit/` | Reference the existing V3 audit test patterns. Expand with additional compliance test cases. |
| litellm | `litellm/litellm/proxy/audit_logging.py` | `packages/gateway/src/auth/audit/` | Port litellm's audit logging middleware for proxy-specific events. |

**Key Files to Create/Modify:**

```
packages/gateway/src/auth/audit/
  ├── audit-event-types.ts           # Audit event taxonomy & type definitions (create)
  ├── audit-logger.ts                # Core audit logging engine (create)
  ├── tamper-evident.ts              # Digital chaining for tamper detection (create)
  ├── storage/
  │   ├── sqlite-audit-store.ts      # Append-only SQLite storage (create)
  │   ├── redis-audit-store.ts       # Redis stream storage (create)
  │   ├── s3-audit-store.ts          # S3/GCS/Azure Blob WORM storage (create)
  │   └── index.ts                   # Storage exports (create)
  ├── exporters/
  │   ├── splunk-exporter.ts         # Splunk HEC exporter (create)
  │   ├── elastic-exporter.ts        # Elasticsearch exporter (create)
  │   ├── datadog-exporter.ts        # Datadog logs exporter (create)
  │   ├── loki-exporter.ts           # Grafana Loki exporter (create)
  │   └── index.ts                   # Exporter exports (create)
  ├── retention.ts                   # Configurable retention policies (create)
  ├── compliance-reports.ts          # Compliance report generators (create)
  ├── audit-middleware.ts            # Automatic audit logging middleware (create)
  └── index.ts                       # Audit public API (create)
```

**Acceptance Criteria:**

- [ ] All security-relevant events are logged with: timestamp, user identity, event type, resource, action, result (success/failure), request metadata (IP, user agent)
- [ ] Tamper-evident chaining is verified — a tool to detect log tampering is provided
- [ ] Append-only storage prevents log modification (verified: direct database modification attempts fail or are detected)
- [ ] Log export to SIEM works for Splunk, Elasticsearch, Datadog, and Grafana Loki
- [ ] Retention policies are configurable per event type with automatic archival and deletion
- [ ] Compliance reports are auto-generated for SOC 2, HIPAA, and GDPR
- [ ] Audit middleware automatically logs configurable event categories without manual instrumentation
- [ ] Logs include correlation IDs linking related events (e.g., request → auth → routing → billing)
- [ ] Integration tests verify: event logging, tamper detection, retention enforcement, SIEM export
- [ ] Audit system performance adds <2ms per logged event (p99) for local storage, <20ms for cloud storage

**Risk Level:** Low

> *Audit logging is a well-understood problem with established patterns. The main risk is performance overhead from synchronous logging on the request path, mitigated by asynchronous log submission (fire-and-forget with a buffer queue) and the option to use low-latency local storage (SQLite) with async batch export to SIEM.*

---

## Phase 15: Billing, Quotas & Rate Limiting (Weeks 31-34)

### Overview

Phase 15 implements the complete billing, quota management, and rate limiting infrastructure by merging new-api's production billing system (used for multi-tenant AI gateway monetization) with litellm's budget management system. The unified system provides: channel management for organizing provider capacity into logical groups, usage tracking and quota enforcement with real-time aggregation, multi-dimensional rate limiting (token-based, request-based, and user-based), billing integration with major payment processors (Stripe, Creem, Epay, Waffo from new-api), and a comprehensive cost analytics dashboard. Together, these enable the gateway to be deployed as a monetized service with usage-based billing.

---

### 15.1 Implement Channel Management (from new-api)

**Detailed Description:**

Channel management is new-api's system for organizing provider capacity into logical groups that can be assigned to different users, teams, or applications. A channel represents a configured provider+model combination with specific rate limits, pricing, and availability. This subphase ports new-api's channel management system, which includes: (1) **Channel definition** — a channel is a named configuration that specifies: provider (e.g., OpenAI), models (e.g., gpt-4o, gpt-4o-mini), rate limits (RPM, TPM, concurrent requests), pricing (optional override of default provider pricing), weight (for load balancing across channels with the same provider+model), priority (for fallback ordering), status (active, paused, maintenance, disabled), (2) **Channel groups** — logical grouping of channels for assignment purposes (e.g., "enterprise-tier", "standard-tier", "development-tier"), (3) **Channel assignment** — channels can be assigned to: specific users, specific teams, specific API keys, or specific IP ranges, (4) **Channel health** — automatic health checking for each channel (sending test requests at configurable intervals) with automatic suspension of unhealthy channels, (5) **Channel weight & priority** — weighted load balancing across channels with the same provider+model, priority-based fallback when channels are unavailable.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| new-api | `new-api/model/channel.go` | `packages/gateway/src/billing/channels/` | Full Go-to-TypeScript port of the channel data model. Adapt to reference the unified provider registry instead of new-api's channel-specific provider configs. |
| new-api | `new-api/controller/channel.go` | `packages/gateway/src/billing/channels/` | Port the channel CRUD operations. Adapt the REST API patterns to Express/Fastify. |
| new-api | `new-api/service/channel_service.go` | `packages/gateway/src/billing/channels/` | Port the channel business logic (weight calculation, health checking, priority sorting). Replace new-api's Go-specific patterns with TypeScript equivalents. |
| new-api | `new-api/service/channel_health.go` | `packages/gateway/src/billing/channels/` | Port the health check implementation. Adapt to use the gateway's provider health check system. |
| litellm | `litellm/litellm/proxy/deployment_orchestration.py` | `packages/gateway/src/billing/channels/` | Reference litellm's deployment orchestration for model-to-deployment mapping patterns. |

**Key Files to Create/Modify:**

```
packages/gateway/src/billing/channels/
  ├── channel-types.ts               # Channel data model types (create)
  ├── channel-store.ts               # Channel CRUD operations (create)
  ├── channel-manager.ts             # Channel lifecycle management (create)
  ├── channel-groups.ts              # Channel group management (create)
  ├── channel-assignment.ts          # Channel→User/Team/Key assignment (create)
  ├── channel-health.ts              # Channel health checking (create)
  ├── channel-router.ts              # Channel selection & load balancing (create)
  ├── channel-middleware.ts          # Request-time channel resolution (create)
  └── index.ts                       # Channel public API (create)
```

**Acceptance Criteria:**

- [ ] Channel definitions support: provider, models, rate limits, pricing, weight, priority, status
- [ ] Channel groups enable logical grouping (e.g., "enterprise-tier" with multiple channels)
- [ ] Channel assignment works at user, team, API key, and IP range levels
- [ ] Channel health checking with configurable intervals — unhealthy channels are auto-suspended
- [ ] Weighted load balancing distributes traffic across channels according to configured weights
- [ ] Priority-based fallback correctly routes to the next available channel when primary is unavailable
- [ ] Channel management is fully accessible via REST API and dashboard UI
- [ ] Channel changes (add, remove, update, suspend) take effect within 5 seconds without gateway restart
- [ ] Integration tests verify: channel routing, weight distribution, priority fallback, health suspension
- [ ] Channel metrics are exposed (requests routed per channel, health status, error rate per channel)

**Risk Level:** Low

> *Channel management is primarily a data management feature with clear interfaces. The main risk is performance overhead from channel resolution on the request path, mitigated by caching channel assignments in Redis with instant invalidation on changes.*

---

### 15.2 Implement Usage Tracking and Quotas (from new-api + litellm budgets)

**Detailed Description:**

Usage tracking and quota enforcement enables the gateway to measure, limit, and report on resource consumption at multiple levels. This subphase merges new-api's usage tracking (token counting, request counting, cost tracking per-user/per-key) with litellm's budget management system (daily/monthly budgets, per-model budgets, budget alerts, budget webhooks). The unified system provides: (1) **Real-time usage aggregation** — token usage (input, output, total), request count, cost, and custom metrics are aggregated in real-time using Redis counters with periodic persistence to SQLite/PostgreSQL, (2) **Multi-level quotas** — quotas can be set at: global, organization, team, user, API key, channel, model levels, with strict hierarchy (organization quota > team quota > user quota), (3) **Quota dimensions** — quotas can be enforced on: total tokens, input tokens, output tokens, total requests, requests per model, total cost, cost per model, concurrent requests, (4) **Budget management** — budgets are time-bound quotas (daily, weekly, monthly, custom period) with: hard cap (block when exceeded), soft cap (warn when exceeded), rollover (unused budget rolls to next period), (5) **Usage alerts & webhooks** — configurable alerts at percentage thresholds (50%, 75%, 90%, 100%) that trigger webhooks, Slack notifications, email notifications.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| new-api | `new-api/model/usage.go` | `packages/gateway/src/billing/usage/` | Full Go-to-TypeScript port of the usage data models. Adapt to the unified token counting system. |
| new-api | `new-api/controller/usage.go` | `packages/gateway/src/billing/usage/` | Port the usage tracking REST API. Adapt the aggregation queries to the gateway's database layer. |
| new-api | `new-api/service/usage_service.go` | `packages/gateway/src/billing/usage/` | Port the usage aggregation logic. Implement real-time Redis counters with periodic SQLite persistence. |
| new-api | `new-api/service/quota_service.go` | `packages/gateway/src/billing/usage/` | Port the quota enforcement logic. Add the hierarchical quota checking. |
| litellm | `litellm/litellm/proxy/budget_limiter.py` | `packages/gateway/src/billing/usage/` | Full TypeScript port of litellm's budget management. Adapt to the multi-level quota system. |
| litellm | `litellm/litellm/proxy/budget_alerts.py` | `packages/gateway/src/billing/usage/` | Port the budget alert system. Add webhook, Slack, and email notification support. |

**Key Files to Create/Modify:**

```
packages/gateway/src/billing/usage/
  ├── usage-tracker.ts               # Real-time usage tracking engine (create)
  ├── usage-aggregator.ts            # Usage aggregation (Redis → SQLite/PostgreSQL) (create)
  ├── usage-store.ts                 # Usage data storage (create)
  ├── quota-engine.ts                # Multi-level quota enforcement (create)
  ├── quota-hierarchy.ts             # Hierarchical quota resolution (create)
  ├── budget-manager.ts              # Budget management (create)
  ├── budget-alerts.ts               # Budget alert triggers & notifications (create)
  ├── usage-middleware.ts            # Request-time usage tracking & quota check (create)
  └── index.ts                       # Usage public API (create)
```

**Acceptance Criteria:**

- [ ] Real-time usage tracking adds <2ms overhead per request (p99) for token counting + counter update
- [ ] Usage aggregation persists to database within 60 seconds of real-time counter updates
- [ ] Multi-level quotas (global → org → team → user → key → model) are all enforced correctly
- [ ] Quota dimensions cover: total tokens, input tokens, output tokens, requests, cost, concurrent requests
- [ ] Budget management supports: daily, weekly, monthly, and custom period budgets with hard/soft caps
- [ ] Budget rollover correctly carries unused budget to the next period (configurable rollover percentage)
- [ ] Usage alerts trigger at configured percentage thresholds via webhook, Slack, email
- [ ] Quota enforcement returns clear error messages indicating: which quota was exceeded, current usage, quota limit
- [ ] Integration tests verify: usage tracking accuracy, quota block at limit, budget alert trigger, rollover calculations
- [ ] Usage data is accessible via REST API with filtering by time range, level, dimension

**Risk Level:** Medium

> *Usage tracking is on the critical request path, so performance is critical. Real-time aggregation with Redis counters can lose data if Redis crashes before persistence. Mitigations include: (1) write-behind persistence with acknowledgment, (2) periodic reconciliation of Redis counters with database aggregates, (3) configurable aggregation window (trade-off between real-time accuracy and durability).*

---

### 15.3 Implement Rate Limiting (Token-Based, Request-Based, User-Based)

**Detailed Description:**

Rate limiting protects the gateway and backend providers from abuse, ensuring fair resource allocation across users and preventing cascading failures. This subphase implements a comprehensive multi-dimensional rate limiting system: (1) **Token-based rate limiting** — limits based on tokens per minute (TPM), distinguishing between input tokens and output tokens, with separate limits for each, (2) **Request-based rate limiting** — limits based on requests per minute (RPM), requests per second (RPS), and concurrent requests, (3) **User-based rate limiting** — limits applied per authenticated user, per API key, per IP address (for unauthenticated requests), and per organization, (4) **Provider-aware rate limiting** — respects provider-specific rate limits (e.g., OpenAI's RPM/TPM tiers) and automatically throttles to avoid 429 errors, (5) **Rate limiting algorithms** — support for: token bucket (bursty traffic), sliding window (smooth traffic), leaky bucket (strict pacing), and adaptive (ML-based dynamic limits), (6) **Rate limit headers** — standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on all responses, (7) **Distributed rate limiting** — Redis-backed counters for distributed deployments with atomic increment operations.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| new-api | `new-api/middleware/rate_limit.go` | `packages/gateway/src/billing/rate-limiting/` | Full Go-to-TypeScript port of the rate limiting middleware. Support multiple algorithms (not just new-api's token bucket). |
| new-api | `new-api/service/rate_limit_service.go` | `packages/gateway/src/billing/rate-limiting/` | Port the distributed rate limit service. Replace Go's Redis library with Node.js ioredis. |
| litellm | `litellm/litellm/proxy/rate_limit.py` | `packages/gateway/src/billing/rate-limiting/` | Port litellm's token-based rate limiter. Add the adaptive (ML-based) rate limiting algorithm. |
| 9Router | `9router/src/middleware/rate-limit.js` | `packages/gateway/src/billing/rate-limiting/` | Port 9Router's rate limiting middleware patterns. Merge the provider-aware throttling logic. |

**Key Files to Create/Modify:**

```
packages/gateway/src/billing/rate-limiting/
  ├── rate-limiter.ts                # Rate limiting orchestrator (create)
  ├── algorithms/
  │   ├── token-bucket.ts            # Token bucket algorithm (create)
  │   ├── sliding-window.ts          # Sliding window algorithm (create)
  │   ├── leaky-bucket.ts            # Leaky bucket algorithm (create)
  │   ├── adaptive.ts                # Adaptive (ML-based) algorithm (create)
  │   └── index.ts                   # Algorithm exports (create)
  ├── dimensions/
  │   ├── token-rate.ts              # Token-based rate limiting (create)
  │   ├── request-rate.ts            # Request-based rate limiting (create)
  │   ├── concurrent-rate.ts         # Concurrent request limiting (create)
  │   └── index.ts                   # Dimension exports (create)
  ├── scopes/
  │   ├── user-rate-limit.ts         # Per-user rate limiting (create)
  │   ├── key-rate-limit.ts          # Per-API-key rate limiting (create)
  │   ├── ip-rate-limit.ts           # Per-IP rate limiting (create)
  │   ├── org-rate-limit.ts          # Per-organization rate limiting (create)
  │   └── index.ts                   # Scope exports (create)
  ├── provider-aware.ts              # Provider-aware throttling (create)
  ├── distributed.ts                 # Redis-backed distributed rate limiting (create)
  ├── rate-limit-headers.ts          # Standard rate limit response headers (create)
  ├── rate-limit-middleware.ts       # Express/Fastify middleware (create)
  └── index.ts                       # Rate limiting public API (create)
```

**Acceptance Criteria:**

- [ ] All four rate limiting algorithms (token bucket, sliding window, leaky bucket, adaptive) are implemented and selectable
- [ ] Token-based limiting correctly counts input/output tokens separately
- [ ] Request-based limiting enforces RPM, RPS, and concurrent request limits
- [ ] User-based limiting applies limits at user, API key, IP, and organization levels
- [ ] Provider-aware throttling prevents 429 errors by automatically pacing requests to stay within provider limits
- [ ] Distributed rate limiting works across multiple gateway instances via Redis
- [ ] Rate limit headers are present on all responses with correct values
- [ ] Rate limit enforcement adds <2ms overhead per request (p99) for local mode, <5ms for distributed mode
- [ ] Rate limit state survives gateway restarts (persisted in Redis/RDB)
- [ ] Integration tests verify: rate limit enforcement at all scopes, algorithm correctness, distributed consistency, header accuracy

**Risk Level:** Medium

> *Rate limiting is a critical reliability feature — misconfiguration can lead to either allowing abuse (denial of wallet) or blocking legitimate traffic (denial of service). Mitigations include: (1) configurable rate limit enforcement modes (strict/warning/disabled), (2) automatic rate limit adjustment based on observed traffic patterns, (3) comprehensive monitoring dashboards for rate limit enforcement, (4) circuit breaker integration — if rate limit errors spike, automatically increase limits to investigate.*

---

### 15.4 Implement Billing Integration (from new-api payment integrations)

**Detailed Description:**

Billing integration enables the gateway to charge for usage, making it viable as a commercial product or internal chargeback system. This subphase ports new-api's production payment integration system which supports four payment processors: (1) **Stripe** — the primary payment processor with support for: subscription plans (metered billing), one-time purchases, usage-based billing (reported via Stripe Metered Billing), invoices, payment methods (cards, ACH, wire transfer), webhook handling for payment events, (2) **Creem** — alternative payment processor for specific regions with: one-time payments, subscription management, invoice generation, (3) **Epay** — payment processor for Asian markets with: local payment methods (Alipay, WeChat Pay, PayNow, GCash), multi-currency support, (4) **Waffo** — payment processor for specific enterprise integrations. The billing system also includes: invoice generation and management, payment tracking (paid, overdue, failed), dunning (automatic retry of failed payments with escalation), tax handling (VAT, GST, sales tax with automatic rate lookup), and billing portal (customer-facing portal for viewing invoices, updating payment methods, downloading receipts).

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| new-api | `new-api/controller/billing.go` | `packages/gateway/src/billing/payments/` | Full Go-to-TypeScript port of the payment controller. Replace Go's Stripe library with Stripe's Node.js library. |
| new-api | `new-api/service/stripe_service.go` | `packages/gateway/src/billing/payments/` | Port the Stripe integration. Adapt the webhook handling to Express request/response. |
| new-api | `new-api/service/creem_service.go` | `packages/gateway/src/billing/payments/` | Port the Creem payment integration. Implement the Creem Node.js API client. |
| new-api | `new-api/service/epay_service.go` | `packages/gateway/src/billing/payments/` | Port the Epay integration for Asian markets. Implement the Epay API client. |
| new-api | `new-api/service/waffo_service.go` | `packages/gateway/src/billing/payments/` | Port the Waffo enterprise payment integration. Implement the Waffo API client. |
| new-api | `new-api/service/invoice_service.go` | `packages/gateway/src/billing/payments/` | Port the invoice generation and management system. Adapt to the gateway's usage data. |

**Key Files to Create/Modify:**

```
packages/gateway/src/billing/payments/
  ├── payment-manager.ts             # Payment processor orchestrator (create)
  ├── processors/
  │   ├── stripe-processor.ts        # Stripe payment integration (create)
  │   ├── creem-processor.ts         # Creem payment integration (create)
  │   ├── epay-processor.ts          # Epay payment integration (create)
  │   ├── waffo-processor.ts         # Waffo payment integration (create)
  │   └── index.ts                   # Processor exports (create)
  ├── price-engine.ts                # Price calculation from usage (create)
  ├── invoice-generator.ts           # Invoice generation & PDF creation (create)
  ├── payment-tracking.ts            # Payment status tracking & dunning (create)
  ├── tax-handler.ts                 # VAT/GST/sales tax handling (create)
  ├── billing-portal.ts              # Customer-facing billing portal endpoints (create)
  ├── webhook-handler.ts             # Unified webhook handler for payment events (create)
  ├── subscription-manager.ts        # Subscription plan management (create)
  └── index.ts                       # Payments public API (create)
```

**Acceptance Criteria:**

- [ ] All four payment processors (Stripe, Creem, Epay, Waffo) are integrated and functional
- [ ] Stripe integration supports metered billing — usage is reported to Stripe in real-time
- [ ] Invoice generation creates PDF invoices with correct amounts, tax breakdown, and payment terms
- [ ] Payment tracking correctly identifies: paid, overdue, failed, refunded, disputed statuses
- [ ] Dunning automatically retries failed payments with configurable schedule (3 retries, escalating intervals)
- [ ] Tax handling correctly calculates VAT, GST, and sales tax based on customer location
- [ ] Billing portal provides: invoice history, payment method management, receipt download, plan change
- [ ] Webhook handler processes all payment events (payment success, failure, refund, dispute) correctly
- [ ] Subscription management supports: create, upgrade, downgrade, cancel, pause, resume
- [ ] Integration tests verify: full payment flow (create subscription → usage → invoice → payment), webhook processing, dunning cycle

**Risk Level:** High

> *Billing integration involves real money — errors in pricing calculation, payment processing, or tax handling have direct financial impact. Each payment processor has different APIs, webhook formats, and edge cases. Mitigations include: (1) comprehensive test suite with test mode for each processor, (2) automated reconciliation between gateway usage records and processor invoices, (3) manual approval workflow for invoices above configurable thresholds, (4) circuit breaker for each processor — if processor API is down, queue billing events for later processing.*

---

### 15.5 Implement Cost Analytics and Reporting Dashboard

**Detailed Description:**

The cost analytics and reporting dashboard provides visibility into spending patterns, enabling users and administrators to understand, optimize, and control their AI infrastructure costs. This subphase implements: (1) **Real-time cost dashboard** — live cost tracking with sub-second updates showing: current spend rate (per minute, per hour, per day), spend by model, spend by provider, spend by team/user, spend by channel, (2) **Historical cost analysis** — configurable date range analysis with: cost trends, growth rates, anomaly detection (unusual spending patterns flagged automatically), (3) **Cost breakdowns** — multi-dimensional breakdowns: by model (which models cost the most), by provider (which providers are cheapest/most expensive), by user (who's spending the most), by time of day (when is usage cheapest), by endpoint (which API endpoints cost the most), (4) **Cost optimization recommendations** — automated recommendations based on usage patterns: "Switch to gpt-4o-mini for this use case (saves 40%)", "Use batch API for non-urgent requests (saves 50%)", "Cache responses for this prompt pattern (saves 30%)", "Switch provider for this model (saves 25%)", (5) **Report scheduling** — scheduled reports delivered via email/Slack/webhook with: daily summary, weekly deep-dive, monthly executive summary, (6) **Budget forecasting** — ML-based cost forecasting that predicts: when current budget will be exhausted, projected end-of-period costs, recommended budget adjustments.

**Copy-Paste Source Project + Surgical Edit Approach:**

| Source Project | Files to Copy | Target Path | Surgical Edits Required |
|---------------|--------------|-------------|------------------------|
| new-api | `new-api/controller/analytics.go` | `packages/gateway/src/billing/analytics/` | Full Go-to-TypeScript port of the analytics controller. Adapt the query patterns for the gateway's database schema. |
| new-api | `new-api/service/analytics_service.go` | `packages/gateway/src/billing/analytics/` | Port the analytics data aggregation logic. Implement the multi-dimensional breakdown queries. |
| litellm | `litellm/litellm/proxy/cost_tracker.py` | `packages/gateway/src/billing/analytics/` | Port litellm's cost tracking and alerting. Add the optimization recommendations engine. |
| litellm | `litellm/litellm/proxy/ spending_logs.py` | `packages/gateway/src/billing/analytics/` | Port litellm's spending log analysis patterns. Adapt to the unified usage data model. |
| 9Router | `9router/src/analytics/cost-metrics.js` | `packages/gateway/src/billing/analytics/` | Port 9Router's cost metrics visualization patterns. Adapt the dashboard API endpoints. |
| Agentic OS V3 | `server/tests/metrics.test.ts` | `packages/gateway/src/billing/analytics/` | Reference the existing metrics patterns. Expand with cost-specific metric collection. |

**Key Files to Create/Modify:**

```
packages/gateway/src/billing/analytics/
  ├── cost-dashboard.ts              # Real-time cost dashboard backend (create)
  ├── cost-aggregator.ts             # Cost data aggregation & rollups (create)
  ├── breakdowns/
  │   ├── by-model.ts                # Cost breakdown by model (create)
  │   ├── by-provider.ts             # Cost breakdown by provider (create)
  │   ├── by-user.ts                 # Cost breakdown by user (create)
  │   ├── by-time.ts                 # Cost breakdown by time period (create)
  │   ├── by-endpoint.ts             # Cost breakdown by endpoint (create)
  │   └── index.ts                   # Breakdown exports (create)
  ├── cost-optimization.ts           # Cost optimization recommendations engine (create)
  ├── anomaly-detection.ts           # Cost anomaly detection (create)
  ├── budget-forecasting.ts          # ML-based budget forecasting (create)
  ├── report-scheduler.ts            # Scheduled report generation & delivery (create)
  ├── report-templates.ts            # Report templates (daily, weekly, monthly) (create)
  ├── dashboard-api.ts               # Dashboard REST API endpoints (create)
  └── index.ts                       # Analytics public API (create)
```

**Acceptance Criteria:**

- [ ] Real-time cost dashboard displays current spend rate with <1 second refresh latency
- [ ] Historical cost analysis covers configurable date ranges with trend visualization data
- [ ] Multi-dimensional cost breakdowns render in <3 seconds for 30-day ranges with 1M+ records
- [ ] Cost optimization recommendations are accurate and actionable (verified: recommendations would save minimum 10% based on historical data)
- [ ] Anomaly detection catches cost spikes (configurable: 2x normal variance) within 5 minutes
- [ ] Budget forecasting predicts end-of-period costs with <10% error (measured against 30+ days of historical data)
- [ ] Scheduled reports are delivered correctly via email, Slack, and webhook
- [ ] Dashboard API supports pagination, filtering, and export (CSV, JSON, PDF)
- [ ] Integration tests verify: cost aggregation accuracy, breakdown correctness, recommendation validity, forecast accuracy
- [ ] Cost analytics performance: aggregate queries on 10M+ records complete in <5 seconds

**Risk Level:** Low

> *Cost analytics is a read-only feature that operates on already-collected data — it cannot cause data loss or service disruption. The main risk is performance of analytical queries on large datasets, mitigated by: (1) pre-aggregated rollups at hour/day/month granularity, (2) time-bucketed data for efficient range queries, (3) optional ClickHouse or DuckDB integration for high-volume deployments, (4) query timeout with fallback to cached results.*

---

## Appendix: Cross-Phase Dependency Map

```
Phase 11 (Caching) ──────────────────────────────────┐
  ├── 11.1 (Multi-Tier) ── depends on: Infrastructure (Redis, SQLite)      │
  ├── 11.2 (Semantic) ──── depends on: 11.1, Provider Registry (embeddings)│
  ├── 11.3 (Strategies) ── depends on: 11.1, Plugin System (Phase 10)     │
  ├── 11.4 (Compression) ─ depends on: Streaming Engine (Phase 12)        │
  └── 11.5 (Warming) ───── depends on: 11.1, 11.2, 11.3                    │
                                                                            │
Phase 12 (Streaming) ──────────────────────────────────┤
  ├── 12.1 (Interface) ─── depends on: Phase 3 (Streaming in existing)    │
  ├── 12.2 (SSE) ───────── depends on: 12.1, Translator (Phase 2)          │
  ├── 12.3 (WebSocket) ─── depends on: 12.1                                 │
  ├── 12.4 (TCP/gRPC) ──── depends on: 12.1                                 │
  └── 12.5 (Transforms) ── depends on: 12.1, Guardrails (Phase 14.4)       │
                                                                            │
Phase 13 (Auth Core) ───────────────────────────────────┤
  ├── 13.1 (Interface) ─── depends on: Vault System                         │
  ├── 13.2 (OAuth) ─────── depends on: 13.1                                 │
  ├── 13.3 (Consent) ───── depends on: 13.2                                 │
  ├── 13.4 (Device Flow) ─ depends on: 13.1, 13.2                           │
  └── 13.5 (API Keys) ──── depends on: 13.1, RBAC (Phase 14.1)             │
                                                                            │
Phase 14 (Auth Advanced) ───────────────────────────────┤
  ├── 14.1 (RBAC) ──────── depends on: 13.1                                 │
  ├── 14.2 (Multi-Tenant) ─ depends on: 13.1, 14.1                          │
  ├── 14.3 (SSO/SAML) ──── depends on: 13.1, 14.1                           │
  ├── 14.4 (Guardrails) ── depends on: 12.5, Plugin System (Phase 10)      │
  └── 14.5 (Audit) ─────── depends on: 13.1, 14.1, 14.2                     │
                                                                            │
Phase 15 (Billing) ─────────────────────────────────────┤
  ├── 15.1 (Channels) ──── depends on: Provider Registry (Phase 1)          │
  ├── 15.2 (Usage/Quotas) ─ depends on: 15.1, Token Counting (12.5)         │
  ├── 15.3 (Rate Limiting) ─ depends on: 15.2, Distributed Redis             │
  ├── 15.4 (Payments) ──── depends on: 15.2                                  │
  └── 15.5 (Analytics) ─── depends on: 15.2, 15.4                           │
```

---

## Key Integration Risks & Mitigations (Phases 11-15)

| Risk | Phase | Probability | Impact | Mitigation |
|------|-------|-------------|--------|------------|
| Semantic cache returns stale/inappropriate responses | 11.2 | Medium | High | Re-validate cache hits against guardrails; shadow mode for new thresholds |
| Streaming transformation pipeline adds unacceptable latency | 12.5 | Medium | High | Per-transform latency budgets; optional transforms for performance-critical routes |
| OAuth provider API changes break authentication | 13.2 | Medium | High | Integration tests run against provider sandboxes; automated alerting on failures |
| RBAC misconfiguration exposes unauthorized resources | 14.1 | Low | Critical | Deny-by-default policy model; comprehensive permission test suite; automated security audit |
| Multi-tenant data isolation failure | 14.2 | Low | Critical | Defense-in-depth (DB RLS + app-level isolation); penetration testing; automated cross-tenant access detection |
| SSO/SAML protocol complexity causes integration failures | 14.3 | High | Medium | Reference implementations for major IdPs; detailed configuration documentation; IdP compatibility test suite |
| Guardrail false positives block legitimate traffic | 14.4 | Medium | High | Shadow mode for tuning; per-guardrail bypass for power users; A/B testing framework |
| Billing calculation errors cause financial loss | 15.4 | Medium | Critical | Automated reconciliation; manual approval for large invoices; comprehensive test mode |
| Cost analytics queries impact database performance | 15.5 | Low | Medium | Pre-aggregated rollups; read replicas for analytics queries; query timeouts with caching |

---

## Resource Requirements (Phases 11-15)

| Phase | Estimated Engineer-Weeks | Key Skills Required | Parallelization |
|-------|------------------------|-------------------|-----------------|
| 11 (Caching) | 12 | TypeScript, Redis, Vector DBs, ML (for prediction) | 11.1+11.4 parallel, then 11.2+11.3+11.5 |
| 12 (Streaming) | 12 | TypeScript, SSE, WebSocket, TCP, gRPC, Node.js streams | 12.1 first, then 12.2+12.3+12.4 parallel, 12.5 last |
| 13 (Auth Core) | 10 | TypeScript, OAuth2, OpenID, Security best practices | 13.1 first, then 13.2+13.4 parallel, 13.3+13.5 parallel |
| 14 (Auth Advanced) | 14 | TypeScript, Casbin, SAML, OIDC, ML (guardrails), SIEM | 14.1+14.4 parallel, then 14.2+14.3+14.5 parallel |
| 15 (Billing) | 12 | TypeScript, Redis, Stripe API, SQL analytics, ML (forecasting) | 15.1+15.3 parallel, then 15.2+15.4 parallel, 15.5 last |

**Total: ~60 engineer-weeks across Phases 11-15**

---

---

## Quick Reference: Phase Completion Checklist (Phases 11-15)

### Phase 11 — Caching & Performance Layer
- [ ] 11.1 Multi-tier cache operational (memory → Redis → disk)
- [ ] 11.2 Semantic caching deployed with embedding-based matching
- [ ] 11.3 Portkey caching strategies integrated
- [ ] 11.4 RTK Caveman/Ponytail compression implemented
- [ ] 11.5 Cache warming and prediction active

### Phase 12 — Streaming Engine
- [ ] 12.1 Unified streaming interface designed and adopted
- [ ] 12.2 SSE streaming handler deployed (from 9Router + litellm)
- [ ] 12.3 WebSocket streaming handler deployed
- [ ] 12.4 Raw TCP/gRPC streaming handler deployed
- [ ] 12.5 Streaming transformation pipeline operational

### Phase 13 — Auth & Security (Core)
- [ ] 13.1 Unified auth provider interface implemented
- [ ] 13.2 20+ OAuth provider integrations ported from 9Router
- [ ] 13.3 OAuth2 consent system imported from gemini-cli
- [ ] 13.4 Device flow auth imported from Goose
- [ ] 13.5 API key management system implemented

### Phase 14 — Auth & Security (Advanced)
- [ ] 14.1 RBAC (Role-Based Access Control) deployed
- [ ] 14.2 Multi-tenant isolation implemented
- [ ] 14.3 SSO/SAML integration operational
- [ ] 14.4 Content safety and guardrails pipeline deployed
- [ ] 14.5 Audit logging and compliance tracking active

### Phase 15 — Billing, Quotas & Rate Limiting
- [ ] 15.1 Channel management system implemented
- [ ] 15.2 Usage tracking and quotas operational
- [ ] 15.3 Multi-dimensional rate limiting deployed
- [ ] 15.4 Billing integration with payment processors active
- [ ] 15.5 Cost analytics and reporting dashboard live

---

*This concludes PART 3 of the MASTER_INTEGRATION_PLAN_30_PHASES. Continue to PART 4 for Phases 16-20 covering Advanced Agent Features, MCP Ecosystem, Voice/Dictation, Testing/Hardening, and Release Engineering.*
