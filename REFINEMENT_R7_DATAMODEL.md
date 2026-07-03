# Agentic OS V4 — REFINEMENT ROUND 7: Data Model Consistency

> **Date:** 2026-07-02
> **Scope:** All 6 Parts (P1–P6) of `MASTER_INTEGRATION_PLAN_30_PHASES_*.md`
> **Reference:** `ARCHITECTURE_ANALYSIS.md` Section 4 (Unified Data Model)
> **Action:** Identify type conflicts, naming inconsistencies, missing types, and mismatches between the Architecture Analysis data model and the Master Plan's type definitions across all phases.

---

## Executive Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| **Critical** | 2 | ProviderId type mismatch; ProviderAdapter trait vs struct confusion |
| **High** | 5 | ChatRequest/ChatResponse incomplete; AgenticError missing; ModelId missing; TOML schema drift; Capabilities type naming |
| **Medium** | 4 | Message type undefined; HealthStatus type mismatch; RoutingHints/RequestContext not referenced; CostEstimate type missing |
| **Low** | 2 | TS interface naming conventions; StreamChunk type location |

**Total Inconsistencies Found: 13**

---

## DM-001 [CRITICAL] — ProviderId: Structured Type vs Flat String

### Evidence

**Architecture Analysis §4.1 defines:**
```rust
struct ProviderId {
    name: String,        // e.g., "openai", "anthropic", "google-gemini"
    version: String,     // e.g., "2024-02-01"
    instance: Option<String>, // For multi-instance providers
}
```

**P1 §1.2 defines:**
```rust
pub struct Provider {
    pub id: String,       // <-- flat string, no typed ProviderId
    ...
}
```

### Impact
- Provider identity is unstructured: `"openai"` vs `"openai:2024-02-01"` vs `"openai:2024-02-01:us-east-1"` all become ambiguous strings
- Version tracking for provider API changes is impossible
- Multi-instance provider support (e.g., two OpenAI accounts) can't be expressed
- The `ProviderId` type is used by `ProviderAdapter::id()` in the AA but nowhere in the P files

### Remediation
Replace `pub id: String` in the `Provider` struct with `pub id: ProviderId` and define `ProviderId` as a struct (not just a type alias). Update all references across P1–P6.

---

## DM-002 [CRITICAL] — ProviderAdapter: Trait (AA) vs Struct (P1) Confusion

### Evidence

**Architecture Analysis §4.1 defines a Trait:**
```rust
#[async_trait]
trait ProviderAdapter: Send + Sync {
    fn id(&self) -> ProviderId;
    fn capabilities(&self) -> Capabilities;
    fn models(&self) -> Vec<ModelInfo>;
    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse>;
    async fn chat_stream(&self, req: ChatRequest) -> Result<BoxStream<ChatResponse>>;
    async fn health(&self) -> HealthStatus;
    async fn cost_estimate(&self, req: &ChatRequest) -> CostEstimate;
}
```

**P1 §3.1 defines a different trait hierarchy:**
```rust
// Three separate traits instead of one unified trait:
trait AIProvider { ... }        // Core: id, name, models, capabilities, health check
trait ChatProvider { ... }      // Chat completions + streaming (extends AIProvider)
trait EmbeddingProvider { ... } // Text embeddings (extends AIProvider)
trait ImageProvider { ... }     // Image generation (extends AIProvider)
trait AudioProvider { ... }     // Audio transcription (extends AIProvider)
trait ToolProvider { ... }      // Tool/function calling (extends ChatProvider)
```

**P1 "Additional Implementation Guidance" defines a Struct:**
```rust
pub struct ProviderAdapter {
    config: ProviderConfig,
    client: reqwest::Client,
    rate_limiter: RateLimiter,
    metrics: ProviderMetrics,
    retry_policy: RetryPolicy,
    circuit_breaker: CircuitBreaker,
}
impl ProviderAdapter {
    // ...methods that don't implement the AA's trait
}
```

### Impact
- The AA's unified `ProviderAdapter` trait is the canonical interface for all providers. The P1 version diverges in two incompatible ways:
  - **Trait hierarchy split**: The AA uses one trait with an enum or capability-based approach; P1 uses separate traits per modality
  - **Struct instead of trait**: The implementation guidance defines a concrete struct with hardcoded retry/circuit-breaker logic, not an abstract trait that different provider implementations can satisfy
- Any code written against the AA's trait will not work with P1's types, and vice versa
- The struct-based approach makes it impossible to have different implementations (e.g., `OpenAIAdapter` vs `AnthropicAdapter`)

### Remediation
1. Keep the AA's `ProviderAdapter` trait as the **canonical interface** that all provider adapters implement
2. Move the struct-based ProviderAdapter to be a **base implementation** or **skeleton** called `BaseProviderAdapter` that provides default retry/rate-limiting/circuit-breaker behavior
3. Keep modality-specific methods as **extension traits** (e.g., `EmbeddingProvider: ProviderAdapter`) rather than replacing the core trait
4. Update P1 §3.1 to use the AA's trait signature exactly

---

## DM-003 [HIGH] — ChatRequest: Incomplete Definition

### Evidence

**Architecture Analysis §4.1 defines:**
```rust
struct ChatRequest {
    model: ModelId,
    messages: Vec<Message>,
    tools: Option<Vec<Tool>>,
    config: ChatConfig,        // temperature, max_tokens, etc.
    context: RequestContext,   // session_id, user_id, trace_id
    routing: RoutingHints,     // preferred provider, cost limit, latency SLA
}
```

**P1 §3.1 only mentions:**
> "3. **Design unified request/response types**: ChatRequest, ChatResponse, StreamChunk, EmbeddingRequest/Response, ToolDefinition/Call/Result"

No field definitions are provided. The ChatRequest struct is never actually defined with the fields from the AA.

### Impact
- Developers implementing provider adapters have no canonical ChatRequest to target
- The `ModelId` type (which itself is missing — see DM-005) is the model field type
- `RequestContext` and `RoutingHints` are referenced in P2 (file creation mentions) but never structurally defined
- Each provider adapter may define its own ChatRequest variant, leading to fragmentation

### Remediation
Add the full `ChatRequest` struct definition (matching AA §4.1 exactly) to P1 §1.2 or P1 §3.1. Include all fields: `model: ModelId`, `messages: Vec<Message>`, `tools: Option<Vec<Tool>>`, `config: ChatConfig`, `context: RequestContext`, `routing: RoutingHints`.

---

## DM-004 [HIGH] — ChatResponse: Missing Enum and Usage Type

### Evidence

**Architecture Analysis §4.1 defines:**
```rust
enum ChatResponse {
    Chunk(StreamChunk),
    Done(Usage),
    Error(AgenticError),
}
```

**P1 §3.1 mentions:**
> "Design unified request/response types: ChatRequest, ChatResponse, StreamChunk"

The `ChatResponse` enum is referenced but never defined. The `Usage` type (containing token counts, cost, etc.) is never mentioned in P files. The `StreamChunk` type is referenced in P4 file creation but not structurally defined.

### Impact
- No canonical response type means streaming responses, final responses, and errors are handled differently across phases
- The `Usage` struct (which tracks prompt tokens, completion tokens, cost) is critical for billing (Phase 14) and observability (Phase 15) but is never defined
- The `ChatResponse::Error(AgenticError)` variant links to the error system (see DM-006) — without it, error handling is ad-hoc

### Remediation
1. Add `enum ChatResponse` definition matching AA §4.1
2. Define `struct Usage { prompt_tokens: u32, completion_tokens: u32, total_tokens: u32, cost: f64, ... }`
3. Define `struct StreamChunk { content: String, finish_reason: Option<String>, ... }`

---

## DM-005 [HIGH] — ModelId Type Missing

### Evidence

**Architecture Analysis §4.1 defines:**
```rust
struct ModelId {
    provider: ProviderId,
    model: String,       // e.g., "gpt-4o", "claude-3-opus", "gemini-2.5-pro"
}
```

**No P file defines ModelId.** P1's Provider struct uses `pub models: Vec<ModelInfo>` where `ModelInfo` is not further defined. The `ChatRequest.model` field type (from AA) should be `ModelId` but it's never defined.

### Impact
- Model references are ambiguous: `"gpt-4o"` could mean OpenAI's gpt-4o, Azure's gpt-4o, or any other provider's variant
- Without the `provider` field embedded in ModelId, the routing system cannot determine which provider to use for a given model name
- Model disambiguation across 250+ providers is impossible without the typed ModelId

### Remediation
Add `struct ModelId { provider: ProviderId, model: String }` and `struct ModelInfo { id: ModelId, context_window: u32, max_output_tokens: u32, pricing: PricingInfo, capabilities: ModelCapabilities }` to P1 §1.2 core types.

---

## DM-006 [HIGH] — AgenticError Not Defined; Multiple Error Types Exist

### Evidence

**Architecture Analysis §4.1 uses:**
```rust
// In ChatResponse:
Error(AgenticError),

// In ProviderAdapter:
async fn chat(&self, req: ChatRequest) -> Result<ChatResponse>;
// where Result<T> = Result<T, AgenticError>
```

**P files define multiple error types:**
| Location | Error Type | Usage |
|----------|------------|-------|
| P1 §5 impl guidance | `ProviderError` | Adapter execution: CircuitBreakerOpen, ServerError, ClientError, Transport, MaxRetriesExceeded, RequestCloneFailed, Deserialization |
| P1 §5 rate limiting | `RateLimitError` | Rate limiter acquire |
| P2 | (no error type) | Routing errors handled ad-hoc |
| P3 | (compliance errors) | Audit logging failures |

**No `AgenticError` type is defined anywhere in P1–P6.**

### Impact
- The canonical error type (`AgenticError`) is never created — all phases use ad-hoc error types
- Error handling patterns differ across phases: some use `Result<T, ProviderError>`, some use `Result<T, RateLimitError>`, others have no error type at all
- The `ChatResponse::Error(AgenticError)` variant cannot be used, breaking the unified response contract
- Error propagation across layers (gateway → orchestrator → ACP → UI) is inconsistent

### Remediation
1. Define `enum AgenticError` as the canonical error type with variants covering all subsystem errors
2. Make `ProviderError`, `RateLimitError`, etc. subtypes of `AgenticError` (either via `From` impls or as enum variants)
3. Update all `Result<T, XxxError>` to use `Result<T, AgenticError>` at public API boundaries
4. Add `AgenticError` to P1 §1.2 core types (`crates/core/src/error.rs`)

---

## DM-007 [HIGH] — TOML Config Schema Drift

### Evidence

**Architecture Analysis §4.2 defines a comprehensive TOML schema** with sections:
```toml
[version]          # schema = "1.0"
[profile]          # name, mode
[providers]        # per-provider sections with api_key, models
[routing]          # strategy, fallback_chain, max_retries, timeout_ms, enable_ensemble
[routing.costs]    # per-model cost data
[caching]          # mode, provider, ttl_seconds, semantic_threshold
[guardrails]       # enabled, providers, block_topics
[billing]          # enabled, backend, usage_tracking, budget_limit, budget_alert_at
[auth]             # mode, providers, sso
[server]           # host, port, acp_enabled, metrics_port
[observability]    # tracing, metrics, logging
[ui]               # mode, theme, notifications
```

**P files reference config but diverge:**
| AA Section | P File Reference | Status |
|------------|-----------------|--------|
| `[version]` | P1 §1.4 mentions schema but no `[version]` | Missing |
| `[profile]` | Not in P files | Missing |
| `[providers]` | P1 §1.2 has Provider struct (Rust) but no TOML `[providers]` section | Inconsistent format |
| `[routing]` | P2 §6.1-7.5 describes routing extensively but no TOML schema | Missing |
| `[routing.costs]` | P5 §21 (local inference pricing) references but no `[routing.costs]` | Missing |
| `[caching]` | P3 §11 describes caching but no TOML `[caching]` | Missing |
| `[guardrails]` | P3 §14 references guardrails but no TOML `[guardrails]` | Missing |
| `[billing]` | P4 §19.3 references billing but no TOML `[billing]` | Missing |
| `[auth]` | P3 §13 describes auth but no TOML `[auth]` | Missing |
| `[server]` | P4 references server but no TOML `[server]` | Missing |
| `[observability]` | P3 §15 describes observability but no TOML `[observability]` | Missing |
| `[ui]` | P4 §16-18 describes UI but no TOML `[ui]` | Missing |

P2 has a `type = "local"` reference in a session storage context that suggests a completely different schema structure.

### Impact
- The AA's TOML schema is the canonical config format, but P files never explicitly adopt it
- Each phase describes its subsystem's config needs independently, risking incompatible config sections
- Developers implementing Phase 2 (Config System) have no single schema to target
- Migration tools (Phase 2.5) need a target schema — without it, migration produces unpredictable output

### Remediation
1. Add the full AA §4.2 TOML schema to P1 §1.4 or P2 §2.1 as the canonical config reference
2. Map each subsystem phase to its TOML section (e.g., P3 §13 → [auth], P3 §15 → [observability])
3. Ensure the config parser crate (`crates/config/src/schema.rs`) matches this TOML schema exactly

---

## DM-008 [HIGH] — Capabilities Type Naming: `Capabilities` vs `ProviderCapabilities` vs `ModelCapabilities`

### Evidence

| Source | Type | Usage |
|--------|------|-------|
| AA §4.1 | `fn capabilities(&self) -> Capabilities` | ProviderAdapter trait |
| AA §4.1 | `capabilities: ProviderCapabilities` | Provider struct (implied by context) |
| P1 §1.2 | `pub capabilities: ProviderCapabilities` | Provider struct |
| P1 §4.3 | `ProviderCapabilities` and `ModelCapabilities` | Capability matrix |
| AA TOML | (no `[capabilities]` section) | Capabilities are per-provider |

### Impact
- The AA's `ProviderAdapter::capabilities()` returns `Capabilities` but P1 defines `ProviderCapabilities` — inconsistent naming
- No single canonical `Capabilities` type exists for the `ProviderAdapter` trait to reference
- TypeScript equivalent also uses `ProviderCapabilities` (P1 TS interface)

### Remediation
1. Rename AA's `Capabilities` to `ProviderCapabilities` for consistency with P1
2. OR rename P1's `ProviderCapabilities` to `Capabilities` to match AA — choose one convention
3. Ensure `ModelCapabilities` (used in capability matrix) is a distinct type with different fields

---

## DM-009 [MEDIUM] — Message Type Never Defined

### Evidence

**AA §4.1 uses:**
```rust
messages: Vec<Message>,
```

**P files reference `Message` but never define it:**
- P4 (session viewer): `message.rs` — "Message model (user, assistant, tool)"
- P4 (chat UI): `MessageList.tsx`, `MessageBubble.tsx`

No canonical `Message` struct/enum is defined in any P file's core types section.

### Impact
- Different subsystems will define their own Message types, causing serialization issues across the ACP → Gateway → Provider boundary
- The Message type is fundamental to ChatRequest but has no canonical definition

### Remediation
Add `enum Message { System(SystemMessage), User(UserMessage), Assistant(AssistantMessage), Tool(ToolMessage) }` with appropriate substructs to P1 §1.2 core types.

---

## DM-010 [MEDIUM] — HealthStatus Type Mismatch

### Evidence

**AA §4.1 defines:**
```rust
async fn health(&self) -> HealthStatus;
```

**P1 §4.4 describes health checks but never defines a `HealthStatus` return type:**
- P1 §4.4: "Health check execution" — returns JSON, not typed
- P1 §4.4: "Automatic deactivation after N consecutive failures"

### Impact
- The AA's `ProviderAdapter::health()` returns `HealthStatus` but no such type exists
- Health check results are described as "status indicators" (healthy, degraded, down) but not as a typed enum

### Remediation
Add `enum HealthStatus { Healthy, Degraded { latency_ms: u64, error_rate: f64 }, Unhealthy { reason: String, last_error: String, since: DateTime } }` to P1 §1.2 or §4.4.

---

## DM-011 [MEDIUM] — RoutingHints and RequestContext Never Defined

### Evidence

**AA §4.1 defines:**
```rust
struct ChatRequest {
    ...
    context: RequestContext,   // session_id, user_id, trace_id
    routing: RoutingHints,     // preferred provider, cost limit, latency SLA
}
```

**P2 references:**
- `request-context.ts` — "RequestContext type" (file creation mention)
- `RequestContext correctly extracts model, provider preferences, latency budget, cost ceiling` (acceptance criteria)

No `RequestContext` or `RoutingHints` type definitions are provided in any P file.

### Impact
- The ChatRequest struct is incomplete without these types
- Routing decisions need `RoutingHints` (preferred provider, cost limit, latency SLA) to function
- Observability/tracing needs `RequestContext` (session_id, user_id, trace_id) for correlation

### Remediation
Define both types in P1 §1.2:
```rust
struct RequestContext {
    session_id: String,
    user_id: Option<String>,
    trace_id: String,
    metadata: HashMap<String, String>,
}
struct RoutingHints {
    preferred_provider: Option<ProviderId>,
    cost_limit: Option<f64>,
    latency_sla_ms: Option<u64>,
    strategy: Option<RoutingStrategy>,
}
```

---

## DM-012 [MEDIUM] — CostEstimate Type Missing

### Evidence

**AA §4.1 defines:**
```rust
async fn cost_estimate(&self, req: &ChatRequest) -> CostEstimate;
```

**P files:**
- P1 §4.3 mentions cost estimation in capability matrix
- P2 mentions "cost ceiling" in routing hints
- P4 §19.3 references billing

No `CostEstimate` struct is defined anywhere.

### Impact
- The `ProviderAdapter` trait cannot be implemented without a return type for `cost_estimate()`
- Billing (Phase 14/P4) and cost-based routing (Phase 7/P2) have no shared cost data type
- Cost estimation is described but cannot be implemented against a canonical type

### Remediation
Add `struct CostEstimate { estimated_cost: f64, currency: String, confidence: f64, breakdown: HashMap<String, f64> }` to P1 §1.2 or §4.3.

---

## DM-013 [LOW] — TS Interface Naming Convention: PascalCase Struct vs camelCase Interface

### Evidence

**P1 §1.2 Rust:**
```rust
pub struct Provider {
    pub provider_type: ProviderType,   // snake_case
    pub auth_type: AuthType,           // snake_case
    pub health_check: HealthCheckConfig, // snake_case
}
```

**P1 §1.2 TypeScript:**
```typescript
export interface Provider {
    providerType: ProviderType;     // camelCase
    authType: AuthType;            // camelCase
    healthCheck: HealthCheckConfig; // camelCase
}
```

### Impact
- The napi-rs bridge automatically converts between snake_case (Rust) and camelCase (JS) — this is intentional and expected
- However, the TS `Provider` interface has no `id` field matching the Rust struct
- The Rust struct has `pub id: String` but the TS interface shown in P1 omits `id`

### Remediation
1. Ensure the TS interface has all fields matching the Rust struct (including `id`)
2. Add a documentation note that napi-rs handles snake_case ↔ camelCase conversion automatically

---

## Summary: Proposed Fixes to Apply

### Fix 1: P1 §1.2 — Replace `pub id: String` with `pub id: ProviderId`
**File:** `MASTER_INTEGRATION_PLAN_30_PHASES_P1.md`
**Change:** In the `Provider` struct and `Provider` interface, replace the flat `id: String` field with a proper `ProviderId` struct/interface.

### Fix 2: P1 §1.2 — Add missing core type definitions
**File:** `MASTER_INTEGRATION_PLAN_30_PHASES_P1.md`
**Change:** Add `ProviderId`, `ModelId`, `ModelInfo`, `Message`, `ChatRequest`, `ChatResponse`, `ChatConfig`, `RequestContext`, `RoutingHints`, `StreamChunk`, `Usage`, `AgenticError`, `HealthStatus`, `CostEstimate` type definitions to section 1.2.

### Fix 3: P1 §3.1 — Reconcile ProviderAdapter trait with AA
**File:** `MASTER_INTEGRATION_PLAN_30_PHASES_P1.md`
**Change:** Replace the split trait hierarchy (`AIProvider`, `ChatProvider`, etc.) with the single `ProviderAdapter` trait from AA §4.1. Move modality-specific methods to extension traits. Rename the struct-based `ProviderAdapter` to `BaseProviderAdapter`.

### Fix 4: P1 §1.4 / P2 §2.1 — Add canonical TOML schema from AA §4.2
**File:** `MASTER_INTEGRATION_PLAN_30_PHASES_P1.md` (or P2)
**Change:** Include the full TOML schema from AA §4.2 as the canonical configuration format. Map each subsystem phase to its TOML section.

### Fix 5: P1 §1.2 — Add `AgenticError` as canonical error type
**File:** `MASTER_INTEGRATION_PLAN_30_PHASES_P1.md`
**Change:** Define `AgenticError` enum with variants covering all subsystem errors. Make `ProviderError`, `RateLimitError` subtypes of `AgenticError`.

---

## Cross-Phase Consistency Matrix

| Type | AA §4 | P1 | P2 | P3 | P4 | P5 | P6 | Status |
|------|-------|----|----|----|----|----|----|--------|
| ProviderId | ✓ | ✗ (flat String) | — | — | — | — | — | **NEEDS FIX** |
| ModelId | ✓ | ✗ | — | — | — | — | — | **NEEDS FIX** |
| ModelInfo | — | ✓ (partial) | — | — | — | — | — | Needs definition |
| Message | ✓ | ✗ | — | — | — | — | — | **NEEDS FIX** |
| ChatRequest | ✓ | ✗ (incomplete) | — | — | — | — | — | **NEEDS FIX** |
| ChatResponse | ✓ | ✗ (incomplete) | — | — | — | — | — | **NEEDS FIX** |
| StreamChunk | ✓ | ✗ | — | — | ✓ (file ref) | — | — | Needs definition |
| Usage | ✓ | ✗ | — | — | — | — | — | **NEEDS FIX** |
| ChatConfig | ✓ | ✗ | — | — | — | — | — | Needs definition |
| RequestContext | ✓ | ✗ | ✓ (file ref) | — | — | — | — | **NEEDS FIX** |
| RoutingHints | ✓ | ✗ | ✗ | — | — | — | — | **NEEDS FIX** |
| ProviderAdapter trait | ✓ | ✗ (different) | — | — | — | — | — | **NEEDS FIX** |
| AgenticError | ✓ | ✗ | — | — | — | — | — | **NEEDS FIX** |
| ProviderError | — | ✓ | — | — | — | — | — | Should subtype AgenticError |
| RateLimitError | — | ✓ | — | — | — | — | — | Should subtype AgenticError |
| HealthStatus | ✓ | ✗ | — | — | — | — | — | **NEEDS FIX** |
| CostEstimate | ✓ | ✗ | — | — | — | — | — | **NEEDS FIX** |
| Capabilities | ✓ (AA name) | ✓ (ProviderCapabilities) | — | — | — | — | — | Inconsistent naming |
| ModelCapabilities | — | ✓ | — | — | — | — | — | Needs alignment |
| ProviderCapabilities | — | ✓ | — | — | — | — | — | Needs alignment |
| ProviderConfig | — | ✓ | — | — | — | — | — | Used in struct adapter |
| TOML schema [version] | ✓ | ✗ | — | — | — | — | — | **NEEDS FIX** |
| TOML schema [profile] | ✓ | ✗ | — | — | — | — | — | Missing |
| TOML schema [providers] | ✓ | ✗ | — | — | — | — | — | Missing |
| TOML schema [routing] | ✓ | — | ✓ (describes) | — | — | — | — | Missing TOML form |
| TOML schema [caching] | ✓ | — | — | ✓ (describes) | — | — | — | Missing TOML form |
| TOML schema [guardrails] | ✓ | — | — | ✓ (describes) | — | — | — | Missing TOML form |
| TOML schema [billing] | ✓ | — | — | — | ✓ (describes) | — | — | Missing TOML form |
| TOML schema [auth] | ✓ | — | — | ✓ (describes) | — | — | — | Missing TOML form |
| TOML schema [server] | ✓ | — | — | — | ✓ (describes) | — | — | Missing TOML form |
| TOML schema [observability] | ✓ | — | — | ✓ (describes) | — | — | — | Missing TOML form |
| TOML schema [ui] | ✓ | — | — | — | ✓ (describes) | — | — | Missing TOML form |

**Legend:** ✓ = present and consistent, ✗ = missing or inconsistent, — = not applicable for this phase

---

## Action Items

| # | Priority | File | Change | Complexity |
|---|----------|------|--------|------------|
| 1 | Critical | P1 §1.2 | Add ProviderId, ModelId, ModelInfo structs + TS interfaces | Medium |
| 2 | Critical | P1 §1.2 + §3.1 | Fix ProviderAdapter: trait from AA as canonical, rename struct to BaseProviderAdapter | Medium |
| 3 | High | P1 §1.2 + §3.1 | Add full ChatRequest struct | Low |
| 4 | High | P1 §1.2 + §3.1 | Add ChatResponse enum + Usage + StreamChunk | Low |
| 5 | High | P1 §1.2 | Add ModelId struct | Low |
| 6 | High | P1 §1.2 | Add AgenticError enum | Low |
| 7 | High | P1 §1.4 / P2 §2.1 | Add canonical TOML schema from AA §4.2 | Medium |
| 8 | High | P1 §1.2 + §4.3 | Align Capabilities type naming | Low |
| 9 | Medium | P1 §1.2 | Add Message enum | Low |
| 10 | Medium | P1 §1.2 + §4.4 | Add HealthStatus enum | Low |
| 11 | Medium | P1 §1.2 + P2 | Add RequestContext + RoutingHints | Low |
| 12 | Medium | P1 §1.2 + §4.3 | Add CostEstimate struct | Low |
| 13 | Low | P1 §1.2 TS | Add missing `id` field to TS Provider interface | Low |

---

## Conclusion

The Architecture Analysis provides a clean, well-thought-out data model in §4, but the Master Plan's 6 parts have drifted significantly from this canonical model. The three most critical fixes are:

1. **ProviderId**: Replace flat strings with structured provider identity
2. **ProviderAdapter trait**: Use the AA's trait as canonical, not a split trait hierarchy or a struct
3. **ChatRequest/ChatResponse/ModelId/AgenticError**: Add these fundamental types that are referenced but never defined

Without these fixes, cross-phase integration will suffer from type incompatibilities, and code written against the AA's data model (the source of truth) will not compile against the P files' type definitions.

**All 13 fixes should be applied to the P files before any implementation begins.**
