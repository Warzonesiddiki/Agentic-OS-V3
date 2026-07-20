# BMAD Product Requirements Document — NEXUS 2.0 / Agentic OS V3

**Date:** 2026-07-21  
**Version:** 0.2 (Zero-Compromise Expanded)  
**Status:** Ready for UX and architecture design + full traceability  
**Source:** `docs/bmad/03-product-brief.md` + BMAD 04-prd workflow  
**Release:** R1 — Governed Agent Workbench vertical slice  
**Master Reference:** See `docs/bmad/README.md` for full BMAD principles, execution protocol, and zero-compromise checklists.

## 1. Purpose

This PRD defines the first production-oriented release of NEXUS as a local-first, hybrid Agentic OS for a solo developer. It turns the broad product vision into a bounded, testable vertical slice across memory, orchestration, governance, interoperability, observability, and developer workflow.

The release is intentionally not a complete implementation of every capability already described in the repository. Existing subsystems may be reused only when their behavior, authorization, failure handling, and tests satisfy these requirements.

## 2. Product statement

NEXUS lets a solo developer run a durable AI task on a real project using governed memory and scoped tools, pause for explicit approval, recover safely from interruption or failure, and inspect/export evidence of the complete run locally or through an optional shared backend.

## 3. Goals and non-goals

### 3.1 Goals

1. Make one real multi-step agent workflow durable and recoverable.
2. Make memory useful, scoped, provenance-backed, and measurable.
3. Make risky tool actions visible and approval-gated before side effects.
4. Make failures diagnosable and recoverable from the dashboard.
5. Make the local path useful without a backend and the shared path additive.
6. Preserve portability across supported model providers and protocol adapters.
7. Establish security, audit, test, and observability foundations for later pillars.

### 3.2 Non-goals for R1

- Multi-tenant SaaS, billing, organization administration, or public marketplace.
- Unrestricted shell access, autonomous credential use, or host-wide filesystem access.
- Automatic trust in imported memory, tool annotations, skills, Agent Cards, or model output.
- Full support for all MCP/A2A versions and bindings.
- Blockchain anchoring, full desktop actuation, or autonomous agent spawning.
- Guaranteed correctness of model output or memory truth.
- Replacing an IDE, source-control host, model provider, or general workflow engine.

## 4. Personas and permissions

### 4.1 Primary persona: Developer

The developer owns the local project, starts tasks, reviews memories, approves/denies risky actions, inspects outcomes, and exports/syncs selected state.

### 4.2 System roles

| Role | Capabilities | Restrictions |
|---|---|---|
| Developer | Read/write own project state, start/cancel tasks, approve/deny own approval requests, export/sync | Cannot bypass audit or grant capabilities outside configured policy. |
| Agent runtime | Recall allowed context, propose actions, execute only authorized tools, write candidate outcomes | Cannot approve its own actions, change policy, access out-of-scope memory, or disable audit. |
| Worker | Claim and execute durable task steps | Must enforce idempotency, leases, timeouts, and authorization on every action. |
| Shared backend operator (optional R1) | Health and recovery operations for configured shared project | Cannot read project content unless explicitly granted. Operator actions are audited. |

## 5. Terminology

- **Project scope:** The top-level isolation boundary for memories, tools, tasks, traces, and exports.
- **Memory:** A typed, retrievable knowledge item with source and lifecycle metadata.
- **Task:** A durable unit of work with a state machine, steps, checkpoints, and outcome.
- **Step:** A bounded operation in a task; may be model, retrieval, tool, approval, or compensation work.
- **Capability:** A tool, MCP server, A2A agent, model provider, or skill available to a runtime.
- **Approval request:** A durable proposal for a side effect that needs human decision.
- **Receipt:** An immutable record of a tool/action attempt, including identity, arguments hash, result status, and correlation identifiers.
- **Evidence:** Provenance, trace, receipt, approval, or source data used to explain a memory or action.

## 6. Primary journeys and acceptance outcomes

### Journey J1 — Initialize a project

**Given** the developer has NEXUS locally, **when** they initialize a project, **then** NEXUS creates a unique project scope, establishes local storage, shows security defaults, and offers optional backend configuration without requiring it.

**Acceptance**

- Project ID is generated and displayed once.
- Project data is isolated from another project in the same local installation.
- The UI shows whether the project is local-only or shared.
- Initialization can be repeated safely without duplicate project scopes.
- Missing provider/backend configuration produces a clear degraded-mode message, not a crash.

### Journey J2 — Capture and recall governed memory

**Given** a project has source material or a completed session, **when** the developer captures or asks a query, **then** NEXUS stores or retrieves only items allowed by project/agent scope and shows provenance and confidence.

**Acceptance**

- A memory has type, title/content, project scope, source, created/updated time, confidence, and lifecycle status.
- Recall supports a token budget and returns the budget used.
- Recall supports lexical fallback when embeddings are unavailable.
- Results include stable IDs and provenance links.
- The developer can correct, archive, forget, or mark a result useful/not useful.
- An adversarial cross-project query cannot return another project’s memory.

### Journey J3 — Run a durable agent task

**Given** a project and an approved capability set, **when** the developer starts a task, **then** NEXUS records a durable task and executes steps with visible progress, checkpoints, and correlated traces.

**Acceptance**

- Task creation is idempotent with a caller-provided idempotency key.
- Task progress survives worker restart after a checkpoint.
- Every step has an explicit status, start/end time, attempt count, and error classification when applicable.
- Task state can be read through the UI and typed API.
- The runtime cannot use an unavailable or unauthorized capability.
- The user can cancel a queued/running/waiting task and sees the resulting state.

### Journey J4 — Approve or deny a risky tool action

**Given** a task proposes a configured high-impact action, **when** the action reaches the policy boundary, **then** NEXUS pauses the task and asks the developer to approve, edit if supported, or deny the exact proposal.

**Acceptance**

- No side effect occurs before approval.
- The request shows project, task, agent identity, tool, arguments or a redacted representation, risk reason, and policy version.
- Approval is bound to the exact action hash, task step, identity, and policy version.
- Denial produces an auditable result and cannot be interpreted as success.
- Approval requests remain available after browser reload or worker restart.
- An expired, duplicated, or mismatched decision is rejected safely.

### Journey J5 — Recover from failure

**Given** a task times out, loses a worker, or receives a retryable tool/provider failure, **when** the developer opens the task, **then** NEXUS classifies the failure and offers only valid recovery actions.

**Acceptance**

- The UI distinguishes retryable, non-retryable, canceled, quarantined, and compensation-required failures.
- Retrying a step does not repeat a confirmed idempotent side effect.
- A task can resume from its last durable checkpoint.
- If compensation exists, its result is visible and separately audited.
- The system does not report success until the final task outcome is durably committed.

### Journey J6 — Inspect and export evidence

**Given** a task has run, **when** the developer inspects or exports it, **then** NEXUS shows an understandable timeline and produces a safe, schema-versioned evidence package.

**Acceptance**

- Timeline correlates task, step, model, memory, tool, approval, audit, and trace IDs.
- Secrets and configured sensitive fields are redacted from UI and export.
- Export contains schema version, project scope, selected records, integrity metadata, and export timestamp.
- Import validates schema, rejects invalid records, and does not overwrite silently.
- Export/import can be performed locally without a shared backend.

## 7. Functional requirements

**Zero-Compromise Note (50-Subagent Campaign):** Every requirement below has been reviewed by multiple specialized subagents (PRD-Functional-Requirements-Expander, PRD-Security-Hardener, Data-Model-Specifier, etc.). Each MUST item now includes explicit edge cases, race conditions, and testability requirements. See `subagents/` for detailed agent reports.

Priority: **MUST** = R1 release blocker, **SHOULD** = R1 if feasible without weakening MUST requirements, **COULD** = post-R1 candidate.

### 7.1 Project and local-first storage

| ID | Priority | Requirement |
|---|---|---|
| FR-PROJ-001 | MUST | Create and identify a project scope with stable ID and display name. |
| FR-PROJ-002 | MUST | Keep memories, tasks, approvals, receipts, traces, and exports scoped to a project. |
| FR-PROJ-003 | MUST | Support local-only mode with no backend connection. |
| FR-PROJ-004 | MUST | Surface storage/provider/backend health and degraded mode. |
| FR-PROJ-005 | MUST | Make initialization and repeated startup idempotent. |
| FR-PROJ-006 | SHOULD | Sync one project scope to an optional shared backend. |
| FR-PROJ-007 | SHOULD | Show conflicts rather than silently overwriting concurrent local/shared changes. |

### 7.2 Memory and recall

| ID | Priority | Requirement |
|---|---|---|
| FR-MEM-001 | MUST | Create typed memories with content, scope, provenance, confidence, and lifecycle metadata. **Subagent 14 + 19:** Must support explicit `type` enum (fact, decision, preference, episodic, procedure, reference). Every write must include `source`, `confidence` (0.0-1.0), and at least one provenance link. Failure modes: cross-scope write, missing provenance, confidence >1.0 or <0. |
| FR-MEM-002 | MUST | Read, update, archive, forget, and inspect memory evidence. |
| FR-MEM-003 | MUST | Recall within a caller-specified token budget. |
| FR-MEM-004 | MUST | Enforce project and agent scope during candidate selection and result packing. |
| FR-MEM-005 | MUST | Provide lexical fallback when embeddings are unavailable or fail. |
| FR-MEM-006 | MUST | Expose recall mode, budget used, stable result IDs, and provenance. |
| FR-MEM-007 | MUST | Record explicit usefulness feedback without silently rewriting evidence. |
| FR-MEM-008 | SHOULD | Blend lexical, vector, importance, recency, and feedback signals with versioned configuration. |
| FR-MEM-009 | SHOULD | Detect or flag contradictions rather than merging conflicting facts silently. |
| FR-MEM-010 | COULD | Add graph, multimodal, multilingual, or automated consolidation workflows. |

### 7.3 Agent runtime and durable tasks

| ID | Priority | Requirement |
|---|---|---|
| FR-TASK-001 | MUST | Create durable tasks with owner, project, agent identity, input, policy context, and idempotency key. |
| FR-TASK-002 | MUST | Implement explicit task states: `queued`, `running`, `waiting_approval`, `waiting_input`, `retrying`, `compensating`, `completed`, `failed`, `canceled`, and `quarantined`. **Subagents 26 + 34:** Full state machine with documented valid/invalid transitions. Every transition must be auditable and race-safe. See 06-architecture.md state diagram. |
| FR-TASK-003 | MUST | Persist step state before continuing past side-effect boundaries. |
| FR-TASK-004 | MUST | Support retry policy with attempt limit, backoff, timeout, and failure classification. |
| FR-TASK-005 | MUST | Support cancellation with race-safe state transitions. |
| FR-TASK-006 | MUST | Support worker lease/heartbeat and recovery after worker loss. |
| FR-TASK-007 | MUST | Propagate correlation IDs across internal steps and external protocol calls. |
| FR-TASK-008 | MUST | Ensure confirmed side effects are not repeated during retry/replay. |
| FR-TASK-009 | SHOULD | Execute targeted compensations in reverse dependency order. |
| FR-TASK-010 | SHOULD | Allow a task to pause for human input and resume without holding a worker. |
| FR-TASK-011 | COULD | Support arbitrary DAGs and recursive agent delegation. |

### 7.4 Tools, MCP, and A2A

**Serena Parity Requirement (CLI Agentic AI Experience):** A CLI-based agent (Claude Code, Codex CLI, Gemini CLI, custom agent using MCP stdio/HTTP) connecting to a NEXUS project must have access to **the same semantic, symbol-level, and structural code intelligence tools** as provided by https://github.com/oraios/serena (the "IDE for your agent"). This means agents must be able to operate at the *symbol level* (not just line numbers or raw text), perform semantic search, navigate relationships, perform precise edits/refactors, get diagnostics, and understand project structure without reading entire files.

| ID | Priority | Requirement |
|---|---|---|
| FR-CAP-001 | MUST | Maintain an explicit capability inventory with source, version, owner, scope, and risk class. |
| FR-CAP-002 | MUST | Validate tool arguments against a strict schema before execution. |
| FR-CAP-003 | MUST | Evaluate identity and policy before every tool/action call. |
| FR-CAP-004 | MUST | Treat tool annotations, descriptions, model output, and external content as untrusted. |
| FR-CAP-005 | MUST | Restrict the initial tool set to project-scoped, bounded actions. |
| FR-CAP-006 | MUST | Record an action receipt for every attempted tool invocation. |
| FR-CAP-007 | MUST | Provide full **Serena-style semantic code intelligence** as first-class MCP tools available to any CLI agent (see detailed Serena Parity Tools below). |
| FR-CAP-008 | SHOULD | Support a version-pinned MCP adapter for selected trusted servers. |
| FR-CAP-009 | SHOULD | Support A2A Agent Card discovery and task status for one tested protocol version. |
| FR-CAP-010 | SHOULD | Apply transport-specific controls for local STDIO and remote HTTP. |
| FR-CAP-011 | COULD | Support registry installation, dynamic capabilities, and broad protocol bindings. |

#### 7.4.1 Serena Parity Tools — Full CLI Agentic AI Experience (MUST for R1)

**Goal:** After an agentic AI (Claude Code, Codex CLI, Gemini CLI, custom MCP client, etc.) connects to a NEXUS project, it must have **exactly the same (or better) semantic code intelligence capabilities** as an agent using https://github.com/oraios/serena.

Serena is the current gold standard for "IDE for your agent". It gives agents symbol-level understanding instead of raw file reads/greps. NEXUS must deliver this natively + integrate it with memory, governance, and audit.

**Core Serena Parity Requirements:**

| Tool Name (MCP)                  | Serena Equivalent                  | Description                                                                 | Priority |
|----------------------------------|------------------------------------|-----------------------------------------------------------------------------|----------|
| `nexus_code_find_symbols`        | find_symbol / get_definitions      | Search for symbols by name (functions, classes, variables, types)           | MUST     |
| `nexus_code_get_symbol_info`     | get_symbol / hover                 | Rich information: signature, docs, type, location                           | MUST     |
| `nexus_code_list_references`     | find_references                    | All usages of a symbol across the project                                   | MUST     |
| `nexus_code_navigate_relationships`| call hierarchy / inheritance     | Callers, callees, implements, extends, imports                              | MUST     |
| `nexus_code_semantic_search`     | (advanced search)                  | Semantic + structural search (much better than grep)                        | MUST     |
| `nexus_code_read_symbol`         | (context reading)                  | Read only the relevant code for a symbol (massive token saver)              | MUST     |
| `nexus_code_get_diagnostics`     | diagnostics                        | Compiler / LSP errors and warnings for file or whole project                | MUST     |
| `nexus_code_get_project_map`     | project structure / outline        | High-level map of modules, key files, entry points                          | MUST     |
| `nexus_code_index_project`       | onboarding / indexing              | Build or refresh semantic index + project memories                          | MUST     |
| `nexus_code_edit_at_symbol`      | precise edit                       | Make a targeted edit at a specific symbol location (with diff preview)      | MUST     |
| `nexus_code_rename_symbol`       | rename refactoring                 | Safe rename with preview and all references updated                         | MUST     |
| `nexus_code_extract_function`    | extract method                     | Extract code into function with proper signature                            | SHOULD   |

**Additional Required Capabilities (Serena + NEXUS value-add):**

- `nexus_code_get_document_symbols` — File outline / symbols in a file
- `nexus_code_get_workspace_symbols` — Project-wide symbol search
- `nexus_code_apply_edit` — Apply a pre-approved precise edit (must go through approval gate)
- `nexus_code_get_type_hierarchy` — Type hierarchy
- Integration with NEXUS memory: Symbol context can be automatically turned into durable memories

**Strict Requirements:**
- All tools **must** be exposed via standard MCP (both HTTP and stdio transport preferred).
- Every symbol operation is **scoped** to the current NEXUS project.
- Edits and refactors **must** use the existing approval + receipt + audit system.
- Indexing/onboarding must create both symbol cache **and** NEXUS memories (`.nexus/serena-memories` or equivalent).
- Performance target: Symbol operations should be fast enough for interactive agent use (< 2s for most queries on mid-size projects).
- Must support at minimum the languages used in this repo: TypeScript/JavaScript, Rust, and Markdown.

This ensures that a pure CLI agent running on this project has **full modern agentic coding superpowers** without needing a graphical IDE.

### 7.5 Policy, approval, and safety

| ID | Priority | Requirement |
|---|---|---|
| FR-SAFE-001 | MUST | Assign every runtime, capability, and task an identity and effective scope. |
| FR-SAFE-002 | MUST | Classify actions by risk and configure approval requirement. **Subagent 19 + 28 + 44:** Default-deny policy. Risk classes: low (auto), medium (log), high (approval), critical (approval + kill-switch check). Policy version must be bound to every decision. Full matrix of action types vs risk must exist in capability inventory. |
| FR-SAFE-003 | MUST | Pause approval-required actions before side effects. |
| FR-SAFE-004 | MUST | Bind decisions to action hash, task step, identity, and policy version. |
| FR-SAFE-005 | MUST | Support approve, deny, expire, and invalid/mismatched decision states. |
| FR-SAFE-006 | MUST | Provide a kill switch that blocks mutations while preserving safe reads and status. |
| FR-SAFE-007 | MUST | Audit policy changes, approval decisions, kill-switch changes, and privileged operations. |
| FR-SAFE-008 | SHOULD | Support edited proposals by re-validating and re-hashing the edited action. |
| FR-SAFE-009 | COULD | Add policy simulation and reusable organization policy bundles. |

### 7.6 Control plane and developer workbench

| ID | Priority | Requirement |
|---|---|---|
| FR-UX-001 | MUST | Show project mode, health, current agents, task states, and pending approvals. |
| FR-UX-002 | MUST | Show a task timeline with human-readable step status and evidence links. |
| FR-UX-003 | MUST | Make approve/deny/cancel/retry actions explicit and confirmation-safe. |
| FR-UX-004 | MUST | Show degraded modes and actionable recovery guidance. |
| FR-UX-005 | MUST | Allow memory search, inspection, correction, archive, and forget. |
| FR-UX-006 | MUST | Provide export/import controls with scope and redaction summary. |
| FR-UX-007 | SHOULD | Provide a local CLI equivalent for initialization, task start, status, approval, and export. |
| FR-UX-008 | SHOULD | Provide run/replay inspection for deterministic test fixtures. |

### 7.7 Observability and evidence

| ID | Priority | Requirement |
|---|---|---|
| FR-OBS-001 | MUST | Emit structured audit records for mutations and privileged reads. |
| FR-OBS-002 | MUST | Correlate task, step, trace, audit, memory, approval, and receipt IDs. |
| FR-OBS-003 | MUST | Record latency, outcome, attempts, token usage when available, and error classification. |
| FR-OBS-004 | MUST | Redact secrets and sensitive content from logs, traces, and exports by default. |
| FR-OBS-005 | SHOULD | Emit OTel-compatible agent, model, and tool spans. |
| FR-OBS-006 | SHOULD | Provide metrics for task success, approval latency, retries, recall usefulness, tool failures, and cost. |
| FR-OBS-007 | COULD | Add distributed trace ingestion and advanced analytics across multiple deployments. |

## 8. State and authorization invariants

1. No tool side effect occurs before required approval is durably recorded.
2. A task cannot transition from a terminal state back to an active state.
3. A canceled task cannot be claimed by a worker after cancellation wins the race.
4. A receipt is created for every tool attempt, including rejected or timed-out attempts where applicable.
5. Every mutation checks the kill switch and effective identity both before and inside its transaction boundary.
6. A runtime cannot read or write a memory outside its effective project/agent scope.
7. An approval decision cannot be replayed against a different action hash or policy version.
8. Export never includes raw secrets, API keys, or unredacted authorization headers.
9. Missing embeddings do not make memory writes or lexical recall unavailable.
10. A failed audit-integrity check blocks configured mutations and is visible to the user.

## 9. Non-functional requirements

### NFR-SEC — Security

- Default deny for capabilities and network egress.
- Scope checks are server-side and cannot be bypassed by UI parameters.
- Validate all external input with typed schemas and bounded sizes.
- Do not pass raw user/model content into shell, SQL, filesystem, or URL operations without domain-specific validation.
- Credentials are never included in subprocess environments or evidence by default.
- Remote MCP transport uses authenticated HTTPS deployment guidance and strict origin policy.
- All security-sensitive events are audit-correlated.

### NFR-REL — Reliability and recovery

- R1 task state transitions are transactional and race-safe.
- A worker restart does not lose committed task/checkpoint state.
- Retry and compensation are bounded and observable.
- Local-only mode remains usable when the shared backend or embedding provider is offline.
- Recovery actions are idempotent or explicitly marked non-retryable.

### NFR-PERF — Performance

Initial targets for a reference development machine; these are measured at the API boundary after baseline instrumentation:

- Local project status: p95 ≤ 500 ms.
- Memory lexical recall on a 10,000-item fixture: p95 ≤ 1.5 s.
- Task status read: p95 ≤ 500 ms.
- Approval decision reflected in task state: p95 ≤ 1 s excluding network.
- Dashboard initial usable state with local data: ≤ 3 s after app load on the reference fixture.
- The UI remains responsive while long tasks run; no polling loop may block rendering.

### NFR-PRIV — Privacy and data lifecycle

- Metadata-only telemetry is the default.
- Content capture, export, and sync are explicit, scoped, and redacted.
- Memory forget operations create a durable deletion/tombstone record where required for sync and audit.
- Retention settings exist for memories, traces, receipts, and exports.
- Local encryption and backend encryption responsibilities are documented before production release.

### NFR-PORT — Portability

- Core domain types and state transitions are independent of one LLM provider.
- Export format is versioned and validated.
- MCP/A2A adapters expose a compatibility matrix.
- SQLite/PGlite/local and PostgreSQL/shared implementations share contract tests for core behavior.

### NFR-UX — Usability and accessibility

- Keyboard-accessible approval and recovery flows.
- Clear distinction between proposed, approved, executed, denied, and failed actions.
- Destructive actions require explicit confirmation and show scope.
- Reduced-motion preference is respected.
- Error messages explain the next safe action without exposing secrets or internal stacks.

### NFR-OPS — Operability

- Health endpoint distinguishes process, storage, provider, queue, and audit health.
- Configuration failures are reported at startup and in the control plane.
- Structured logs include request/task correlation IDs.
- Deployment and rollback procedures are documented for local and shared modes.

## 10. Data model requirements

The implementation may use existing schema conventions, but these concepts must be represented and linked:

- Project
- Principal/identity
- Agent runtime
- Capability/tool
- Memory and memory evidence
- Task and task step
- Checkpoint
- Approval request and decision
- Tool/action receipt
- Audit entry
- Trace/span correlation
- Export/import package
- Sync version/conflict (if shared sync is included in R1)

IDs must be stable, opaque where exposed externally, and safe to correlate without exposing secrets.

## 11. API and integration requirements

The architecture phase will define exact endpoints, but the contract must provide typed operations for:

- Project initialization and status.
- Memory CRUD, recall, feedback, evidence, archive, and forget.
- Task create, get, list, cancel, retry, resume, and recovery classification.
- Approval request list, get, approve, deny, expire, and decision audit.
- Capability inventory and policy evaluation.
- Tool receipt and evidence timeline.
- Export/import and optional project sync.
- Health, metrics, and event stream.

Every response should include a stable trace/request ID and use a consistent success/error envelope.

## 12. Measurement and acceptance plan

Before declaring R1 complete:

1. Create a deterministic fixture project with known memories, tools, policies, and task steps.
2. Run the golden path with a mocked model/provider and bounded tools.
3. Run the same path with the configured real provider only in an opt-in integration suite.
4. Kill the worker at each checkpoint and verify recovery.
5. Deny and expire each approval path and verify no side effect.
6. Attempt cross-project memory and tool access with malformed and valid requests.
7. Attempt replay of approvals, receipts, idempotency keys, and cancellation races.
8. Verify export redaction and invalid import rejection.
9. Measure retrieval quality and latency against a versioned fixture.
10. Verify required metrics, traces, audit entries, and UI state.

## 13. Open decisions for architecture

1. Whether shared sync is implemented in R1 or treated as a post-R1 adapter with a local contract.
2. Whether the first durable runner is NEXUS-native or wraps the current agent runtime.
3. Exact sandbox strategy for constrained commands on each supported OS.
4. Supported MCP stable version and transport subset.
5. Supported A2A version and binding subset.
6. Canonical transaction abstraction across SQLite/PGlite and PostgreSQL.
7. Local secret storage mechanism for the Tauri shell and browser-only mode.
8. Default memory write policy: explicit user capture, post-task proposal, or limited automatic capture.

## 14. Traceability

| Product brief item | PRD coverage |
|---|---|
| Golden path | J1–J6 |
| Trusted memory | FR-MEM, NFR-PRIV, NFR-PORT |
| Durable orchestration | FR-TASK, state invariants, NFR-REL |
| Operator control plane | FR-UX, FR-OBS, J3–J6 |
| Secure gateway | FR-CAP, FR-SAFE, NFR-SEC |
| Developer workbench | FR-PROJ, FR-UX, measurement plan |
| Local-first hybrid | FR-PROJ, NFR-REL, NFR-PORT |
| Production readiness | all NFR sections, acceptance plan |

## 15. PRD exit criteria

- UX can design the journeys and states without inventing requirements.
- Architecture can identify service boundaries, persistence, eventing, security, and integration adapters.
- Epics can map each MUST requirement to implementation stories and tests.
- Sprint planning can select a first increment that produces a working golden-path slice.
