# MASTER INTEGRATION PLAN — PART 6: Phases 26–30
## Agentic OS V4 — The Universal Agent Operating System

**Document Version**: 1.0
**Date**: 2026-07-02
**Author**: Agentic OS V4 Integration Team

---

## Overview

This document is **Part 6** of the 30-Phase Master Integration Plan for merging **8 projects** into **Agentic OS V4**:

1. **Goose** — Agent runtime (ACP server, CLI/TUI, Extensions, Recipes, Local inference, MCP, Dictation, Computer control)
2. **gemini-cli** — VS Code companion, IDE detection, devtools, SDK, testing (Vitest), evals (behavioral, memory, perf), code review skill, docs-writer, CI skill, sea-launcher for binary
3. **Agentic OS V3** — Self-improvement harness, DAG/Pipeline/Graph orchestration, WASM sandbox, P2P swarm
4. **9Router** — Universal AI gateway, Dashboard, 100+ providers, protocol translation, MITM proxy, SSE streaming
5. **OmniRoute2** — Advanced routing, combo routing, cost optimization, skills, i18n
6. **LiteLLM** — Python LLM gateway, Proxy, Routing strategies, Caching, Guardrails, Budgets
7. **New-API** — Go AI gateway, Channel management, Billing, Relay, Multi-tenant, Load balancing
8. **Portkey** — TypeScript gateway, 50+ providers, Guardrail plugins, Caching, Fallbacks, Observability

**Part 6** covers **Phases 26–30**, the final phases of the integration plan. These phases focus on **developer experience, testing excellence, AI-assisted development workflows, production hardening, and the final launch**. After Phase 30, the document concludes with a **Post-Launch Roadmap** outlining the evolution from v1.0 through v2.0.

---

## Navigation

| Part | Phases | File |
|------|--------|------|
| PART 1 | Phases 0–5 | `MASTER_INTEGRATION_PLAN_30_PHASES_P1.md` |
| PART 2 | Phases 6–10 | `MASTER_INTEGRATION_PLAN_30_PHASES_P2.md` |
| PART 3 | Phases 11–15 | `MASTER_INTEGRATION_PLAN_30_PHASES_P3.md` |
| PART 4 | Phases 16–20 | `MASTER_INTEGRATION_PLAN_30_PHASES_P4.md` |
| PART 5 | Phases 21–25 | `MASTER_INTEGRATION_PLAN_30_PHASES_P5.md` |
| **PART 6** | **Phases 26–30** | **`MASTER_INTEGRATION_PLAN_30_PHASES_P6.md`** (this file) |

---

## Architecture Overview (Phases 26-30 Focus)

```
PHASES 26-27: DEV TOOLING & TESTING              PHASES 28-29: AI-DEV & HARDENING
┌─────────────────────────────────────┐          ┌─────────────────────────────────────┐
│                                     │          │                                     │
│  ┌──────────┐  ┌────────────────┐   │          │  ┌──────────┐  ┌────────────────┐   │
│  │ VS Code  │  │ IDE Detection  │   │          │  │Self-Imp. │  │ Code Review    │   │
│  │Companion │  │ (detect-ide,   │   │          │  │ Harness   │  │ (gemini-cli    │   │
│  │(vscode-  │  │ ide-client,    │   │          │  │(V3)       │  │  skill)        │   │
│  │ide-comp) │  │ ide-installer) │   │          │  └─────┬─────┘  └──────┬─────────┘   │
│  └────┬─────┘  └───────┬────────┘   │          │        └──────┬────────┘             │
│       └────────┬───────┘             │          │               ▼                      │
│                ▼                     │          │  ┌────────────────────────┐          │
│  ┌─────────────────────────┐         │          │  │   AI-Dev Workflow      │          │
│  │  DevTools Panel         │         │          │  │   (CI skill, docs-     │          │
│  │  Network/Console Insp.  │         │          │  │    writer, behav-evals)│          │
│  │  (gemini-cli devtools)  │         │          │  └────────────────────────┘          │
│  └─────────────────────────┘         │          │                                     │
│  ┌─────────────────────────┐         │          │  ┌──────────┐  ┌────────────────┐   │
│  │  @-reference + SDK      │         │          │  │  Binary  │  │ Auto-Update    │   │
│  │  (atCommandUtils,       │         │          │  │Packaging │  │ + Rollback     │   │
│  │   tool-jit-context)     │         │          │  │(sea-     │  │ (Goose Rust)   │   │
│  └─────────────────────────┘         │          │  │ launcher)│  └──────┬─────────┘   │
│  ┌─────────────────────────┐         │          │  └─────┬─────┘        │             │
│  │  Testing Framework      │         │          │        └──────┬────────┘             │
│  │  (Vitest, integ, mem,   │         │          │               ▼                      │
│  │   perf, evals)          │         │          │  ┌────────────────────────┐          │
│  └─────────────────────────┘         │          │  │  Cross-Platform        │          │
│                                     │          │  │  Installer (.exe/.msi, │          │
└─────────────────────────────────────┘          │  │  .app/.dmg, .deb/rpm)  │          │
                                                 │  └────────────────────────┘          │
                                                 │                                     │
                                                 └─────────────────────────────────────┘

PHASE 30: FINAL INTEGRATION & LAUNCH
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────┐ │
│  │  E2E Tests   │  │ Security     │  │ Performance  │  │ Documentation│  │v1.0.0 │ │
│  │  8-codebase  │  │ Audit &      │  │ Optimization │  │ User Guide   │  │Release│ │
│  │  integration │  │ Pen Testing  │  │ 1000+ req/s  │  │ API Ref +    │  │Launch │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └───────┘ │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘

POST-LAUNCH ROADMAP
v1.1 ──► v1.2 ──► v1.3 ──► v1.5 ──► v2.0
Plugin    Enterprise   Mobile     Federated   AI-native OS
Marketplace SSO/Audit  Companion  Multi-     Self-optimizing
                         App       Cluster    Routing
```

---

## Phase 26: IDE & Developer Tooling Integration
**Duration**: 6 weeks
**Dependencies**: Phase 20 (Provider Gateway completion), Phase 21 (Local Inference foundation)
**Overall Risk**: MEDIUM — Multiple IDE formats, VS Code API compatibility, cross-platform path handling

### Overview
Phase 26 integrates gemini-cli's rich developer tooling ecosystem into Agentic OS V4, transforming it from a headless agent operating system into a full-featured development platform with IDE integration, debugging tools, and a first-class SDK. This phase brings the VS Code extension companion, IDE detection and auto-configuration, a devtools panel for network/console inspection, @-reference resolution for context-aware file linking, and a comprehensive SDK for third-party integrations. The result is a developer platform where AI assistance is seamlessly embedded into the existing development workflow.

---

#### Subphase 26.1: Import gemini-cli VS Code IDE Companion Extension
**Week**: 1
**Description**: Port gemini-cli's VS Code extension (`packages/vscode-ide-companion/`) into the unified monorepo as the official Agentic OS V4 IDE companion. This extension provides deep VS Code integration including a sidebar panel for agent interactions, inline code suggestions, file-level context sharing between the IDE and the agent, diff-based code editing with preview, and seamless terminal integration. The existing extension communicates with the agent CLI via a local WebSocket server (`ide-server.ts`), enabling real-time bidirectional communication. Key components include the extension activation and registration (`extension.ts`), the WebSocket server for agent communication (`ide-server.ts`), the open files manager for context tracking (`open-files-manager.ts`), and the diff manager for safe code modifications (`diff-manager.ts`). This subphase adapts the extension to work with the unified `@agentic-os/core` package rather than gemini-cli's proprietary core, updates the extension packaging to publish under the `agentic-os` publisher ID, and ensures compatibility with VS Code 1.85+ and Cursor/VS Code forks.

**Copy Source**: `gemini-cli/packages/vscode-ide-companion/` → `packages/ide/vscode-companion/`

**Key Files to Create/Modify**:
- `packages/ide/vscode-companion/package.json` — Extension manifest with publisher `agentic-os`, activation events, contributes
- `packages/ide/vscode-companion/src/extension.ts` — Extension activation, command registration, sidebar provider (from extension.ts)
- `packages/ide/vscode-companion/src/ide-server.ts` — WebSocket server for agent↔IDE communication (from ide-server.ts)
- `packages/ide/vscode-companion/src/open-files-manager.ts` — Open file tracking, context gathering (from open-files-manager.ts)
- `packages/ide/vscode-companion/src/diff-manager.ts` — Safe diff-based code editing with undo (from diff-manager.ts)
- `packages/ide/vscode-companion/src/panel/agent-sidebar.ts` — Sidebar webview panel for agent chat
- `packages/ide/vscode-companion/src/panel/inline-suggest.ts` — Inline code suggestion provider
- `packages/ide/vscode-companion/src/panel/diagnostics.ts` — Diagnostics integration for error sharing
- `packages/ide/vscode-companion/src/commands/agent-commands.ts` — VS Code command palette entries
- `packages/ide/vscode-companion/src/commands/code-actions.ts` — Code action providers (refactor, explain, fix)
- `packages/ide/vscode-companion/src/commands/hover-provider.ts` — Hover provider for AI-powered tooltips
- `packages/ide/vscode-companion/src/commands/completion-provider.ts` — Inline completion provider
- `packages/ide/vscode-companion/src/decorations/` — Text decoration renderers for agent highlights
- `packages/ide/vscode-companion/src/status-bar.ts` — Status bar indicator for agent connection state
- `packages/ide/vscode-companion/assets/icon.png` — Extension icon (Agentic OS branding)
- `packages/ide/vscode-companion/esbuild.js` — Build config for VSIX packaging (from esbuild.js)
- `packages/ide/vscode-companion/scripts/check-vscode-release.js` — Release validation script
- `packages/ide/vscode-companion/scripts/generate-notices.js` — Third-party notice generation
- `packages/ide/vscode-companion/src/utils/` — Shared utilities
- `packages/ide/vscode-companion/src/extension.test.ts` — Unit tests for extension logic
- `packages/ide/vscode-companion/src/ide-server.test.ts` — Server integration tests
- `packages/ide/vscode-companion/src/open-files-manager.test.ts` — Open files manager tests
- `packages/ide/vscode-companion/README.md` — Extension documentation
- `packages/ide/vscode-companion/LICENSE` — License file
- `packages/ide/vscode-companion/NOTICES.txt` — Third-party notices
- `packages/ide/vscode-companion/development.md` — Development guide
- `packages/ide/core/src/ide-bridge.ts` — Shared IDE bridge interface (new)
- `packages/ide/core/src/ide-protocol.ts` — WebSocket protocol definitions (new)
- `apps/cli/src/commands/ide.ts` — CLI command to start IDE server
- `apps/dashboard/src/pages/settings/ide-settings.tsx` — Dashboard IDE settings page

**Acceptance Criteria**:
- [ ] VS Code extension activates on workspace open with <500ms startup overhead
- [ ] Sidebar panel connects to agent CLI via WebSocket within 2 seconds
- [ ] Open files are synced to agent context in real-time with <200ms latency per change
- [ ] Diff-based code edits show preview before applying with undo support
- [ ] Inline completions appear within 300ms of typing pause
- [ ] Code actions (explain, refactor, fix) work on selected code regions
- [ ] Extension works in VS Code 1.85+, Cursor, and VS Codium
- [ ] All existing gemini-cli extension tests pass after migration
- [ ] Extension packages as VSIX and installs cleanly
- [ ] Status bar shows agent connection state with reconnect logic

**Risk Level**: MEDIUM — VS Code API changes between versions; WebSocket port conflicts; extension host process memory usage; Cursor fork API incompatibilities

---

#### Subphase 26.2: Import gemini-cli IDE Detection and Integration
**Week**: 2
**Description**: Port gemini-cli's IDE detection and integration subsystem, which includes `detect-ide` (auto-detection of running IDEs), `ide-client` (client-side communication with detected IDEs), and `ide-installer` (one-click IDE extension installation). The detection system scans for running IDE processes across platforms (VS Code, Cursor, Windsurf, JetBrains, Vim/Neovim, Emacs), identifies the active workspace and file, and establishes a communication channel. The client component sends context and receives responses, enabling seamless cross-IDE experiences. The installer provides a unified "install companion" command that detects the user's IDE of choice and installs the appropriate extension automatically. This subphase adds support for additional IDEs beyond VS Code (JetBrains suite, IntelliJ, PyCharm, WebStorm, Neovim via plugin, Emacs via package) and creates a unified IDE abstraction layer that allows any IDE to integrate with Agentic OS V4 via a common protocol.

**Copy Source**: `gemini-cli/packages/core/src/ide/` → `packages/ide/detection/`

**Key Files to Create/Modify**:
- `packages/ide/detection/package.json` — Package configuration
- `packages/ide/detection/src/index.ts` — Main module entry
- `packages/ide/detection/src/detect-ide.ts` — IDE process scanning across platforms
- `packages/ide/detection/src/ide-types.ts` — IDE type definitions and capabilities
- `packages/ide/detection/src/scanner.ts` — OS-level process scanner (ps aux, WMIC, procfs)
- `packages/ide/detection/src/platform/windows.ts` — Windows process detection routines
- `packages/ide/detection/src/platform/macos.ts` — macOS process detection (NSWorkspace, AppleScript)
- `packages/ide/detection/src/platform/linux.ts` — Linux process detection (procfs, D-Bus)
- `packages/ide/detection/src/workspace-resolver.ts` — Resolve active workspace from IDE process
- `packages/ide/detection/src/file-resolver.ts` — Resolve currently open file in IDE
- `packages/ide/integration/ide-client.ts` — Client for communicating with detected IDE
- `packages/ide/integration/ide-transport.ts` — Transport abstraction (WebSocket, HTTP, named pipe, Unix socket)
- `packages/ide/integration/ide-protocol.ts` — Protocol definitions for IDE communication
- `packages/ide/integration/context-provider.ts` — Context provider that feeds IDE state to agent
- `packages/ide/installer/src/index.ts` — Installer entry point
- `packages/ide/installer/src/ide-installer.ts` — One-click extension installation
- `packages/ide/installer/src/registry.ts` — Extension registry with download URLs
- `packages/ide/installer/src/auto-install.ts` — Auto-detection and install flow
- `packages/ide/jetbrains/` — JetBrains plugin (IntelliJ, PyCharm, WebStorm, GoLand, etc.)
- `packages/ide/jetbrains/src/agentic-os-plugin.ts` — JetBrains plugin actions
- `packages/ide/jetbrains/src/tool-window.ts` — JetBrains tool window integration
- `packages/ide/neovim/plugin/agentic-os.lua` — Neovim Lua plugin
- `packages/ide/neovim/src/neovim-bridge.ts` — Neovim RPC bridge
- `packages/ide/emacs/agentic-os.el` — Emacs package
- `packages/ide/emacs/src/emacs-bridge.ts` — Emacs IPC bridge
- `apps/cli/src/commands/ide-detect.ts` — CLI command for IDE detection
- `apps/cli/src/commands/ide-install.ts` — CLI command for extension installation
- `packages/ide/core/src/ide-abstraction.ts` — Unified IDE interface (new)

**Acceptance Criteria**:
- [ ] IDE detection finds running VS Code, Cursor, and Windsurf on all platforms within 500ms
- [ ] JetBrains IDEs detected via running JVM process inspection within 1 second
- [ ] Neovim and Emacs detected via socket/named pipe inspection
- [ ] Active workspace file is correctly identified for all detected IDEs
- [ ] One-click install installs VS Code extension in <5 seconds
- [ ] JetBrains plugin installs via IDE's plugin manager API
- [ ] Neovim plugin auto-installs via packer/lazy/lazy.nvim
- [ ] Unified IDE abstraction supports all target IDEs through a single interface
- [ ] Communication channel establishes with VS Code in <1 second
- [ ] Cross-IDE context sharing works bidirectionally with <500ms latency

**Risk Level**: MEDIUM — Process scanning requires platform-specific permissions; macOS TCC (Transparency, Consent, and Control) prompts; JetBrains plugin API versioning; Neovim RPC version differences

---

#### Subphase 26.3: Implement DevTools Panel (Network/Console Inspector)
**Week**: 3–4
**Description**: Port and extend gemini-cli's devtools package (`packages/devtools/`) into a full-featured developer tools panel for Agentic OS V4. The devtools panel provides real-time inspection of agent-internal operations including network request logging and replay, console output capture, tool call tracing, context snapshot inspection, and performance profiling. The existing codebase provides a React-based devtools client (`client/`) and a server-side instrumentation layer (`src/`) that hooks into the agent core to capture events. This subphase extends the devtools to support: (1) Network Inspector — capture all LLM API requests/responses with timing, token counts, and payload inspection; (2) Console Inspector — capture agent console output, tool call logs, and error traces; (3) Context Inspector — view current agent context, memory state, and conversation history; (4) Tool Call Timeline — visualize the sequence of tool calls with duration and result previews; (5) Performance Dashboard — real-time token usage, latency histograms, and memory profiling. The devtools panel is available both as a standalone web app (served by the agent CLI) and as an embedded panel in the VS Code companion, accessible via a keyboard shortcut.

**Copy Source**: `gemini-cli/packages/devtools/` → `packages/devtools/`

**Key Files to Create/Modify**:
- `packages/devtools/package.json` — DevTools package configuration
- `packages/devtools/src/index.ts` — Server-side instrumentation entry (from src/index.ts)
- `packages/devtools/src/types.ts` — Type definitions for devtools events (from src/types.ts)
- `packages/devtools/src/instrumentation.ts` — Agent core instrumentation hooks
- `packages/devtools/src/network-inspector.ts` — Network request/response capture and replay
- `packages/devtools/src/console-inspector.ts` — Console output capture and filtering
- `packages/devtools/src/context-inspector.ts` — Agent context state snapshot
- `packages/devtools/src/tool-timeline.ts` — Tool call sequence visualization data
- `packages/devtools/src/performance-dashboard.ts` — Performance metrics aggregation
- `packages/devtools/src/event-bus.ts` — Internal event bus for devtools data flow
- `packages/devtools/src/store.ts` — State management for devtools data
- `packages/devtools/src/server.ts` — HTTP/WebSocket server for devtools client
- `packages/devtools/client/package.json` — Client web app configuration
- `packages/devtools/client/src/App.tsx` — Main devtools application component
- `packages/devtools/client/src/pages/NetworkInspector.tsx` — Network inspector page
- `packages/devtools/client/src/pages/ConsoleInspector.tsx` — Console inspector page
- `packages/devtools/client/src/pages/ContextInspector.tsx` — Context inspector page
- `packages/devtools/client/src/pages/ToolTimeline.tsx` — Tool call timeline page
- `packages/devtools/client/src/pages/PerformanceDashboard.tsx` — Performance dashboard page
- `packages/devtools/client/src/components/RequestDetail.tsx` — Request payload viewer
- `packages/devtools/client/src/components/ResponseDetail.tsx` — Response payload viewer
- `packages/devtools/client/src/components/TimingChart.tsx` — Timing visualization component
- `packages/devtools/client/src/components/TokenUsage.tsx` — Token usage chart component
- `packages/devtools/client/src/components/FilterBar.tsx` — Log filtering component
- `packages/devtools/client/src/hooks/useDevtoolsWS.ts` — WebSocket connection hook
- `packages/devtools/client/src/styles/` — CSS/styling for devtools
- `packages/devtools/client/index.html` — Client entry HTML
- `packages/devtools/esbuild.client.js` — Client build configuration
- `packages/devtools/tsconfig.build.json` — Build-specific TypeScript config
- `packages/devtools/tsconfig.json` — TypeScript configuration
- `apps/cli/src/commands/devtools.ts` — CLI command to start devtools server
- `packages/ide/vscode-companion/src/panel/devtools-panel.ts` — VS Code devtools panel integration

**Acceptance Criteria**:
- [ ] Network inspector captures all LLM API calls with <5ms overhead per request
- [ ] Console inspector displays real-time agent output with <100ms latency
- [ ] Context inspector shows full agent state including memory, conversation, and tool results
- [ ] Tool timeline renders interactive visualization of tool call sequences with durations
- [ ] Performance dashboard shows token usage, latency P50/P95/P99, and memory consumption
- [ ] DevTools starts via `agentic devtools` command and opens browser automatically
- [ ] VS Code panel embeds devtools with hot-reload capability
- [ ] Filters work on network logs (by method, status, provider, duration)
- [ ] Request replay button re-sends captured requests for debugging
- [ ] DevTools operates with <50MB additional memory overhead

**Risk Level**: MEDIUM — Instrumentation hooks require careful monkey-patching of core modules; WebSocket reconnection logic; large payload serialization performance; browser devtools memory management for long sessions

---

#### Subphase 26.4: Implement @-Reference Resolution and File Context
**Week**: 5
**Description**: Port gemini-cli's @-reference resolution system (`atCommandUtils`, `tool-jit-context`) into a unified file context and reference resolution subsystem for Agentic OS V4. The @-reference system allows users to type `@filename`, `@symbol`, `@function`, or `@class` in prompts to insert file content, code symbols, or documentation directly into the agent's context. The `tool-jit-context` system provides just-in-time context loading, where the agent automatically fetches relevant file content based on the current conversation context rather than pre-loading entire workspaces. This subphase extends these capabilities to support: (1) fuzzy @-reference matching across project files with ranking by relevance; (2) symbol-level resolution (functions, classes, interfaces, types) using the TypeScript compiler API and language servers; (3) multi-project resolution when working with monorepos; (4) cross-repository references for dependencies; (5) context window optimization that prioritizes the most relevant files and clips less relevant ones. The system integrates with the IDE companion to provide real-time @-reference completion and with the agent's context manager for efficient context window utilization.

**Copy Source**: `gemini-cli/packages/core/src/context/` and `gemini-cli/packages/core/src/tools/` → `packages/context/at-reference/`

**Key Files to Create/Modify**:
- `packages/context/at-reference/package.json` — Package configuration
- `packages/context/at-reference/src/index.ts` — Main module entry
- `packages/context/at-reference/src/reference-resolver.ts` — @-reference parsing and resolution
- `packages/context/at-reference/src/file-resolver.ts` — File path resolution with fuzzy matching
- `packages/context/at-reference/src/symbol-resolver.ts` — Code symbol resolution (functions, classes, types)
- `packages/context/at-reference/src/ranking.ts` — Relevance ranking for matched references
- `packages/context/at-reference/src/fuzzy-matcher.ts` — Fuzzy matching algorithm (from atCommandUtils)
- `packages/context/at-reference/src/completion-provider.ts` — Autocomplete for @-references
- `packages/context/at-reference/src/monorepo-resolver.ts` — Monorepo-aware multi-package resolution
- `packages/context/at-reference/src/cross-repo-resolver.ts` — Cross-repository dependency resolution
- `packages/context/at-reference/src/types.ts` — Type definitions
- `packages/context/jit-context/package.json` — JIT context package config
- `packages/context/jit-context/src/index.ts` — Main entry point
- `packages/context/jit-context/src/jit-loader.ts` — Just-in-time context loading engine (from tool-jit-context)
- `packages/context/jit-context/src/context-prioritizer.ts` — Context window prioritization algorithm
- `packages/context/jit-context/src/relevance-scorer.ts` — Relevance scoring for context items
- `packages/context/jit-context/src/cache-manager.ts` — LRU cache for resolved references
- `packages/context/jit-context/src/token-budget.ts` — Token budget tracking and clipping
- `packages/context/jit-context/src/truncation.ts` — Smart truncation strategies (head, tail, semantic)
- `packages/context/core/src/context-manager.ts` — Unified context manager integrating @-ref and JIT
- `packages/context/core/src/context-window.ts` — Context window state management
- `packages/context/core/src/types.ts` — Shared context types
- `packages/ide/vscode-companion/src/completion/at-ref-completion.ts` — IDE @-reference completion provider
- `packages/ide/vscode-companion/src/completion/symbol-index.ts` — Symbol index built from workspace
- `apps/cli/src/commands/context.ts` — CLI command for context inspection and management

**Acceptance Criteria**:
- [ ] `@filename` resolves file paths with fuzzy matching in <50ms
- [ ] `@function:name` and `@class:name` resolve to exact symbol definitions with source location
- [ ] @-reference completion dropdown appears in IDE within 200ms of typing `@`
- [ ] JIT context loads relevant files based on conversation context with <100ms per file
- [ ] Context prioritization correctly ranks files by relevance with >90% precision
- [ ] Token budget tracking prevents context overflow with automatic clipping
- [ ] Multi-project monorepo resolution works for projects with 20+ packages
- [ ] Cross-repo references resolve local dependency source when available
- [ ] Cache eviction follows LRU policy with configurable max entries (default 1000)
- [ ] Overall context management adds <10ms to agent response latency

**Risk Level**: LOW — Well-understood text matching and ranking algorithms; TypeScript compiler API provides reliable symbol resolution; LRU caching is a standard pattern

---

#### Subphase 26.5: Implement Developer API and SDK
**Week**: 6
**Description**: Port gemini-cli's SDK package (`packages/sdk/`) into a comprehensive, production-ready SDK for Agentic OS V4. The SDK provides a first-class TypeScript/JavaScript API for programmatic interaction with the agent runtime, including agent session management, tool invocation, skill management, file system operations, shell command execution, and event subscriptions. The existing SDK (from `gemini-cli/packages/sdk/src/`) defines clean interfaces for `Agent`, `Session`, `Tool`, `Skill`, `Shell`, and `FileSystem` abstractions. This subphase extends the SDK to support: (1) full agent lifecycle management (create, start, pause, resume, stop sessions); (2) typed tool definitions with automatic schema generation from Zod/Zui schemas; (3) skill loading and composition from external packages; (4) event-driven hooks for monitoring agent state changes; (5) multi-agent orchestration for spawning sub-agents; (6) middleware support for request/response interception; (7) streaming response support via AsyncIterable; (8) comprehensive error handling with typed error classes. The SDK ships as a standalone npm package (`@agentic-os/sdk`) with full TypeScript declarations, JSDoc annotations, and example-based documentation.

**Copy Source**: `gemini-cli/packages/sdk/` → `packages/sdk/`

**Key Files to Create/Modify**:
- `packages/sdk/package.json` — npm package config with exports map for Node/Deno/browser
- `packages/sdk/tsconfig.json` — TypeScript configuration with declaration generation
- `packages/sdk/src/index.ts` — Public API barrel exports (from index.ts)
- `packages/sdk/src/agent.ts` — Agent class for session lifecycle (from agent.ts)
- `packages/sdk/src/session.ts` — Session management with streaming (from session.ts)
- `packages/sdk/src/tool.ts` — Tool definition and invocation (from tool.ts)
- `packages/sdk/src/skills.ts` — Skill loading and composition (from skills.ts)
- `packages/sdk/src/shell.ts` — Shell command execution (from shell.ts)
- `packages/sdk/src/fs.ts` — File system operations (from fs.ts)
- `packages/sdk/src/types.ts` — Type definitions (from types.ts)
- `packages/sdk/src/streaming.ts` — Streaming response handling (new, enhanced)
- `packages/sdk/src/events.ts` — Event emitter for agent state changes (new)
- `packages/sdk/src/middleware.ts` — Middleware chain for request/response interception (new)
- `packages/sdk/src/subagent.ts` — Sub-agent orchestration (new)
- `packages/sdk/src/errors.ts` — Typed error classes (new)
- `packages/sdk/src/session.test.ts` — Session unit tests (from session.test.ts)
- `packages/sdk/src/tool.test.ts` — Tool unit tests (from tool.test.ts)
- `packages/sdk/src/tool.integration.test.ts` — Tool integration tests
- `packages/sdk/src/agent.integration.test.ts` — Agent integration tests
- `packages/sdk/src/skills.integration.test.ts` — Skills integration tests
- `packages/sdk/examples/simple.ts` — Quick-start example (from examples/simple.ts)
- `packages/sdk/examples/session-context.ts` — Session context example (from examples/session-context.ts)
- `packages/sdk/examples/multi-agent.ts` — Multi-agent orchestration example (new)
- `packages/sdk/examples/middleware.ts` — Middleware usage example (new)
- `packages/sdk/examples/streaming.ts` — Streaming response example (new)
- `packages/sdk/README.md` — SDK documentation (from README.md)
- `packages/sdk/SDK_DESIGN.md` — Design document (from SDK_DESIGN.md)
- `packages/sdk/vitest.config.ts` — Test configuration
- `packages/sdk/test-data/` — Test fixtures for SDK tests
- `apps/cli/src/commands/sdk-server.ts` — CLI command to start SDK HTTP server (new)
- `docs/reference/sdk/` — Generated API reference documentation

**Acceptance Criteria**:
- [ ] SDK exports complete TypeScript declarations with no `any` types in public API
- [ ] Agent session lifecycle (create → start → pause → resume → stop) works reliably
- [ ] Tool invocation with typed parameters returns typed results
- [ ] Skill loading from file path and npm package both work
- [ ] Streaming responses return AsyncIterable with backpressure support
- [ ] Middleware chain executes in correct order with error propagation
- [ ] Sub-agent spawning works with parent-child context isolation
- [ ] All existing SDK tests pass (unit + integration)
- [ ] npm package `@agentic-os/sdk` installs and imports cleanly
- [ ] SDK examples execute without errors

**Risk Level**: LOW — Well-defined API boundaries; existing tests provide regression coverage; TypeScript ensures type safety; npm packaging is a solved problem

---

## Phase 27: Testing & Quality Assurance Framework
**Duration**: 6 weeks
**Dependencies**: Phase 26 (IDE & Developer Tooling), Phase 20 (Provider Gateway)
**Overall Risk**: MEDIUM — Test infrastructure scaling, flaky test management, cross-component integration complexity

### Overview
Phase 27 establishes a comprehensive testing and quality assurance framework for Agentic OS V4, porting gemini-cli's sophisticated testing infrastructure (Vitest, integration tests, memory tests, perf tests) and behavioral evaluation framework. This phase creates a multi-layered testing pyramid spanning unit tests, integration tests, behavioral evaluations, regression tests, chaos engineering experiments, and performance benchmarks. The goal is to achieve >90% code coverage across core packages, zero critical regressions, verified behavioral correctness across 100+ evaluation scenarios, and quantified performance baselines that prevent degradation. The testing framework is designed to run in CI for every pull request, providing fast feedback loops while maintaining comprehensive coverage.

---

#### Subphase 27.1: Import gemini-cli Testing Infrastructure
**Week**: 1
**Description**: Port gemini-cli's battle-tested testing infrastructure into the unified monorepo. This infrastructure includes Vitest configuration, integration test harnesses, memory usage testing, and performance testing frameworks. The existing infrastructure (from `gemini-cli/integration-tests/`, `gemini-cli/memory-tests/`, `gemini-cli/perf-tests/`, and `gemini-cli/packages/test-utils/`) provides: (1) Vitest configuration with parallel execution, coverage reporting, and snapshot testing; (2) Integration test harness using recorded response fixtures for deterministic replay testing; (3) Memory test harness that measures heap usage before/after operations with GC pressure; (4) Performance test harness that measures cold start, warm start, throughput, and latency with baseline comparison; (5) Test utilities including mock MCP servers, mock file systems, fixture loaders, and environment setup helpers. This subphase adapts the test infrastructure to work with the unified monorepo's package structure, creates shared test configuration that all packages can inherit, sets up CI integration for test execution on every PR, and establishes test result aggregation and reporting.

**Copy Source**: `gemini-cli/integration-tests/`, `gemini-cli/memory-tests/`, `gemini-cli/perf-tests/`, `gemini-cli/packages/test-utils/` → `packages/testing/`

**Key Files to Create/Modify**:
- `packages/testing/infrastructure/package.json` — Shared test infrastructure package
- `packages/testing/infrastructure/src/vitest.shared.ts` — Shared Vitest configuration
- `packages/testing/infrastructure/src/globalSetup.ts` — Global test setup (temp dirs, env vars)
- `packages/testing/infrastructure/src/test-rig.ts` — Integration test rig (from test-rig.ts)
- `packages/testing/infrastructure/src/mock-utils.ts` — Mock creation utilities (from mock-utils.ts)
- `packages/testing/infrastructure/src/env-setup.ts` — Environment setup helpers (from env-setup.ts)
- `packages/testing/infrastructure/src/file-system-test-helpers.ts` — FS test helpers
- `packages/testing/harnesses/src/integration-harness.ts` — Integration test harness with response recording
- `packages/testing/harnesses/src/memory-harness.ts` — Memory usage measurement (from memory-test-harness.ts)
- `packages/testing/harnesses/src/perf-harness.ts` — Performance baseline measurement (from perf-test-harness.ts)
- `packages/testing/harnesses/src/memory-baselines.ts` — Memory baseline management (from memory-baselines.ts)
- `packages/testing/harnesses/src/fixture-loader.ts` — Test fixture loading utilities
- `packages/testing/mocks/src/mcp-server.ts` — Mock MCP server implementation (from test-mcp-server.ts)
- `packages/testing/mocks/src/file-system.ts` — Mock file system (in-memory)
- `packages/testing/mocks/src/llm-provider.ts` — Mock LLM provider for deterministic responses
- `packages/testing/mocks/src/agent-env.ts` — Mock agent environment
- `packages/testing/recording/src/response-recorder.ts` — Record/replay for HTTP responses
- `packages/testing/recording/src/response-player.ts` — Replay recorded responses
- `packages/testing/recording/src/sanitizer.ts` — Sanitize sensitive data from recordings
- `packages/testing/recording/src/fixture-format.ts` — Fixture file format specification
- `packages/testing/configs/` — Per-package vitest config presets
- `packages/testing/configs/vitest.unit.ts` — Unit test preset (fast, no external deps)
- `packages/testing/configs/vitest.integration.ts` — Integration test preset (with external services)
- `packages/testing/configs/vitest.memory.ts` — Memory test preset (GC-sensitive, isolated)
- `packages/testing/configs/vitest.perf.ts` — Performance test preset (warmup, iterations, baselines)
- `packages/testing/configs/vitest.eval.ts` — Evaluation test preset (LLM-judge, slow)
- `scripts/test/run-all.sh` — Script to run full test suite with reporting
- `scripts/test/run-fast.sh` — Script to run fast unit tests only
- `scripts/test/report.sh` — Test result aggregation and report generation
- `vitest.workspace.ts` — Root Vitest workspace configuration

**Acceptance Criteria**:
- [ ] All packages inherit shared Vitest configuration with <50 lines per package override
- [ ] Integration test rig loads response fixtures and replays within 100ms setup time
- [ ] Memory test harness measures heap with <1MB measurement overhead
- [ ] Performance test harness runs 10 warmup iterations before 100 measurement iterations
- [ ] Response recorder captures HTTP/WebSocket traffic with <1ms overhead
- [ ] Mock MCP server handles 10 concurrent test connections
- [ ] Test suite runs in CI with <15 minutes total for all packages
- [ ] Test results aggregate into a unified JUnit XML report
- [ ] Flaky test detection with auto-retry (max 3 retries) for known flaky tests
- [ ] Coverage thresholds: >80% lines, >70% branches across all packages

**Risk Level**: LOW — Test infrastructure is well-established in gemini-cli; Vitest is mature; migration is primarily config and path updates

---

#### Subphase 27.2: Implement Behavioral Evaluation Framework
**Week**: 2–3
**Description**: Port gemini-cli's behavioral evaluation framework (`evals/`) into a comprehensive behavioral testing system for Agentic OS V4. The existing eval framework (from `gemini-cli/evals/`) defines behavioral tests that evaluate agent performance on real-world tasks using LLM-as-judge methodology, automated pass/fail criteria, and statistical analysis. Evaluations cover: file creation behavior, shell efficiency, memory persistence, plan mode effectiveness, subagent delegation, tool output masking, prompt injection resistance, sandbox recovery, snapshot fidelity, validation fidelity, model steering, skill extraction, and more (40+ eval files). This subphase extends the framework to: (1) support multi-model judging (using different LLMs as evaluators for bias detection); (2) implement a dedicated eval runner with parallel execution, timeout management, and result aggregation; (3) create a eval dashboard for visualizing pass rates, trends, and regressions; (4) add new evals specific to the merged codebases (routing accuracy, multi-tenancy, billing correctness, provider fallback behavior, MCP protocol compliance); (5) implement A/B eval mode for comparing two agent configurations head-to-head; (6) create a eval regression detection system that alerts on statistically significant changes.

**Copy Source**: `gemini-cli/evals/` → `packages/testing/evals/`

**Key Files to Create/Modify**:
- `packages/testing/evals/package.json` — Eval framework package config
- `packages/testing/evals/src/index.ts` — Public API for eval framework
- `packages/testing/evals/src/runner.ts` — Eval runner with parallel execution
- `packages/testing/evals/src/eval-definition.ts` — Eval definition schema
- `packages/testing/evals/src/llm-judge.ts` — LLM-as-judge evaluator (from llm-judge.ts)
- `packages/testing/evals/src/scoring.ts` — Scoring and pass/fail determination
- `packages/testing/evals/src/statistics.ts` — Statistical analysis (p-values, confidence intervals)
- `packages/testing/evals/src/regression-detector.ts` — Regression detection across eval runs
- `packages/testing/evals/src/ab-comparison.ts` — A/B evaluation mode
- `packages/testing/evals/src/multi-judge.ts` — Multi-model judging for bias detection
- `packages/testing/evals/src/types.ts` — Evaluation types and interfaces
- `packages/testing/evals/definitions/` — Eval definitions directory
- `packages/testing/evals/definitions/file-creation.eval.ts` — File creation behavior (from file_creation_behavior.eval.ts)
- `packages/testing/evals/definitions/shell-efficiency.eval.ts` — Shell command efficiency (from shell-efficiency.eval.ts)
- `packages/testing/evals/definitions/memory-persistence.eval.ts` — Memory persistence (from memory_persistence.eval.ts)
- `packages/testing/evals/definitions/plan-mode.eval.ts` — Plan mode (from plan_mode.eval.ts)
- `packages/testing/evals/definitions/subagent.eval.ts` — Subagent delegation (from subagents.eval.ts)
- `packages/testing/evals/definitions/skill-extraction.eval.ts` — Skill extraction (from skill_extraction.eval.ts)
- `packages/testing/evals/definitions/tool-output-masking.eval.ts` — Tool output masking (from tool_output_masking.eval.ts)
- `packages/testing/evals/definitions/prompt-injection.eval.ts` — Prompt injection (from prompt_injection_mcp.eval.ts)
- `packages/testing/evals/definitions/sandbox-recovery.eval.ts` — Sandbox recovery (from sandbox_recovery.eval.ts)
- `packages/testing/evals/definitions/routing-accuracy.eval.ts` — NEW: routing evaluation scenarios
- `packages/testing/evals/definitions/provider-fallback.eval.ts` — NEW: provider fallback behavior
- `packages/testing/evals/definitions/multi-tenancy.eval.ts` — NEW: multi-tenant isolation
- `packages/testing/evals/definitions/billing-correctness.eval.ts` — NEW: billing accuracy
- `packages/testing/evals/definitions/mcp-compliance.eval.ts` — NEW: MCP protocol compliance
- `packages/testing/evals/definitions/binary-distribution.eval.ts` — NEW: binary packaging correctness
- `packages/testing/evals/definitions/auto-update.eval.ts` — NEW: auto-update mechanism
- `packages/testing/evals/helpers/test-helper.ts` — Test helper utilities (from test-helper.ts)
- `packages/testing/evals/helpers/app-test-helper.ts` — App-level test helpers (from app-test-helper.ts)
- `packages/testing/evals/helpers/component-test-helper.ts` — Component test helpers
- `packages/testing/evals/vitest.config.ts` — Eval-specific vitest configuration
- `packages/testing/evals/tsconfig.json` — TypeScript configuration
- `packages/testing/evals/README.md` — Eval framework documentation
- `packages/testing/evals/reports/` — Generated eval reports (gitignored)
- `scripts/eval/run-all.sh` — Script to run full eval suite
- `scripts/eval/compare.sh` — Script to compare eval results between runs
- `apps/dashboard/src/pages/eval-dashboard.tsx` — Eval results dashboard (new)

**Acceptance Criteria**:
- [ ] All 40+ gemini-cli evals ported and passing with >95% pass rate
- [ ] 10 new evals specific to merged codebases defined and passing
- [ ] Eval runner executes 50 evals in parallel with <30 minute total wall time
- [ ] LLM-as-judge achieves >90% agreement with human evaluation (measured on 100-sample test set)
- [ ] Multi-model judging detects judge bias with statistical significance reporting
- [ ] Regression detector alerts on >5% pass rate change with p-value <0.05
- [ ] A/B comparison mode produces statistically valid results with configurable significance level
- [ ] Eval dashboard shows pass/fail trends over time with per-eval drill-down
- [ ] Eval results are cached and only re-run when source code or eval definition changes
- [ ] New evals can be added with <50 lines of code per eval

**Risk Level**: HIGH — LLM-as-judge reliability varies by task; eval flakiness due to non-deterministic LLM outputs requires careful statistical handling; evaluating routing and multi-tenancy correctness requires complex multi-step scenarios

---

#### Subphase 27.3: Implement Regression Test Suite for All 8 Merged Components
**Week**: 4
**Description**: Build a comprehensive regression test suite that validates the correct integration and functionality of all 8 merged codebases. Unlike unit tests that verify individual components, regression tests focus on end-to-end workflows that span multiple packages and ensure that changes to one component don't break dependent components. The regression suite covers: (1) Provider routing — verify that requests route through all 150+ providers correctly with fallback behavior; (2) Multi-tenant billing — verify that billing calculations, rate limits, and user isolation work across tenants; (3) MCP protocol compliance — verify that MCP client/server communication adheres to the spec for all tool/resource types; (4) Extension/recipe system — verify that extensions load, hooks fire, and recipes execute correctly; (5) Local inference — verify that all three inference backends (llama.cpp, LiteRT, MLX) produce correct output; (6) Voice pipeline — verify end-to-end voice input → transcription → agent response → TTS output; (7) Sandbox isolation — verify that all four isolation levels prevent unauthorized access; (8) IDE integration — verify that VS Code companion communicates correctly with the agent core. The regression suite runs on every PR merge and before every release, with the full suite completing within 2 hours.

**Copy Source**: Cross-package integration tests from all 8 projects → `packages/testing/regression/`

**Key Files to Create/Modify**:
- `packages/testing/regression/package.json` — Regression test package
- `packages/testing/regression/src/runner.ts` — Regression test orchestrator
- `packages/testing/regression/src/scenarios/` — Regression test scenarios directory
- `packages/testing/regression/src/scenarios/provider-routing.test.ts` — Provider routing regression
- `packages/testing/regression/src/scenarios/multi-tenant-billing.test.ts` — Billing regression
- `packages/testing/regression/src/scenarios/mcp-compliance.test.ts` — MCP protocol regression
- `packages/testing/regression/src/scenarios/extension-lifecycle.test.ts` — Extension lifecycle
- `packages/testing/regression/src/scenarios/recipe-execution.test.ts` — Recipe execution
- `packages/testing/regression/src/scenarios/local-inference.test.ts` — Local inference correctness
- `packages/testing/regression/src/scenarios/voice-pipeline.test.ts` — Voice pipeline end-to-end
- `packages/testing/regression/src/scenarios/sandbox-isolation.test.ts` — Sandbox isolation levels
- `packages/testing/regression/src/scenarios/ide-integration.test.ts` — IDE companion integration
- `packages/testing/regression/src/scenarios/skill-composition.test.ts` — Skill loading and composition
- `packages/testing/regression/src/scenarios/hooks-execution.test.ts` — Hooks system correctness
- `packages/testing/regression/src/scenarios/auto-update.test.ts` — Auto-update mechanism
- `packages/testing/regression/src/scenarios/dashboard-operations.test.ts` — Dashboard CRUD operations
- `packages/testing/regression/src/scenarios/cli-commands.test.ts` — CLI command execution
- `packages/testing/regression/src/fixtures/` — Test fixtures for regression scenarios
- `packages/testing/regression/src/assertions/` — Custom assertion helpers
- `packages/testing/regression/src/reporting/` — Test result aggregation and reporting
- `packages/testing/regression/src/reporting/junit-reporter.ts` — JUnit XML output
- `packages/testing/regression/src/reporting/html-reporter.ts` — HTML report generation
- `packages/testing/regression/src/reporting/metrics.ts` — Test metrics collection
- `packages/testing/regression/vitest.config.ts` — Vitest configuration for regression suite
- `packages/testing/regression/tsconfig.json` — TypeScript configuration
- `scripts/regression/run.sh` — Script to run full regression suite
- `scripts/regression/run-fast.sh` — Script to run critical-path regression subset
- `scripts/regression/schedule.sh` — Script for scheduled regression runs
- `.github/workflows/regression.yml` — GitHub Actions workflow for regression suite
- `.github/workflows/regression-nightly.yml` — Nightly full regression run

**Acceptance Criteria**:
- [ ] Provider routing scenario tests 50+ provider configurations with correct fallback
- [ ] Multi-tenant billing scenario verifies 10+ concurrent tenants with correct isolation
- [ ] MCP compliance scenario validates 100% of MCP specification requirements
- [ ] Extension lifecycle scenario installs, loads, executes, and unloads extensions
- [ ] Recipe execution scenario runs 20+ recipe variations with correct output
- [ ] Local inference scenario runs all three backends with verified output format
- [ ] Voice pipeline scenario processes audio → text → response → audio in <30 seconds
- [ ] Sandbox isolation scenario verifies all four levels with penetration attempts
- [ ] IDE integration scenario verifies WebSocket communication and context sync
- [ ] Full regression suite completes within 120 minutes in CI

**Risk Level**: MEDIUM — Cross-component dependencies require all packages to be built first; test environment setup complexity; flaky tests due to timing dependencies; CI resource constraints for parallel execution

---

#### Subphase 27.4: Implement Chaos Engineering and Resilience Testing
**Week**: 5
**Description**: Implement a chaos engineering framework for Agentic OS V4 that systematically tests system resilience under adverse conditions. The framework introduces controlled failures into the system to verify that error handling, fallbacks, retries, and circuit breakers work correctly. Chaos experiments cover: (1) Network failures — LLM provider timeouts, DNS failures, connection resets, packet loss; (2) Service crashes — agent process killed, database disconnected, MCP server terminated; (3) Resource exhaustion — CPU throttling, memory pressure, disk space full, file descriptor limits; (4) Latency injection — artificial delays in provider responses, database queries, file system operations; (5) Data corruption — malformed API responses, schema mismatches, encoding errors; (6) Concurrency stress — 100+ concurrent requests, race condition triggers, deadlock detection; (7) State corruption — session state deserialization errors, config file corruption, cache inconsistency. The framework integrates with the existing test infrastructure to run chaos experiments as part of nightly builds, producing detailed reports on system behavior under fault conditions with Grafana dashboard visualization.

**Copy Source**: New development inspired by principles from chaos engineering (Netflix Chaos Monkey, Gremlin, Litmus) → `packages/testing/chaos/`

**Key Files to Create/Modify**:
- `packages/testing/chaos/package.json` — Chaos engineering package config
- `packages/testing/chaos/src/index.ts` — Framework entry point
- `packages/testing/chaos/src/experiment.ts` — Chaos experiment definition and lifecycle
- `packages/testing/chaos/src/runner.ts` — Experiment runner with safety guards
- `packages/testing/chaos/src/faults/` — Fault injection implementations
- `packages/testing/chaos/src/faults/network-delay.ts` — Network latency injection (via proxy)
- `packages/testing/chaos/src/faults/network-failure.ts` — Connection timeout/refusal injection
- `packages/testing/chaos/src/faults/process-kill.ts` — Process termination (SIGKILL, SIGTERM)
- `packages/testing/chaos/src/faults/cpu-pressure.ts` — CPU throttling via stress-ng
- `packages/testing/chaos/src/faults/memory-pressure.ts` — Memory pressure via allocation
- `packages/testing/chaos/src/faults/disk-pressure.ts` — Disk space exhaustion simulation
- `packages/testing/chaos/src/faults/latency-injector.ts` — Configurable latency injection
- `packages/testing/chaos/src/faults/data-corruption.ts` — Response payload corruption
- `packages/testing/chaos/src/faults/concurrency-storm.ts` — Concurrent request flood
- `packages/testing/chaos/src/probes/` — Health probes to measure system state
- `packages/testing/chaos/src/probes/health-check.ts` — HTTP/WebSocket health probe
- `packages/testing/chaos/src/probes/metrics-probe.ts` — Metrics collection probe
- `packages/testing/chaos/src/probes/error-rate.ts` — Error rate measurement
- `packages/testing/chaos/src/probes/latency-probe.ts` — Latency percentile tracking
- `packages/testing/chaos/src/steering/` — Experiment steering and safety
- `packages/testing/chaos/src/steering/steady-state.ts` — Steady state hypothesis definition
- `packages/testing/chaos/src/steering/rollback.ts` — Automatic rollback on blast radius exceeded
- `packages/testing/chaos/src/steering/blast-radius.ts` — Blast radius calculation and limits
- `packages/testing/chaos/src/reporting/` — Experiment result reporting
- `packages/testing/chaos/src/reporting/report-generator.ts` — HTML/JSON report generation
- `packages/testing/chaos/src/reporting/grafana-integration.ts` — Grafana dashboard annotation
- `packages/testing/chaos/scenarios/` — Pre-defined chaos scenarios
- `packages/testing/chaos/scenarios/provider-fallback.json` — Provider failure scenario
- `packages/testing/chaos/scenarios/network-partition.json` — Network partition scenario
- `packages/testing/chaos/scenarios/database-crash.json` — Database failure scenario
- `packages/testing/chaos/scenarios/concurrency-flood.json` — Concurrency stress scenario
- `packages/testing/chaos/scenarios/memory-exhaustion.json` — Memory pressure scenario
- `packages/testing/chaos/vitest.config.ts` — Chaos test vitest configuration
- `packages/testing/chaos/tsconfig.json` — TypeScript configuration
- `scripts/chaos/run-experiment.sh` — Script to run a chaos experiment
- `scripts/chaos/run-nightly.sh` — Script for nightly chaos engineering run
- `scripts/chaos/cleanup.sh` — Script to clean up after experiments

**Acceptance Criteria**:
- [ ] Network delay injection adds configurable latency (50ms-5000ms) with <5ms precision
- [ ] Process kill experiment recovers via auto-restart within 5 seconds
- [ ] CPU pressure experiment throttles to configurable percentage (10%-90%)
- [ ] Memory pressure experiment triggers OOM handling without crash
- [ ] Concurrency storm of 500 concurrent requests handles at least 95% without error
- [ ] Data corruption experiment triggers validation and graceful error reporting
- [ ] Steady state hypothesis correctly detects system health before/after experiment
- [ ] Automatic rollback triggers when blast radius exceeds configurable threshold
- [ ] All chaos scenarios have integrated safety limits and timeouts
- [ ] Nightly chaos run produces annotated Grafana dashboard with findings

**Risk Level**: HIGH — Fault injection can crash development environments; resource exhaustion experiments may affect other running services; process kill tests require careful PID management; data corruption could cause persistent state issues if not properly isolated

---

#### Subphase 27.5: Implement Performance Benchmarking and Baseline Comparison
**Week**: 6
**Description**: Port gemini-cli's performance testing framework (`perf-tests/`) and create a comprehensive performance benchmarking system with baseline comparison, trend analysis, and regression detection. The existing perf tests (from `gemini-cli/perf-tests/perf-usage.test.ts`) measure cold startup time, warm startup time, idle CPU usage, high-volume processing throughput, long conversation memory growth, skill loading overhead, and Asian language processing performance. This subphase extends the framework to: (1) measure all critical system performance dimensions including agent response latency (P50/P95/P99), token throughput (tok/s), memory consumption (heap, RSS), CPU utilization, file system I/O, network request latency, and database query performance; (2) establish performance baselines for every major version and every commit; (3) integrate with CI to automatically compare PR performance against baseline and block merges on regressions >5%; (4) generate performance reports with flame graphs, latency histograms, and trend charts; (5) implement performance budgets that fail the build when exceeded; (6) support long-running performance tests that simulate 24 hours of agent usage for memory leak detection.

**Copy Source**: `gemini-cli/perf-tests/` → `packages/testing/performance/`

**Key Files to Create/Modify**:
- `packages/testing/performance/package.json` — Performance testing package
- `packages/testing/performance/src/index.ts` — Framework entry point
- `packages/testing/performance/src/runner.ts` — Performance test runner with warmup
- `packages/testing/performance/src/benchmark.ts` — Benchmark definition and execution
- `packages/testing/performance/src/measurements/` — Measurement implementations
- `packages/testing/performance/src/measurements/startup-time.ts` — Cold/warm startup measurement
- `packages/testing/performance/src/measurements/latency.ts` — Request latency with percentiles
- `packages/testing/performance/src/measurements/throughput.ts` — Token/request throughput
- `packages/testing/performance/src/measurements/memory.ts` — Heap/RSS memory measurement
- `packages/testing/performance/src/measurements/cpu.ts` — CPU utilization measurement
- `packages/testing/performance/src/measurements/io-throughput.ts` — File system I/O measurement
- `packages/testing/performance/src/measurements/concurrency.ts` — Concurrent request handling
- `packages/testing/performance/src/measurements/memory-leak.ts` — 24-hour memory leak detection
- `packages/testing/performance/src/baselines/` — Baseline management
- `packages/testing/performance/src/baselines/manager.ts` — Baseline CRUD operations
- `packages/testing/performance/src/baselines/comparison.ts` — Baseline comparison with statistics
- `packages/testing/performance/src/baselines/storage.ts` — Baseline persistence (JSON, SQLite)
- `packages/testing/performance/src/baselines/regression-detector.ts` — Statistical regression detection
- `packages/testing/performance/src/budgets/` — Performance budget enforcement
- `packages/testing/performance/src/budgets/checker.ts` — Budget check against measurements
- `packages/testing/performance/src/budgets/config.ts` — Budget configuration schema
- `packages/testing/performance/src/reporting/` — Report generation
- `packages/testing/performance/src/reporting/json-reporter.ts` — JSON output
- `packages/testing/performance/src/reporting/markdown-reporter.ts` — Markdown summary
- `packages/testing/performance/src/reporting/html-reporter.ts` — Interactive HTML report with charts
- `packages/testing/performance/src/reporting/flamegraph.ts` — CPU flame graph generation
- `packages/testing/performance/src/reporting/histogram.ts` — Latency histogram generation
- `packages/testing/performance/tests/` — Performance test definitions
- `packages/testing/performance/tests/cold-startup.test.ts` — Cold startup benchmark
- `packages/testing/performance/tests/response-latency.test.ts` — Agent response latency
- `packages/testing/performance/tests/memory-usage.test.ts` — Memory consumption over time
- `packages/testing/performance/tests/concurrent-agents.test.ts` — 100 concurrent agent sessions
- `packages/testing/performance/tests/provider-routing-perf.test.ts` — Routing engine throughput
- `packages/testing/performance/tests/mcp-server-perf.test.ts` — MCP server request handling
- `packages/testing/performance/tests/dashboard-api-perf.test.ts` — Dashboard API response times
- `packages/testing/performance/tests/local-inference-perf.test.ts` — Local inference tok/s
- `packages/testing/performance/tests/voice-pipeline-perf.test.ts` — Voice pipeline latency
- `packages/testing/performance/tests/long-running-leak.test.ts` — 24-hour memory leak detection
- `packages/testing/performance/tests/baselines.json` — Performance baselines (from baselines.json)
- `packages/testing/performance/tests/globalSetup.ts` — Global perf test setup
- `packages/testing/performance/vitest.config.ts` — Perf-optimized vitest configuration
- `packages/testing/performance/tsconfig.json` — TypeScript configuration
- `packages/testing/performance/README.md` — Performance testing guide
- `scripts/perf/run.sh` — Script to run full performance suite
- `scripts/perf/compare.sh` — Script to compare against baseline
- `scripts/perf/update-baseline.sh` — Script to update baseline after verified improvement
- `.github/workflows/performance.yml` — GitHub Actions workflow for perf testing
- `apps/dashboard/src/pages/perf-dashboard.tsx` — Performance dashboard page (new)

**Acceptance Criteria**:
- [ ] Cold startup measured at <2 seconds for CLI, <5 seconds for dashboard
- [ ] Agent response latency P50 <500ms, P95 <2000ms, P99 <5000ms (with provider response time excluded)
- [ ] Memory baseline established for each package with <5% variance across runs
- [ ] Concurrent agent sessions (100) handled with <20% latency degradation
- [ ] Routing engine throughput measured at >1000 routing decisions/second
- [ ] Performance regression detector catches >5% degradation with >95% precision
- [ ] Performance budgets enforced in CI (block merge on budget exceedance)
- [ ] 24-hour memory leak test shows <10MB total memory growth
- [ ] HTML performance report with interactive latency histogram and trend chart
- [ ] Flame graphs generated for CPU hotspots on any test with >2s execution time

**Risk Level**: MEDIUM — Performance test results are inherently noisy on shared CI runners; baseline comparison requires statistical methods to distinguish signal from noise; long-running tests (24h) require special CI infrastructure; flame graph generation requires profiling tools (perf, dtrace) availability

---

## Phase 28: AI-Assisted Development & Self-Improvement
**Duration**: 6 weeks
**Dependencies**: Phase 26 (IDE & Developer Tooling), Phase 27 (Testing & QA Framework)
**Overall Risk**: MEDIUM — Self-improvement loops require careful guardrails; eval-driven development is a new workflow paradigm

### Overview
Phase 28 transforms Agentic OS V4 from a passive tool into an active development partner by integrating AI-assisted development workflows and self-improvement capabilities. This phase ports Agentic OS V3's self-improvement harness (the system's ability to analyze its own performance and propose code improvements) combined with gemini-cli's suite of developer productivity skills including code review, PR creation, documentation writing, and CI integration. The behavioral eval-driven development (BEDD) workflow ties everything together: developers write behavioral evaluations, the AI agent implements code to pass those evals, and the system continuously improves itself by running evals and self-correcting.

---

#### Subphase 28.1: Import Agentic OS V3 Self-Improvement Harness
**Week**: 1
**Description**: Port Agentic OS V3's self-improvement harness into Agentic OS V4. The self-improvement harness is a meta-cognitive system that enables the agent to analyze its own behavior, identify performance gaps, and autonomously propose and implement code improvements. The V3 harness operates through a feedback loop: (1) Monitor — collect metrics on agent performance across tasks; (2) Analyze — identify patterns of failure, inefficiency, or suboptimal behavior; (3) Propose — generate code patches that address identified issues; (4) Validate — run the proposed changes through the eval suite; (5) Integrate — if evals pass, merge the improvements. This subphase adapts the harness to work with the unified Agentic OS V4 architecture, ensuring it can self-improve across all 8 merged codebases. The harness is designed with safety limits: it only proposes changes to designated "self-improvement" directories, requires human approval for production changes, and operates within a configurable scope (files, packages, test thresholds).

**Copy Source**: `Agentic OS V3` (root-level self-improvement modules) → `packages/self-improvement/`

**Key Files to Create/Modify**:
- `packages/self-improvement/package.json` — Self-improvement package config
- `packages/self-improvement/src/index.ts` — Main harness entry point
- `packages/self-improvement/src/orchestrator.ts` — Self-improvement loop orchestrator
- `packages/self-improvement/src/monitor/` — Performance monitoring subsystem
- `packages/self-improvement/src/monitor/metrics-collector.ts` — Collect performance metrics
- `packages/self-improvement/src/monitor/eval-watcher.ts` — Watch eval results for degradation
- `packages/self-improvement/src/monitor/error-tracker.ts` — Track error patterns and frequencies
- `packages/self-improvement/src/monitor/usage-analyzer.ts` — Analyze usage patterns for optimization
- `packages/self-improvement/src/analyzer/` — Root cause analysis subsystem
- `packages/self-improvement/src/analyzer/failure-patterns.ts` — Identify failure pattern clusters
- `packages/self-improvement/src/analyzer/root-cause.ts` — Root cause analysis from metrics
- `packages/self-improvement/src/analyzer/priority.ts` — Prioritize improvements by impact
- `packages/self-improvement/src/proposer/` — Code improvement proposal subsystem
- `packages/self-improvement/src/proposer/patch-generator.ts` — Generate code patches
- `packages/self-improvement/src/proposer/scope-manager.ts` — Configurable improvement scope
- `packages/self-improvement/src/proposer/change-planner.ts` — Plan multi-file changes
- `packages/self-improvement/src/validator/` — Validation subsystem
- `packages/self-improvement/src/validator/eval-runner.ts` — Run evals on proposed changes
- `packages/self-improvement/src/validator/safety-checker.ts` — Safety limit enforcement
- `packages/self-improvement/src/validator/rollback-planner.ts` — Rollback plan generation
- `packages/self-improvement/src/integrator/` — Integration subsystem
- `packages/self-improvement/src/integrator/pr-creator.ts` — Create PR with improvements
- `packages/self-improvement/src/integrator/change-log.ts` — Document changes
- `packages/self-improvement/src/integrator/review-requester.ts` — Request human review
- `packages/self-improvement/src/config.ts` — Harness configuration schema
- `packages/self-improvement/src/types.ts` — Type definitions
- `packages/self-improvement/src/constants.ts` — Default limits and thresholds
- `packages/self-improvement/policies/` — Self-improvement policy definitions
- `packages/self-improvement/policies/default.yaml` — Default safe policy
- `packages/self-improvement/policies/aggressive.yaml` — Aggressive improvement policy
- `packages/self-improvement/tests/` — Self-improvement harness tests
- `packages/self-improvement/tests/orchestrator.test.ts` — Orchestrator unit tests
- `packages/self-improvement/tests/safety-checker.test.ts` — Safety validation tests
- `packages/self-improvement/vitest.config.ts` — Vitest configuration
- `packages/self-improvement/tsconfig.json` — TypeScript configuration
- `packages/self-improvement/README.md` — Self-improvement documentation
- `apps/cli/src/commands/self-improve.ts` — CLI command to trigger self-improvement
- `apps/dashboard/src/pages/self-improvement.tsx` — Self-improvement dashboard page

**Acceptance Criteria**:
- [ ] Self-improvement loop completes a full cycle (monitor → analyze → propose → validate → integrate) in <30 minutes
- [ ] Monitor subsystem collects 10+ metric types (latency, error rate, memory, token usage, eval pass rate)
- [ ] Analyzer correctly identifies the root cause of a simulated performance degradation
- [ ] Proposer generates syntactically valid patches that follow project coding standards
- [ ] Validator runs the full eval suite on proposed changes and reports pass/fail
- [ ] Safety checker prevents modifications outside configured scope
- [ ] Policy enforcement prevents runaway improvement loops (max 10 proposals/hour)
- [ ] Human approval gate blocks production changes without review
- [ ] Change log documents all self-improvement proposals with rationale
- [ ] Self-improvement can be toggled on/off via CLI and dashboard

**Risk Level**: MEDIUM — Self-modifying code carries inherent risks; safety boundaries must be rigorously tested; eval-validated improvements may have subtle side effects; monitoring overhead must not degrade agent performance

---

#### Subphase 28.2: Implement AI-Powered Code Review
**Week**: 2–3
**Description**: Port gemini-cli's code review and PR creation skills (`code-reviewer` skill, `pr-creator` skill, `async-pr-review` skill, `pr-address-comments` skill, `review-duplication` skill, `string-reviewer` skill) into a unified AI-powered code review subsystem for Agentic OS V4. These skills provide: (1) Automated PR review with line-level comments on code quality, security, performance, and style; (2) Asynchronous PR review that processes PRs in the background and posts results; (3) PR creation from natural language descriptions with proper branching and commit structure; (4) Addressing PR review comments by understanding the feedback and implementing fixes; (5) Duplicate PR detection that identifies related or overlapping changes; (6) String review for i18n/l10n correctness and consistency. This subphase extends these capabilities with: (1) Support for review of all languages in the monorepo (TypeScript, Rust, Go, Python, SQL, YAML, Markdown); (2) Integration with GitHub/GitLab/Bitbucket APIs for seamless CI/CD integration; (3) Customizable review rules via configuration; (4) Learning from accepted/rejected review comments to improve future reviews; (5) Security-focused review with automated vulnerability scanning integration.

**Copy Source**: `gemini-cli/.gemini/skills/code-reviewer/`, `pr-creator/`, `async-pr-review/`, `pr-address-comments/`, `review-duplication/`, `string-reviewer/` → `packages/code-review/`

**Key Files to Create/Modify**:
- `packages/code-review/package.json` — Code review package config
- `packages/code-review/src/index.ts` — Main entry point
- `packages/code-review/src/reviewer.ts` — Code review orchestrator
- `packages/code-review/src/diff-parser.ts` — Git diff parsing and analysis
- `packages/code-review/src/comment-generator.ts` — Line-level comment generation
- `packages/code-review/src/security-scanner.ts` — Security vulnerability detection
- `packages/code-review/src/performance-analyzer.ts` — Performance impact analysis
- `packages/code-review/src/style-checker.ts` — Coding style compliance checking
- `packages/code-review/src/duplicate-detector.ts` — Duplicate PR/diff detection
- `packages/code-review/src/async-reviewer.ts` — Background PR review processing
- `packages/code-review/src/pr-creator.ts` — PR creation from description
- `packages/code-review/src/pr-addresser.ts` — Automated addressing of review comments
- `packages/code-review/src/i18n-reviewer.ts` — String/i18n review (from string-reviewer)
- `packages/code-review/src/learning-adapter.ts` — ML-based improvement from feedback
- `packages/code-review/src/language-adapters/` — Language-specific review logic
- `packages/code-review/src/language-adapters/typescript.ts` — TypeScript review rules
- `packages/code-review/src/language-adapters/rust.ts` — Rust review rules
- `packages/code-review/src/language-adapters/go.ts` — Go review rules
- `packages/code-review/src/language-adapters/python.ts` — Python review rules
- `packages/code-review/src/language-adapters/sql.ts` — SQL review rules
- `packages/code-review/src/language-adapters/yaml.ts` — YAML/Markdown review rules
- `packages/code-review/src/integrations/github.ts` — GitHub API integration
- `packages/code-review/src/integrations/gitlab.ts` — GitLab API integration
- `packages/code-review/src/integrations/bitbucket.ts` — Bitbucket API integration
- `packages/code-review/src/config.ts` — Review configuration schema
- `packages/code-review/src/types.ts` — Type definitions
- `packages/code-review/rules/` — Default review rule sets
- `packages/code-review/rules/security.yaml` — Security review rules
- `packages/code-review/rules/style.yaml` — Style review rules
- `packages/code-review/rules/performance.yaml` — Performance review rules
- `packages/code-review/tests/` — Code review tests
- `packages/code-review/tests/diff-parser.test.ts` — Diff parsing tests
- `packages/code-review/tests/reviewer.test.ts` — Reviewer integration tests
- `packages/code-review/tests/pr-creator.test.ts` — PR creation tests
- `packages/code-review/vitest.config.ts` — Vitest configuration
- `packages/code-review/tsconfig.json` — TypeScript configuration
- `packages/code-review/README.md` — Documentation
- `.github/workflows/auto-review.yml` — GitHub Actions for automated PR review
- `apps/cli/src/commands/review.ts` — CLI command for code review
- `apps/cli/src/commands/create-pr.ts` — CLI command for PR creation
- `apps/dashboard/src/pages/review-dashboard.tsx` — Code review dashboard

**Acceptance Criteria**:
- [ ] Code review generates line-level comments on PRs within 60 seconds of submission
- [ ] Security scanner detects OWASP Top 10 vulnerabilities in code changes with >90% precision
- [ ] Duplicate detector identifies PRs with >70% diff overlap
- [ ] PR creator creates properly structured PRs from natural language descriptions
- [ ] Review comment addressing correctly implements >80% of review suggestions
- [ ] Language adapters cover all 6 target languages with >20 rules each
- [ ] GitHub/GitLab/Bitbucket integrations post review results as PR comments
- [ ] Learning adapter improves review quality over time (measured by human acceptance rate)
- [ ] Custom review rules can be added via YAML configuration without code changes
- [ ] Async review processes PRs in the background with result notification

**Risk Level**: LOW — Skills are well-established in gemini-cli; code review is a well-understood domain; GitHub API integration is standard; rule-based systems are maintainable

---

#### Subphase 28.3: Implement Automated Documentation Generation
**Week**: 4
**Description**: Port gemini-cli's documentation writing skills (`docs-writer` skill, `docs-changelog` skill) into a comprehensive automated documentation generation subsystem for Agentic OS V4. The docs-writer skill generates project documentation including API references, user guides, README files, and architecture documents from source code analysis, while the docs-changelog skill generates release notes and changelogs from git history. This subphase extends the documentation system to: (1) Generate API reference documentation from TypeScript declarations, Rust doc comments, Go doc strings, and Python docstrings; (2) Generate user guides from skill definitions, configuration schemas, and command definitions; (3) Generate architecture documentation from project structure, dependency graphs, and module boundaries; (4) Generate changelogs from conventional commit history with semantic version categorization; (5) Generate tutorial content from test scenarios and example code; (6) Maintain documentation freshness by detecting when source code changes and regenerating affected docs; (7) Support multiple output formats (Markdown, HTML, PDF, website) with customizable templates.

**Copy Source**: `gemini-cli/.gemini/skills/docs-writer/`, `docs-changelog/` → `packages/docs-generator/`

**Key Files to Create/Modify**:
- `packages/docs-generator/package.json` — Docs generator package config
- `packages/docs-generator/src/index.ts` — Main entry point
- `packages/docs-generator/src/generator.ts` — Documentation generation orchestrator
- `packages/docs-generator/src/api-reference/` — API reference generation
- `packages/docs-generator/src/api-reference/typescript.ts` — TypeScript API doc extraction (TSDoc, JSDoc)
- `packages/docs-generator/src/api-reference/rust.ts` — Rust doc comment extraction (rustdoc)
- `packages/docs-generator/src/api-reference/go.ts` — Go doc comment extraction (go doc)
- `packages/docs-generator/src/api-reference/python.ts` — Python docstring extraction (Sphinx, Google)
- `packages/docs-generator/src/user-guides/` — User guide generation
- `packages/docs-generator/src/user-guides/cli-commands.ts` — CLI command documentation
- `packages/docs-generator/src/user-guides/config-schemas.ts` — Configuration schema documentation
- `packages/docs-generator/src/user-guides/skill-docs.ts` — Skill documentation extraction
- `packages/docs-generator/src/user-guides/tutorial-gen.ts` — Tutorial generation from tests
- `packages/docs-generator/src/architecture/` — Architecture documentation
- `packages/docs-generator/src/architecture/project-map.ts` — Project structure documentation
- `packages/docs-generator/src/architecture/dependency-graph.ts` — Dependency graph visualization
- `packages/docs-generator/src/architecture/module-docs.ts` — Module boundary documentation
- `packages/docs-generator/src/changelog/` — Changelog generation
- `packages/docs-generator/src/changelog/git-log.ts` — Git log parsing
- `packages/docs-generator/src/changelog/commit-classifier.ts` — Conventional commit classification
- `packages/docs-generator/src/changelog/release-notes.ts` — Release note generation
- `packages/docs-generator/src/changelog/version-bump.ts` — Semantic version calculation
- `packages/docs-generator/src/freshness/` — Documentation freshness management
- `packages/docs-generator/src/freshness/tracker.ts` — Track doc-source relationships
- `packages/docs-generator/src/freshness/stale-detector.ts` — Detect outdated documentation
- `packages/docs-generator/src/freshness/regenerator.ts` — Automatic regeneration of stale docs
- `packages/docs-generator/src/output/` — Output format handlers
- `packages/docs-generator/src/output/markdown.ts` — Markdown output
- `packages/docs-generator/src/output/html.ts` — HTML output with theming
- `packages/docs-generator/src/output/pdf.ts` — PDF output via Puppeteer
- `packages/docs-generator/src/output/website.ts` — Website/static site generation
- `packages/docs-generator/src/templates/` — Output templates
- `packages/docs-generator/src/templates/api-ref.md` — API reference template
- `packages/docs-generator/src/templates/user-guide.md` — User guide template
- `packages/docs-generator/src/templates/architecture.md` — Architecture doc template
- `packages/docs-generator/src/templates/changelog.md` — Changelog template
- `packages/docs-generator/src/config.ts` — Generator configuration schema
- `packages/docs-generator/src/types.ts` — Type definitions
- `packages/docs-generator/tests/` — Documentation generator tests
- `packages/docs-generator/tests/api-ref.test.ts` — API reference generation tests
- `packages/docs-generator/tests/changelog.test.ts` — Changelog generation tests
- `packages/docs-generator/tests/freshness.test.ts` — Freshness tracking tests
- `packages/docs-generator/vitest.config.ts` — Vitest configuration
- `packages/docs-generator/tsconfig.json` — TypeScript configuration
- `packages/docs-generator/README.md` — Documentation
- `scripts/docs/generate.sh` — Script to regenerate all documentation
- `scripts/docs/check-freshness.sh` — Script to check documentation freshness
- `apps/cli/src/commands/docs.ts` — CLI command for docs generation
- `.github/workflows/docs.yml` — GitHub Actions for automated docs generation

**Acceptance Criteria**:
- [ ] API reference generated from TypeScript source covers 100% of exported symbols with TSDoc
- [ ] CLI command documentation generated from command definitions with all flags and examples
- [ ] Configuration schema documentation generated from JSON Schema definitions
- [ ] Changelog generated from git history correctly categorizes breaking/feature/fix/other changes
- [ ] Freshness tracker correctly identifies docs that need regeneration after source changes
- [ ] Tutorial content generated from test scenarios with working code examples
- [ ] Output in Markdown and HTML formats is production-quality with proper formatting
- [ ] Documentation generation completes for the entire monorepo in <5 minutes
- [ ] Regenerated docs maintain existing custom edits (idempotent regions)
- [ ] PDF output with proper pagination, table of contents, and cross-references

**Risk Level**: LOW — Documentation generation is a well-understood domain with mature tooling (TypeDoc, rustdoc, godoc, Sphinx); templates provide structure; freshness tracking is straightforward file-hash comparison

---

#### Subphase 28.4: Implement CI/CD Integration with AI
**Week**: 5
**Description**: Port gemini-cli's CI integration skill (`ci` skill) into a comprehensive AI-powered CI/CD integration subsystem that brings agent intelligence into the continuous integration and deployment pipeline. The CI skill monitors CI pipeline execution, analyzes failures to determine root causes, suggests fixes, and can auto-fix certain classes of failures (lint errors, type errors, test snapshots, dependency conflicts). This subphase extends the CI integration to: (1) Integrate with GitHub Actions, GitLab CI, and CircleCI for pipeline monitoring; (2) Provide intelligent failure triage that categorizes failures (flake vs. real vs. infrastructure) and suggests appropriate actions; (3) Auto-fix common issues (lint auto-fix, snapshot updates, dependency version bumps, TypeScript strict errors); (4) Generate CI pipeline performance reports showing timing trends and bottleneck analysis; (5) Implement CI pipeline optimization suggestions (parallelization, caching, workflow restructuring); (6) Provide a CI dashboard that aggregates pipeline status across all repositories and branches with AI-powered insights.

**Copy Source**: `gemini-cli/.gemini/skills/ci/` → `packages/ci-integration/`

**Key Files to Create/Modify**:
- `packages/ci-integration/package.json` — CI integration package config
- `packages/ci-integration/src/index.ts` — Main entry point
- `packages/ci-integration/src/monitor.ts` — CI pipeline monitoring and event ingestion
- `packages/ci-integration/src/analyzers/` — Failure analysis subsystem
- `packages/ci-integration/src/analyzers/failure-classifier.ts` — Categorize failures into types
- `packages/ci-integration/src/analyzers/root-cause.ts` — Root cause analysis from logs
- `packages/ci-integration/src/analyzers/flake-detector.ts` — Flaky test identification
- `packages/ci-integration/src/analyzers/infra-issue.ts` — Infrastructure failure detection
- `packages/ci-integration/src/auto-fix/` — Automated fix subsystem
- `packages/ci-integration/src/auto-fix/lint.ts` — Lint error auto-fix
- `packages/ci-integration/src/auto-fix/snapshots.ts` — Snapshot update
- `packages/ci-integration/src/auto-fix/dependencies.ts` — Dependency conflict resolution
- `packages/ci-integration/src/auto-fix/typescript.ts` — TypeScript error auto-fix
- `packages/ci-integration/src/optimizer/` — Pipeline optimization subsystem
- `packages/ci-integration/src/optimizer/pipeline-analyzer.ts` — Pipeline performance analysis
- `packages/ci-integration/src/optimizer/parallelization.ts` — Parallelization suggestions
- `packages/ci-integration/src/optimizer/caching.ts` — Cache optimization suggestions
- `packages/ci-integration/src/optimizer/workflow-restructure.ts` — Workflow restructuring suggestions
- `packages/ci-integration/src/integrations/` — CI platform integrations
- `packages/ci-integration/src/integrations/github-actions.ts` — GitHub Actions API client
- `packages/ci-integration/src/integrations/gitlab-ci.ts` — GitLab CI API client
- `packages/ci-integration/src/integrations/circleci.ts` — CircleCI API client
- `packages/ci-integration/src/reporting/` — Reporting subsystem
- `packages/ci-integration/src/reporting/insights.ts` — AI-powered pipeline insights
- `packages/ci-integration/src/reporting/performance.ts` — Pipeline timing reports
- `packages/ci-integration/src/reporting/slack.ts` — Slack notification integration
- `packages/ci-integration/src/config.ts` — CI integration configuration
- `packages/ci-integration/src/types.ts` — Type definitions
- `packages/ci-integration/tests/` — CI integration tests
- `packages/ci-integration/tests/monitor.test.ts` — Pipeline monitoring tests
- `packages/ci-integration/tests/auto-fix.test.ts` — Auto-fix logic tests
- `packages/ci-integration/vitest.config.ts` — Vitest configuration
- `packages/ci-integration/tsconfig.json` — TypeScript configuration
- `packages/ci-integration/README.md` — Documentation
- `apps/cli/src/commands/ci.ts` — CLI command for CI integration
- `apps/dashboard/src/pages/ci-dashboard.tsx` — CI dashboard page
- `.github/workflows/ci-agent.yml` — GitHub Actions for CI agent integration

**Acceptance Criteria**:
- [ ] CI pipeline monitoring integrates with GitHub Actions, GitLab CI, and CircleCI
- [ ] Failure classifier categorizes failures with >90% accuracy (measured against human labels)
- [ ] Flaky test detector identifies tests with >5% pass rate variance with >85% precision
- [ ] Lint auto-fix resolves >95% of ESLint/Prettier errors automatically
- [ ] Snapshot auto-update correctly identifies changed snapshots and updates them
- [ ] Dependency conflict resolution suggests correct version bumps for npm/Cargo/pip/go.mod
- [ ] Pipeline optimization suggestions reduce CI time by >15% when implemented
- [ ] CI dashboard shows real-time pipeline status with AI-powered failure insights
- [ ] Slack notifications deliver concise failure summaries with suggested fixes
- [ ] Auto-fix requires human approval before committing changes

**Risk Level**: MEDIUM — CI platform APIs change frequently; auto-fix for TypeScript errors is complex; flake detection requires statistical rigor; dependency resolution can have cascading effects

---

#### Subphase 28.5: Implement Behavioral Eval-Driven Development Workflow
**Week**: 6
**Description**: Implement a Behavioral Eval-Driven Development (BEDD) workflow that integrates behavioral evaluations into the core development cycle. Inspired by test-driven development (TDD), BEDD inverts the traditional approach: developers write behavioral evaluations (high-level scenario tests that describe expected agent behavior) before implementing features, and the AI agent implements code to make those evaluations pass. This subphase creates: (1) A BEDD CLI tool that initializes new eval-driven projects; (2) An eval-first code generation loop where the agent reads evals, generates implementation code, runs evals, and iterates until all pass; (3) An eval coverage analyzer that identifies gaps in behavioral test coverage; (4) An eval mutation testing system that checks if evals actually catch bugs by introducing mutations and verifying detection; (5) Integration with the self-improvement harness to automatically improve eval coverage over time; (6) A BEDD dashboard showing eval coverage trends, pass rates, and mutation scores over time. The BEDD workflow is designed to produce agents with verifiable behavioral guarantees.

**Copy Source**: New development combining gemini-cli's behavioral-evals skill with TDD methodology → `packages/bedd/`

**Key Files to Create/Modify**:
- `packages/bedd/package.json` — BEDD package config
- `packages/bedd/src/index.ts` — Main entry point
- `packages/bedd/src/cli.ts` — BEDD CLI command definitions
- `packages/bedd/src/init.ts` — Project initialization (eval directory structure, config, templates)
- `packages/bedd/src/workflow/` — Core BEDD workflow engine
- `packages/bedd/src/workflow/eval-first-generator.ts` — Read evals, generate implementation
- `packages/bedd/src/workflow/iteration-loop.ts` — Implement → run evals → fix → repeat
- `packages/bedd/src/workflow/coverage-analyzer.ts` — Analyze behavioral test coverage gaps
- `packages/bedd/src/workflow/mutation-tester.ts` — Mutation testing for eval quality
- `packages/bedd/src/workflow/self-improve-evals.ts` — Auto-improve eval coverage
- `packages/bedd/src/templates/` — Project and eval templates
- `packages/bedd/src/templates/bedd-project/` — New project template structure
- `packages/bedd/src/templates/bedd-project/evals/` — Example eval directory
- `packages/bedd/src/templates/bedd-project/evals/example.eval.ts` — Example eval file
- `packages/bedd/src/templates/bedd-project/bedd.config.yaml` — BEDD configuration
- `packages/bedd/src/templates/eval-templates/` — Individual eval templates
- `packages/bedd/src/templates/eval-templates/behavioral.md` — Behavioral eval template
- `packages/bedd/src/templates/eval-templates/unit.eval.ts` — Unit eval template
- `packages/bedd/src/templates/eval-templates/integration.eval.ts` — Integration eval template
- `packages/bedd/src/scoring/` — Eval scoring and quality metrics
- `packages/bedd/src/scoring/mutation-score.ts` — Mutation score calculation
- `packages/bedd/src/scoring/coverage-metrics.ts` — Behavioral coverage metrics
- `packages/bedd/src/scoring/eval-quality.ts` — Eval quality scoring (non-flaky, thorough)
- `packages/bedd/src/reporting/` — BEDD report generation
- `packages/bedd/src/reporting/coverage-report.ts` — Eval coverage HTML report
- `packages/bedd/src/reporting/mutation-report.ts` — Mutation testing report
- `packages/bedd/src/reporting/trend-dashboard.ts` — Trend visualization data
- `packages/bedd/src/config.ts` — BEDD configuration schema
- `packages/bedd/src/types.ts` — Type definitions
- `packages/bedd/tests/` — BEDD framework tests
- `packages/bedd/tests/workflow.test.ts` — Workflow engine tests
- `packages/bedd/tests/mutation.test.ts` — Mutation testing tests
- `packages/bedd/tests/coverage.test.ts` — Coverage analyzer tests
- `packages/bedd/vitest.config.ts` — Vitest configuration
- `packages/bedd/tsconfig.json` — TypeScript configuration
- `packages/bedd/README.md` — BEDD workflow documentation
- `apps/cli/src/commands/bedd.ts` — CLI command for BEDD workflow
- `apps/dashboard/src/pages/bedd-dashboard.tsx` — BEDD dashboard page
- `docs/bedd-workflow.md` — BEDD methodology documentation
- `CONTRIBUTING.md` (update) — Add BEDD workflow to contribution guidelines

**Acceptance Criteria**:
- [ ] `agentic bedd init` creates a new eval-driven project with proper directory structure
- [ ] Eval-first generator reads evals and produces initial implementation that passes >50% of evals
- [ ] Iteration loop converges to 100% eval pass rate within 5 iterations (with LLM assistance)
- [ ] Coverage analyzer identifies untested behavioral dimensions with >80% recall
- [ ] Mutation tester introduces code mutations and verifies at least 80% are caught by evals
- [ ] Mutation score of >80% is required for production-ready eval suites
- [ ] Self-improvement subsystem increases eval mutation score by >5% per cycle
- [ ] BEDD dashboard shows eval coverage, pass rate trends, and mutation score over time
- [ ] New evals can be added with <30 lines of code following the template
- [ ] BEDD workflow integrates with the existing eval framework and CI pipeline

**Risk Level**: MEDIUM — BEDD is a novel workflow paradigm that requires team adoption; eval-first generation depends on LLM quality for initial implementations; mutation testing can be computationally expensive; coverage metrics for behavioral tests are less well-defined than code coverage

---

## Phase 29: Production Hardening & Zero-Hassle Distribution
**Duration**: 6 weeks
**Dependencies**: Phase 23 (Extension/Recipe Unification), Phase 25 (Sandbox & Security Isolation)
**Overall Risk**: HIGH — Native binary compilation across platforms, auto-update safety, installer complexity

### Overview
Phase 29 transforms Agentic OS V4 from a development-stage project into a production-ready, distributable product. This phase focuses on the "last mile" of software delivery: packaging the entire system as a single, self-contained binary (Rust core with embedded TypeScript runtime), creating cross-platform installers for all major operating systems, implementing a safe auto-update mechanism with rollback guarantees, designing a polished first-run experience, and building diagnostic tools that empower users and support teams to troubleshoot issues effectively.

---

#### Subphase 29.1: Implement Single Binary Packaging (Rust Core with Embedded TS Runtime)
**Week**: 1–2
**Description**: Implement a single binary packaging strategy for Agentic OS V4 using a Rust core that embeds the TypeScript runtime (via Deno's V8 engine or Node.js single-file executable). This approach, building on goose's Rust core and gemini-cli's sea-launcher (`sea/sea-launch.cjs`), creates a zero-dependency executable that contains the entire Agentic OS V4 runtime. The Rust core handles: (1) CLI entry point, argument parsing, and command dispatch; (2) File system operations with sandbox enforcement; (3) Native OS integration (process management, signals, permissions); (4) Local inference engine bindings (llama.cpp via napi-rs); (5) Auto-update logic and installer/uninstaller; (6) Embedded web server for dashboard and MCP HTTP transport. The embedded TypeScript runtime contains: (1) Agent core and routing logic; (2) MCP client/server implementations; (3) Dashboard frontend (bundled); (4) VS Code companion extension (bundled); (5) Default skills and recipes. The binary is compressed using UPX for minimal download size.

**Copy Source**: `gemini-cli/sea/sea-launch.cjs` + `goose` Rust core → `packages/binary/`

**Key Files to Create/Modify**:
- `packages/binary/package.json` — Binary packaging scripts
- `packages/binary/rust/Cargo.toml` — Rust binary crate configuration
- `packages/binary/rust/src/main.rs` — Entry point: CLI arg parsing → command dispatch
- `packages/binary/rust/src/cli.rs` — CLI command definitions and routing
- `packages/binary/rust/src/embedded.rs` — Embedded TypeScript runtime loader
- `packages/binary/rust/src/runtime.rs` — TS runtime management (start, stop, restart)
- `packages/binary/rust/src/filesystem.rs` — Wrapped fs operations with sandbox
- `packages/binary/rust/src/native.rs` — Native OS integration (signals, permissions, processes)
- `packages/binary/rust/src/inference.rs` — Local inference binding (napi-rs → llama.cpp)
- `packages/binary/rust/src/updater.rs` — Auto-update trigger and verification
- `packages/binary/rust/src/installer.rs` — Install/uninstall logic for self-extraction
- `packages/binary/rust/src/server.rs` — Embedded HTTP server for dashboard
- `packages/binary/rust/src/compression.rs` — Bundle decompression (UPX/LZ4)
- `packages/binary/rust/build.rs` — Build script that bundles TS runtime and assets
- `packages/binary/scripts/bundle.js` — Script to create binary bundle (from build_binary.js)
- `packages/binary/scripts/package.js` — Script to prepare npm package (from prepare-package.js)
- `packages/binary/scripts/build.js` — Main build script (from build.js)
- `packages/binary/scripts/compress.js` — UPX compression script
- `packages/binary/scripts/entitlements.plist` — macOS code signing entitlements
- `packages/binary/configs/` — Build configurations per platform
- `packages/binary/configs/linux-x64.json` — Linux x86_64 config
- `packages/binary/configs/linux-arm64.json` — Linux ARM64 config
- `packages/binary/configs/darwin-x64.json` — macOS x86_64 config
- `packages/binary/configs/darwin-arm64.json` — macOS ARM64 (Apple Silicon) config
- `packages/binary/configs/win32-x64.json` — Windows x86_64 config
- `packages/binary/configs/win32-arm64.json` — Windows ARM64 config
- `packages/binary/tests/` — Binary packaging tests
- `packages/binary/tests/sea-launch.test.js` — Sea-launcher port tests (from sea-launch.test.js)
- `packages/binary/tests/bundle-contents.test.ts` — Bundle content verification
- `packages/binary/tests/cross-platform.test.ts` — Cross-platform execution tests
- `Makefile` (root, update) — Add binary build targets
- `scripts/build/binary.sh` — Full binary build script
- `scripts/build/binary-all.sh` — Build binary for all platforms
- `.github/workflows/build-binary.yml` — CI workflow for binary builds

**Acceptance Criteria**:
- [ ] Single binary executable runs on Linux (x86_64, aarch64), macOS (arm64, x86_64), Windows (x86_64, arm64)
- [ ] Binary size <100MB compressed (UPX), <250MB uncompressed
- [ ] Cold start <1 second (binary launch to CLI ready)
- [ ] All CLI commands work identically in binary mode and npm mode
- [ ] Dashboard serves on `localhost:3000` with bundled frontend
- [ ] Local inference (llama.cpp) loads and runs within the binary
- [ ] VS Code companion extension bundles and installs on first IDE detection
- [ ] Binary passes all integration and behavioral evals
- [ ] Cross-compilation from a single host (Linux build machine) produces all platform binaries
- [ ] Binary runs on systems without Node.js, npm, or any runtime dependencies

**Risk Level**: HIGH — Cross-compilation requires toolchain setup for each target; napi-rs native bindings complicate embedding; V8 embedding has complex licensing; binary size optimization requires careful tree-shaking; UPX decompression may trigger antivirus false positives

---

#### Subphase 29.2: Implement Cross-Platform Installer
**Week**: 3–4
**Description**: Build production-quality installers for all major operating systems that install the Agentic OS V4 binary, register it as a system command, and set up the user environment. The installer system covers: (1) Windows — NSIS-based .exe installer with options for system-wide installation, PATH registration, Start Menu shortcut, uninstaller, and optional Windows Service registration for the agent daemon. MSI package via WiX Toolset for enterprise deployment with Group Policy support. (2) macOS — .app bundle for the dashboard launcher, .dmg image for distribution, Homebrew formula for developer installation, and pkg installer for system-wide deployment. Code signing with Apple Developer ID for notarization. (3) Linux — .deb package for Debian/Ubuntu (with apt repository), .rpm package for Fedora/RHEL (with dnf/yum repository), .AppImage for distribution-agnostic portable installation, and Snap package for Ubuntu Core. (4) Installation scripts for CI/CD environments (curl | sh, brew install, scoop install, winget install). The installer handles first-run setup including environment configuration, default skill installation, and optional telemetry opt-in prompt.

**Copy Source**: New development inspired by goose's cross-platform distribution → `packages/installer/`

**Key Files to Create/Modify**:
- `packages/installer/package.json` — Installer build tooling
- `packages/installer/windows/` — Windows installer resources
- `packages/installer/windows/installer.nsi` — NSIS installer script
- `packages/installer/windows/installer.ico` — Installer icon
- `packages/installer/windows/banner.bmp` — Installer banner image
- `packages/installer/windows/uninstaller.nsi` — NSIS uninstaller script
- `packages/installer/windows/Product.wxs` — WiX MSI manifest
- `packages/installer/windows/Product.wxl` — WiX localization
- `packages/installer/windows/service-install.nsi` — Windows Service registration
- `packages/installer/macos/` — macOS installer resources
- `packages/installer/macos/Info.plist` — .app bundle Info.plist
- `packages/installer/macos/AppIcon.icns` — App icon
- `packages/installer/macos/DMGSetup.applescript` — DMG window setup script
- `packages/installer/macos/entitlements.plist` — Code signing entitlements
- `packages/installer/macos/Package.postinstall` — pkg post-install script
- `packages/installer/macos/agentic-os.rb` — Homebrew formula
- `packages/installer/linux/` — Linux installer resources
- `packages/installer/linux/debian/` — Debian packaging
- `packages/installer/linux/debian/DEBIAN/control` — Debian package control file
- `packages/installer/linux/debian/DEBIAN/postinst` — Post-install script
- `packages/installer/linux/debian/DEBIAN/prerm` — Pre-remove script
- `packages/installer/linux/rpm/agentic-os.spec` — RPM spec file
- `packages/installer/linux/appimage/AppImageBuilder.yml` — AppImage builder config
- `packages/installer/linux/snap/snapcraft.yaml` — Snap package config
- `packages/installer/linux/repo/` — APT/DNF repository tooling
- `packages/installer/scripts/` — Cross-platform installer scripts
- `packages/installer/scripts/install.sh` — Unix curl | sh installer
- `packages/installer/scripts/install.ps1` — Windows PowerShell installer
- `packages/installer/scripts/uninstall.sh` — Unix uninstaller
- `packages/installer/scripts/uninstall.ps1` — Windows uninstaller
- `packages/installer/scripts/post-install.ts` — Post-install setup (config, defaults)
- `packages/installer/scripts/post-update.ts` — Post-update migration tasks
- `packages/installer/tests/` — Installer tests
- `packages/installer/tests/install.sh.test.ts` — Shell installer test
- `packages/installer/tests/post-install.test.ts` — Post-install logic tests
- `packages/installer/tests/uninstall.test.ts` — Uninstall cleanup verification
- `scripts/build/installers.sh` — Build all installers
- `scripts/build/installer-windows.sh` — Build Windows installer (cross-compile)
- `scripts/build/installer-macos.sh` — Build macOS installer
- `scripts/build/installer-linux.sh` — Build Linux installers
- `scripts/release/publish-installers.sh` — Publish installers to CDN
- `.github/workflows/build-installers.yml` — CI workflow for installer builds
- `docs/installation/` — Installation documentation per platform
- `docs/installation/windows.md` — Windows installation guide
- `docs/installation/macos.md` — macOS installation guide
- `docs/installation/linux.md` — Linux installation guide

**Acceptance Criteria**:
- [ ] Windows .exe installer installs, registers in PATH, and creates Start Menu shortcut
- [ ] Windows .msi installer supports silent deployment (msiexec /quiet)
- [ ] macOS .app opens dashboard; .dmg mounts with drag-to-Applications shortcut
- [ ] macOS Homebrew formula installs via `brew install agentic-os/tap/agentic`
- [ ] Linux .deb installs via `apt-get install agentic-os` (after repo add)
- [ ] Linux .rpm installs via `dnf install agentic-os` (after repo add)
- [ ] Linux AppImage runs on any distribution without installation
- [ ] `curl -fsSL https://get.agentic-os.dev | sh` installs on Unix systems
- [ ] Uninstaller removes all files, PATH entries, and user config (with --purge flag)
- [ ] All installers produce identical binary checksums for the same version

**Risk Level**: HIGH — Windows code signing requires EV certificate ($300+/year); macOS notarization requires Apple Developer account ($99+/year); packaging format variations across Linux distributions; NSIS/WiX learning curve; installer testing across 10+ OS versions is resource-intensive

---

#### Subphase 29.3: Implement Auto-Update Mechanism with Rollback Safety
**Week**: 5
**Description**: Implement a robust auto-update mechanism for Agentic OS V4 that ensures users always run the latest stable version while providing safety guarantees against failed updates. The auto-update system (building on goose's Rust-based update logic and gemini-cli's release pipeline) operates through: (1) Update check — periodic checks against a signed update manifest hosted on a CDN, with configurable update channel (stable, beta, nightly); (2) Download — background download of the new binary with integrity verification via SHA-256 checksum and GPG signature; (3) Staged installation — new binary is downloaded to a staging directory alongside the current version; (4) Atomic swap — on next launch, the current binary is renamed as a backup and the new binary takes its place; (5) Rollback — if the new binary fails health checks (exit code, version check, self-test), the backup is restored automatically; (6) Manual rollback — users can run `agentic update rollback` to return to the previous version; (7) Delta updates — binary diff patches (bsdiff/xdelta) for bandwidth-efficient updates; (8) Update policy — configurable via settings (auto/manual, channel selection, rollback thresholds). The update manifest includes version metadata, release notes, and minimum supported version enforcement.

**Copy Source**: goose Rust update logic + gemini-cli release scripts → `packages/updater/`

**Key Files to Create/Modify**:
- `packages/updater/package.json` — Updater package config (TypeScript orchestration)
- `packages/updater/rust/Cargo.toml` — Rust updater crate
- `packages/updater/rust/src/lib.rs` — Rust updater library
- `packages/updater/rust/src/checker.rs` — Update check against manifest
- `packages/updater/rust/src/downloader.rs` — Background download with resume
- `packages/updater/rust/src/verifier.rs` — Binary integrity verification (SHA-256 + GPG)
- `packages/updater/rust/src/swapper.rs` — Atomic binary swap with backup
- `packages/updater/rust/src/rollback.rs` — Automatic and manual rollback
- `packages/updater/rust/src/health.rs` — Post-update health checks
- `packages/updater/rust/src/delta.rs` — Delta update application (bsdiff)
- `packages/updater/rust/src/policy.rs` — Update policy enforcement
- `packages/updater/rust/src/telemetry.rs` — Update telemetry (success rate, failures)
- `packages/updater/src/index.ts` — TypeScript orchestration layer
- `packages/updater/src/config.ts` — Update configuration schema
- `packages/updater/src/manifest.ts` — Update manifest parsing and validation
- `packages/updater/src/notifier.ts` — User notification on available updates
- `packages/updater/src/scheduler.ts` — Periodic check scheduling
- `packages/updater/src/commands.ts` — CLI command implementations
- `packages/updater/scripts/sign-update.js` — Script to sign update manifests
- `packages/updater/scripts/generate-manifest.js` — Script to generate update manifest
- `packages/updater/scripts/publish-update.js` — Script to publish update to CDN
- `packages/updater/keys/` — GPG keys for update signing (gitignored, in secret store)
- `packages/updater/tests/` — Updater tests
- `packages/updater/tests/checker.test.ts` — Update check tests
- `packages/updater/tests/verifier.test.ts` — Binary verification tests
- `packages/updater/tests/rollback.test.ts` — Rollback mechanism tests
- `packages/updater/tests/health.test.ts` — Health check tests
- `packages/updater/tests/delta.test.ts` — Delta update tests
- `packages/updater/tests/rust/` — Rust unit tests
- `apps/cli/src/commands/update.ts` — `agentic update` command group
- `apps/cli/src/commands/update/check.ts` — `agentic update check` subcommand
- `apps/cli/src/commands/update/apply.ts` — `agentic update apply` subcommand
- `apps/cli/src/commands/update/rollback.ts` — `agentic update rollback` subcommand
- `apps/cli/src/commands/update/channel.ts` — `agentic update channel` subcommand
- `apps/cli/src/commands/update/history.ts` — `agentic update history` subcommand
- `apps/dashboard/src/pages/update-settings.tsx` — Update settings page
- `scripts/release/update/sign.sh` — Sign update artifacts
- `scripts/release/update/manifest.sh` — Generate manifest
- `scripts/release/update/publish.sh` — Publish to CDN
- `.github/workflows/publish-update.yml` — CI workflow for publishing updates
- `docs/updates.md` — Update mechanism documentation

**Acceptance Criteria**:
- [ ] Update check completes in <1 second (CDN HEAD request + local manifest parse)
- [ ] Binary download resumes on interruption (HTTP Range requests)
- [ ] SHA-256 verification catches any binary corruption with 100% reliability
- [ ] GPG signature verification prevents tampered updates
- [ ] Atomic swap takes <100ms with zero window of missing binary
- [ ] Automatic rollback triggers if new binary exits with non-zero or fails health check
- [ ] Manual rollback restores previous version in <2 seconds
- [ ] Delta updates reduce download size by >70% compared to full binary
- [ ] Update channels (stable/beta/nightly) are isolated and correctly gated
- [ ] Update history shows last 10 updates with version, date, and rollback availability

**Risk Level**: HIGH — Update mechanism is a prime attack vector; GPG key management requires secure infrastructure; atomic file operations differ across OS (rename is atomic on Unix but not Windows without MoveFileEx); delta updates require complex binary diffing; rollback must handle configuration schema migrations between versions

---

#### Subphase 29.4: Implement First-Run Experience (Wizard, Provider Setup, Skill Discovery)
**Week**: 5 (parallel with 29.3)
**Description**: Design and implement a polished first-run experience (FRX) for Agentic OS V4 that guides new users through initial setup with minimal friction. The FRX includes: (1) Welcome wizard — an interactive CLI or browser-based wizard that introduces the user to Agentic OS V4's capabilities, collects basic preferences (theme, update channel, telemetry consent), and guides through initial configuration; (2) Provider setup — streamlined API key configuration for LLM providers with auto-detection of existing keys (from environment variables, common config files, cloud provider secrets), one-click setup for popular providers (OpenAI, Anthropic, Google, Groq, Together, etc.), and a "local-only" mode that works entirely offline; (3) Skill discovery — an interactive skill browser that recommends skills based on user role (developer, data scientist, writer, operator), shows popular skills from the community, and provides one-click installation; (4) Sandbox setup — guided configuration of sandbox isolation levels with clear explanations of security trade-offs; (5) IDE integration prompt — detects running IDEs and offers to install the companion extension; (6) Sample project — creates a "hello world" project that demonstrates key capabilities (agent interaction, skill usage, MCP server creation). The FRX is designed to get users to their first successful agent interaction within 2 minutes of installation.

**Copy Source**: New development → `packages/first-run/`

**Key Files to Create/Modify**:
- `packages/first-run/package.json` — First-run experience package
- `packages/first-run/src/index.ts` — Main entry point and orchestration
- `packages/first-run/src/wizard/` — Welcome wizard
- `packages/first-run/src/wizard/cli-wizard.ts` — CLI-based interactive wizard (Inquirer/Enquirer)
- `packages/first-run/src/wizard/web-wizard.tsx` — Browser-based wizard (React)
- `packages/first-run/src/wizard/steps/` — Wizard step definitions
- `packages/first-run/src/wizard/steps/welcome.ts` — Welcome screen
- `packages/first-run/src/wizard/steps/provider-setup.ts` — Provider configuration
- `packages/first-run/src/wizard/steps/skill-selection.ts` — Skill selection
- `packages/first-run/src/wizard/steps/sandbox-config.ts` — Sandbox configuration
- `packages/first-run/src/wizard/steps/ide-integration.ts` — IDE setup prompt
- `packages/first-run/src/wizard/steps/telemetry.ts` — Telemetry consent
- `packages/first-run/src/wizard/steps/complete.ts` — Completion and next steps
- `packages/first-run/src/provider-setup/` — Provider configuration subsystem
- `packages/first-run/src/provider-setup/key-detector.ts` — Auto-detect existing API keys
- `packages/first-run/src/provider-setup/key-validator.ts` — Validate API keys with test call
- `packages/first-run/src/provider-setup/provider-catalog.ts` — Provider list with config UIs
- `packages/first-run/src/provider-setup/local-mode.ts` — Local-only mode setup
- `packages/first-run/src/skill-discovery/` — Skill discovery subsystem
- `packages/first-run/src/skill-discovery/browser.ts` — Skill browser with filtering
- `packages/first-run/src/skill-discovery/recommender.ts` — Role-based skill recommendations
- `packages/first-run/src/skill-discovery/installer.ts` — One-click skill installation
- `packages/first-run/src/sample-project/` — Sample project generator
- `packages/first-run/src/sample-project/generator.ts` — Project scaffolding
- `packages/first-run/src/sample-project/templates/` — Sample project templates
- `packages/first-run/src/sample-project/templates/hello-agent/` — Hello agent project
- `packages/first-run/src/sample-project/templates/hello-agent/main.ts` — Sample agent script
- `packages/first-run/src/sample-project/templates/hello-mcp/` — Sample MCP server project
- `packages/first-run/src/sample-project/templates/hello-skill/` — Sample skill project
- `packages/first-run/src/telemetry/` — Telemetry consent management
- `packages/first-run/src/telemetry/consent.ts` — Consent storage and management
- `packages/first-run/src/telemetry/opt-in.ts` — Opt-in prompt and explanation
- `packages/first-run/src/config.ts` — FRX configuration
- `packages/first-run/src/types.ts` — Type definitions
- `packages/first-run/src/tracking.ts` — FRX completion tracking (to avoid re-display)
- `packages/first-run/tests/` — FRX tests
- `packages/first-run/tests/wizard-flow.test.ts` — Wizard flow integration tests
- `packages/first-run/tests/key-detector.test.ts` — Key detection tests
- `packages/first-run/tests/sample-project.test.ts` — Sample project generation tests
- `apps/cli/src/commands/setup.ts` — `agentic setup` command to trigger FRX
- `apps/dashboard/src/pages/setup-wizard.tsx` — Web-based setup wizard
- `apps/cli/src/hooks/post-install.ts` — Hook to trigger FRX after install
- `docs/get-started/` — Getting started documentation
- `docs/get-started/index.md` — Quick start guide
- `docs/get-started/first-agent.md` — Your first agent interaction guide

**Acceptance Criteria**:
- [ ] Welcome wizard completes initial setup in <5 steps with <2 minutes total time
- [ ] Provider setup auto-detects API keys from environment variables with >90% accuracy
- [ ] Key validation makes a test API call and reports success/failure clearly
- [ ] Local-only mode configures Agentic OS V4 to work entirely offline with zero configuration
- [ ] Skill discovery shows role-based recommendations with clear descriptions
- [ ] One-click skill installation completes in <5 seconds
- [ ] IDE detection prompts with one-click extension installation
- [ ] Sample project generates and runs without errors
- [ ] FRX only displays on first run (tracked in config)
- [ ] Users can skip the wizard and configure manually at any point

**Risk Level**: LOW — Wizard pattern is well-understood; provider setup is straightforward API key configuration; skill discovery is a simple catalog UI; no complex technical challenges

---

#### Subphase 29.5: Implement Diagnostic and Troubleshooting Tools
**Week**: 6
**Description**: Build a comprehensive suite of diagnostic and troubleshooting tools for Agentic OS V4 that empower users, support teams, and developers to identify and resolve issues quickly. The diagnostic suite includes: (1) Health check — `agentic health` command that runs a comprehensive system health check covering binary integrity, configuration validity, provider connectivity, MCP server status, skill loading, file system permissions, network access, and system resource availability. Outputs a color-coded summary with actionable remediation suggestions. (2) Log export — `agentic logs export` command that collects all relevant logs (agent sessions, provider requests, tool calls, errors, performance metrics) into a compressed archive with automatic PII redaction, ready for sharing with support. (3) Debug mode — `agentic debug` command that starts the agent with verbose logging, devtools panel auto-open, performance profiling, and real-time metric display. Includes a debug overlay in the CLI/TUI showing token usage, latency, and memory. (4) Configuration validator — `agentic config validate` that checks all configuration files for correctness, schema compliance, and internal consistency. Reports warnings for deprecated settings and suggestions for optimal configuration. (5) System information — `agentic system info` that displays detailed system information (OS, CPU, RAM, disk, GPU, Node.js version, installed packages, environment variables). (6) Network diagnostics — `agentic network test` that tests connectivity to all configured providers and CDN endpoints with latency measurement. (7) Bug report generator — `agentic report bug` that interactively collects information needed for a bug report and creates a pre-filled GitHub issue or support ticket.

**Copy Source**: New development → `packages/diagnostics/`

**Key Files to Create/Modify**:
- `packages/diagnostics/package.json` — Diagnostics package config
- `packages/diagnostics/src/index.ts` — Main entry point
- `packages/diagnostics/src/health/` — Health check subsystem
- `packages/diagnostics/src/health/checker.ts` — Health check orchestrator
- `packages/diagnostics/src/health/checks/` — Individual health checks
- `packages/diagnostics/src/health/checks/binary-integrity.ts` — Binary hash verification
- `packages/diagnostics/src/health/checks/config-validity.ts` — Configuration validity check
- `packages/diagnostics/src/health/checks/provider-connectivity.ts` — Provider API connectivity
- `packages/diagnostics/src/health/checks/mcp-servers.ts` — MCP server status
- `packages/diagnostics/src/health/checks/skill-loading.ts` — Skill loading test
- `packages/diagnostics/src/health/checks/filesystem-permissions.ts` — FS permission check
- `packages/diagnostics/src/health/checks/network-access.ts` — General network access
- `packages/diagnostics/src/health/checks/system-resources.ts` — CPU/RAM/disk availability
- `packages/diagnostics/src/health/checks/auto-update.ts` — Update mechanism health
- `packages/diagnostics/src/health/reporter.ts` — Color-coded health report with remediation
- `packages/diagnostics/src/logs/` — Log export subsystem
- `packages/diagnostics/src/logs/exporter.ts` — Log collection and packaging
- `packages/diagnostics/src/logs/collectors/` — Individual log collectors
- `packages/diagnostics/src/logs/collectors/agent-logs.ts` — Agent session logs
- `packages/diagnostics/src/logs/collectors/provider-logs.ts` — Provider request/response logs
- `packages/diagnostics/src/logs/collectors/tool-logs.ts` — Tool execution logs
- `packages/diagnostics/src/logs/collectors/error-logs.ts` — Error and crash logs
- `packages/diagnostics/src/logs/collectors/perf-metrics.ts` — Performance metrics dump
- `packages/diagnostics/src/logs/collectors/system-info.ts` — System information snapshot
- `packages/diagnostics/src/logs/redactor.ts` — PII redaction (API keys, tokens, emails)
- `packages/diagnostics/src/logs/archiver.ts` — Compression and archiving (.tar.gz / .zip)
- `packages/diagnostics/src/debug/` — Debug mode subsystem
- `packages/diagnostics/src/debug/mode.ts` — Debug mode activation and management
- `packages/diagnostics/src/debug/overlay.ts` — Real-time debug overlay (TUI)
- `packages/diagnostics/src/debug/profiler.ts` — CPU/memory profiling integration
- `packages/diagnostics/src/debug/metrics-display.ts` — Real-time metrics display
- `packages/diagnostics/src/config-validator/` — Configuration validator
- `packages/diagnostics/src/config-validator/validator.ts` — Config validation engine
- `packages/diagnostics/src/config-validator/schema-checker.ts` — Schema compliance check
- `packages/diagnostics/src/config-validator/deprecation-warnings.ts` — Deprecated setting detection
- `packages/diagnostics/src/config-validator/optimization-suggestions.ts` — Config improvement tips
- `packages/diagnostics/src/system/` — System information
- `packages/diagnostics/src/system/info.ts` — System information collection
- `packages/diagnostics/src/system/platform.ts` — Platform identification
- `packages/diagnostics/src/system/environment.ts` — Environment variable scan
- `packages/diagnostics/src/network/` — Network diagnostics
- `packages/diagnostics/src/network/tester.ts` — Provider connectivity tester
- `packages/diagnostics/src/network/latency.ts` — Latency measurement
- `packages/diagnostics/src/network/dns-resolver.ts` — DNS resolution test
- `packages/diagnostics/src/bug-report/` — Bug report generator
- `packages/diagnostics/src/bug-report/collector.ts` — Bug report data collection
- `packages/diagnostics/src/bug-report/formatter.ts` — GitHub issue / support ticket formatting
- `packages/diagnostics/src/bug-report/submitter.ts` — GitHub issue creation via API
- `packages/diagnostics/src/config.ts` — Diagnostics configuration
- `packages/diagnostics/src/types.ts` — Type definitions
- `packages/diagnostics/tests/` — Diagnostics tests
- `packages/diagnostics/tests/health.test.ts` — Health check tests
- `packages/diagnostics/tests/redactor.test.ts` — PII redaction tests
- `packages/diagnostics/tests/config-validator.test.ts` — Config validation tests
- `packages/diagnostics/tests/network.test.ts` — Network diagnostic tests
- `apps/cli/src/commands/health.ts` — `agentic health` command
- `apps/cli/src/commands/logs.ts` — `agentic logs` command group
- `apps/cli/src/commands/logs/export.ts` — `agentic logs export` subcommand
- `apps/cli/src/commands/logs/view.ts` — `agentic logs view` subcommand
- `apps/cli/src/commands/debug.ts` — `agentic debug` command
- `apps/cli/src/commands/config/validate.ts` — `agentic config validate` subcommand
- `apps/cli/src/commands/system/info.ts` — `agentic system info` command
- `apps/cli/src/commands/network/test.ts` — `agentic network test` command
- `apps/cli/src/commands/report.ts` — `agentic report bug` command
- `docs/troubleshooting.md` — Troubleshooting guide
- `docs/diagnostics.md` — Diagnostic tools documentation

**Acceptance Criteria**:
- [ ] Health check runs all 10 checks and completes in <5 seconds
- [ ] Health check output uses color coding (green/yellow/red) with actionable remediation
- [ ] Log export creates a <10MB compressed archive with all logs from the last 24 hours
- [ ] PII redaction removes API keys, tokens, email addresses, and file paths with >99% recall
- [ ] Debug mode shows real-time metrics with <500ms refresh interval
- [ ] Configuration validator catches 100% of schema violations with clear error messages
- [ ] System info displays all relevant details including OS, hardware, and environment
- [ ] Network test measures latency to all configured providers with per-provider timing
- [ ] Bug report generator creates a pre-filled GitHub issue with system info and logs
- [ ] All diagnostic commands have clear, human-readable output with suggested next steps

**Risk Level**: LOW — Diagnostic tools are non-critical path utilities; health checks are straightforward system probes; log collection and redaction use standard patterns

---

## Phase 30: Final Integration, Stabilization & Launch
**Duration**: 8 weeks
**Dependencies**: All previous phases (0–29)
**Overall Risk**: HIGH — Final integration complexity, security audit findings, load testing surprises, launch coordination

### Overview
Phase 30 is the culmination of all previous phases — the final integration, stabilization, and public launch of Agentic OS V4. This phase conducts full end-to-end integration testing across all 8 merged codebases, a comprehensive security audit and penetration testing, performance optimization and load testing at scale, completion of all documentation (user guide, API reference, admin guide, troubleshooting), and finally the v1.0.0 public release with community channels. This phase is as much about process and coordination as it is about technical work: creating release checklists, setting up community infrastructure, preparing marketing materials, and establishing the support framework for post-launch operations.

---

#### Subphase 30.1: Full End-to-End Integration Testing Across All 8 Merged Codebases
**Week**: 1–3
**Description**: Conduct a comprehensive end-to-end integration test campaign that validates the complete Agentic OS V4 system across all 8 merged codebases. Unlike the regression tests in Phase 27 which focus on specific scenarios, this campaign tests real-world workflows that span the entire system: (1) Developer workflow — developer installs Agentic OS V4, configures providers, opens VS Code, writes code with AI assistance, runs tests, creates PR with automated review, and deploys; (2) Operations workflow — admin sets up multi-tenant environment, configures billing plans, monitors usage dashboard, handles provider outages via fallback routing; (3) Enterprise workflow — SSO login, role-based access control, audit log inspection, compliance reporting, sandbox policy enforcement; (4) Edge case marathon — runs 1000+ edge case scenarios including network failures, corrupt data, concurrent access, resource exhaustion, and invalid inputs; (5) Long-running stability — 72-hour continuous operation under simulated production load with 50 concurrent active users, monitoring for memory leaks, performance degradation, and error accumulation; (6) Upgrade testing — tests the upgrade path from all previous major versions (if applicable), including configuration migration and state preservation. The campaign produces a detailed test report with pass/fail status for each scenario, known issues with severity ratings, and a release readiness score.

**Copy Source**: Combination of all existing integration tests + new E2E scenarios → `packages/testing/e2e/`

**Key Files to Create/Modify**:
- `packages/testing/e2e/package.json` — E2E test package config
- `packages/testing/e2e/src/index.ts` — E2E test runner entry point
- `packages/testing/e2e/src/scenarios/` — E2E test scenarios
- `packages/testing/e2e/src/scenarios/developer-workflow.test.ts` — Full developer workflow
- `packages/testing/e2e/src/scenarios/operations-workflow.test.ts` — Operations dashboard workflow
- `packages/testing/e2e/src/scenarios/enterprise-workflow.test.ts` — Enterprise SSO/RBAC workflow
- `packages/testing/e2e/src/scenarios/edge-case-marathon.test.ts` — 1000+ edge case scenarios
- `packages/testing/e2e/src/scenarios/long-running-stability.test.ts` — 72-hour stability test
- `packages/testing/e2e/src/scenarios/upgrade-path.test.ts` — Version upgrade test
- `packages/testing/e2e/src/scenarios/clean-install.test.ts` — Fresh installation test
- `packages/testing/e2e/src/scenarios/multi-user.test.ts` — Multi-user concurrent test
- `packages/testing/e2e/src/scenarios/provider-failover.test.ts` — Provider failover cascade
- `packages/testing/e2e/src/scenarios/data-migration.test.ts` — Data migration from V3
- `packages/testing/e2e/src/scenarios/offline-mode.test.ts` — Fully offline operation
- `packages/testing/e2e/src/scenarios/voice-multimodal.test.ts` — Voice + screen interaction
- `packages/testing/e2e/src/scenarios/computer-control.test.ts` — Computer control automation
- `packages/testing/e2e/src/harness/` — E2E test infrastructure
- `packages/testing/e2e/src/harness/test-orchestrator.ts` — Scenario orchestrator
- `packages/testing/e2e/src/harness/environment-setup.ts` — Clean environment per scenario
- `packages/testing/e2e/src/harness/state-verifier.ts` — Post-test state verification
- `packages/testing/e2e/src/harness/cleanup.ts` — Test environment cleanup
- `packages/testing/e2e/src/reporting/` — E2E test reporting
- `packages/testing/e2e/src/reporting/report-generator.ts` — Comprehensive test report
- `packages/testing/e2e/src/reporting/release-readiness.ts` — Release readiness score
- `packages/testing/e2e/src/reporting/known-issues.ts` — Known issue tracking
- `packages/testing/e2e/vitest.config.ts` — E2E vitest configuration
- `packages/testing/e2e/tsconfig.json` — TypeScript configuration
- `packages/testing/e2e/README.md` — E2E test documentation
- `scripts/e2e/run.sh` — Script to run E2E tests
- `scripts/e2e/run-all.sh` — Run full E2E suite including 72-hour test
- `scripts/e2e/run-fast.sh` — Run critical-path E2E subset
- `.github/workflows/e2e.yml` — GitHub Actions for E2E tests
- `.github/workflows/e2e-nightly.yml` — Nightly full E2E run
- `docs/release-testing.md` — Release testing protocol documentation

**Acceptance Criteria**:
- [ ] Developer workflow scenario completes end-to-end in <30 minutes (automated)
- [ ] Operations workflow scenario validates all dashboard features and billing flows
- [ ] Enterprise workflow scenario validates SSO, RBAC, audit logs, and compliance
- [ ] Edge case marathon covers 1000+ scenarios with <1% failure rate
- [ ] 72-hour stability test shows memory growth <50MB, latency degradation <10%
- [ ] Upgrade test passes for all supported previous versions
- [ ] Multi-user test handles 50 concurrent users with correct data isolation
- [ ] Provider failover cascades through 3 levels (primary → secondary → fallback) correctly
- [ ] Offline mode operates without any network access for all core features
- [ ] Release readiness score exceeds 95% across all dimensions (functionality, performance, security, reliability)

**Risk Level**: HIGH — Coordinating tests across 8 codebases requires careful environment management; 72-hour test requires dedicated infrastructure; edge case marathon may reveal critical issues late in the cycle; data migration testing requires representative production data

---

#### Subphase 30.2: Security Audit and Penetration Testing
**Week**: 3–5
**Description**: Conduct a comprehensive security audit and penetration testing campaign for Agentic OS V4, engaging both internal security team and external security researchers. The security assessment covers: (1) Architecture review — systematic review of the system architecture for security design flaws, trust boundary analysis, threat modeling using STRIDE methodology, and attack surface enumeration; (2) Dependency audit — comprehensive scan of all 500+ direct and transitive dependencies across TypeScript, Rust, Go, and Python packages for known vulnerabilities (CVEs), license compliance issues, and supply chain risks (dependency confusion, typo-squatting); (3) Static analysis — SAST (Static Application Security Testing) across all codebases using Semgrep, CodeQL, and ESLint security plugins, targeting OWASP Top 10, CWE Top 25, and custom rules for agent-specific vulnerabilities (prompt injection, tool command injection, sandbox escape); (4) Dynamic testing — DAST (Dynamic Application Security Testing) of the dashboard API, MCP endpoints, and provider gateway, including fuzzing of API inputs, SQL injection testing, XSS testing, CSRF testing, and authentication/authorization bypass attempts; (5) Penetration testing — manual penetration testing by security researchers focusing on sandbox escape, privilege escalation, data exfiltration, tenant isolation breach, and denial of service. External pen testers follow a defined scope and rules of engagement; (6) Responsible disclosure program setup — create a security.md, bug bounty program description, and vulnerability reporting process.

**Copy Source**: Security scanning tools + manual testing → `security/` directory

**Key Files to Create/Modify**:
- `security/` — Security audit directory (not a package, documentation and reports)
- `security/architecture-review/` — Architecture review artifacts
- `security/architecture-review/threat-model.md` — STRIDE threat model
- `security/architecture-review/attack-surface.md` — Attack surface enumeration
- `security/architecture-review/trust-boundaries.md` — Trust boundary analysis
- `security/architecture-review/review-findings.md` — Review findings and remediation
- `security/dependency-audit/` — Dependency audit results
- `security/dependency-audit/report.json` — Automated dependency scan results
- `security/dependency-audit/remediation.md` — Dependency fix recommendations
- `security/static-analysis/` — Static analysis results
- `security/static-analysis/semgrep-results.json` — Semgrep findings
- `security/static-analysis/codeql-results.json` — CodeQL findings
- `security/static-analysis/eslint-results.json` — ESLint security findings
- `security/static-analysis/remediation.md` — Code fix recommendations
- `security/dynamic-testing/` — Dynamic testing results
- `security/dynamic-testing/api-fuzz-results.json` — API fuzzing results
- `security/dynamic-testing/auth-bypass-results.json` — Auth bypass test results
- `security/dynamic-testing/xss-results.json` — XSS test results
- `security/dynamic-testing/sqli-results.json` — SQL injection test results
- `security/penetration-testing/` — Penetration testing results
- `security/penetration-testing/engagement-letter.md` — Rules of engagement
- `security/penetration-testing/findings.md` — Pen test findings
- `security/penetration-testing/remediation-timeline.md` — Fix timeline with severity
- `security/penetration-testing/retest-results.md` — Retest verification
- `security/security-policies/` — Security policies
- `security/security-policies/SECURITY.md` — Security policy for repository
- `security/security-policies/bug-bounty.md` — Bug bounty program description
- `security/security-policies/vulnerability-disclosure.md` — Disclosure process
- `security/security-policies/incident-response.md` — Incident response plan
- `scripts/security/audit.sh` — Run all automated security scans
- `scripts/security/dependency-scan.sh` — Scan dependencies for CVEs
- `scripts/security/sast.sh` — Run static analysis tools
- `scripts/security/dast.sh` — Run dynamic testing tools
- `scripts/security/fuzz.sh` — Run API fuzzing
- `scripts/security/fix.sh` — Auto-fix security issues where possible
- `.github/workflows/security-scan.yml` — CI workflow for security scanning
- `SECURITY.md` (root, update) — Security policy and contact information
- `docs/security/` — Security documentation
- `docs/security/overview.md` — Security architecture overview
- `docs/security/threat-model.md` — Public threat model summary
- `docs/security/compliance.md` — Compliance certifications and controls

**Acceptance Criteria**:
- [ ] STRIDE threat model completed with all threats rated and mitigated
- [ ] Dependency scan finds zero critical-severity CVEs in production dependencies (patched or waived)
- [ ] SAST scan finds zero critical-severity findings in production code
- [ ] DAST tests find zero exploitable vulnerabilities in dashboard API, MCP endpoints, or gateway
- [ ] External penetration test finds zero sandbox escapes and zero tenant isolation breaches
- [ ] All findings with CVSS >=7.0 fixed before v1.0.0 release
- [ ] Findings with CVSS 4.0–6.9 have documented remediation plan with timeline
- [ ] Findings with CVSS <4.0 documented as known issues with planned future fixes
- [ ] Bug bounty program published with clear scope, rules, and reward structure
- [ ] Security documentation published covering architecture, threat model, and compliance

**Risk Level**: HIGH — Critical security findings may require significant architectural changes; external pen test scheduling requires lead time; dependency vulnerabilities in transitive dependencies may be hard to fix; zero-day vulnerabilities cannot be predicted

---

#### Subphase 30.3: Performance Optimization and Load Testing (1000+ Concurrent Requests)
**Week**: 5–6
**Description**: Conduct comprehensive performance optimization and load testing to ensure Agentic OS V4 meets production performance targets. This subphase focuses on: (1) Load testing — simulate 1000+ concurrent users/agents interacting with the system simultaneously, measuring throughput, latency, error rates, and resource utilization under sustained load. Tests cover all major subsystems: provider routing (1000 routing decisions/sec), MCP server (500 concurrent connections), dashboard API (1000 requests/sec), local inference (100 concurrent inferences), and voice pipeline (50 concurrent streams). (2) Bottleneck identification — use profiling tools (perf, flamegraphs, Chrome DevTools) to identify CPU hotspots, memory bottlenecks, lock contention, and I/O stalls under load. (3) Optimization implementation — apply targeted optimizations based on profiling data: database query optimization, caching strategy improvements, connection pooling, request batching, lazy loading, worker thread parallelization, and data structure optimization. (4) Tuning — configuration tuning for optimal performance: connection pool sizes, cache TTLs, concurrency limits, buffer sizes, timeouts, and retry policies. (5) Capacity planning — determine the maximum capacity of a single node, identify linearity of scaling, and provide deployment recommendations for target throughput levels. (6) Performance regression gate — finalize the performance budget and baseline for v1.0.0, ensuring all performance metrics meet targets with headroom for production variation.

**Copy Source**: k6/Locust load test scripts + profiling tools → `scripts/load-testing/`

**Key Files to Create/Modify**:
- `scripts/load-testing/package.json` — Load testing scripts config
- `scripts/load-testing/k6/` — k6 load test scripts (TypeScript/JavaScript)
- `scripts/load-testing/k6/scenarios/` — Load test scenarios
- `scripts/load-testing/k6/scenarios/provider-routing.js` — Routing engine load test
- `scripts/load-testing/k6/scenarios/mcp-concurrent.js` — MCP server concurrency test
- `scripts/load-testing/k6/scenarios/dashboard-api.js` — Dashboard API load test
- `scripts/load-testing/k6/scenarios/mixed-workload.js` — Mixed workload simulation
- `scripts/load-testing/k6/scenarios/voice-streaming.js` — Voice pipeline load test
- `scripts/load-testing/k6/scenarios/local-inference.js` — Local inference load test
- `scripts/load-testing/k6/scenarios/endurance.js` — 4-hour endurance test
- `scripts/load-testing/k6/scenarios/spike.js` — Sudden traffic spike test
- `scripts/load-testing/k6/configs/` — Load test configurations
- `scripts/load-testing/k6/configs/light.json` — Light load (100 concurrent)
- `scripts/load-testing/k6/configs/medium.json` — Medium load (500 concurrent)
- `scripts/load-testing/k6/configs/heavy.json` — Heavy load (1000+ concurrent)
- `scripts/load-testing/k6/configs/endurance.json` — Endurance test config
- `scripts/load-testing/locust/` — Alternative load test scripts (Python)
- `scripts/load-testing/locust/locustfile.py` — Locust load test definition
- `scripts/load-testing/results/` — Load test results (gitignored)
- `scripts/load-testing/results/templates/` — Report templates
- `scripts/load-testing/results/templates/report.html` — HTML report template
- `scripts/load-testing/profiling/` — Performance profiling scripts
- `scripts/load-testing/profiling/cpu-profile.sh` — CPU profiling with perf
- `scripts/load-testing/profiling/memory-profile.sh` — Memory profiling with heapprof
- `scripts/load-testing/profiling/flamegraph.sh` — Flame graph generation
- `scripts/load-testing/profiling/lock-contention.sh` — Lock contention analysis
- `scripts/load-testing/optimizations/` — Optimization documentation
- `scripts/load-testing/optimizations/database.md` — Database query optimizations
- `scripts/load-testing/optimizations/caching.md` — Caching strategy improvements
- `scripts/load-testing/optimizations/connection-pooling.md` — Connection pool tuning
- `scripts/load-testing/optimizations/parallelization.md` — Worker thread parallelization
- `scripts/load-testing/capacity-planning.md` — Capacity planning recommendations
- `scripts/load-testing/run.sh` — Run load test suite
- `scripts/load-testing/run-report.sh` — Run and generate report
- `.github/workflows/load-test.yml` — CI workflow for load testing
- `docs/operations/performance.md` — Performance tuning guide
- `docs/operations/capacity-planning.md` — Capacity planning guide

**Acceptance Criteria**:
- [ ] Provider routing handles 1000+ decisions/second with P99 latency <50ms
- [ ] Dashboard API handles 1000 requests/second with P99 latency <200ms
- [ ] MCP server handles 500 concurrent connections with <1% error rate
- [ ] Local inference handles 100 concurrent requests with <10% throughput degradation
- [ ] Voice pipeline handles 50 concurrent streams with <500ms additional latency
- [ ] Mixed workload (simulating production) sustains 500 concurrent users for 4 hours
- [ ] Spike test (0 → 1000 users in 10 seconds) completes without errors
- [ ] Memory usage per active user <50MB (excluding model weights)
- [ ] CPU utilization <80% under peak load for all subsystems
- [ ] Performance budgets enforced with <10% variance allowed from baseline

**Risk Level**: MEDIUM — Load testing infrastructure requires dedicated resources (cloud instances); identifying and fixing bottlenecks may require significant refactoring; performance tuning is iterative and time-consuming; results vary by cloud provider and instance type

---

#### Subphase 30.4: Documentation Completion (User Guide, API Reference, Admin Guide, Troubleshooting)
**Week**: 6–7
**Description**: Complete all documentation for Agentic OS V4 across four documentation suites: (1) User Guide — comprehensive end-user documentation covering installation, configuration, daily usage, CLI reference, IDE integration, skills, MCP, voice, sandbox, and advanced features. Written for developers and power users with practical examples and workflows. (2) API Reference — complete API documentation for the SDK (@agentic-os/sdk), REST API (dashboard and gateway), MCP protocol, and plugin APIs. Auto-generated from source code with manual enhancements for clarity and completeness. (3) Admin Guide — operations-focused documentation for system administrators covering deployment (single-node, multi-node, Kubernetes), configuration, monitoring, logging, backup/restore, scaling, security hardening, and compliance. (4) Troubleshooting Guide — common issues and their solutions organized by symptom, with diagnostic command usage, log interpretation guides, and escalation paths. Documentation is published as: a website (using the docs generator from Phase 28.3), downloadable PDF, and integrated help within the CLI (`agentic help` and `agentic docs` commands). All documentation is tested for accuracy by running the documented commands and verifying output.

**Copy Source**: Existing docs from gemini-cli (`docs/`), Agentic OS V3, goose, plus new writing → `docs/`

**Key Files to Create/Modify**:
- `docs/README.md` — Documentation index and navigation
- `docs/user-guide/` — User guide section
- `docs/user-guide/getting-started/` — Getting started guides
- `docs/user-guide/getting-started/installation.md` — Installation guide (all platforms)
- `docs/user-guide/getting-started/quickstart.md` — 5-minute quickstart
- `docs/user-guide/getting-started/first-agent.md` — Creating your first agent
- `docs/user-guide/getting-started/configuration.md` — Configuration guide
- `docs/user-guide/core-concepts/` — Core concepts
- `docs/user-guide/core-concepts/agents.md` — Agent model and lifecycle
- `docs/user-guide/core-concepts/providers.md` — Provider system
- `docs/user-guide/core-concepts/routing.md` — Request routing
- `docs/user-guide/core-concepts/skills.md` — Skill system
- `docs/user-guide/core-concepts/extensions.md` — Extension system
- `docs/user-guide/core-concepts/hooks.md` — Hook system
- `docs/user-guide/core-concepts/mcp.md` — Model Context Protocol
- `docs/user-guide/core-concepts/sandbox.md` — Security sandbox
- `docs/user-guide/core-concepts/voice.md` — Voice and multimodal
- `docs/user-guide/cli/` — CLI reference
- `docs/user-guide/cli/commands.md` — All CLI commands reference
- `docs/user-guide/cli/configuration.md` — CLI configuration
- `docs/user-guide/cli/themes.md` — Terminal themes
- `docs/user-guide/cli/keyboard-shortcuts.md` — Keyboard shortcuts
- `docs/user-guide/ide-integration/` — IDE integration guide
- `docs/user-guide/ide-integration/vscode.md` — VS Code setup and features
- `docs/user-guide/ide-integration/jetbrains.md` — JetBrains setup
- `docs/user-guide/ide-integration/neovim.md` — Neovim setup
- `docs/user-guide/ide-integration/emacs.md` — Emacs setup
- `docs/user-guide/ide-integration/devtools.md` — DevTools panel usage
- `docs/user-guide/advanced/` — Advanced topics
- `docs/user-guide/advanced/self-improvement.md` — Self-improvement harness
- `docs/user-guide/advanced/code-review.md` — AI code review
- `docs/user-guide/advanced/bedd.md` — Behavioral eval-driven development
- `docs/user-guide/advanced/automation.md` — Automation and CI/CD
- `docs/user-guide/advanced/multi-agent.md` — Multi-agent orchestration
- `docs/user-guide/tutorials/` — Tutorials and examples
- `docs/user-guide/tutorials/` — Various tutorial files
- `docs/api-reference/` — API reference section
- `docs/api-reference/sdk/` — SDK API reference (auto-generated)
- `docs/api-reference/sdk/agent.md` — Agent class reference
- `docs/api-reference/sdk/session.md` — Session class reference
- `docs/api-reference/sdk/tool.md` — Tool class reference
- `docs/api-reference/sdk/skills.md` — Skills API reference
- `docs/api-reference/sdk/hooks.md` — Hooks API reference
- `docs/api-reference/rest-api/` — REST API reference
- `docs/api-reference/rest-api/dashboard.md` — Dashboard API reference
- `docs/api-reference/rest-api/gateway.md` — Gateway API reference
- `docs/api-reference/rest-api/admin.md` — Admin API reference
- `docs/api-reference/mcp/` — MCP protocol reference
- `docs/api-reference/mcp/protocol.md` — MCP protocol specification
- `docs/api-reference/mcp/tools.md` — MCP tool definitions
- `docs/api-reference/mcp/resources.md` — MCP resource definitions
- `docs/api-reference/mcp/security.md` — MCP security model
- `docs/api-reference/changelog.md` — Full changelog
- `docs/admin-guide/` — Admin guide section
- `docs/admin-guide/deployment/` — Deployment guides
- `docs/admin-guide/deployment/single-node.md` — Single-node deployment
- `docs/admin-guide/deployment/multi-node.md` — Multi-node deployment
- `docs/admin-guide/deployment/kubernetes.md` — Kubernetes deployment
- `docs/admin-guide/deployment/docker.md` — Docker deployment
- `docs/admin-guide/configuration/` — Admin configuration
- `docs/admin-guide/configuration/environment.md` — Environment variables
- `docs/admin-guide/configuration/providers.md` — Provider configuration
- `docs/admin-guide/configuration/routing.md` — Routing rules
- `docs/admin-guide/configuration/billing.md` — Billing configuration
- `docs/admin-guide/operations/` — Operations guide
- `docs/admin-guide/operations/monitoring.md` — Monitoring and alerting
- `docs/admin-guide/operations/logging.md` — Log management
- `docs/admin-guide/operations/backup-restore.md` — Backup and restore
- `docs/admin-guide/operations/scaling.md` — Scaling guide
- `docs/admin-guide/security/` — Security hardening
- `docs/admin-guide/security/overview.md` — Security architecture
- `docs/admin-guide/security/hardening.md` — Security hardening guide
- `docs/admin-guide/security/compliance.md` — Compliance information
- `docs/admin-guide/security/audit.md` — Audit log guide
- `docs/admin-guide/multi-tenancy.md` — Multi-tenancy guide
- `docs/admin-guide/billing.md` — Billing administration
- `docs/admin-guide/troubleshooting.md` — Admin troubleshooting
- `docs/troubleshooting/` — Troubleshooting guide section
- `docs/troubleshooting/common-issues.md` — Common issues by category
- `docs/troubleshooting/installation.md` — Installation issues
- `docs/troubleshooting/configuration.md` — Configuration issues
- `docs/troubleshooting/connectivity.md` — Provider connectivity issues
- `docs/troubleshooting/performance.md` — Performance issues
- `docs/troubleshooting/security.md` — Security issues
- `docs/troubleshooting/error-codes.md` — Error code reference
- `docs/troubleshooting/faq.md` — Frequently asked questions
- `docs/troubleshooting/support.md` — Getting support
- `scripts/docs/generate-all.sh` — Regenerate all documentation
- `scripts/docs/verify-links.sh` — Verify all internal and external links
- `scripts/docs/check-accuracy.sh` — Test documented commands against actual output
- `.github/workflows/docs-check.yml` — CI workflow for documentation checks
- `mkdocs.yml` — Documentation site configuration (if using MkDocs)
- `docusaurus.config.ts` — Docusaurus site configuration (if using Docusaurus)

**Acceptance Criteria**:
- [ ] User guide covers all CLI commands, configuration options, and core concepts with examples
- [ ] API reference is auto-generated from source and shows 100% of exported symbols
- [ ] SDK API reference includes usage examples for every public method
- [ ] Admin guide covers deployment on all platforms (bare metal, Docker, Kubernetes)
- [ ] Troubleshooting guide covers the top 50 most common issues with verified solutions
- [ ] All documented commands have been tested and produce accurate output
- [ ] All internal and external links are valid (zero broken links)
- [ ] Documentation is available as website, PDF, and CLI-integrated help
- [ ] Search functionality works on the documentation website
- [ ] Documentation has been reviewed by a technical writer for clarity and completeness

**Risk Level**: LOW — Documentation is primarily writing effort; auto-generation from source provides baseline accuracy; testing documented commands catches drift; no technical complexity

---

#### Subphase 30.5: Release v1.0.0: Public Launch with Community Channels
**Week**: 8
**Description**: Execute the public launch of Agentic OS V4 v1.0.0, including all release engineering tasks, community infrastructure setup, and launch coordination. This subphase covers: (1) Release engineering — create the final v1.0.0 build, sign all packages and binaries, publish to all distribution channels (npm, Homebrew, APT, RPM, Snap, Docker Hub, GitHub Releases), update version numbers across all packages, tag the release in git. (2) Community infrastructure — set up community channels: Discord server, GitHub Discussions, Stack Overflow tag, Twitter/X account, newsletter/mailing list, blog (Substack or similar), and documentation site with custom domain. (3) Launch assets — create launch page on the website, blog post announcement, changelog, release notes, video demo (3-5 minutes), screenshot gallery, and comparison matrix (Agentic OS vs. alternatives). (4) Marketing preparation — prepare Hacker News launch post, Reddit posts (r/programming, r/MachineLearning, r/selfhosted), LinkedIn article, dev.to article, and YouTube video. (5) Launch day operations — coordinate all launch activities: publish blog post, post to HN/Reddit/social media, monitor all channels for feedback, triage incoming issues, provide real-time support in Discord, track launch metrics (downloads, Docker pulls, npm installs, GitHub stars, new issues). (6) Post-launch support — 24/7 on-call rotation for the first week, daily triage of incoming issues, quick patch releases for critical bugs, community engagement and moderation, and retrospective planning for v1.1.

**Copy Source**: Release scripts from gemini-cli (`scripts/releasing/`) + new launch infrastructure → `scripts/release/`

**Key Files to Create/Modify**:
- `scripts/release/package.json` — Release scripts package
- `scripts/release/version.sh` — Update version across all packages
- `scripts/release/tag.sh` — Create git tag for release
- `scripts/release/build.sh` — Build all release artifacts
- `scripts/release/sign.sh` — Sign binaries and packages
- `scripts/release/publish.sh` — Publish to all distribution channels
- `scripts/release/publish-npm.sh` — Publish npm packages
- `scripts/release/publish-homebrew.sh` — Update Homebrew formula
- `scripts/release/publish-apt.sh` — Publish to APT repository
- `scripts/release/publish-rpm.sh` — Publish to RPM repository
- `scripts/release/publish-snap.sh` — Publish Snap package
- `scripts/release/publish-docker.sh` — Publish Docker image
- `scripts/release/publish-github.sh` — Publish GitHub Release
- `scripts/release/announce.sh` — Generate changelog and release notes
- `scripts/release/prepare-notes.js` — Prepare release notes from changelog
- `scripts/release/checklist.md` — Release checklist (manual sign-off)
- `scripts/release/rollback.sh` — Emergency rollback script
- `scripts/release/verify.sh` — Verify release artifacts
- `scripts/release/health.sh` — Post-release health monitoring
- `scripts/release/versions/` — Version configuration files
- `scripts/release/versions/v1.0.0.json` — Version manifest for v1.0.0
- `community/` — Community resources
- `community/README.md` — Community overview
- `community/CODE_OF_CONDUCT.md` — Code of conduct
- `community/CONTRIBUTING.md` — Contribution guidelines
- `community/SUPPORT.md` — Support resources
- `community/GOVERNANCE.md` — Project governance model
- `community/ROADMAP.md` — Public roadmap
- `community/FAQs.md` — Community FAQ
- `.github/ISSUE_TEMPLATE/` — Issue templates
- `.github/ISSUE_TEMPLATE/bug_report.yml` — Bug report form
- `.github/ISSUE_TEMPLATE/feature_request.yml` — Feature request form
- `.github/ISSUE_TEMPLATE/config.yml` — Issue template configuration
- `.github/PULL_REQUEST_TEMPLATE.md` — PR template
- `website/launch/` — Launch page assets
- `website/launch/index.html` — Launch page
- `website/launch/assets/` — Screenshots, diagrams, logos
- `website/blog/v1-launch.md` — Launch blog post
- `docs/releases/v1.0.0.md` — Release notes
- `CHANGELOG.md` (root, update) — Final v1.0.0 changelog entry
- `README.md` (root, update) — Updated for v1.0.0 with badges and links
- `SECURITY.md` (root, update) — Security contact information
- `CONTRIBUTING.md` (root, update) — Contribution guide

**Acceptance Criteria**:
- [ ] All npm packages published with correct version (no dependency conflicts)
- [ ] All binary installers published for all platforms (Windows, macOS, Linux)
- [ ] Docker image published on Docker Hub with proper tags (v1.0.0, latest, stable)
- [ ] Homebrew formula updated and tested (`brew install agentic-os`)
- [ ] APT and RPM repositories updated and accessible
- [ ] GitHub Release created with signed binaries, checksums, and release notes
- [ ] All launch assets ready: blog post, video demo, screenshots, comparison matrix
- [ ] Community channels operational: Discord, GitHub Discussions, Twitter/X, newsletter
- [ ] Issue templates and contribution guidelines published
- [ ] Post-launch on-call schedule established for first week with escalation paths

**Risk Level**: MEDIUM — Distribution channel publishing may have unexpected issues (npm 2FA, Homebrew PR review delays, Docker Hub rate limits); launch coordination requires precise timing; community moderation requires bandwidth; first-week support load is unpredictable

---

## Post-Launch Roadmap

### Overview
The v1.0.0 release is the foundation for Agentic OS V4, but the vision extends far beyond. The post-launch roadmap outlines the planned evolution across five major releases, from v1.1 through v2.0. Each release builds on the previous one, progressively adding capabilities that transform Agentic OS from a powerful developer tool into a universal AI-native operating system. The roadmap is a living document and will be refined based on community feedback, market conditions, and technological advances.

---

### v1.1: Plugin Marketplace Launch (target: v1.0.0 + 3 months)

**Objective**: Launch the Agentic OS plugin marketplace, enabling third-party developers to create, publish, and monetize plugins (skills, extensions, MCP servers, themes).

**Key Features**:
- **Marketplace Website**: A browseable, searchable marketplace at `marketplace.agentic-os.dev` with categories, ratings, reviews, and usage statistics.
- **Plugin Publishing Pipeline**: CI/CD pipeline that validates, signs, and publishes plugins from GitHub repositories to the marketplace registry.
- **Plugin SDK**: Simplified SDK for plugin developers with scaffolding tools (`agentic plugin init`), testing utilities, and documentation.
- **Monetization**: Support for free, donation-based, and paid plugins (via Stripe integration for payment processing).
- **Discovery and Recommendations**: AI-powered plugin recommendations based on user workflows and usage patterns, with trending and popular sections.
- **Plugin Sandbox**: Hardened sandbox for third-party plugins with CPU/memory/network usage limits and permission scopes.
- **Version Management**: Plugin versioning with semantic versioning, dependency declarations, and automatic updates.
- **Analytics Dashboard**: Usage analytics for plugin developers showing installs, active users, error rates, and performance metrics.

**Key Deliverables**:
- `packages/marketplace/` — Marketplace client and registry
- `apps/marketplace/` — Marketplace website (Next.js)
- `packages/plugin-sdk/` — Plugin development SDK
- `packages/plugin-sandbox/` — Hardened plugin execution sandbox
- `docs/plugin-development/` — Plugin development documentation

**Success Metrics**:
- 100+ plugins published within 3 months of marketplace launch
- 50+ active plugin developers in the community
- 50% of users install at least one plugin within first week
- Plugin marketplace generates revenue covering marketplace hosting costs

---

### v1.2: Enterprise SSO, Audit, Compliance (target: v1.0.0 + 6 months)

**Objective**: Make Agentic OS V4 enterprise-ready with Single Sign-On (SSO), comprehensive audit logging, and compliance certifications.

**Key Features**:
- **Single Sign-On (SSO)**: Support for SAML 2.0, OIDC, OAuth 2.0, and LDAP integration. Pre-built connectors for Okta, Azure AD, Google Workspace, OneLogin, and Keycloak. Just-In-Time (JIT) user provisioning and SCIM for user/group sync.
- **Role-Based Access Control (RBAC)**: Fine-grained RBAC with predefined roles (admin, operator, developer, viewer, billing) and custom role creation. Resource-level permissions down to individual provider keys and skill instances.
- **Audit Logging**: Immutable, tamper-evident audit log of all user actions, API calls, configuration changes, and billing operations. Log export in JSON/CSV/Syslog formats with SIEM integration (Splunk, ELK, Datadog, Sumo Logic).
- **Compliance Certifications**: SOC 2 Type II audit preparation and certification, GDPR compliance documentation and data processing agreement, HIPAA BAA for healthcare use cases, ISO 27001 certification alignment.
- **Data Residency**: Configurable data storage regions, data export/deletion APIs, data retention policies, and data classification tagging.
- **Encryption**: Customer-managed encryption keys (CMEK) via AWS KMS / Azure Key Vault / GCP Cloud KMS, field-level encryption for PII, and envelope encryption for stored data.
- **Compliance Reporting**: Automated compliance report generation for SOC 2, HIPAA, and GDPR with evidence collection and access review workflows.

**Key Deliverables**:
- `packages/enterprise/auth/` — SSO and authentication
- `packages/enterprise/rbac/` — Role-based access control
- `packages/enterprise/audit/` — Immutable audit logging
- `packages/enterprise/compliance/` — Compliance tooling
- `packages/enterprise/encryption/` — Encryption management
- `docs/enterprise/` — Enterprise documentation suite

**Success Metrics**:
- SOC 2 Type II report completed within 6 months of v1.2 launch
- 10+ enterprise customers with 1000+ users each
- Zero audit log integrity failures
- SSO integration with 5+ major identity providers validated

---

### v1.3: Mobile Companion App (target: v1.0.0 + 9 months)

**Objective**: Launch mobile companion apps for iOS and Android that extend Agentic OS V4 capabilities to mobile devices.

**Key Features**:
- **Agent Companion**: Mobile app that connects to the user's Agentic OS instance (self-hosted or cloud) for on-the-go agent interaction. Voice-first interface with push-to-talk, text input, and notification-based interaction.
- **Mobile Voice Input**: Native voice recognition using on-device speech-to-text (Apple Speech Framework on iOS, Google Speech Recognition on Android) for fast, private voice input. Optional server-side transcription for higher accuracy.
- **Push Notifications**: Real-time notifications for agent completions, approvals, errors, and scheduled task results. Configurable notification channels (alert, silent, critical).
- **Mobile Dashboard**: Simplified monitoring dashboard showing agent status, active tasks, provider health, usage metrics, and billing alerts. Optimized for small screens with glanceable widgets.
- **Quick Actions**: iOS Shortcuts and Android quick settings tiles for common actions: "Ask agent", "Summarize clipboard", "Translate text", "Create reminder".
- **Mobile SDK**: SDK for building custom mobile experiences that interact with Agentic OS, enabling enterprise mobile apps.
- **Offline Mode**: Queue requests when offline and sync when connectivity returns.

**Key Deliverables**:
- `apps/mobile/ios/` — iOS app (Swift/SwiftUI)
- `apps/mobile/android/` — Android app (Kotlin/Jetpack Compose)
- `packages/mobile-sdk/` — Mobile SDK for custom app development
- `packages/mobile-bridge/` — Bridge between agent core and mobile push/voice
- `docs/mobile/` — Mobile app documentation

**Success Metrics**:
- iOS and Android apps published on respective app stores
- 10,000+ mobile app downloads within 3 months
- Mobile voice input accuracy >95% with on-device processing
- Push notification delivery within 5 seconds

---

### v1.5: Federated Multi-Cluster Support (target: v1.0.0 + 12 months)

**Objective**: Enable multi-cluster, geographically distributed deployments of Agentic OS V4 with global routing, data synchronization, and unified management.

**Key Features**:
- **Multi-Cluster Architecture**: Support for hub-and-spoke and peer-to-peer cluster topologies with automatic service discovery and cluster health monitoring.
- **Global Routing**: Geo-aware routing that directs requests to the nearest or most appropriate cluster based on latency, capacity, cost, and data residency requirements.
- **Data Synchronization**: Cross-cluster data sync for configuration, user data, billing records, and audit logs with conflict resolution and eventual consistency for non-critical data.
- **Unified Management**: Single management plane that provides a global view across all clusters with per-cluster drill-down, centralized configuration management, and cross-cluster analytics.
- **Failover and Disaster Recovery**: Cross-cluster failover with automatic traffic redirection, data replication to standby clusters, and recovery time objective (RTO) <5 minutes.
- **Global Load Testing**: Built-in global load testing that measures performance across all clusters and regions.
- **Edge Deployment**: Lightweight edge agent that runs on low-resource devices (Raspberry Pi, edge gateways) and connects to the federated mesh for local inference with cloud backup.

**Key Deliverables**:
- `packages/federation/` — Federation protocol and cluster management
- `packages/global-router/` — Geo-aware global routing
- `packages/edge-agent/` — Lightweight edge deployment
- `packages/data-sync/` — Cross-cluster data synchronization
- `docs/federation/` — Federation deployment and operations guide

**Success Metrics**:
- Federation of 10+ clusters with <50ms global routing overhead
- Cross-cluster failover in <5 seconds with zero data loss
- Edge agent runs on Raspberry Pi 4 with <500MB memory
- Global management plane handles 100+ clusters

---

### v2.0: AI-Native OS with Self-Optimizing Routing (target: v1.0.0 + 18 months)

**Objective**: Evolve Agentic OS into a true AI-native operating system that self-optimizes, self-heals, and self-improves across all layers.

**Key Features**:
- **Self-Optimizing Routing**: AI-driven routing that learns optimal provider selection, routing strategies, and caching policies from historical performance data. Uses reinforcement learning to continuously adapt to changing conditions (provider latency, cost fluctuations, new model capabilities).
- **Autonomous System Management**: The system monitors its own health, predicts potential failures (disk full, memory pressure, traffic spikes), and automatically takes preventive action (scale up, redistribute load, cache warm).
- **Natural Language System Administration**: Administer the entire system through natural language: "Show me the top 5 providers by latency this week", "Scale up the European cluster by 50%", "Generate a security compliance report for Q3".
- **Cross-Model Optimization**: Automatically determines which model/provider combination is optimal for each type of request based on complexity, latency requirements, cost budget, and quality requirements. Supports ensemble routing (query multiple models, take best result).
- **Autonomous Skill Evolution**: Skills can self-evolve by analyzing usage patterns, identifying gaps, and generating improved versions. Self-improvement harness (Phase 28) becomes continuous and autonomous with safety guardrails.
- **Predictive Resource Scaling**: Uses ML models to predict resource needs 24 hours in advance and auto-scale infrastructure accordingly, reducing costs by avoiding over-provisioning and preventing outages from under-provisioning.
- **Unified Developer Experience**: A single, unified interface for all development tasks: code → test → deploy → monitor → optimize. The OS understands the full development lifecycle and provides AI assistance at every step.
- **Federated Learning**: Privacy-preserving learning across federated clusters where models improve from usage patterns without sharing raw data. Each cluster learns locally and only shares anonymized model updates.

**Key Deliverables**:
- `packages/self-optimizing-router/` — Reinforcement learning routing engine
- `packages/auto-pilot/` — Autonomous system management
- `packages/natural-language-admin/` — NL-based administration
- `packages/federated-learning/` — Privacy-preserving federated learning
- `packages/predictive-scaling/` — ML-based resource prediction
- `docs/v2.0/` — v2.0 documentation and migration guide

**Success Metrics**:
- Self-optimizing routing reduces average cost per request by 30% while maintaining quality
- Autonomous management prevents 90% of potential incidents before they occur
- Natural language admin handles 80% of common admin tasks successfully
- Cross-model optimization selects optimal model with >95% accuracy
- Predictive scaling reduces infrastructure costs by 25% vs. reactive scaling

---

## Appendix A: Key File Index by Subphase

| Subphase | Primary Package | Key Files (count) |
|----------|----------------|-------------------|
| 26.1 | `packages/ide/vscode-companion/` | 26 files |
| 26.2 | `packages/ide/detection/` + `integration/` + `installer/` + `jetbrains/` + `neovim/` + `emacs/` | 38 files |
| 26.3 | `packages/devtools/` | 32 files |
| 26.4 | `packages/context/at-reference/` + `jit-context/` + `core/` | 28 files |
| 26.5 | `packages/sdk/` | 28 files |
| 27.1 | `packages/testing/infrastructure/` + `harnesses/` + `mocks/` + `recording/` + `configs/` | 32 files |
| 27.2 | `packages/testing/evals/` | 42 files |
| 27.3 | `packages/testing/regression/` | 30 files |
| 27.4 | `packages/testing/chaos/` | 38 files |
| 27.5 | `packages/testing/performance/` | 40 files |
| 28.1 | `packages/self-improvement/` | 32 files |
| 28.2 | `packages/code-review/` | 38 files |
| 28.3 | `packages/docs-generator/` | 42 files |
| 28.4 | `packages/ci-integration/` | 34 files |
| 28.5 | `packages/bedd/` | 30 files |
| 29.1 | `packages/binary/` | 32 files |
| 29.2 | `packages/installer/` | 40 files |
| 29.3 | `packages/updater/` | 38 files |
| 29.4 | `packages/first-run/` | 36 files |
| 29.5 | `packages/diagnostics/` | 48 files |
| 30.1 | `packages/testing/e2e/` | 28 files |
| 30.2 | `security/` | 24 files |
| 30.3 | `scripts/load-testing/` | 30 files |
| 30.4 | `docs/` | 72 files |
| 30.5 | `scripts/release/` + `community/` + `website/` | 40 files |

---

## Appendix B: Subphase Risk Distribution

```
Phase 26: ■■■■■■■■■ (0% HIGH, 60% MEDIUM, 40% LOW)
  26.1 ■■■   (MEDIUM)
  26.2 ■■■   (MEDIUM)
  26.3 ■■■   (MEDIUM)
  26.4 ■■    (LOW)
  26.5 ■■    (LOW)

Phase 27: ■■■■■■■■■ (20% HIGH, 60% MEDIUM, 20% LOW)
  27.1 ■■    (LOW)
  27.2 ■■■■■ (HIGH)
  27.3 ■■■   (MEDIUM)
  27.4 ■■■■■ (HIGH)
  27.5 ■■■   (MEDIUM)

Phase 28: ■■■■■■■■■ (0% HIGH, 60% MEDIUM, 40% LOW)
  28.1 ■■■   (MEDIUM)
  28.2 ■■    (LOW)
  28.3 ■■    (LOW)
  28.4 ■■■   (MEDIUM)
  28.5 ■■■   (MEDIUM)

Phase 29: ■■■■■■■■■ (60% HIGH, 20% MEDIUM, 20% LOW)
  29.1 ■■■■■ (HIGH)
  29.2 ■■■■■ (HIGH)
  29.3 ■■■■■ (HIGH)
  29.4 ■■    (LOW)
  29.5 ■■    (LOW)

Phase 30: ■■■■■■■■■ (40% HIGH, 40% MEDIUM, 20% LOW)
  30.1 ■■■■■ (HIGH)
  30.2 ■■■■■ (HIGH)
  30.3 ■■■   (MEDIUM)
  30.4 ■■    (LOW)
  30.5 ■■■   (MEDIUM)

Total: ■■■■■■■■■ (24% HIGH, 48% MEDIUM, 28% LOW)
```

---

## Appendix C: Team Allocation Recommendation

| Subphase | Lead Engineer(s) | Supporting Engineers | Specialist Input |
|----------|-----------------|---------------------|------------------|
| 26.1 | Full-Stack Engineer (2) | VS Code API Specialist | Extension publishing expert |
| 26.2 | Platform Engineer (2) | IDE Specialist (each platform) | JetBrains plugin dev, Neovim plugin dev |
| 26.3 | Full-Stack Engineer (2) | UI/UX Designer | Browser DevTools experience preferred |
| 26.4 | TypeScript Engineer (2) | Search/Ranking Engineer | NLP specialist for relevance ranking |
| 26.5 | TypeScript Engineer (2) | API Designer | SDK usability reviewer |
| 27.1 | Platform Engineer (2) | QA Engineer | CI/CD infrastructure engineer |
| 27.2 | ML Engineer (2) | QA Engineer (2) | LLM evaluation researcher |
| 27.3 | QA Engineer (3) | All package owners | Cross-component integration specialist |
| 27.4 | SRE/Infrastructure (2) | Security Engineer | Chaos engineering practitioner |
| 27.5 | Performance Engineer (2) | Platform Engineer | Profiling tools expert (perf, dtrace) |
| 28.1 | ML Engineer (2) | TypeScript Engineer | Safety/alignment researcher |
| 28.2 | ML Engineer (2) | Security Engineer (review rules) | Code review process expert |
| 28.3 | Technical Writer (2) | TypeScript Engineer | Doc generation tooling expert |
| 28.4 | DevOps Engineer (2) | ML Engineer | CI/CD platform expert (GitHub Actions) |
| 28.5 | ML Engineer (2) | QA Engineer | TDD/BDD methodology expert |
| 29.1 | Rust Engineer (2) | Build Engineer | napi-rs specialist, binary distribution expert |
| 29.2 | Build Engineer (2) | Platform Engineer (per OS) | Windows Installer expert, macOS packaging expert |
| 29.3 | Rust Engineer (2) | Security Engineer | Update system security expert, CDN specialist |
| 29.4 | Product Designer (1) | Full-Stack Engineer (1) | UX researcher, onboarding specialist |
| 29.5 | Full-Stack Engineer (2) | Technical Writer | Support engineering input |
| 30.1 | QA Engineer (4) | All package owners | Test infrastructure specialist |
| 30.2 | Security Engineer (3) | External Pen Testers | Compliance specialist, CVE researcher |
| 30.3 | Performance Engineer (2) | SRE/Infrastructure (2) | Load testing specialist (k6) |
| 30.4 | Technical Writer (3) | All engineers (reviews) | Documentation tooling specialist |
| 30.5 | DevOps/Release Engineer (2) | Marketing/Community Manager | Developer relations specialist |

---

## Appendix D: Dependency Graph (Phases 26–30)

```
Phase 26 ─────────────────────────────────────────────────────────────────────────┐
  │ 26.1 (VS Code Companion) ◄──── Phase 23 (Extension System)                    │
  │ 26.2 (IDE Detection) ◄──────── Phase 23, Phase 25 (Sandbox)                   │
  │ 26.3 (DevTools Panel) ◄─────── Phase 26.1 (VS Code integration)               │
  │ 26.4 (@-Reference) ◄────────── Phase 26.1 (IDE integration)                   │
  │ 26.5 (SDK) ◄────────────────── Phase 20 (Provider Gateway)                    │
  └───────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Phase 27 ─────────────────────────────────────────────────────────────────────────┐
  │ 27.1 (Testing Infrastructure) ◄ Phase 26.5 (SDK exposes testable API)         │
  │ 27.2 (Behavioral Evals) ◄────── Phase 27.1 (Test harness), Phase 20 (Gateway) │
  │ 27.3 (Regression Suite) ◄────── All prior phases (comprehensive coverage)      │
  │ 27.4 (Chaos Engineering) ◄───── Phase 25 (Sandbox), Phase 27.1 (Infra)         │
  │ 27.5 (Performance Benchmarks) ◄ Phase 27.1 (Test infra), Phase 20 (Gateway)   │
  └───────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Phase 28 ─────────────────────────────────────────────────────────────────────────┐
  │ 28.1 (Self-Improvement) ◄────── Phase 27.2 (Evals for validation)              │
  │ 28.2 (Code Review) ◄─────────── Phase 26.1 (IDE integration), Phase 26.4      │
  │ 28.3 (Docs Generation) ◄─────── Phase 26.5 (SDK API for docs), Phase 27.1     │
  │ 28.4 (CI Integration) ◄──────── Phase 27.3 (Regression suite for CI)           │
  │ 28.5 (BEDD Workflow) ◄───────── Phase 27.2 (Evals), Phase 28.1 (Self-imp.)    │
  └───────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Phase 29 ─────────────────────────────────────────────────────────────────────────┐
  │ 29.1 (Binary Packaging) ◄────── Phase 23 (Extensions/Recipes), Phase 25       │
  │ 29.2 (Cross-Platform Installer) ◄ Phase 29.1 (Binary to distribute)            │
  │ 29.3 (Auto-Update) ◄────────── Phase 29.2 (Installer for update target)       │
  │ 29.4 (First-Run Experience) ◄── Phase 29.2 (Installer triggers FRX)           │
  │ 29.5 (Diagnostics) ◄─────────── All prior phases (tests all components)        │
  └───────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Phase 30 ─────────────────────────────────────────────────────────────────────────┐
  │ 30.1 (E2E Integration) ◄─────── All 29 prior phases (final validation)         │
  │ 30.2 (Security Audit) ◄──────── Phase 25 (Sandbox), Phase 29.3 (Update sec)   │
  │ 30.3 (Load Testing) ◄────────── Phase 29 (Full system for realistic load)     │
  │ 30.4 (Documentation) ◄───────── All prior phases (document all features)       │
  │ 30.5 (v1.0.0 Launch) ◄───────── All 30 phases complete                         │
  └───────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix E: Migration Guide for Existing Users

### gemini-cli Users
Your existing installation and configuration are fully compatible:
- **VS Code extension** — The Agentic OS V4 VS Code companion replaces the gemini-cli extension. Uninstall the old extension, install the new one from the VS Code marketplace or via `agentic ide install`. Your existing settings (themes, keybindings, workspace trust) migrate automatically.
- **Skills** — Your `.gemini/skills/` directory is automatically detected and loaded. Skills are now extensions; the format is compatible with minor additions (metadata fields for marketplace publishing).
- **Hooks** — Hooks configurations migrate to the unified hooks system. The hooks event model is expanded; existing hooks continue to work with the new event names aliased.
- **Evals** — Your `evals/` directory moves to `packages/testing/evals/definitions/`. The eval framework is enhanced but backward-compatible.
- **SDK** — Replace `@gemini-cli/sdk` imports with `@agentic-os/sdk`. The API surface is similar with additional methods.
- **DevTools** — Launch via `agentic devtools` instead of the gemini-cli equivalent. The panel is enhanced with new tabs (Context, Timeline, Performance).

### Agentic OS V3 Users
Your agent orchestration configurations are preserved:
- **DAG/Pipeline/Graph definitions** — Imported directly into the unified system. The execution engine is enhanced with MCP integration and extension hooks.
- **Skills** — Skills convert to the unified extension format. Run `agentic extension migrate` to update your skill definitions.
- **Self-improvement harness** — The V4 harness is more capable and safer. Your existing self-improvement policies are read and adapted to the new format.
- **WASM sandbox configurations** — Preserved and integrated into the unified sandbox hierarchy. Run `agentic sandbox migrate` to update.
- **Dashboard** — The Agentic OS V4 dashboard replaces the V3 dashboard with enhanced multi-tenant, billing, and provider management features.

### 9Router Users
Your provider configurations and routing rules are fully compatible:
- **Provider configurations** — Read from your existing configuration location or migrated to the unified format with `agentic providers migrate`.
- **Dashboard** — 9Router's dashboard functionality is subsumed by the Agentic OS V4 dashboard with enhanced multi-tenant and multi-user support.
- **Protocol translation** — All existing protocol translation rules continue to work.
- **MITM proxy** — The MITM proxy functionality is preserved and enhanced with MCP protocol support.

### New-API Users
Your multi-tenant billing and user management settings are preserved:
- **Billing plans** — Migrate using `agentic billing migrate`. The unified billing system supports all new-api plan types plus additional options.
- **User databases** — Data migrates to the unified database. Run `agentic admin migrate-users` to transfer user data.
- **API keys** — Existing API keys continue to work. New keys can be generated through the unified dashboard or API.

### LiteLLM / Portkey / OmniRoute2 Users
Your routing configurations are unified into the single routing engine:
- **Routing strategies** — Existing strategy configurations are read and converted to the unified format. The unified engine supports all strategies from all three projects.
- **Provider lists** — Your provider configurations are automatically discovered and imported.
- **Caching rules** — Cache configurations are unified. The unified cache supports all backends (Redis, in-memory, disk-based) from all three projects.
- **Fallback chains** — Converted automatically. The unified system supports more complex fallback topologies.

---

## Appendix F: Release Checklist (v1.0.0)

### Pre-Release (T-4 weeks)
- [ ] Phase 30.1 E2E tests pass with >95% release readiness score
- [ ] Phase 30.2 Security audit complete with all critical/high findings fixed
- [ ] Phase 30.3 Load tests pass with all metrics within budget
- [ ] Phase 30.4 Documentation complete and reviewed
- [ ] All Phase 29 production hardening complete (binary, installer, updater, FRX, diagnostics)
- [ ] All regressions from Phase 27.3 passing
- [ ] Performance baselines established and recorded

### Release Candidate (T-2 weeks)
- [ ] v1.0.0-rc.1 tagged and built
- [ ] RC distributed to beta testers (50+ users)
- [ ] Beta feedback collected and triaged
- [ ] Critical issues fixed and verified
- [ ] RC.2 built with fixes (if needed)

### Final Release (T-1 week)
- [ ] All release artifacts built and signed
- [ ] All distribution channels pre-loaded (npm, Homebrew, APT, RPM, Snap, Docker)
- [ ] GitHub Release draft created with release notes
- [ ] Blog post written and reviewed
- [ ] Social media posts scheduled
- [ ] Community channels ready (Discord, Discussions, etc.)
- [ ] On-call schedule confirmed for launch week
- [ ] Rollback plan documented and tested

### Launch Day (Day 0)
- [ ] Final build verified
- [ ] All artifacts published
- [ ] Blog post published
- [ ] HN/Reddit/social media posts published
- [ ] Discord announcements sent
- [ ] Newsletters sent
- [ ] Launch metrics tracking started (downloads, stars, installs)
- [ ] Support channels monitored

### Post-Launch (Day 1-7)
- [ ] Daily issue triage and prioritization
- [ ] Critical bug fixes released as patches (v1.0.1+)
- [ ] Community engagement and moderation
- [ ] Launch metrics report generated
- [ ] Retrospective scheduled for v1.1 planning

---

*End of PART 6 — Phases 26–30*

*Next: This is the final part of the 30-Phase Master Integration Plan.*

*Continue to execution of Phase 0 to begin the integration.*

---

**Total Lines**: ~2,450
**Subphases Documented**: 25 (Phases 26–30, each with 5 subphases)
**Key Files Referenced**: ~860
**Risk Items Catalogued**: 25
**Acceptance Criteria**: ~250 individual checks
**Post-Launch Versions Planned**: 5 (v1.1, v1.2, v1.3, v1.5, v2.0)
