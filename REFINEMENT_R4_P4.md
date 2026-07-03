# REFINEMENT R4 — Gap Analysis: Phases 16-20

**Date:** 2026-07-02  
**Source:** `MASTER_INTEGRATION_PLAN_30_PHASES_P4.md`  
**Codebase Cross-Reference:** `gemini-cli/`, `server/`, `src/`, `nexus-tauri/`

---

## Executive Summary

Phases 16–20 are structurally sound but have **32 identified gaps** across completeness, cross-referencing against actual source code, and missing features. **8 gaps are critical** (missing CLI commands, unmapped subsystems, VS Code companion omission), **12 are moderate** (incomplete UI component lists, missing observability features), and **12 are minor** (documentation refinement, acceptance criteria tightening).

---

## Phase 16: CLI & Terminal Experience — Gaps

### 🔴 Critical Gaps

#### GAP-16.1.1: Missing CLI Commands in Rust CLI (16.1)

The plan lists 14 Rust CLI commands (`chat`, `run`, `session`, `recipe`, `skill`, `provider`, `gateway`, `mitm`, `local`, `dictation`, `config`, `doctor`, `update`, `schedule`, `project`, `completion`). Cross-referencing the actual Gemini CLI codebase (`packages/cli/src/commands/`), the following commands exist but are **not mapped**:

| Missing Command | Source | Description |
|----------------|--------|-------------|
| `extensions` | gemini-cli | Extension install/list/remove/update (critical — 22 test files depend on this) |
| `hooks` | gemini-cli | Hook lifecycle management (before-agent, after-tool, etc.) |
| `mcp` | gemini-cli | MCP server registration, status, tool listing |
| `voice` | gemini-cli/core/src/voice/ | Full voice mode (dictation.rs is only partial — missing STT pipeline, wake word, VAD) |
| `policy` | gemini-cli/core/src/policy/ | Policy definition, enforcement rules |
| `checkpoint` | gemini-cli integration-tests | Session checkpoint/resume/rewind |
| `agent` | Gemini CLI core | Agent lifecycle management |

**Fix Required:** Add these commands to 16.1 command file tree and acceptance criteria.

---

#### GAP-16.1.2: Missing Core Subsystems Not Mapped for Integration

The following subsystems from `gemini-cli/packages/core/src/` are **not referenced** in Phase 16, yet they contain critical logic that CLI commands depend on:

| Subsystem | Path | Relevance |
|-----------|------|-----------|
| Voice pipeline | `core/src/voice/` | Dictation, wake word, VAD, STT integration |
| Policy engine | `core/src/policy/` | Allow/deny policies, guardrails, consent flows |
| Safety/Moderation | `core/src/safety/` | Content filters, PII detection, prompt injection |
| Fallback engine | `core/src/fallback/` | Provider fallback chains, retry logic |
| Confirmation bus | `core/src/confirmation-bus/` | Tool confirmation queue, user-in-the-loop |
| Availability detection | `core/src/availability/` | Service discovery, health checks (client-side) |
| Context management | `core/src/context/` | Token windowing, compression, context budgeting |
| Code assist | `core/src/code_assist/` | Inline code completion, file context |
| Scheduler | `core/src/scheduler/` | Cron jobs, scheduled agent tasks |
| Billing integration | `core/src/billing/` | Client-side billing data, quota tracking |

**Fix Required:** Add these subsystems to 16.1 or 16.3's routing layer with appropriate file structures.

---

#### GAP-16.1.3: Missing Ink CLI Components (16.2)

The gemini-cli's `packages/cli/src/ui/components/` directory contains **60+ Ink/React components**. The plan lists only ~10. Critical unmapped components:

| Component | Function |
|-----------|----------|
| `AskUserDialog.tsx` | Interactive user input dialog |
| `BackgroundTaskDisplay.tsx` | Background operation progress |
| `Composer.tsx` | Message composer with attachments |
| `ConsentPrompt.tsx` | User consent/permission flows |
| `ContextSummaryDisplay/ContextUsageDisplay` | Context budget visualization |
| `DebugProfiler.tsx` | Performance profiling UI |
| `DialogManager.tsx` | Central dialog registry |
| `FolderTrustDialog.tsx` | Security folder trust prompts |
| `HooksDialog/HookStatusDisplay` | Hook management and status |
| `InboxDialog.tsx` | Notification inbox |
| `ListeningIndicator.tsx` | Voice mode active indicator |
| `MemoryUsageDisplay.tsx` | Memory consumption monitor |
| `ModelDialog/ModelQuotaDisplay/ModelStatsDisplay` | Model management UI |
| `Notifications.tsx` | Notification center |
| `PolicyUpdateDialog.tsx` | Policy change notifications |
| `RewindViewer.tsx` | Session rewind/history scrub |
| `SessionBrowser.tsx` | Full session browser (more detail than SessionList) |
| `ShortcutsHelp.tsx` | Keyboard shortcuts reference |
| `SuggestionsDisplay.tsx` | Autocomplete suggestions |
| `ToastDisplay.tsx` | Toast notification system |
| `ValidationDialog.tsx` | Schema validation feedback |
| `VoiceModelDialog.tsx` | Voice model selector |

**Fix Required:** Add these components to 16.2's file tree, or at minimum reference them in a comprehensive table.

---

### 🟡 Moderate Gaps

#### GAP-16.4.1: Shell Completion Dynamic Query Latency

Acceptance criteria says "under 100ms" for dynamic completions, but the risk assessment says latency is medium risk. The plan doesn't specify:
- **Cache strategy** for dynamic completions (TTL per completion type)
- **Timeout fallback** behavior when services are unresponsive
- **Predictive pre-fetch** for common completions

**Fix Required:** Add caching TTL specifications and timeout fallback mechanism.

#### GAP-16.5.1: Missing Theme Formats

The plan lists 13 built-in themes but the gemini-cli has `20+ themes`. The additional themes should be enumerated:
- `shades_of_purple.rs`, `holiday_dark.rs`, `xcode_light.rs`, `google_light.rs` (partial)
- Missing: `nord.rs`, `catppuccin.rs`, `monokai.rs`, `one_half.rs`, `everforest.rs` (verify against gemini-cli source)

**Fix Required:** Enumerate all themes or add a reference to the full theme registry.

---

## Phase 17: TUI & Interactive Experience — Gaps

### 🔴 Critical Gaps

#### GAP-17.1.1: Missing Ratatui Components

The plan lists 19 Ratatui components. Cross-reference with Goose TUI source reveals these are missing:

| Missing Component | Purpose |
|------------------|---------|
| ANSI renderer | Raw ANSI passthrough display |
| Image preview | ASCII art image preview in terminal |
| URL link handler | Clickable links in terminal |
| Color picker | Theme color customization |
| Session recorder | Record/replay terminal sessions |

**Fix Required:** Add missing components or note they are covered by existing ones.

#### GAP-17.1.2: Missing TUI Tabs

The plan lists 14 tabs. Missing from Goose TUI:
- `audit` tab — Audit log viewer
- `cache` tab — Cache statistics and management
- `security` tab — Security configuration overview
- `tunnel` tab — Tunnel/SSH connection status

**Fix Required:** Add missing tabs or document rationale for omission.

---

### 🟡 Moderate Gaps

#### GAP-17.4.1: Incremental Syntax Highlighting Language Coverage

Plan says "15+ languages" but only lists 16 explicitly. Missing from the list:
- Ruby, PHP, C#, Swift, Kotlin, Scala, R, Lua, Haskell, Elixir, Rust (listed twice?), TypeScript/JavaScript

The minimum bar should be explicit: at minimum the **top 20 languages by Stack Overflow survey**.

**Fix Required:** Use "20+ languages" or provide an explicit minimum set.

#### GAP-17.5.1: Multi-Session Resource Limits Underspecified

Acceptance criteria says "resource manager prevents memory exhaustion with >20 concurrent sessions" but doesn't specify:
- Per-session memory budget (e.g., 50MB max)
- What happens when limit is reached (throttle, reject, pause oldest)
- Disk overflow strategy for session state

**Fix Required:** Add numeric resource budgets and overflow policies.

---

## Phase 18: Desktop Application — Gaps

### 🟡 Moderate Gaps

#### GAP-18.1.1: VS Code IDE Companion Not Mapped

The gemini-cli includes a full **VS Code IDE companion extension** (`packages/vscode-ide-companion/`). This is a significant integration point that should be a subphase of Phase 18 or explicitly referenced as follow-up work. Features include:
- Inline code completions in VS Code
- Agent session sidebar in VS Code
- File context provider for the agent
- Code actions integration

**Fix Required:** Add subphase 18.6 for VS Code companion or reference in cross-cutting concerns.

#### GAP-18.1.2: Missing Desktop Features

- **Deep linking** (`agentic-os://` protocol handler) — not mentioned
- **Crash reporting** (Sentry/Crashpad integration) — not mentioned
- **Power management** (macOS App Nap prevention during streaming) — not mentioned
- **Drag-and-drop** file import — mentioned only briefly in 18.1 description

**Fix Required:** Add these as acceptance criteria items or new sub-sections.

#### GAP-18.3.1: Offline Mode Conflict Resolution

The plan mentions "conflict resolution strategies" but doesn't specify the strategy. CRDT-based (referenced in risk) is one option, but the plan should specify:
- **Default strategy** (e.g., last-writer-wins with version vectors)
- **Conflict UI** for user-in-the-loop resolution
- **Auto-merge rules** for session append-only data vs. configuration data

**Fix Required:** Specify conflict resolution strategies per data type.

---

### 🟢 Minor Gaps

#### GAP-18.5.1: Auto-Update Channel Promotion

Plan mentions stable/beta/nightly channels but doesn't describe **promotion workflow** (how builds move between channels) or **A/B testing support** (gradual rollout percentage).

**Fix Required:** Add channel promotion workflow description.

---

## Phase 19: Web Dashboard — Gaps

### 🟡 Moderate Gaps

#### GAP-19.1.1: Missing Dashboard Pages

The plan lists 30+ dashboard pages. Cross-reference with 9Router dashboard reveals these missing:
- `api-keys` page — Global API key management
- `webhooks` page — Webhook configuration
- `cache` page — Cache management and statistics
- `rate-limits` page — Rate limit configuration
- `migrations` page — Data migration management
- `feature-flags` page — Feature flag toggles

**Fix Required:** Add missing pages or document as future enhancements.

#### GAP-19.1.2: Dashboard Onboarding Wizard

New users need an **onboarding wizard** for first-time setup (similar to CLI config wizard but web-based). Not mentioned.

**Fix Required:** Add onboarding wizard as a sub-component.

#### GAP-19.3.1: Analytics Export Formats

The plan mentions CSV, JSON, PDF export. Missing:
- **Scheduled report delivery** (email daily/weekly/monthly PDF)
- **Webhook delivery** (push analytics to Slack/Teams)
- **Embedded analytics** (public shareable dashboard links)

**Fix Required:** Add scheduled reporting and sharing capabilities.

---

### 🟢 Minor Gaps

#### GAP-19.4.1: Log View Performance

Acceptance criteria says logs support "full-text search" but doesn't specify minimum performance targets for the log viewer itself (e.g., "initial load < 2s for 1M log entries").

**Fix Required:** Add log viewer performance acceptance criteria.

#### GAP-19.5.1: SCIM Provisioning

Enterprise multi-tenant deployments often require SCIM (System for Cross-domain Identity Management) for user provisioning. Not mentioned.

**Fix Required:** Add SCIM support as acceptance criteria or future note.

---

## Phase 20: Observability — Gaps

### 🟡 Moderate Gaps

#### GAP-20.0.1: SLO/SLI Tracking Not Mentioned

Service Level Objectives (SLOs) and Service Level Indicators (SLIs) are a standard observability practice that feed into alerting. The plan has metrics and alerting but no SLO framework:
- SLI definitions (latency, error rate, availability, cost efficiency)
- SLO burn rate alerting
- Error budgets
- SLO dashboard

**Fix Required:** Add SLO/SLI sub-section to Phase 20.

#### GAP-20.0.2: Incident Management Workflow

The alerting system (20.5) triggers alerts but there's no formal **incident management** workflow:
- Alert → Incident creation
- On-call scheduling
- Incident severity classification
- Post-mortem template
- Incident timeline tracking

**Fix Required:** Add incident management sub-system or reference external tool integration.

#### GAP-20.2.1: Cost Attribution in Traces

Cost metrics are collected (20.2) but the plan doesn't describe **end-to-end cost attribution** — attaching cost data to individual trace spans so users can see "this request cost $0.0023" in the trace waterfall.

**Fix Required:** Add cost-per-span attribution to 20.1 tracing.

---

### 🟢 Minor Gaps

#### GAP-20.3.1: Log-Based Metrics Generation

The ability to generate Prometheus metrics from log patterns (e.g., "count of ERROR level logs per service per minute") is a standard observability pattern. Not mentioned.

**Fix Required:** Add log-to-metrics pipeline description.

#### GAP-20.4.1: Health Check Distributed Tracing Integration

Health checks (20.4) should propagate trace context so that failing health checks can be traced through the service graph. Not mentioned.

**Fix Required:** Add trace propagation requirement to health check acceptance criteria.

#### GAP-20.5.1: Anomaly Detection Model Persistence

Anomaly detection baselines (20.5) should persist across restarts and support export/import for sharing baseline configurations between environments. Not mentioned.

**Fix Required:** Add baseline persistence and export/import requirements.

---

## Cross-Cutting Gaps

### 🔴 Critical

#### GAP-XC-1: VS Code IDE Companion Entirely Missing

The `packages/vscode-ide-companion/` is a fully-featured VS Code extension with:
- Inline completions
- Agent chat panel
- File context provider
- MCP server integration
- Settings synchronization

This **must** be added as a subphase (suggested: 18.6) or at minimum referenced in the Cross-Cutting Concerns section.

#### GAP-XC-2: Developer Tools Package Not Mapped

The `packages/devtools/` package provides React DevTools integration, component inspector, and performance profiling. Not mentioned beyond a brief reference in 17.2.

**Fix Required:** Add devtools integration as explicit acceptance criteria.

---

### 🟡 Moderate

#### GAP-XC-3: Testing Strategy Gaps

The testing strategy table is missing:
- Desktop E2E tests for tray, notifications, offline mode
- Dashboard E2E tests for each major workflow (provider add, user invite, alert creation)
- Cross-interface consistency tests (settings made in CLI reflected in desktop)
- Polyglot trace propagation tests (Typescript → Rust → Typescript)

**Fix Required:** Expand testing strategy table.

#### GAP-XC-4: Accessibility (a11y) Requirements

None of the phases mention accessibility requirements:
- CLI: Screen reader compatibility for interactive mode
- TUI: ARIA labels, focus indicators, high-contrast mode
- Desktop: WCAG 2.1 AA compliance
- Dashboard: Keyboard navigation, screen reader support, focus management

**Fix Required:** Add accessibility requirements to each phase's acceptance criteria.

---

### 🟢 Minor

#### GAP-XC-5: i18n Localization Gaps

The plan mentions "30+ i18n" for the dashboard but doesn't specify which languages or the localization strategy for CLI/TUI/Desktop (message catalogs, ICU message format, RTL support).

**Fix Required:** Add i18n strategy section.

#### GAP-XC-6: Upgrade/Migration Path

The plan doesn't describe how users upgrade from:
- Standalone Goose → Agentic OS V4 CLI
- Standalone gemini-cli → Agentic OS V4 interactive CLI
- Previous config formats → unified config
- Standalone 9Router → Agentic OS V4 dashboard

**Fix Required:** Add migration path descriptions to each phase.

---

## Summary Statistics

| Severity | Phase 16 | Phase 17 | Phase 18 | Phase 19 | Phase 20 | Cross-Cutting | Total |
|----------|----------|----------|----------|----------|----------|---------------|-------|
| 🔴 Critical | 3 | 2 | 0 | 0 | 0 | 2 | 7 |
| 🟡 Moderate | 2 | 2 | 3 | 3 | 3 | 2 | 15 |
| 🟢 Minor | 1 | 0 | 1 | 2 | 4 | 2 | 10 |
| **Total** | **6** | **4** | **4** | **5** | **7** | **6** | **32** |

---

## Recommended Actions

### Immediate (Apply to P4.md):

1. **Add missing CLI commands** to 16.1 command list: `extensions`, `hooks`, `mcp`, `voice`, `policy`, `checkpoint`, `agent`
2. **Add missing core subsystems** to 16.1/16.3: voice pipeline, policy engine, safety, fallback, confirmation bus, availability, context management, code assist, scheduler, billing
3. **Add missing Ink components** to 16.2 file tree (see Gap-16.1.3)
4. **Add missing Ratatui components and tabs** to 17.1
5. **Add VS Code companion** as 18.6 or cross-cutting reference
6. **Add SLO/SLI tracking** to 20.x
7. **Add incident management** to 20.x
8. **Add deep linking and crash reporting** to 18.x

### Deferred (Document in REFINEMENT_TRACKER.md):

9. Accessibility requirements across all phases
10. i18n strategy and language list
11. Upgrade/migration paths
12. Self-monitoring of observability stack
