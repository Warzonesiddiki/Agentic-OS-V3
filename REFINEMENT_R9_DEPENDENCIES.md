# REFINEMENT R9 — Cross-Phase Dependency Analysis

**Date:** 2026-07-02  
**Focus:** Dependency graph accuracy, phase ordering, circular dependencies, parallelization  
**Files Analyzed:** P1 through P6 (30-Phase Master Integration Plan)

---

## Summary of Findings

| # | Severity | Category | Description |
|---|----------|----------|-------------|
| 1 | **Critical** | Missing Phase | "Phase 0 (Database)" referenced in P2 but never defined |
| 2 | **Critical** | Circular Dependency | Phase 12.5 (Streaming Transforms) ↔ Phase 14.4 (Guardrails) |
| 3 | **High** | Incorrect Next Links | P1's "Next" section lists wrong phases for Part 2 |
| 4 | **High** | Incorrect Next Links | P2's "Next" section lists wrong phases for Part 3 |
| 5 | **High** | Wrong Phase Name | P2 says Phase 1 = "Provider Registry" — actually Phase 3 |
| 6 | **High** | Wrong Phase Name | P2 says Phase 4 = "Streaming Engine" — actually Phase 12 |
| 7 | **High** | Wrong Phase Name | P2 says Phase 5 = "Guardrails" — actually Protocol Translation |
| 8 | **High** | Wrong Phase Ref | P4: Phase 18.1 depends on "Phase 13 (desktop foundation)" — Phase 13 is Auth |
| 9 | **High** | Wrong Phase Ref | P4: Phase 18.3 depends on "Phase 12 (local inference)" — Phase 12 is Streaming |
| 10 | **High** | Wrong Phase Ref | P4: Phase 18.5 depends on "Phase 20 (release eng)" — Phase 20 is Observability |
| 11 | **High** | Wrong Phase Ref | P4: Phase 19.1 depends on "Phase 15 (web dashboard base)" — Phase 15 is Billing |
| 12 | **High** | Wrong Phase Ref | P4: Phase 19.3 depends on "Phase 7 (billing)" — Phase 7 is Routing, billing is Phase 15 |
| 13 | **High** | Wrong Phase Ref | P4: Phase 19.5 depends on "Phase 7 (multi-tenant)" — multi-tenant is Phase 14 |
| 14 | **High** | Wrong Phase Ref | P4: Phase 20.1 depends on "Phase 9 (telemetry)" — Phase 9 is Agent Orchestration |
| 15 | **High** | Wrong Phase Ref | P4: Phase 17.3 depends on "Phase 11 (session mgmt)" — Phase 11 is Caching |
| 16 | **High** | Wrong Phase Ref | P4: Phase 16.3 depends on "Phase 11 (ACP)" — Phase 11 is Caching |
| 17 | **High** | Wrong Phase Ref | P5: Phase 21 depends on "Phase 6 (Local Inference)" — Phase 6 is Routing |
| 18 | **High** | Wrong Phase Ref | P5: Phase 21.4 depends on "Phase 20 (Gateway completion)" — Phase 20 is Observability |
| 19 | **High** | Wrong Phase Ref | P6: Phase 26 depends on "Phase 20 (Provider Gateway)" — Phase 20 is Observability |
| 20 | **Medium** | Wrong Phase Ref | P5: Phase 22 depends on "Phase 3 (ACP Server)" — Phase 3 is Provider Registry |
| 21 | **Medium** | Wrong Phase Ref | P5: Phase 23 depends on "Phase 4 (Recipe & Skill)" — Phase 4 is Provider Registry Completion |
| 22 | **Medium** | Mismatched arrow | P5: Phase 21 → Phase 26 called "Performance Optimization" — Phase 26 is IDE Tooling |
| 23 | **Low** | P3: "Translator (Phase 2)" | P1 Phase 2 is Config System, not Translator |
| 24 | **Low** | P3: "Phase 3 (Streaming in existing)" | P1 Phase 3 is Provider Registry Core, not Streaming |
| 25 | **Low** | P3: "Provider Registry (Phase 1)" | P1 Phase 1 is Foundation, not Provider Registry |
| 26 | **Low** | Missing Phase 0 definition | Add Phase 0: Infrastructure & Database to P1 |

---

## Issue Details

### CRITICAL: Issue #1 — Missing Phase 0 (Database/Infrastructure)

**Location:** P2 line 1575, P3 lines 1423-1455  
**Problem:** P2's cross-phase dependencies say `Phase 8 depends on: Phase 0 (Database)`. P3 subphases 11.1, 15.3 reference "Infrastructure (Redis, SQLite)" and "Distributed Redis". But **Phase 0 is never defined** in P1 (which covers Phases 1-5 only).

**Fix:** Either:
- (A) Add Phase 0 to the beginning of P1, covering: Database setup (SQLite schema, PostgreSQL support), Redis configuration, Secrets Vault, and base infrastructure
- (B) Renumber Phases 1-5 to 0-4 and shift all subsequent phases down by 1

**Recommendation:** Option A — Add Phase 0 to P1.

### CRITICAL: Issue #2 — Circular Dependency: Phase 12.5 ↔ Phase 14.4

**Location:** P3, Cross-Phase Dependency Map  
**Problem:** 
- Phase 12.5 (Streaming Transforms) `depends on: 12.1, Guardrails (Phase 14.4)`
- Phase 14.4 (Guardrails) `depends on: 12.5, Plugin System (Phase 10)`

These two subphases depend on each other — a classic circular dependency.

**Fix:** Split the guardrails interface from the implementation:
1. Phase 12.5 should depend on the **Guardrails Interface** (defined early in Phase 14 before 14.4)
2. Phase 14.4 should implement the guardrails engine using the streaming transform hooks from Phase 12.5
3. Update Phase 14.4 dependency to: `depends on: 13.1, Plugin System (Phase 10), Streaming Transform Interface (12.5)`
4. Update Phase 12.5 dependency to: `depends on: 12.1, Guardrails Interface (14.1)`

Or alternatively, move guardrails implementation earlier (Phase 5 or Phase 7) to break the cycle.

### HIGH: Issue #3 — P1 "Next" Section Lists Wrong Phases

**Location:** P1, lines 1742-1747  
**Current text:**
```
Next: Part 2 will cover Phases 6–10 including:
- Phase 6: Agent Orchestration Core
- Phase 7: ACP Server Implementation
- Phase 8: MCP Registry & Tool System
- Phase 9: CLI & TUI Implementation
- Phase 10: Desktop Application & Dashboard
```

**Correct P2 content:**
```
Part 2 covers Phases 6-10:
- Phase 6: Routing Engine — Core
- Phase 7: Routing Engine — Advanced Strategies
- Phase 8: Agent Orchestration — Core
- Phase 9: Agent Orchestration — Advanced
- Phase 10: Skill System — Unified
```

### HIGH: Issue #4 — P2 "Next" Section Lists Wrong Phases

**Location:** P2, near the end  
**Current text:** "Next: Proceed to PART 3 (Phases 11-15: Recipe Engine, Local Inference, Desktop, CLI/TUI, Dashboard)"

**Correct P3 content:**
```
Part 3 covers Phases 11-15:
- Phase 11: Caching & Performance Layer
- Phase 12: Streaming Engine
- Phase 13: Auth & Security — Core
- Phase 14: Auth & Security — Advanced
- Phase 15: Billing, Quotas & Rate Limiting
```

### HIGH: Issues #5-7 — Wrong Phase Names in P2 Dependencies

**Location:** P2, Cross-Phase Dependencies section (around line 1566)

| Current | Should Be |
|---------|-----------|
| Phase 1 (Provider Registry) | Phase 3 (Provider Registry — Core) |
| Phase 4 (Streaming Engine) | Phase 12 (Streaming Engine) — but this is in Part 3! |
| Phase 5 (Guardrails) | No existing phase maps to "Guardrails" — Guardrails are in Phase 14.4 |

**Analysis:** The dependency should reference:
- Actually Phase 6 depends on **Phase 3 (Provider Registry — Core)** for provider registry, not Phase 1
- For streaming, Phase 6 may need basic streaming capability from **Phase 5 (Protocol Translation Layer)** which includes streaming format conversion, not from Phase 4
- Guardrails don't exist yet at Phase 7's position — Phase 7 should depend on the guardrails interface that could be defined earlier

### HIGH: Issues #8-16 — Wrong Phase References in P4

**Location:** P4, Phase Dependency Graph (lines 1762-1827)

| Line | Current Ref | Correct Ref | Reason |
|------|-------------|-------------|--------|
| 18.1 | Phase 13 (desktop foundation) | Phase 18 is the Desktop phase itself | Desktop foundation is Phase 18, not an earlier phase |
| 18.3 | Phase 12 (local inference) | Phase 21 (Local & Edge Inference) | Local inference is in Part 5 |
| 18.5 | Phase 20 (release eng) | Phase 29 (Production Hardening) | Release engineering is Phase 29 |
| 19.1 | Phase 15 (web dashboard base) | No earlier phase is "web dashboard base" | Dashboard IS Phase 19; 19.1 is the first subphase |
| 19.3 | Phase 7 (billing) | Phase 15 (Billing, Quotas & Rate Limiting) | Billing is Phase 15 |
| 19.5 | Phase 7 (multi-tenant) | Phase 14.2 (Multi-Tenant) | Multi-tenant is Phase 14 subphase |
| 20.1 | Phase 9 (telemetry) | Phase 6-10 routing/agent telemetry outputs | Should reference earlier telemetry outputs, not a specific phase |
| 17.3 | Phase 11 (session mgmt) | Phase 8 (Session Manager is 8.5) | Session management is Phase 8.5 |
| 16.3 | Phase 11 (ACP) | ACP Server is not yet defined as a distinct phase | Should reference Phase 8 or be defined separately |

### HIGH: Issues #17-19 — Wrong Phase References in P5-P6

**P5, Cross-Phase Dependencies:**
- Phase 21.1/21.2 ← "Phase 6 (Local Inference foundation)" → Should be: No prior phase covers local inference; Phase 21 IS the Local Inference phase
- Phase 21.4 ← "Phase 20 (Gateway completion)" → Should reference Phase 5 (Protocol Translation Layer) or routing phases 6-7

**P6, Phase 26 dependencies:**
- "Phase 20 (Provider Gateway completion)" → Should reference Phases 6-7 (Routing Engine) and Phase 5 (Protocol Translation)

### MEDIUM: Issues #20-21 — Wrong Phase Refs in P5

- Phase 22 depends on "Phase 3 (ACP Server)" → P1 Phase 3 is Provider Registry Core. Should reference Phase 8 (Agent Orchestration Core which includes ACP server) or define ACP as part of the gateway/agent runtime
- Phase 23 depends on "Phase 4 (Recipe & Skill)" → P1 Phase 4 is Provider Registry Completion. Recipe & Skill is Phase 10 and Phase 23 itself

### MEDIUM: Issue #22 — Phase 21 → 26 Arrow Mislabeled

P5 shows `Phase 21 → Phase 26 (Performance Optimization)` but P6 Phase 26 is "IDE & Developer Tooling Integration". Performance optimization is within Phase 30.

### LOW: Issues #23-25 — Phase Name Mismatches in P3

P3 references:
- "Translator (Phase 2)" → P1 Phase 2 is "Unified Configuration System"
- "Phase 3 (Streaming in existing)" → P1 Phase 3 is "Provider Registry — Core"  
- "Provider Registry (Phase 1)" → P1 Phase 1 is "Foundation & Monorepo Bootstrap"

---

## Circular Dependency Analysis

| Cycle | Phases | Severity | Resolution |
|-------|--------|----------|------------|
| 12.5 ↔ 14.4 | Streaming Transforms ↔ Guardrails | Critical | Split interface from implementation |
| None found | Phase 6-10 | None | Linear: 6→7→8→9→10 |
| None found | Phase 11-15 | None | Linear with subphase branches |
| None found | Phase 16-20 | None | Branches but no cycles |
| None found | Phase 21-25 | None | Linear: 21→22→23→24→25 |
| None found | Phase 26-30 | None | Linear: 26→27→28→29→30 |

**Verdict:** Only one circular dependency found (12.5 ↔ 14.4).

---

## Dependency Ordering Check

| Assertion | Status | Notes |
|-----------|--------|-------|
| Phase N can be done without Phase N-1? | ❌ Most cannot | Phases 6-10 are sequential; Phase 8 requires 6-7; Phase 9 requires 8 |
| Phase N depends only on earlier phases? | ❌ Broken | P4 references Phase 13 (Auth) as "desktop foundation" — desktop (Phase 18) should come after auth |
| No forward references? | ❌ Broken | P5's Phase 21 references "Phase 26" which is 5 phases ahead |
| Subphase ordering internally consistent? | ⚠️ Most are | P3's Phase 12.5 ↔ 14.4 is problematic |

---

## Parallelization Opportunities

| Phase Group | Can Run Alongside | Rationale |
|-------------|-------------------|-----------|
| Phase 11 (Caching) | Phase 12 (Streaming) | Independent concerns; cache can support streaming |
| Phase 13 (Auth Core) | Phase 15 (Billing) | Auth is prerequisite for billing, but basic billing design can start alongside |
| Phase 16 (CLI) | Phase 17 (TUI) | Shared Rust libs, but independent rendering |
| Phase 16-17 (CLI/TUI) | Phase 19 (Dashboard) | Web and terminal UIs are independent teams |
| Phase 18 (Desktop) | Phase 19 (Dashboard) | Tauri vs Next.js, different stacks |
| Phase 20 (Observability) | Phase 16-19 | Observability instruments services as they're built |
| Phase 21 (Local Inference) | Phase 22 (MCP) | Independent systems |
| Phase 23 (Extension) | Phase 25 (Sandbox) | Extensions need sandboxing, but basic extension system can start before sandbox |
| Phase 24 (Voice) | Phase 23 (Extension) | Voice input is independent of extension system |
| **Phase 11-15** | **Phase 16-20** | Backend infrastructure vs frontend UIs — fully parallelizable! |
| **Phase 21-23** | **Phase 24-25** | Independent feature tracks |

**Recommended Parallel Execution Tracks:**
```
Track A (Backend Infra):  Phases 1-5 → 6-7 → 8-10 → 11-15 → 26-27 → 28 → 29 → 30
Track B (User Interfaces):          → 16-17 → 18-20 (can start after Phase 5)
Track C (Advanced Features):                 → 21-23 → 24-25 (can start after Phase 10)
```

---

## Corrected Dependency Graph

```
Phase 0 [NEW]: Infrastructure & Database (SQLite, Redis, Vault)
  └── provides: DB client, Redis client, Secrets Vault → used by ALL phases

Phase 1: Foundation & Monorepo Bootstrap
  └── depends on: nothing
  └── provides: Monorepo, CI/CD, shared types → used by ALL phases

Phase 2: Unified Configuration System
  └── depends on: Phase 1
  └── provides: Config parser, CLI, hot-reload → used by ALL phases

Phase 3: Provider Registry — Core
  └── depends on: Phase 1, Phase 2
  └── provides: Provider adapters → used by Phase 4, Phase 5, Phase 6, Phase 15

Phase 4: Provider Registry — Completion
  └── depends on: Phase 3
  └── provides: Full provider registry (250+), health checks → used by Phase 5, Phase 6

Phase 5: Protocol Translation Layer
  └── depends on: Phase 3, Phase 4
  └── provides: Protocol adapters (OpenAI, Anthropic, Gemini), streaming format conversion
  └── provides: Streaming transform hooks (interface for guardrails) → used by Phase 6, Phase 12

Phase 6: Routing Engine — Core
  └── depends on: Phase 3 (Provider Registry), Phase 5 (Protocol Translation + streaming)
  └── provides: Router interface → used by Phase 7, Phase 9

Phase 7: Routing Engine — Advanced Strategies
  └── depends on: Phase 6, Phase 3, Phase 5
  └── provides: Budget, Quality, Context-aware routing → used by Phase 10, Phase 15

Phase 8: Agent Orchestration — Core
  └── depends on: Phase 6-7, Phase 0 (Database)
  └── provides: DAG, Pipeline, Scheduler, Sessions, ACP Server → used by Phase 9, Phase 10, Phase 16-17, Phase 22

Phase 9: Agent Orchestration — Advanced
  └── depends on: Phase 8, Phase 6-7
  └── provides: Swarm, Self-improvement, A2A, Registry → used by Phase 10, Phase 20

Phase 10: Skill System — Unified
  └── depends on: Phase 8 (Session context), Phase 6-7 (Routing)
  └── provides: Unified skill runtime → used by Phase 11, Phase 14, Phase 16-19, Phase 23

Phase 11: Caching & Performance Layer
  └── depends on: Phase 0 (Redis, SQLite), Phase 3 (embeddings for semantic cache)
  └── provides: Multi-tier cache, semantic cache, warming → used by Phase 12, Phase 15

Phase 12: Streaming Engine
  └── depends on: Phase 5 (Streaming hooks), Phase 2 (Translator)
  └── 12.5 (Transforms) depends on: Guardrails Interface (defined in Phase 14.1)
  └── provides: SSE, WebSocket, TCP/gRPC streaming, transforms → used by Phase 14.4, Phase 17

Phase 13: Auth & Security — Core
  └── depends on: Phase 0 (Vault), Phase 2 (Config)
  └── provides: Auth interface, OAuth, API Keys → used by Phase 14, Phase 18 (settings), Phase 22

Phase 14: Auth & Security — Advanced
  └── depends on: Phase 13, Phase 10 (Plugin System)
  └── 14.1 defines Guardrails Interface → used by Phase 12.5
  └── 14.4 (Guardrails Implementation) depends on: 12.5 (Streaming Transform Hooks), Phase 10
  └── provides: RBAC, Multi-tenant, SSO, Guardrails, Audit → used by Phase 15, Phase 19

Phase 15: Billing, Quotas & Rate Limiting
  └── depends on: Phase 3 (Provider Registry), Phase 12.5 (Token Counting), Phase 14 (RBAC/Multi-tenant)
  └── provides: Billing plans, quotas, rate limiting, analytics → used by Phase 19

Phase 16: CLI & Terminal Experience
  └── depends on: Phase 1-5 (monorepo, providers), Phase 8 (ACP), Phase 2 (Config)
  └── provides: Rust CLI, Ink CLI, completions, theming → used by Phase 17

Phase 17: TUI & Interactive Experience
  └── depends on: Phase 16 (Rust CLI libs), Phase 8 (Session/A CP), Phase 12 (Streaming)
  └── provides: Ratatui TUI, Ink TUI, session viewer, multi-session

Phase 18: Desktop Application
  └── depends on: Phase 17 (shared Rust libs), Phase 13 (Auth/Security for settings), Phase 2 (Config theming)
  └── 18.3 (Offline Mode) depends on: Phase 21 (Local Inference)
  └── 18.5 (Auto-Update) depends on: Phase 29 (Release Engineering)
  └── provides: Tauri desktop, tray, offline mode, settings, auto-update

Phase 19: Web Dashboard
  └── depends on: Phase 13 (Auth for login), Phase 15 (Billing), Phase 14 (Multi-tenant), Phase 20 (Observability)
  └── provides: Provider UI, analytics/billing, monitoring, user management

Phase 20: Observability
  └── depends on: Phase 9 (Telemetry from agents), Phase 6-7 (Routing telemetry), Phase 3 (Provider telemetry)
  └── provides: Tracing, metrics, logging, health checks, alerting

Phase 21: Local & Edge Inference
  └── depends on: Phase 5 (Protocol Translation for OpenAI-compatible serving)
  └── provides: llama.cpp, LiteRT, MLX backends, hybrid router → used by Phase 18 (Offline), Phase 24 (Voice), Phase 26

Phase 22: MCP & Tool Ecosystem
  └── depends on: Phase 8 (ACP Server), Phase 13 (Auth/OAuth)
  └── provides: MCP client, tool execution, OAuth, registry → used by Phase 24 (Computer control)

Phase 23: Extension & Recipe System
  └── depends on: Phase 10 (Skill System), Phase 25 (Sandbox for security)
  └── provides: WASM extensions, YAML recipes, hooks, marketplace, versioning

Phase 24: Voice & Multimodal
  └── depends on: Phase 21 (Whisper/STT), Phase 22 (MCP for computer control)
  └── provides: Dictation, TTS, multimodal input, computer control

Phase 25: Sandbox & Security Isolation
  └── depends on: Phase 22 (MCP security integration), Phase 23 (Extension sandbox)
  └── provides: WASM sandbox, filesystem sandbox, container sandbox, policy engine

Phase 26: IDE & Developer Tooling
  └── depends on: Phase 23 (Extension System), Phase 25 (Sandbox)
  └── provides: VS Code companion, IDE detection, DevTools, SDK

Phase 27: Testing & QA Framework
  └── depends on: Phase 26 (SDK exposes testable API), Phase 20 (Gateway for integration tests)
  └── provides: Testing infra, behavioral evals, regression, chaos, benchmarks

Phase 28: AI-Assisted Development
  └── depends on: Phase 26 (IDE), Phase 27 (Evals for validation)
  └── provides: Self-improvement harness, code review, docs generation, CI integration, BEDD

Phase 29: Production Hardening
  └── depends on: Phase 23 (Extensions/Recipes), Phase 25 (Sandbox)
  └── provides: Single binary, cross-platform installer, auto-update, first-run, diagnostics

Phase 30: Final Integration, Stabilization & Launch
  └── depends on: ALL prior phases
  └── 30.3 (Load Testing) depends on: Phase 29 (Full system for realistic load)
  └── provides: E2E testing, security audit, load testing, docs, v1.0.0 release
```

---

## Corrected Phase-to-Part Mapping

| Part | Phases | Content |
|------|--------|---------|
| Part 1 (P1) | Phases 0-5 | Foundation, Config, Provider Registry (Core+Completion), Protocol Translation |
| Part 2 (P2) | Phases 6-10 | Routing Engine (Core+Advanced), Agent Orchestration (Core+Advanced), Skill System |
| Part 3 (P3) | Phases 11-15 | Caching & Performance, Streaming Engine, Auth & Security (Core+Advanced), Billing |
| Part 4 (P4) | Phases 16-20 | CLI, TUI, Desktop, Web Dashboard, Observability |
| Part 5 (P5) | Phases 21-25 | Local Inference, MCP Ecosystem, Extension & Recipe, Voice & Multimodal, Sandbox |
| Part 6 (P6) | Phases 26-30 | IDE & Dev Tooling, Testing & QA, AI-Assisted Dev, Production Hardening, Launch |

---

## Recommendation Summary

1. **Add Phase 0 (Infrastructure & Database)** to P1 — covers SQLite schema, Redis, Secrets Vault
2. **Fix the circular dependency** between Phase 12.5 and Phase 14.4 by splitting interface from implementation
3. **Correct all phase label references** in P2, P3, P4, P5, P6 to match actual phase content
4. **Fix "Next" section** in P1 and P2 to accurately describe upcoming content
5. **Adopt parallel execution tracks** to reduce delivery time (backend, frontend, advanced features can run concurrently)
6. **Add Phase 0 definition** as a new section at the start of P1

---

## Files to Fix

1. `MASTER_INTEGRATION_PLAN_30_PHASES_P1.md` — Fix "Next" section, add Phase 0 placeholder
2. `MASTER_INTEGRATION_PLAN_30_PHASES_P2.md` — Fix "Next" section, fix phase name refs in dependencies
3. `MASTER_INTEGRATION_PLAN_30_PHASES_P3.md` — Fix circular dependency 12.5 ↔ 14.4, fix phase name refs
4. `MASTER_INTEGRATION_PLAN_30_PHASES_P4.md` — Fix all phase refs in dependency graph
5. `MASTER_INTEGRATION_PLAN_30_PHASES_P5.md` — Fix phase refs in cross-phase dependencies
6. `MASTER_INTEGRATION_PLAN_30_PHASES_P6.md` — Fix phase refs in dependencies section
