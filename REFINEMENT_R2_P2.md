# Refinement Round 2: Gap Analysis — Phases 6-10 (P2.md)

> **Date**: 2026-07-02
> **Focus**: Missing features, strategies, implementations from source projects
> **Sources analyzed**: V3 server/, gemini-cli/packages (core, cli, a2a-server, sdk), skills/omniroute/, server/services/omniroute/

---

## Summary of Gaps Found

| Area | Gaps Found | Severity |
|------|-----------|----------|
| Phase 6 (Routing Core) | 6 major gaps | HIGH |
| Phase 7 (Advanced Routing) | 5 major gaps | HIGH |
| Phase 8 (Orchestration Core) | 6 major gaps | MEDIUM |
| Phase 9 (Advanced Orchestration) | 5 major gaps | HIGH |
| Phase 10 (Skill System) | 7 major gaps | HIGH |

---

## Phase 6 — Routing Engine Core: Gaps

### GAP 6-A: Missing gemini-cli's complete routing strategy system
**Source**: `gemini-cli/packages/core/src/routing/`

P2.md 6.1 only references litellm's Router Strategy Patterns. gemini-cli has a full production routing system with:
- `routingStrategy.ts` — Abstract routing strategy interface
- `modelRouterService.ts` — Full model routing service (135 lines) with provider selection
- `strategies/classifierStrategy.ts` — Classifier-based model routing (227 lines)
- `strategies/compositeStrategy.ts` — Composite strategy combining multiple strategies (122 lines)
- `strategies/fallbackStrategy.ts` — Fallback-specific routing (61 lines)
- `strategies/overrideStrategy.ts` — Configurable strategy overrides (53 lines)
- `strategies/numericalClassifierStrategy.ts` — Numerical threshold-based routing (248 lines)
- `strategies/gemmaClassifierStrategy.ts` — On-device Gemma classifier routing (246 lines)
- `strategies/approvalModeStrategy.ts` — Approval-based routing decisions (101 lines)
- `strategies/defaultStrategy.ts` — Default strategy fallback (43 lines)

**Impact**: Missing 10+ production-tested routing strategies that could directly integrate.

**Fix**: Add gemini-cli routing strategies as sources for 6.1 and 6.2. Include classifierStrategy and compositeStrategy as alternative routing patterns.

---

### GAP 6-B: Missing gemini-cli's availability/auto-routing fallback system
**Source**: `gemini-cli/packages/core/src/availability/`

- `modelAvailabilityService.ts` — Tracks which models/providers are available (148 lines)
- `modelPolicy.ts` — Model policy constraints (64 lines)
- `policyCatalog.ts` — Policy catalog for routing decisions (192 lines)
- `autoRoutingFallback.integration.test.ts` — Auto-routing fallback integration (417 lines)
- `fallbackIntegration.test.ts` — Fallback integration tests (115 lines)

**Impact**: Missing a production model availability service that auto-routes around unavailable models — essential for 6.4 (Fallback Chains).

**Fix**: Add modelAvailabilityService as a source for 6.4. Reference auto-routing fallback as a key pattern.

---

### GAP 6-C: Missing V3's existing llm-router.ts
**Source**: `server/src/services/llm-router.ts` (91 lines)

V3 already has a basic LLM router that's been operating. It should be a reference implementation for Phase 6.1.

**Fix**: Add llm-router.ts as a reference source for the Router interface.

---

### GAP 6-D: Missing OmniRoute's tagRouter.ts and comboResolver.ts
**Source**: `server/src/services/omniroute/domain/`

- `tagRouter.ts` (64 lines) — Tag-based routing strategy
- `comboResolver.ts` (106 lines) — Combo/ensemble resolution
- `costRules.ts` (631 lines) — Detailed cost calculation rules
- `fallbackPolicy.ts` (160 lines) — Fallback policy definitions

P2.md 6.3 mentions OmniRoute2's auto-combo but doesn't reference the existing V3 comboResolver.

**Fix**: Add tagRouter.ts and comboResolver.ts as sources for 6.3.

---

### GAP 6-E: Missing OmniRoute's connection model rules and model availability
**Source**: `server/src/services/omniroute/domain/`

- `connectionModelRules.ts` (82 lines) — Model-to-connection binding rules
- `modelAvailability.ts` (41 lines) — Model availability tracking
- `providerExpiration.ts` (255 lines) — Provider credential expiration management

These are existing production features that should inform the routing implementation.

**Fix**: Add these as supplementary sources for 6.1.

---

### GAP 6-F: Missing Portkey's actual middleware directory structure
**Source**: `server/src/services/unified-gateway/portkey/`

Portkey directory exists but is empty of actual middleware implementations. P2.md 6.4 references Portkey's fallback code at `portkey/src/middlewares/` but this code isn't present in the repository. The Portkey source exists only as shell files.

**Fix**: Flag that Portkey code needs to be sourced from the external Portkey repo (npm package). Reference the existing Portkey `globals.ts`, `start-server.ts`, and `utils.ts` as available code.

---

## Phase 7 — Advanced Routing: Gaps

### GAP 7-A: Missing gemini-cli's fallback handler
**Source**: `gemini-cli/packages/core/src/fallback/`

- `handler.ts` (194 lines) — Full fallback chain handler
- `types.ts` (58 lines) — Fallback types

P2.md 7.1-7.5 doesn't reference gemini-cli's fallback handler.

**Fix**: Add fallback handler as source for budget-aware routing and fallback integration.

---

### GAP 7-B: Missing OmniRoute's guardrails/resilience systems
**Source**: `server/src/services/omniroute/guardrails/`

- `promptInjection.ts` (285 lines) — Prompt injection detection
- `promptInjectionGuard.ts` (106 lines) — Guard implementation
- `piiMasker.ts` (208 lines), `piiSanitizer.ts` (416 lines) — PII handling
- `streamingPiiTransform.ts` (350 lines) — Real-time PII masking in streams
- `visionBridge.ts` (237 lines), `visionBridgeHelpers.ts` (499 lines) — Vision model routing
- `registry.ts` (282 lines) — Guardrail registry

**Source**: `server/src/services/omniroute/resilience/`
- `modelLockoutSettings.ts` (95 lines) — Model lockout configuration
- `settings.ts` (840 lines) — Resilience settings

These should inform quality-gate routing (7.2) and latency optimization (7.3).

**Fix**: Add guardrail registry and resilience settings as sources for 7.2 and 7.3.

---

### GAP 7-C: Missing OmniRoute's cost rules and degradation detection
**Source**: `server/src/services/omniroute/domain/`

- `costRules.ts` (631 lines) — Comprehensive cost calculation rules (per-model, per-provider, caching discounts)
- `degradation.ts` (253 lines) — Service degradation detection
- `quotaCache.ts` (529 lines) — Quota tracking and caching

These directly inform budget-aware routing (7.1) but aren't referenced.

**Fix**: Add costRules.ts and degradation.ts as sources for 7.1.

---

### GAP 7-D: Missing V3's guardrails system
**Source**: `server/src/services/guardrails.ts` (690 lines)

V3 has a comprehensive guardrails system that should inform quality-gate routing (7.2).

**Fix**: Add V3 guardrails.ts as a source for 7.2.

---

### GAP 7-E: Missing context-aware routing integration with gemini-cli's classifier strategies
P2.md 7.5 mentions context-aware routing as "Novel+gemini-cli" but doesn't reference:
- `classifierStrategy.ts` — Task-type classification for routing (227 lines)
- `numericalClassifierStrategy.ts` — Numerical threshold routing (248 lines)
- `gemmaClassifierStrategy.ts` — On-device classification (246 lines)

These are directly applicable to 7.5's complexity classifier.

**Fix**: Add gemini-cli classifier strategies as primary sources for 7.5.

---

## Phase 8 — Agent Orchestration Core: Gaps

### GAP 8-A: Missing V3's agent-runtime.ts
**Source**: `server/src/services/agent-runtime.ts` (721 lines)

V3 has a full agent runtime that orchestrates DAG execution, tool calls, and LLM interactions. P2.md doesn't reference this as a source for Phase 8.

**Fix**: Add agent-runtime.ts as a primary source for 8.1-8.3.

---

### GAP 8-B: Missing V3's message-bus.ts
**Source**: `server/src/services/message-bus.ts` (602 lines)

The message bus enables inter-agent communication, event-driven DAG steps, and pub/sub for workflow events. Critical for DAG execution coordination.

**Fix**: Add message-bus.ts as a source for 8.1 and 8.3.

---

### GAP 8-C: Missing V3's task-worker.ts and llm-scheduler.ts
**Source**: `server/src/services/task-worker.ts` (429 lines), `llm-scheduler.ts` (730 lines)

V3 already has production task workers and scheduler infrastructure that should inform 8.4.

**Fix**: Add task-worker.ts and llm-scheduler.ts as sources for 8.4.

---

### GAP 8-D: Missing gemini-cli's full scheduler system
**Source**: `gemini-cli/packages/core/src/scheduler/`

- `scheduler.ts` (961 lines) — Production scheduler with concurrent tool execution
- `confirmation.ts` (349 lines) — Tool confirmation/approval system
- `policy.ts` (285 lines) — Scheduling policy engine
- `state-manager.ts` (602 lines) — Tool execution state management
- `tool-executor.ts` (477 lines) — Individual tool execution
- `types.ts` (216 lines) — Scheduler types

P2.md 8.4 only references V3's basic cron scheduler and gemini-cli's scheduler. This full system is much more comprehensive.

**Fix**: Add the full gemini-cli scheduler system as sources for 8.4. Reference confirmation.ts and policy.ts for advanced scheduling features.

---

### GAP 8-E: Missing gemini-cli's context management pipeline
**Source**: `gemini-cli/packages/core/src/context/`

- `contextManager.ts` (493 lines) — Full context management
- `chatCompressionService.ts` (483 lines) — Chat compression
- `contextCompressionService.ts` (526 lines) — Context compression
- `pipeline.ts`, `orchestrator.ts` — Context pipeline orchestration
- `processors/` — Multiple context processors (truncation, distillation, masking)
- `utils/contextTokenCalculator.ts` — Token budget calculation

This directly informs session management (8.5) for context window management.

**Fix**: Add context management pipeline as source for 8.5 session context window management.

---

### GAP 8-F: Missing gemini-cli's agent-scheduler and agent-tool
**Source**: `gemini-cli/packages/core/src/agents/`

- `agent-scheduler.ts` (93 lines) — Agent-level task scheduling
- `agent-tool.ts` (282 lines) — Agents as tools (agent composition)
- `local-executor.ts` (1K lines) — Local agent execution engine

These enable agents to schedule tasks and be used as tools by other agents — essential for DAG orchestration (8.1).

**Fix**: Add agent-scheduler.ts and agent-tool.ts as sources for 8.1 and 8.3.

---

## Phase 9 — Advanced Orchestration: Gaps

### GAP 9-A: Missing gemini-cli's hook system
**Source**: `gemini-cli/packages/core/src/hooks/`

- `hookSystem.ts` (447 lines) — Complete hook lifecycle system
- `hookRegistry.ts` (356 lines) — Hook registration and discovery
- `hookRunner.ts` (561 lines) — Hook execution engine
- `hookPlanner.ts` (150 lines) — Hook planning/scheduling
- `hookAggregator.ts` (371 lines) — Hook result aggregation
- `hookTranslator.ts` (475 lines) — Hook event translation
- `trustedHooks.ts` (122 lines) — Trusted hook execution
- `types.ts` (748 lines) — Extensive hook type definitions

P2.md doesn't reference this for the self-improvement harness (9.2) or shadow daemon (9.3). The hook system provides the perfect mechanism for self-improvement observation and shadow daemon monitoring.

**Fix**: Add gemini-cli's complete hook system as a primary source for 9.2 and 9.3.

---

### GAP 9-B: Missing gemini-cli's policy engine
**Source**: `gemini-cli/packages/core/src/policy/`

- `policy-engine.ts` (949 lines) — Full policy evaluation engine
- `config.ts` (934 lines) — Policy configuration
- `toml-loader.ts` (748 lines) — TOML policy loading
- `integrity.ts` (154 lines) — Policy integrity checking
- `persistence.ts` (522 lines) — Policy persistence
- `shell-safety.ts` (539 lines) — Shell command security policies
- `policies/` — Multiple policy TOML definitions (agents, plan, read-only, write, yolo, sandbox)

This policy engine should inform the shadow daemon's remediation policies (9.3) and the agent registry's security constraints (9.5).

**Fix**: Add policy engine as source for 9.3 remediation policies and 9.5 agent security.

---

### GAP 9-C: Missing gemini-cli's full A2A client manager
**Source**: `gemini-cli/packages/core/src/agents/`

- `a2a-client-manager.ts` (291 lines) — A2A client lifecycle management
- `a2a-errors.ts` (206 lines) — A2A protocol error handling
- `a2aUtils.ts` (368 lines) — A2A protocol utilities
- `a2a-client-manager.test.ts` (570 lines)

P2.md 9.4 only references gemini-cli's a2a-server but not the client manager.

**Fix**: Add a2a-client-manager as a source for 9.4.

---

### GAP 9-D: Missing V3's p2p-swarm message-bus integration
**Source**: `server/src/services/p2p-swarm.ts` (187 lines), `message-bus.ts` (602 lines)

P2.md 9.1 references P2P swarm but doesn't mention the message-bus integration that V3 uses for swarm communication.

**Fix**: Add message-bus.ts as a dependency for 9.1.

---

### GAP 9-E: Missing gemini-cli's skill-extraction-agent
**Source**: `gemini-cli/packages/core/src/agents/skill-extraction-agent.ts` (490 lines)

This agent extracts skills from natural language conversations — directly relevant to the self-improvement harness (9.2) as a pattern for learning from execution history.

**Fix**: Add skill-extraction-agent.ts as a supplementary source for 9.2.

---

## Phase 10 — Skill System: Gaps

### GAP 10-A: Missing V3's skill-compiler.ts
**Source**: `server/src/services/skill-compiler.ts` (513 lines)

V3 has a full skill compilation pipeline that compiles TypeScript skills into executable bundles with dependency resolution and WASM support. P2.md 10.2 mentions copy-pasting skills but doesn't reference the existing compiler.

**Fix**: Add skill-compiler.ts as a primary source for 10.1 and 10.2.

---

### GAP 10-B: Missing V3's wasm-plugin-runtime.ts
**Source**: `server/src/services/wasm-plugin-runtime.ts` (387 lines)

V3 already supports WASM-based plugin/skill execution. P2.md 10.1 mentions WASM as an option for Python skills but doesn't reference the existing runtime.

**Fix**: Add wasm-plugin-runtime.ts as a source for 10.1.

---

### GAP 10-C: Missing OmniRoute's full skill system
**Source**: `server/src/services/omniroute/skills/`

- `executor.ts` (196 lines) — Skill execution engine
- `registry.ts` (398 lines) — Skill registry with CRUD
- `injection.ts` (307 lines) — Skill injection/interception
- `interception.ts` (343 lines) — Request/response interception for skills
- `sandbox.ts` (178 lines) — Skill sandboxing
- `builtins.ts` (493 lines) — Built-in skill definitions (40+ skills)
- `hybrid.ts` (67 lines) — Hybrid execution mode
- `types.ts` (61 lines) — Skill types

P2.md 10.2 mentions "40+ skills from V3" but doesn't reference the existing OmniRoute skill system which already has the registry, executor, and sandbox.

**Fix**: Add OmniRoute skill system as primary sources for 10.2.

---

### GAP 10-D: Missing gemini-cli's full skill system
**Source**: `gemini-cli/packages/core/src/skills/`

- `skillManager.ts` (213 lines) — Skill lifecycle management
- `skillLoader.ts` (192 lines) — Skill loading from filesystem
- `skillManagerAlias.ts` (178 lines) — Skill aliasing

**Source**: `gemini-cli/packages/cli/src/commands/skills/`
- `install.ts`, `uninstall.ts`, `list.ts`, `enable.ts`, `disable.ts`, `link.ts` — CLI skill management

**Source**: `gemini-cli/packages/cli/src/services/`
- `SkillCommandLoader.ts` (57 lines) — Skill command loading

P2.md 10.4 references gemini-cli's `.gemini/skills/` system but doesn't list the actual skill manager files.

**Fix**: Add gemini-cli skill manager and CLI commands as sources for 10.4.

---

### GAP 10-E: Missing V3's MCP registry
**Source**: `server/src/services/mcp-registry.ts` (547 lines)

MCP (Model Context Protocol) registry that handles tool registration, discovery, and execution. Skills should be able to register MCP tools.

**Fix**: Add mcp-registry.ts as a supplementary source for 10.2.

---

### GAP 10-F: Missing V3's plugin-manifest.ts
**Source**: `server/src/services/plugin-manifest.ts` (144 lines)

Plugin manifest parsing and validation system. Should inform the unified skill manifest schema (10.1).

**Fix**: Add plugin-manifest.ts as a source for 10.1.

---

### GAP 10-G: Missing gemini-cli's extension system
**Source**: `gemini-cli/packages/cli/src/config/`

- `extension-manager.ts` (1K lines) — Full extension lifecycle manager
- `extension.ts` (69 lines) — Extension entity
- `extensionRegistryClient.ts` (147 lines) — Extension registry client
- `extensions/` directory — Extension settings, updates, consent, enablement

**Source**: `gemini-cli/packages/core/src/config/`
- `extensions/integrity.ts` (324 lines) — Extension integrity verification

P2.md 10.5 mentions a marketplace but doesn't reference gemini-cli's existing extension registry client and integrity checking — directly applicable to the marketplace implementation.

**Fix**: Add extension registry client and integrity checker as sources for 10.5.

---

## APPLIED FIXES TO P2.md

The following edits have been applied to `MASTER_INTEGRATION_PLAN_30_PHASES_P2.md`:

1. **6.1**: Added gemini-cli routing strategies as sources (classifierStrategy, compositeStrategy, overrideStrategy, modelRouterService)
2. **6.2**: Added gemini-cli's gemmaClassifierStrategy and numericalClassifierStrategy as adaptive strategy sources
3. **6.3**: Added OmniRoute's tagRouter.ts and comboResolver.ts as sources
4. **6.4**: Added gemini-cli's availability/auto-routing fallback and modelAvailabilityService as sources
5. **7.1**: Added OmniRoute costRules.ts, degradation.ts, and gemini-cli fallback handler as sources
6. **7.2**: Added V3 guardrails.ts and OmniRoute guardrails registry as sources
7. **7.5**: Added gemini-cli classifier strategies as primary sources for context-aware routing
8. **8.1**: Added V3 agent-runtime.ts and message-bus.ts as sources
9. **8.2**: Added V3 pipeline-io.ts and pipeline-executor.ts as sources
10. **8.4**: Added gemini-cli full scheduler system (confirmation, policy, state-manager) as sources
11. **8.5**: Added gemini-cli context management pipeline as source for session context window management
12. **9.1**: Added V3 message-bus.ts integration as dependency
13. **9.2**: Added gemini-cli hook system and skill-extraction-agent as sources
14. **9.3**: Added gemini-cli policy engine and hook system as sources
15. **9.4**: Added gemini-cli a2a-client-manager as source
16. **10.1**: Added V3 skill-compiler.ts, wasm-plugin-runtime.ts, and plugin-manifest.ts as sources
17. **10.2**: Added OmniRoute skill system (executor, registry, sandbox) as primary sources
18. **10.4**: Added gemini-cli skillManager, skillLoader, and CLI commands as sources
19. **10.5**: Added gemini-cli extension registry client and integrity checker as sources

*See edit history in the document for exact change locations.*
