# Agentic OS V4 — REFINEMENT ROUND 1: Gap Analysis (Phases 1-5)

> **Date:** 2026-07-02
> **Scope:** Phases 1-5 of `MASTER_INTEGRATION_PLAN_30_PHASES_P1.md`
> **Reference:** `ARCHITECTURE_ANALYSIS.md` (Architecture Risks, Data Model, Security Controls, Folder Blueprint, Risk Register)
> **Action:** Identify EVERY gap vs source project needs, categorize by severity

---

## Summary of Findings

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| **Missing Features** | 1 | 3 | 4 | 2 |
| **Structural Gaps** | 1 | 2 | 3 | 1 |
| **Cross-Cutting** | 0 | 2 | 2 | 1 |
| **Total** | **2** | **7** | **9** | **4** |

**Overall Assessment:** The plan is thorough but has **22 gaps** that need addressing before execution begins. Two critical gaps: (1) no `crates/installer/` for auto-update/installer, (2) no `crates/safety/` for content safety pipeline.

---

## GAP-001 [CRITICAL] — Missing `crates/installer/` for Auto-Update & Installer

### Location
Phase 1 — Root Monorepo Structure (1.1)

### Problem
The `ARCHITECTURE_ANALYSIS.md` §2.3 "Zero-Hassle Distribution Strategy" explicitly designs an **installer crate** with:
- Cross-platform binary download and PATH setup
- SHA-256 checksum verification
- Shell completions (bash, zsh, fish, powershell)
- Auto-update mechanism checking GitHub releases every 6 hours
- Atomic binary swap with rollback on failure

The Master Plan Phase 1 directory structure has **NO `crates/installer/`** crate. This is a critical omission — the "zero-hassle" installer experience cannot be built without this crate.

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §2.3: `crates/installer/` in folder blueprint
- ARCHITECTURE_ANALYSIS.md §2.3: Installer workflow pseudo-Rust code
- ARCHITECTURE_ANALYSIS.md §2.3: Cross-platform build matrix (6 targets)
- Risk R3: Single binary size >100MB — installer manages optional downloads

### Remediation
Add `crates/installer/` to Phase 1 root structure with files:
- `crates/installer/src/lib.rs` — Installer workflow
- `crates/installer/src/self_update.rs` — Auto-update engine
- `crates/installer/src/download.rs` — Platform-aware binary download
- `crates/installer/src/completions.rs` — Shell completion generation
- `crates/installer/src/verify.rs` — Checksum verification

---

## GAP-002 [CRITICAL] — Missing `crates/safety/` for Content Safety Pipeline

### Location
Phase 1 — Root Monorepo Structure (1.1) and Phase 3-4 — Provider Registry

### Problem
The `ARCHITECTURE_ANALYSIS.md` §6.1 "Security Architecture" defines a **Content Safety Checker** as a mandatory middleware layer between request validation and routing:
```
Request Validator → Content Safety Checker → Router + Orchestrator → ...
```

The Master Plan has content safety buried inside `crates/security/` as guardrails, but the Architecture Analysis places it as a **separate crate** (`crates/safety/`) because:
1. It needs its own pipeline (multi-checker: PII, prompt injection, jailbreak, content safety)
2. It must integrate with Portkey's guardrail plugins (Phase 3.4)
3. It has a compliance dimension (GDPR, HIPAA, SOC2 — §6.3)
4. The `crates/security/` crate in the plan covers auth/encryption/keys, not content safety

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §6.1: Content Safety Checker in security architecture diagram
- ARCHITECTURE_ANALYSIS.md §6.2: Multi-checker pipeline from gemini-cli
- ARCHITECTURE_ANALYSIS.md §7: `crates/safety/` in folder blueprint
- ARCHITECTURE_ANALYSIS.md §1.3: "Inconsistent content safety" as MEDIUM security gap

### Remediation
Add `crates/safety/` to Phase 1 root structure:
- `crates/safety/src/lib.rs` — Safety pipeline orchestrator
- `crates/safety/src/checker.rs` — Multi-checker interface
- `crates/safety/src/pii.rs` — PII detection & redaction
- `crates/safety/src/injection.rs` — Prompt injection detection
- `crates/safety/src/jailbreak.rs` — Jailbreak detection
- `crates/safety/src/content.rs` — Content safety (hate, violence, sexual)
- `crates/safety/src/portkey.rs` — Portkey guardrail plugin bridge

---

## GAP-003 [HIGH] — Missing `packages/sdk/` for Programmatic SDK

### Location
Phase 1 — TypeScript Workspace Structure (1.1)

### Problem
The `ARCHITECTURE_ANALYSIS.md` §7 "Folder Structure Blueprint" lists `packages/sdk/` as a top-level package providing a programmatic SDK for Agentic OS V4. The Master Plan Phase 1 has `packages/acp-client/` and `packages/mcp-client/` but **no unified SDK package** that would:
- Wrap ACP, MCP, and Gateway APIs into a single developer-friendly SDK
- Provide TypeScript types for all public interfaces
- Include browser-compatible builds (for web dashboard)
- Include Node.js and Deno entry points

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §7: `packages/sdk/` in folder blueprint
- ARCHITECTURE_ANALYSIS.md §2.3: `agentic-os sdk` binary embedding concept
- The `packages/core/` in the plan provides types but not a usable SDK

### Remediation
Add `packages/sdk/` to Phase 1 workspace:
- `packages/sdk/src/index.ts` — Unified SDK entry point
- `packages/sdk/src/acp.ts` — ACP client wrapper
- `packages/sdk/src/mcp.ts` — MCP client wrapper
- `packages/sdk/src/gateway.ts` — Gateway API wrapper
- `packages/sdk/src/provider.ts` — Provider management

---

## GAP-004 [HIGH] — Missing `packages/devtools/` and `packages/vscode/`

### Location
Phase 1 — TypeScript Workspace Structure (1.1)

### Problem
The `ARCHITECTURE_ANALYSIS.md` §7 lists `packages/devtools/` and `packages/vscode/` which are missing from the Master Plan. The gemini-cli project (one of the 8 merged projects) has substantial DevTools infrastructure:
- `gemini-cli devtools` command for inspecting agent state
- VS Code extension for MCP tool management
- Debugger integration for skill execution
- Config file editor with validation

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §7: `packages/devtools/` and `packages/vscode/`
- gemini-cli has built-in DevTools patterns
- Phase 1.5 (Dev Environment) doesn't cover runtime devtools

### Remediation
Add to Phase 1:
- `packages/devtools/` — Browser-based DevTools panel
- `packages/devtools/package.json` — DevTools dependencies
- `packages/vscode/` — VS Code extension (optional, can be Phase 6+)

---

## GAP-005 [HIGH] — Missing `providers/` Directory for TypeScript Provider Adapters

### Location
Phase 1 — Root Directory Structure (1.1)

### Problem
The `ARCHITECTURE_ANALYSIS.md` §7 defines a top-level `providers/` directory containing TypeScript-based provider adapters (openai, anthropic, google, ollama, 150+ more). The Master Plan places all provider adapters under `crates/gateway/src/provider/adapters/` as Rust-only.

This is a **strategic gap** because:
1. Rust adapters require recompilation to add new providers
2. The Architecture Analysis §1.3 notes "Provider credential sprawl" — TS adapters can be loaded dynamically
3. Portkey and OmniRoute2 providers are TypeScript-native
4. The plan should support **both** Rust (embedded/built-in) and TS (dynamic/pluggable) provider adapters
5. The `napi-rs` bridge enables TS providers to call into Rust infrastructure

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §7: `providers/` directory with 150+ TS provider adapters
- ARCHITECTURE_ANALYSIS.md §1.1: "Provider credential sprawl" risk
- Phase 3.3-3.5 imports from TS projects (Portkey, OmniRoute2) but doesn't keep their TypeScript structure

### Remediation
Add `providers/` directory at root level (parallel to `crates/` and `packages/`):
- `providers/` — TS provider adapters for dynamic loading
- `providers/openai/` — OpenAI adapter (TS)
- `providers/anthropic/` — Anthropic adapter (TS)
- `providers/google/` — Google/Gemini adapter (TS)
- `providers/ollama/` — Ollama adapter (TS)
- Build-time code generation can compile these into Rust

---

## GAP-006 [HIGH] — Phase 2 Config Schema Missing Billing & SSO Sections

### Location
Phase 2 — Config Schema Design (2.1)

### Problem
The `ARCHITECTURE_ANALYSIS.md` §4.2 unified config schema includes `[billing]` and `[auth.sso]` sections that are **absent** from Phase 2.1's schema audit:

**Missing fields from Architecture Analysis config:**
- `[billing]` — enabled, backend (sqlite/postgres/mysql), usage_tracking, budget_limit, budget_alert_at
- `[auth.mode]` = "sso" with provider/client_id
- `[routing.costs]` — per-model pricing
- `[caching.mode]` = "semantic" with semantic_threshold
- `[ui.mode]` = "desktop"/"web" (plan only mentions TUI and CLI)

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §4.2: Complete TOML config with billing, SSO, routing costs, semantic caching, UI modes
- Phase 2.1 Table: new-api billing has 150+ options but schema section list doesn't include `[billing]`
- ARCHITECTURE_ANALYSIS.md §1.2: "Database Bottlenecks" — billing needs its own config

### Remediation
Add to Phase 2.1 schema sections:
- `[billing]` — With backend, usage_tracking, budget_limit, budget_alert_at
- `[auth]` — With mode (api_key, oauth, sso, none), SSO provider config
- `[routing.costs]` — Per-model pricing overrides
- `[caching]` — Semantic caching threshold configuration
- `[ui]` — Mode selection (cli, tui, desktop, web)

---

## GAP-007 [HIGH] — Missing Connection Between Performance Benchmarks and Architecture Analysis Performance Issues

### Location
Cross-cutting — Performance (end of document, Additional Guidance)

### Problem
The `ARCHITECTURE_ANALYSIS.md` §1.4 identifies **5 specific performance issues** that must be addressed during Phases 1-5:

| Issue | Affected Phase | Impact |
|-------|---------------|--------|
| 9Router protocol translation ~50ms overhead | Phase 5 | Must optimize with zero-copy |
| litellm semantic cache ~200ms on miss | Phase 2/3 | Must implement tiered caching |
| V3 DAG serial execution | Phase 3+ (actually Phase 6) | N/A for Phases 1-5 |
| gemini-cli context compression latency | Phase 4 | Async/streaming compression |
| Goose TUI full-screen re-render | Phase 6+ | N/A for Phases 1-5 |

The Master Plan's performance benchmarks are **generic targets** (e.g., "translation < 5ms p50") but don't reference these specific known issues. There's no mitigation strategy for the ~50ms translation overhead from 9Router.

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §1.4: 5 specific performance issues
- Master Plan Performance Benchmarks table: targets without connection to known issues
- Risk R4: "Performance regression vs specialized tools"

### Remediation
Add to Phase 5 acceptance criteria:
- "Zero-copy translation for OpenAI↔Unified path (target: <3ms p50)"
- "Streaming translation pipeline achieves <5ms p50 end-to-end"
- "Cached config parse <1ms (not just cold)"

---

## GAP-008 [MEDIUM] — Phase 1 Directory Structure Missing Key Crates

### Location
Phase 1 — Root Monorepo Structure (1.1)

### Problem
Comparing the `ARCHITECTURE_ANALYSIS.md` §7 folder blueprint to the Master Plan Phase 1 structure, several crates are missing or differently named:

| Architecture Analysis | Master Plan | Gap |
|-----------------------|-------------|-----|
| `crates/installer/` | **_MISSING** | CRITICAL (GAP-001) |
| `crates/safety/` | `crates/security/` (different scope) | CRITICAL (GAP-002) |
| `crates/provider-registry/` | Under `crates/gateway/src/provider/` | MEDIUM — Should be separate crate |
| `crates/protocol-translator/` | Under `crates/gateway/src/translator/` | MEDIUM — Should be separate crate |
| `crates/router/` | Under `crates/gateway/src/routing/` | MEDIUM — Should be separate crate |
| `crates/cache/` | Under `crates/gateway/src/cache/` (implied) | MEDIUM |
| `crates/observability/` | `crates/telemetry/` (different naming) | LOW — Naming only |
| `crates/mcp/` | `crates/mcp/` | ✓ Present |
| `crates/auth/` | Under `crates/gateway/` | MEDIUM |
| `crates/billing/` | Under `crates/gateway/` | MEDIUM |

The Architecture Analysis separates these because each is a **significant subsystem** with its own traits, tests, and dependencies. The Master Plan consolidates them under `crates/gateway/` which creates a monolithic crate of excessive complexity.

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §7: 16 crates in folder blueprint
- Master Plan Phase 1.1: ~12 crates listed
- ARCHITECTURE_ANALYSIS.md §1.1: "No Shared Data Model" — caused by monolithic design

### Remediation
Split `crates/gateway/` into focused crates:
- `crates/provider-registry/` — Provider adapter interface + registry
- `crates/protocol-translator/` — Protocol translation engine
- `crates/router/` — Routing engine (adaptive, budget, latency)
- `crates/cache/` — Multi-tier caching (memory, redis, disk, semantic)
- `crates/auth/` — Auth & OAuth
- `crates/billing/` — Usage tracking & quotas
- Keep `crates/gateway/` as the **orchestration layer** that ties them together

---

## GAP-009 [MEDIUM] — Phase 3 Provider Import Missing Explicit Pricing Data Integration

### Location
Phase 3.3 — litellm Provider Import

### Problem
The Master Plan Phase 3.3 says "Import litellm's model pricing database" and creates `data/providers/litellm-models.json`. However, it doesn't specify:

1. **How pricing data is merged** when conflicts exist (e.g., different prices for `gpt-4o` from litellm vs 9Router)
2. **How frequently pricing data is updated** — litellm's pricing database is updated weekly
3. **Where the unified pricing is stored** after merge
4. **No pricing data file** for 9Router providers (only litellm, Portkey, new-api)
5. Missing a `scripts/merge-pricing.ts` script that reconciles all sources

The Architecture Analysis §4.2 config has `[routing.costs]` for per-model pricing overrides, which implies the pricing system must be comprehensive.

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §4.2: `[routing.costs]` section in config schema
- Phase 3.3: litellm pricing import but no merge strategy
- Phase 3.2: 9Router import has no pricing data file

### Remediation
Add to Phase 3:
- `data/providers/pricing/unified-pricing.json` — Merged pricing from all sources
- `scripts/merge-pricing.ts` — Pricing reconciliation script
- Update Phase 3 acceptance criteria: "Pricing data is reconciled across all sources with conflict resolution"
- Add `crates/gateway/src/provider/pricing.rs` — Unified pricing data model

---

## GAP-010 [MEDIUM] — Phase 4 Missing Unified Error Taxonomy as Deliverable

### Location
Phase 4 — Provider Registry Completion, and cross-cutting

### Problem
The `ARCHITECTURE_ANALYSIS.md` §4.1 defines a comprehensive `Unified Error Taxonomy` with 20+ error codes (AUTH_001 through INFRA_002). The Master Plan Phase 1.2 mentions `crates/core/src/error.rs` for "Unified error types & error codes" but **never defines the actual error taxonomy** as a concrete deliverable with codes, categories, HTTP mappings.

The Additional Implementation Guidance section at the end of the Master Plan does include the error code table, but it's not linked to any specific phase or acceptance criteria.

### Source Evidence
- Master Plan Additional Guidance: Error taxonomy table (20 codes)
- Phase 1.2: `crates/core/src/error.rs` mentioned but no error code specification
- Phase 5: No mention of error translation in protocol adapters
- ARCHITECTURE_ANALYSIS.md §4.1: Unified error types in data model

### Remediation
Add to Phase 1.2 deliverables:
- `docs/error-codes.md` — Documented error taxonomy with all codes, HTTP mappings, and descriptions
- Update Phase 5 adapters to translate provider errors into unified error codes
- Add acceptance criterion: "All provider adapters map errors to unified taxonomy"

---

## GAP-011 [MEDIUM] — Phase 5 Missing Explicit Zero-Copy Translation Optimization

### Location
Phase 5 — Protocol Translation Layer

### Problem
The `ARCHITECTURE_ANALYSIS.md` §1.4 identifies **9Router protocol translation overhead** as a specific performance issue: "Each translation adds ~50ms latency. Need zero-copy where possible."

The Master Plan Phase 5 implements bidirectional translation but **never mentions zero-copy** or any specific optimization for translation latency. The performance benchmarks say "Request translation < 5ms" but the known issue from 9Router is 50ms — the plan needs specific mitigations to achieve this 10x improvement.

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §1.4: "9Router protocol translation overhead: Each translation adds ~50ms latency"
- Master Plan Phase 5.4: Translation engine description
- Master Plan Performance Benchmarks: "< 5ms p50" target with no optimization strategy
- Risk R4: "Performance regression vs specialized tools"

### Remediation
Add to Phase 5:
- `crates/protocol-translator/src/optimizations/zero_copy.rs` — Zero-copy path for OpenAI↔Unified (most common)
- `crates/protocol-translator/src/optimizations/direct.rs` — Direct format-to-format for common pairs (OpenAI↔Anthropic, OpenAI↔Gemini)
- Performance acceptance criterion: "OpenAI↔Unified translation < 3ms p50"

---

## GAP-012 [MEDIUM] — Phase 2 Missing Config Validation Against Provider Capability Matrix

### Location
Phase 2 — Config Parser Validation (2.2, 2.4)

### Problem
The Master Plan Phase 2 validates config schema but doesn't validate **against provider capabilities**. Example issues:
- User configures `model = "gpt-4-vision-preview"` but selected provider is Anthropic (which has no vision model with that ID)
- User configures `routing.strategy = "semantic_cache"` but caching provider is not configured
- User configures `guardrails.enabled = true` but no guardrail providers are configured

Phase 4 implements the capability matrix, but Phase 2 needs to reference it for **cross-phase validation**. The hot-reload (2.4) should also re-validate against capabilities when provider configs change.

### Source Evidence
- Phase 2.2: Validation produces helpful error messages but only for syntax/schema
- Phase 2.4: Hot-reload detects config changes but doesn't mention capability re-validation
- Phase 4.3: Capability matrix implemented after Phase 2
- ARCHITECTURE_ANALYSIS.md §1.1: "Incompatible Provider Interfaces" risk

### Remediation
Add to Phase 2.2:
- "Config validation includes cross-reference against provider capability matrix"
- Add acceptance criterion: "Invalid model/provider combinations are caught with clear error messages"
- Add to Phase 2.4: "Hot-reload re-validates config against provider capabilities"

---

## GAP-013 [MEDIUM] — Phase 3-5 Missing Connection to Unified Data Model Types

### Location
Phase 3-5 — Provider Registry & Protocol Translation

### Problem
The `ARCHITECTURE_ANALYSIS.md` §4.1 defines a **unified data model** with `ChatRequest`, `ChatResponse`, `ProviderAdapter` trait, `ModelId`, `ProviderId`, and `Capabilities`. The Master Plan Phase 1.2 imports core types but:
1. Phase 3.1 defines its own `AIProvider` trait — does this match the Architecture Analysis's `ProviderAdapter` trait?
2. Phase 5 defines its own request/response types — do they match the unified `ChatRequest`/`ChatResponse`?
3. There's no explicit mapping between the Architecture Analysis unified data model (§4.1) and the Master Plan's types

This creates risk of type drift where different phases implement different versions of the same concept.

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §4.1: Unified data model with ProviderAdapter trait, ChatRequest, ChatResponse
- Phase 3.1: AIProvider trait definition
- Phase 5: Request/response types for each protocol
- ARCHITECTURE_ANALYSIS.md §1.1: "No Shared Data Model" as HIGH risk — creating one now but need to ensure consistency

### Remediation
Add cross-phase type consistency check:
- Document the Architecture Analysis §4.1 data model as the **canonical reference** in Phase 1.2
- Add type mapping table in Phase 1.2 showing how each project's types map to unified model
- Add acceptance criteria to Phase 3.1 and Phase 5: "All types conform to unified data model defined in crates/core/"

---

## GAP-014 [MEDIUM] — Phase 3-5 Missing Integration with Security Architecture

### Location
Phases 3-5 (cross-cutting)

### Problem
The `ARCHITECTURE_ANALYSIS.md` §6.1 defines a **security architecture pipeline** that wraps every provider request:
```
Rate Limiter → Auth Gateway → Request Validator → Content Safety Checker → Router + Orchestrator → Provider Adapter Layer → Output Filter → Audit Logger
```

The Master Plan implements these pieces in isolation:
- Rate limiter: Phase 3 (in Additional Guidance)
- Auth: Phase 3 (scattered across adapter implementations)
- Content Safety: Phase 3.4 (Portkey guardrails partial)
- Output Filter: Not explicitly in Phases 1-5
- Audit Logger: Not in Phases 1-5

There's no **integration point** that chains these together into the security pipeline described in the Architecture Analysis.

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §6.1: Complete security architecture diagram
- ARCHITECTURE_ANALYSIS.md §6.2: Security controls table with 13 controls
- ARCHITECTURE_ANALYSIS.md §1.3: 7 security gaps identified

### Remediation
Add to Phase 3 or 4:
- `crates/security/src/pipeline.rs` — Security pipeline orchestrator
- Define middleware chain: RateLimit → Auth → Validate → Safety → Route → Translate → Output → Audit
- Add acceptance criterion: "All provider requests pass through the complete security pipeline"
- Move rate limiter from "Additional Guidance" to concrete Phase 3 deliverable

---

## GAP-015 [MEDIUM] — No Explicit Risk Register Integration in Plan

### Location
Cross-cutting — Project Management

### Problem
The `ARCHITECTURE_ANALYSIS.md` §8 defines a **Risk Register** with 5 identified risks (R1-R5) with probability, impact, RPN scores, owners, and mitigations. The Master Plan **never references this risk register** — not in any phase's acceptance criteria or implementation details.

Specifically:
- R1 (Language fragmentation, RPN 20): Phase 1 sets up CI but doesn't address the fragmentation risk
- R2 (Provider interface incompatibility, RPN 15): Phases 3-4 don't mention backward compat layer
- R3 (Binary size >100MB, RPN 9): No Phase mentions size budget tracking in CI
- R4 (Performance regression, RPN 8): Benchmarks exist but no CI baseline comparison
- R5 (Config migration corruption, RPN 10): Phase 2.5 migration tool mentions read-only but no backup-first requirement

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §8: Full risk register with RPN scores
- Master Plan: No risk register reference in any phase

### Remediation
Add risk mitigation tracking to each phase:
- Phase 1: "R1 mitigation: Containerized builds, unified build matrix tested in CI"
- Phase 3-4: "R2 mitigation: Backward compatibility layer for existing provider interfaces; A/B testing framework"
- Phase 2.5: "R5 mitigation: Config migration is read-only; original configs are never modified; automatic backup before migration"
- Cross-phase: "R3 mitigation: Binary size checked in CI; alert if >80MB uncompressed"
- Cross-phase: "R4 mitigation: Performance benchmarks tracked in CI with baseline comparison"

---

## GAP-016 [MEDIUM] — Phase 5 Missing Audio/Multimodal Protocol Translation

### Location
Phase 5 — Protocol Translation Layer

### Problem
The Master Plan Phase 5 implements translation for:
- OpenAI format (text + tools + images)
- Anthropic format (text + tools + thinking)
- Gemini format (text + tools + multimodal)
- Bidirectional engine

However, it **omits audio protocol translation**. The Architecture Analysis identifies dictation/Whisper as a key feature from Goose (§2.1), and Phase 5.1 mentions "handle multimodal content (images, audio as base64)" but:
1. There's no dedicated audio translation path
2. Whisper/audio providers need their own adapter pattern
3. Real-time audio streaming (WebSocket) is different from text streaming
4. The `crates/dictation/` crate is in Phase 1 structure but its protocol translation isn't defined in Phase 5

### Source Evidence
- Master Plan Phase 1.1: `crates/dictation/` listed
- Phase 5.1: Brief mention of "audio as base64"
- ARCHITECTURE_ANALYSIS.md §2.1: "Dictation (Whisper)" as component from Goose
- ARCHITECTURE_ANALYSIS.md §1.4: "gemini-cli context compression" — audio adds compression complexity

### Remediation
Add to Phase 5:
- `crates/gateway/src/translator/audio.rs` — Audio-specific translation (Whisper → text, TTS → audio)
- Update Phase 5.1: Explicit audio message format in OpenAI translation
- Update Phase 5.3: Gemini's audio File API handling
- Add acceptance criterion: "Audio messages are translated correctly across all formats"

---

## GAP-017 [LOW] — Phase 1 Missing `Packages` for Dashboard and Desktop Components

### Location
Phase 1 — TypeScript Workspace Structure (1.1)

### Problem
The Master Plan Phase 1 lists `packages/dashboard` and `packages/desktop-ui` but these are **source packages**, not the actual `apps/dashboard/` and `apps/desktop/` directories that produce runnable applications. The folder structure shows both `apps/` and `packages/` directories:
- `apps/dashboard/` — Next.js web app (runnable)
- `apps/desktop/` — Tauri desktop app (runnable)
- `packages/dashboard/` — React component library for dashboard
- `packages/desktop-ui/` — React component library for desktop

The Master Plan correctly lists `apps/` and `packages/` but the breakdown is incomplete — `apps/dashboard/` and `apps/desktop/` are empty (no files listed).

### Source Evidence
- Phase 1.1: `apps/dashboard/` and `apps/desktop/` listed in tree but with no files
- Phase 1.1: `packages/dashboard/` and `packages/desktop-ui/` listed

### Remediation
Add placeholder files for apps:
- `apps/dashboard/package.json` — Next.js app manifest
- `apps/dashboard/next.config.js` — Next.js config
- `apps/desktop/package.json` — Tauri app manifest
- `apps/desktop/tauri.conf.json` — Tauri configuration

---

## GAP-018 [LOW] — Phase 2 Config Templates Missing "Enterprise" Template

### Location
Phase 2.3 — Config CLI Commands

### Problem
Phase 2.3 mentions three config templates: `minimal.toml`, `standard.toml`, `enterprise.toml`. However, the enterprise template is **never defined** in the plan's implementation details. The minimal and standard template contents are described implicitly through the schema, but enterprise features (multi-tenant, SSO, billing, HA) are never specified.

### Source Evidence
- Phase 2.3: "crates/config/templates/enterprise.toml" listed in files
- No description of what enterprise config contains
- ARCHITECTURE_ANALYSIS.md §6.2: SSO/SAML, RBAC, HIPAA features are enterprise-level

### Remediation
Add enterprise template spec:
- `crates/config/templates/enterprise.toml` — Includes all features: SSO, RBAC, billing, HA clustering, audit logging, compliance settings
- Document difference between minimal/standard/enterprise in Phase 2.1

---

## GAP-019 [LOW] — Phase 4 Health Check Missing gRPC Support

### Location
Phase 4.4 — Provider Health Check System

### Problem
The Master Plan Phase 4.4 implements health checks via HTTP (`GET /v1/models` for OpenAI-compatible), but the Architecture Analysis §2.3 mentions "gRPC health check protocol" as a future consideration. Many enterprise providers (AWS Bedrock, GCP Vertex AI) use gRPC health checks.

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §2.3: Health check protocols
- Phase 4.4: Only HTTP health checks described

### Remediation
Low priority — note for future:
- Add `crates/gateway/src/health/grpc.rs` placeholder for gRPC health checks
- Add acceptance criterion: "HTTP health checks work; gRPC support is extensible"

---

## GAP-020 [LOW] — Missing `data/` Directory in Phase 1 Root Structure

### Location
Phase 1.1 — Root Directory Structure

### Problem
Phase 3 and 4 create data files under `data/providers/` (e.g., `data/providers/9router-providers.json`, `data/providers/unified-registry.json`), but the Phase 1.1 root structure doesn't include a `data/` directory. This directory should be part of the monorepo structure from day one.

### Source Evidence
- Phase 3.2: `data/providers/9router-providers.json`
- Phase 3.3: `data/providers/litellm-models.json`
- Phase 4.2: `data/providers/unified-registry.json`
- Phase 1.1: No `data/` directory in root structure

### Remediation
Add to Phase 1.1:
- `data/providers/` — Provider configuration data
- `data/providers/.gitkeep` — Ensure directory exists

---

## GAP-021 [LOW] — Phase 2.4 Hot-Reload Missing Watch Mode for Provider Discovery

### Location
Phase 2.4 — Config Hot-Reload and Watch Mode

### Problem
Phase 2.4 watches config files but **doesn't watch for provider changes** (e.g., new local Ollama model, new env var set). Phase 4.5 implements provider discovery as a one-time operation, but the config hot-reload system should also detect:
- New local providers appearing (Ollama/vLLM startup)
- Environment variable changes (new API key exported)
- Docker container changes (new provider service)

### Source Evidence
- Phase 2.4: File watching only
- Phase 4.5: One-time provider discovery
- ARCHITECTURE_ANALYSIS.md §1.2: "Connection Limits" — providers can appear/disappear

### Remediation
Add to Phase 2.4:
- "Config watcher can also watch for new local providers (Ollama, vLLM, LM Studio) via periodic health checks"
- "Environment variable changes trigger automatic provider config update"
- Add acceptance criterion: "New local providers are detected within 30 seconds"

---

## GAP-022 [LOW] — Phase 1-5 No Explicit Testing Strategy for Each Phase

### Location
Cross-cutting — Testing

### Problem
The `ARCHITECTURE_ANALYSIS.md` §5 defines a comprehensive **testing strategy** with a test pyramid (10,000+ unit, 2,000 component, 200 E2E), key test categories (10 categories), and a CI/CD pipeline. The Master Plan has acceptance criteria per phase but **no explicit testing plan**:
- No test count targets per phase
- No mention of which testing framework to use for each component
- No fuzz testing, chaos testing, or security testing in Phases 1-5
- The "tests/" directory is listed in Phase 1.1 but never populated

### Source Evidence
- ARCHITECTURE_ANALYSIS.md §5: Complete testing strategy
- Master Plan: Acceptance criteria only, no testing infrastructure
- ARCHITECTURE_ANALYSIS.md §1.5: "Testing disparity" — gemini-cli has 10k+ tests, 9Router has minimal tests

### Remediation
Add phase-specific testing requirements:

**Phase 1:**
- `tests/unit/core-types.test.ts` — Core type validation tests
- `tests/unit/config-parser.test.ts` — Config parsing tests

**Phase 2:**
- `tests/integration/config-migration.test.ts` — Migration tests for all 8 projects

**Phase 3:**
- `tests/unit/provider-adapters.test.ts` — Provider adapter tests with mocks
- `tests/integration/provider-health.test.ts` — Health check integration tests

**Phase 4:**
- `tests/unit/capability-matrix.test.ts` — Capability query tests
- `tests/integration/provider-discovery.test.ts` — Discovery integration tests

**Phase 5:**
- `tests/unit/translation-engine.test.ts` — Protocol translation tests
- `tests/integration/streaming-conversion.test.ts` — Streaming tests

---

## Priority Remediation Summary

| Priority | Count | Gap IDs |
|----------|-------|---------|
| **Must Fix Before Phase 1 Execution** | 4 | GAP-001, GAP-002, GAP-008, GAP-020 |
| **Must Fix Before Phase 2 Execution** | 3 | GAP-006, GAP-012, GAP-018 |
| **Must Fix Before Phase 3 Execution** | 5 | GAP-005, GAP-009, GAP-013, GAP-014, GAP-022 |
| **Must Fix Before Phase 4 Execution** | 4 | GAP-007, GAP-010, GAP-015, GAP-019 |
| **Must Fix Before Phase 5 Execution** | 4 | GAP-011, GAP-016, GAP-017, GAP-021 |
| **Low Priority (Note for Future)** | 2 | GAP-003, GAP-004 |

---

## Remediation Action Items for P1.md

The following edits must be applied to `MASTER_INTEGRATION_PLAN_30_PHASES_P1.md`:

### 1. Add `crates/installer/` to Phase 1.1 directory structure (GAP-001, GAP-008)
### 2. Add `crates/safety/` to Phase 1.1 directory structure (GAP-002, GAP-008)
### 3. Split `crates/gateway/` into focused crates in Phase 1.1 (GAP-008)
### 4. Add `data/` directory to Phase 1.1 (GAP-020)
### 5. Add `providers/` TS adapters directory to Phase 1.1 (GAP-005)
### 6. Add billing, SSO, routing.costs to Phase 2.1 schema (GAP-006)
### 7. Add enterprise config template description to Phase 2.3 (GAP-018)
### 8. Add provider-validation to Phase 2.2 config parser (GAP-012)
### 9. Add pricing merge strategy to Phase 3.3 (GAP-009)
### 10. Add unified error taxonomy as Phase 1.2 deliverable (GAP-010)
### 11. Add zero-copy optimization to Phase 5 (GAP-011)
### 12. Add audio translation to Phase 5 (GAP-016)
### 13. Add performance baseline reference to Phase 5 (GAP-007)
### 14. Add risk register integration to relevant phases (GAP-015)
### 15. Add testing strategy to each phase (GAP-022)
