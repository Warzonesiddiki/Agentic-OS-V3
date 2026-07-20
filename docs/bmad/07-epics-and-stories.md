# BMAD Epics & Stories — NEXUS 2.0 / Agentic OS V3

**Date:** 2026-07-21  
**Status:** Ready for sprint planning  
**Source:** `docs/bmad/04-prd.md`, `docs/bmad/05-ux-design.md`, `docs/bmad/06-architecture.md`  
**Release:** R1 — Governed Agent Workbench vertical slice

## 1. Delivery strategy

The product vision includes all five pillars, but R1 is delivered as one integrated golden path. Stories are ordered by architectural dependency and user-visible value. A story is not complete when code compiles; it is complete when its acceptance criteria, tests, audit behavior, and documentation are verified.

### Priority key

- **P0:** Release blocker / foundational.
- **P1:** Required for the golden path.
- **P2:** Strong R1 enhancement.
- **P3:** Post-R1 candidate.

### Estimate key

Relative points: 1 = small isolated change, 2 = modest, 3 = medium, 5 = large/cross-cutting, 8 = architectural/high risk.

## 2. Epic overview

| Epic | Name | Outcome | Priority |
|---|---|---|---|
| E0 | Baseline and domain contracts | Reliable testable boundaries before feature integration | P0 |
| E1 | Project and local-first foundation | A scoped local project can be initialized and inspected | P0 |
| E2 | Trusted memory and recall | Provenance-backed scoped memory and budgeted recall | P1 |
| E3 | Durable task execution | A task survives interruption and exposes state | P0 |
| E4 | Policy, capability, and approvals | Risky actions pause before side effects | P0 |
| E5 | Evidence and observability | Every meaningful action is explainable and correlated | P1 |
| E6 | Control plane and developer workbench | Developer can complete the golden path in the UI | P1 |
| E7 | Interoperability and optional shared mode | Selected MCP/A2A and explicit project sync paths | P2 |
| E8 | Production hardening and release validation | Security, performance, recovery, and release confidence | P0 |

## 3. Cross-story Definition of Done

Every story must satisfy the following unless explicitly waived in its story file:

- Typed domain/API contracts; no new unvalidated external payloads.
- Unit or contract tests for happy path, failure path, and authorization boundary.
- Audit/evidence behavior documented for mutations.
- No secrets or raw sensitive content added to logs, fixtures, or exports.
- UI changes cover loading, empty, error, offline/degraded, and accessibility states where applicable.
- Relevant docs updated.
- Story acceptance criteria checked and implementation notes recorded.
- `npm run lint`, `npm run typecheck`, and targeted tests pass when dependencies are available.

## 4. Epic E0 — Baseline and domain contracts

### E0-S1 — Establish repository validation baseline

**Priority:** P0 · **Estimate:** 3  
**User story:** As a maintainer, I want a reproducible validation baseline so that later stories can distinguish existing failures from regressions.

**Acceptance criteria**

1. Document Node/package-manager requirements and the supported install command.
2. Run or explicitly record the result of lint, typecheck, unit tests, frontend tests, and Rust checks.
3. Capture existing failures by command, package, and classification without suppressing them.
4. Add a CI/local validation entry point that produces deterministic exit codes.
5. Record the baseline in `docs/bmad/` and link it from the sprint status file.

**Dependencies:** none  
**Test notes:** validation scripts; no silent catch-all.

### E0-S2 — Define shared R1 domain types and state enums

**Priority:** P0 · **Estimate:** 5  
**User story:** As an engineer, I want one typed vocabulary for projects, tasks, approvals, capabilities, receipts, and evidence so that local, server, and UI code cannot drift.

**Acceptance criteria**

1. Define versioned types for project mode, task state, step state, risk, decision, receipt, and policy decision.
2. Define valid task and approval transitions plus invalid-transition errors.
3. Parse external JSON at boundaries; no domain function accepts unvalidated unknown data.
4. Types are consumable by server, frontend, and SDK without driver-specific fields.
5. Contract tests cover every valid transition and representative invalid transitions.

**Dependencies:** E0-S1  
**Test notes:** exhaustive transition table and property-style invalid transition tests.

### E0-S3 — Introduce repository/service boundaries

**Priority:** P0 · **Estimate:** 5  
**User story:** As a maintainer, I want routes and UI adapters to depend on domain services/repositories rather than raw database details so that local and shared implementations can conform to the same behavior.

**Acceptance criteria**

1. Define repository interfaces for projects, memories, tasks, approvals, and evidence.
2. Move at least the R1 command/query paths behind service functions.
3. Route modules contain no inline domain mutation or direct database queries.
4. Local and PostgreSQL adapters can be substituted in contract tests.
5. Errors map to stable domain/API codes with safe messages.

**Dependencies:** E0-S2  
**Test notes:** mock repository tests plus one real adapter contract suite.

## 5. Epic E1 — Project and local-first foundation

### E1-S1 — Initialize and inspect a project scope

**Priority:** P0 · **Estimate:** 3  
**User story:** As a developer, I want to initialize a project so that all memory, task, tool, and evidence data is isolated to it.

**Acceptance criteria**

1. Create a project with stable opaque ID, name, root/scope metadata, mode, and timestamps.
2. Repeating initialization with the same idempotency key returns the same project.
3. Project status reports local/shared mode, storage health, provider health, embedding health, and sync state.
4. A request without a valid project scope cannot read or mutate project data.
5. The API and UI show a clear local-only/degraded state.

**Dependencies:** E0-S2, E0-S3  
**Test notes:** duplicate init, missing scope, cross-project access, provider unavailable.

### E1-S2 — Implement local persistence adapter

**Priority:** P0 · **Estimate:** 5  
**User story:** As a developer, I want the core project path to work locally without a backend so that I can use NEXUS privately and offline.

**Acceptance criteria**

1. Local storage persists project, memory, task, approval, receipt, and event records across reload.
2. Storage writes are serialized or otherwise race-safe for the supported runtime.
3. Corruption or quota errors surface as health state and do not silently discard writes.
4. Local IDs and timestamps follow the shared domain contracts.
5. A fresh local store can run the deterministic R1 fixture.

**Dependencies:** E0-S2  
**Test notes:** reload, concurrent writes, quota/corruption simulation, fixture setup/teardown.

### E1-S3 — Project export/import dry run

**Priority:** P1 · **Estimate:** 3  
**User story:** As a developer, I want to export and validate project data so that local work remains portable and recoverable.

**Acceptance criteria**

1. Export is schema-versioned and scoped to one project.
2. Secrets and sensitive fields are redacted or omitted according to the export policy.
3. Import validates schema and integrity before mutation.
4. Dry-run reports additions, conflicts, rejected records, and redactions.
5. Invalid input cannot partially mutate the project.

**Dependencies:** E1-S1, E0-S3, E5-S1  
**Test notes:** invalid schema, duplicate records, redaction, interrupted import transaction.

## 6. Epic E2 — Trusted memory and recall

### E2-S1 — Create and manage provenance-backed memories

**Priority:** P1 · **Estimate:** 5  
**User story:** As a developer, I want typed memories with evidence and lifecycle controls so that the agent can reuse context without treating all content as equally trustworthy.

**Acceptance criteria**

1. Create memory with type, content, project/agent scope, source, provenance, confidence, and lifecycle state.
2. Read/update/archive/forget operations enforce scope and kill-switch policy.
3. Update history or evidence link shows what changed and why.
4. Imported/external content is marked untrusted or candidate until approved by policy.
5. Memory mutations create audit records and sync-compatible changes.

**Dependencies:** E1-S1, E0-S3  
**Test notes:** cross-scope access, forget/tombstone, provenance required, kill switch.

### E2-S2 — Implement token-budgeted hybrid recall

**Priority:** P1 · **Estimate:** 5  
**User story:** As an agent runtime, I want scoped recall within a token budget so that I can receive useful project context without overflowing the model context window.

**Acceptance criteria**

1. Query accepts project/agent scope and positive token budget.
2. Results are candidate-filtered by scope before packing.
3. Lexical mode works without embeddings.
4. Vector mode is used only when the provider/index is available and dimension-compatible.
5. Response includes result IDs, provenance, mode, budget requested, budget used, and truncation state.
6. Packing never exceeds the requested budget according to the documented tokenizer/estimator.

**Dependencies:** E2-S1, E1-S2  
**Test notes:** empty corpus, budget 0/low/high, lexical fallback, cross-scope, dimension mismatch.

### E2-S3 — Add recall feedback and contradiction signals

**Priority:** P2 · **Estimate:** 3  
**User story:** As a developer, I want to mark recall useful or not useful and see contradictions so that memory quality improves without silent rewriting.

**Acceptance criteria**

1. Feedback is recorded with query, result, actor, timestamp, and scope.
2. Feedback cannot change memory content or provenance by itself.
3. Contradiction candidates are flagged with linked evidence.
4. Recall can expose signal explanations without leaking unrelated records.
5. Feedback and contradiction changes are auditable.

**Dependencies:** E2-S2, E5-S1  
**Test notes:** duplicate feedback, unauthorized feedback, conflicting facts, ranking regression fixture.

## 7. Epic E3 — Durable task execution

### E3-S1 — Create durable tasks with idempotency

**Priority:** P0 · **Estimate:** 5  
**User story:** As a developer, I want to start a durable task so that my request does not disappear when a process or browser stops.

**Acceptance criteria**

1. Task creation stores project, principal, agent, goal, capabilities, policy version, input reference, and idempotency key.
2. Repeated idempotency key returns the original task without duplicate execution.
3. Task starts in `queued` and emits a committed event.
4. Task detail/list APIs return state, current step, timestamps, and correlation IDs.
5. Unauthorized callers cannot see or mutate the task.

**Dependencies:** E0-S2, E0-S3, E1-S1  
**Test notes:** duplicate requests, concurrent create, missing capability, scope isolation.

### E3-S2 — Implement checkpointed worker execution

**Priority:** P0 · **Estimate:** 8  
**User story:** As a developer, I want task steps and checkpoints persisted so that work can resume after worker loss without replaying committed side effects.

**Acceptance criteria**

1. Worker claims tasks with a lease and heartbeat.
2. Each step writes durable state before continuing past its side-effect boundary.
3. Worker restart recovers expired leases from the last checkpoint.
4. A confirmed receipt prevents duplicate execution of an idempotent step.
5. Task state transitions are race-safe and terminal states cannot reopen.
6. Crash injection tests cover before/after checkpoint and before/after side effect.

**Dependencies:** E3-S1, E5-S1  
**Test notes:** fake clock, worker crash injection, concurrent workers, lease expiry.

### E3-S3 — Retry, timeout, cancellation, and recovery

**Priority:** P0 · **Estimate:** 5  
**User story:** As a developer, I want bounded recovery controls so that transient failures do not require restarting the whole task and permanent failures do not loop forever.

**Acceptance criteria**

1. Retry policy stores max attempts, backoff, timeout, and error classification.
2. Retry is available only for eligible states/errors.
3. Cancellation is race-safe against claim/start/approval transitions.
4. Failed tasks expose last checkpoint and valid recovery actions.
5. Compensation steps run only when declared and are separately recorded.
6. The API never reports `completed` before final state commit.

**Dependencies:** E3-S2, E4-S2, E5-S1  
**Test notes:** timeout, cancellation race, exhausted attempts, compensation partial failure.

### E3-S4 — Task event stream and replay cursor

**Priority:** P1 · **Estimate:** 3  
**User story:** As a control-plane user, I want task changes to stream and replay so that reloads do not lose execution visibility.

**Acceptance criteria**

1. Committed task events have stable IDs and sequence/cursor.
2. Client can reconnect with the last cursor.
3. Server replays missed events or signals resync required.
4. Duplicate events are idempotent in the client store.
5. Events do not include unredacted secrets/content by default.

**Dependencies:** E3-S1, E5-S2  
**Test notes:** disconnect/reconnect, duplicate delivery, missed cursor, out-of-order rejection.

## 8. Epic E4 — Policy, capability, and approvals

### E4-S1 — Capability inventory and policy evaluation

**Priority:** P0 · **Estimate:** 5  
**User story:** As a developer, I want explicit capabilities and risk rules so that an agent can only use tools I intentionally make available.

**Acceptance criteria**

1. Capability record includes source, version, owner, schema, risk class, scopes, and health.
2. Policy evaluation returns allow/deny/approval-required with rule and version.
3. Model output, tool descriptions, and annotations cannot override policy.
4. Capability lookup is project/agent scoped and default-deny.
5. Policy evaluation is unit-testable without invoking an LLM or tool.

**Dependencies:** E0-S2, E1-S1  
**Test notes:** allow/deny/approval matrix, malformed schema, unavailable capability, scope escalation.

### E4-S2 — Durable approval requests and decisions

**Priority:** P0 · **Estimate:** 5  
**User story:** As a developer, I want to approve or deny a precise proposed action so that risky side effects never happen invisibly.

**Acceptance criteria**

1. Approval request is persisted before the task can execute the action.
2. Request shows project, task, agent, tool, redacted arguments, risk reason, policy version, expiry, and action hash.
3. Approve/deny validates identity, current kill switch, expiry, policy version, and action hash.
4. A denied/expired/mismatched decision produces no tool side effect.
5. Duplicate decisions are safe and do not resume a different action.
6. Approval survives browser/worker restart.

**Dependencies:** E4-S1, E3-S2, E5-S1  
**Test notes:** approval race, expiry, replay, denial side effect spy, reload.

### E4-S3 — Bounded native tool gateway

**Priority:** P0 · **Estimate:** 8  
**User story:** As a developer, I want the agent to use a small safe tool set so that the golden path can perform useful project work without granting unrestricted host access.

**Acceptance criteria**

1. Read-file tool enforces project-root/path allowlist.
2. Write-file tool requires approval and records a receipt.
3. Constrained-command tool runs only in the selected sandbox with timeout and resource limits.
4. Tool inputs and outputs are schema-validated and redacted where needed.
5. Network, credentials, path traversal, and command injection tests fail closed.
6. Every attempt is linked to task step, approval, receipt, audit, and trace IDs.

**Dependencies:** E4-S1, E4-S2, E3-S2, E5-S1  
**Test notes:** adversarial path/command/input fixtures; no real destructive commands.

### E4-S4 — Kill switch and quarantine enforcement

**Priority:** P0 · **Estimate:** 3  
**User story:** As a developer, I want an emergency stop that blocks mutation and execution so that I can contain a suspected unsafe agent.

**Acceptance criteria**

1. Enabling kill switch is authenticated, scoped, reasoned, and audited.
2. New mutations, tool calls, task claims, and approvals are blocked according to policy.
3. In-flight steps reach a safe stop boundary or quarantine state.
4. Status/evidence reads needed for recovery remain available.
5. Disable requires explicit authorization and is audited.
6. Race tests cover enable during transaction, claim, approval, and tool execution.

**Dependencies:** E4-S1, E5-S1  
**Test notes:** transaction lock/race tests and recovery.

## 9. Epic E5 — Evidence and observability

### E5-S1 — Append-only audit and action receipts

**Priority:** P0 · **Estimate:** 5  
**User story:** As a developer, I want an immutable record of mutations and tool attempts so that I can prove what happened during a task.

**Acceptance criteria**

1. Task transitions, memory mutations, policy/approval decisions, kill-switch changes, and tool attempts create audit/evidence records.
2. Receipts contain normalized action hash, actor, target, outcome, timing, and correlation IDs.
3. Audit integrity can be verified and reports the first broken sequence/hash.
4. Update/delete attempts against append-only evidence are blocked.
5. Sensitive fields are redacted before persistence where required.
6. Evidence records are exportable by project scope.

**Dependencies:** E0-S2, E1-S1  
**Test notes:** tamper attempt, hash chain, redaction, missing audit failure.

### E5-S2 — OTel-compatible task/model/tool telemetry

**Priority:** P1 · **Estimate:** 5  
**User story:** As a developer, I want the complete agent execution graph observable so that I can diagnose latency, cost, and failure causes.

**Acceptance criteria**

1. Emit spans for task, agent, recall, model, approval wait, tool, and outcome operations.
2. Record model/latency/token metadata when available.
3. Do not capture prompt/memory/file/tool content by default.
4. Trace IDs correlate with audit, receipt, task, and approval records.
5. Metrics cover task outcomes, retries, approval latency, recall mode/usefulness, tool failures, and provider health.
6. Exporter failure cannot fail the task or mutate domain state.

**Dependencies:** E3-S1, E4-S3, E5-S1  
**Test notes:** exporter unavailable, redaction, correlation, metric cardinality.

### E5-S3 — Evidence timeline and safe export

**Priority:** P1 · **Estimate:** 5  
**User story:** As a developer, I want a human-readable task evidence package so that I can inspect, debug, or share a run safely.

**Acceptance criteria**

1. Timeline joins task/step/approval/receipt/audit/trace/provenance references through service projections.
2. Export includes schema version, scope, selected records, redaction summary, and integrity metadata.
3. Export never includes configured secrets or authorization headers.
4. Import dry-run reports additions/conflicts/rejections without mutation.
5. Export/import failures leave the source project unchanged.

**Dependencies:** E5-S1, E5-S2, E1-S3  
**Test notes:** redaction corpus, invalid import, large export, partial failure.

## 10. Epic E6 — Control plane and developer workbench

### E6-S1 — R1 dashboard and project setup UX

**Priority:** P1 · **Estimate:** 5  
**User story:** As a developer, I want to see project health and start a governed task from one place so that the product is understandable without studying the backend.

**Acceptance criteria**

1. Dashboard shows project mode, health, pending approvals, active/recoverable tasks, and capability status.
2. Empty state guides project initialization.
3. Setup wizard explains local/shared mode and safe defaults.
4. Loading, empty, offline, degraded, error, and permission states are implemented.
5. Keyboard and screen-reader checks pass for setup and primary actions.

**Dependencies:** E1-S1, E6-S2  
**Test notes:** mocked local/shared states, responsive snapshots, accessibility.

### E6-S2 — Task start and detail experience

**Priority:** P1 · **Estimate:** 8  
**User story:** As a developer, I want to start and inspect a task timeline so that I understand what the agent is doing and can recover safely.

**Acceptance criteria**

1. Start drawer shows goal, scope, agent, memory mode, capabilities, budgets, and approval preview.
2. Task detail has deep link, status, current step, timeline, evidence links, cost/latency, and valid actions.
3. UI renders all task states with the PRD language and no fake progress.
4. Event replay keeps the view correct after reload/reconnect.
5. Cancel/retry/recover actions require server-confirmed state.
6. UI never exposes raw secrets or unredacted tool arguments.

**Dependencies:** E3-S1, E3-S4, E5-S3  
**Test notes:** golden path with fake runtime, reconnect, each state fixture.

### E6-S3 — Approval inbox and safe decision UX

**Priority:** P0 · **Estimate:** 5  
**User story:** As a developer, I want to review the exact side effect before approving it so that I can make an informed decision.

**Acceptance criteria**

1. List shows risk, action, project, agent, expiry, and “no side effect yet.”
2. Detail shows plain-language effect, exact redacted operation, policy reason, identity, and evidence.
3. Approve button names the side effect; deny is equally accessible.
4. Focus management, keyboard flow, escape behavior, and screen-reader labels are correct.
5. Stale/mismatched decision errors explain that the action must be refreshed.

**Dependencies:** E4-S2, E6-S2  
**Test notes:** approve/deny/expire/reload/accessibility.

### E6-S4 — Memory and evidence workbench

**Priority:** P1 · **Estimate:** 5  
**User story:** As a developer, I want to inspect memory provenance and task evidence so that I can correct the system instead of blindly trusting it.

**Acceptance criteria**

1. Memory list/recall shows scope, source, confidence, freshness, mode, and feedback controls.
2. Memory inspect supports correct/archive/forget with confirmation and audit result.
3. Task evidence view links to relevant memory and receipt records.
4. Export dialog shows scope, record types, redaction, and dry-run result.
5. Works in local and shared/degraded modes with accurate status.

**Dependencies:** E2-S1, E2-S2, E5-S3  
**Test notes:** data projection, feedback, forget, export preview, keyboard use.

## 11. Epic E7 — Interoperability and optional shared mode

### E7-S1 — Versioned MCP capability adapter

**Priority:** P2 · **Estimate:** 8  
**User story:** As a developer, I want to connect a selected MCP server through NEXUS policy so that tool integrations do not bypass governance.

**Acceptance criteria**

1. Supported MCP version and transports are declared in a compatibility matrix.
2. Server discovery/listing is authorization-aware and deterministic.
3. Tool schemas are validated; annotations are treated as untrusted.
4. Local STDIO environment is filtered; remote HTTP uses configured auth/origin/timeout controls.
5. Tool calls flow through capability policy, approval, receipt, audit, and trace boundaries.
6. Unsupported protocol behavior fails with a clear capability error.

**Dependencies:** E4-S1, E4-S3, E5-S2  
**Test notes:** conformance fixtures, malicious annotations, env leakage, timeout.

### E7-S2 — Versioned A2A task adapter

**Priority:** P2 · **Estimate:** 8  
**User story:** As a developer, I want to delegate a bounded task to a trusted remote agent without losing local visibility or policy control.

**Acceptance criteria**

1. Supported A2A version/binding is declared and tested.
2. Agent Card is validated for identity, endpoint, capabilities, auth, and version.
3. Remote task ID/context/artifacts correlate to a local task step.
4. Local policy and approval run before delegation and before artifact promotion.
5. Remote failure/unknown status is visible and recoverable.
6. Remote content is untrusted and cannot silently become trusted memory.

**Dependencies:** E4-S1, E3-S2, E5-S2  
**Test notes:** fake remote agent, malformed card, auth failure, long-running task, artifact validation.

### E7-S3 — Explicit one-project sync

**Priority:** P2 · **Estimate:** 8  
**User story:** As a developer, I want to sync one local project to a shared backend with visible conflicts so that I can move between machines without silent data loss.

**Acceptance criteria**

1. Push/pull uses revision/cursor and project scope.
2. Append-only records merge by ID/integrity; mutable conflicts are surfaced.
3. Task/approval state is resolved through the state machine, not timestamps.
4. Offline edits remain available locally until accepted or rejected.
5. UI shows sync mode, last cursor, pending changes, and conflicts.
6. Conflict resolution is explicit and audited.

**Dependencies:** E1-S3, E5-S1, E6-S1  
**Test notes:** offline edits, concurrent memory update, task/approval conflict, retry.

## 12. Epic E8 — Production hardening and release validation

### E8-S1 — Security and isolation verification

**Priority:** P0 · **Estimate:** 8  
**User story:** As a maintainer, I want adversarial tests for the R1 boundaries so that production readiness is based on evidence rather than feature claims.

**Acceptance criteria**

1. Cross-project, cross-agent, and scope-escalation tests fail closed.
2. Path traversal, command injection, SSRF, oversized payload, and credential leakage tests fail closed.
3. Approval replay, idempotency replay, kill-switch race, and audit tamper tests pass.
4. MCP/A2A untrusted metadata tests do not bypass policy.
5. Security findings are triaged with severity and resolution/defer decision.
6. No security test relies on a real destructive external system.

**Dependencies:** E4-S3, E4-S4, E5-S1, E7-S1/E7-S2 if enabled  
**Test notes:** isolated fixtures, fuzz/property cases where practical.

### E8-S2 — Performance and reliability acceptance suite

**Priority:** P0 · **Estimate:** 5  
**User story:** As a maintainer, I want repeatable performance and crash-recovery tests so that the golden path remains usable under realistic load.

**Acceptance criteria**

1. Measure PRD p95 targets for status, recall, approval, and dashboard startup.
2. Run worker crash/restart and event reconnect suites repeatedly.
3. Verify no unbounded event/listener/worker leaks in long-running tests.
4. Capture result, environment, fixture size, and thresholds in an artifact.
5. Regressions are visible in CI or documented as a release decision.

**Dependencies:** E2-S2, E3-S2, E3-S4, E6-S2  
**Test notes:** fake provider for deterministic timings; separate real-provider suite.

### E8-S3 — R1 release gate and operational documentation

**Priority:** P0 · **Estimate:** 5  
**User story:** As a developer, I want an honest setup, recovery, and upgrade guide so that I can operate NEXUS safely after implementation.

**Acceptance criteria**

1. Document local-only setup, shared setup, provider setup, supported capabilities, and degraded modes.
2. Document backups/export, restore/import, kill switch, audit verification, and worker recovery.
3. Publish compatibility matrix for Node, database, MCP/A2A adapters, and browser/Tauri paths.
4. README feature claims match validated behavior; simulations and deferred capabilities are labeled.
5. Release checklist includes tests, migrations, security review, rollback, and known limitations.

**Dependencies:** all R1 MUST stories  
**Test notes:** clean-machine walkthrough and documentation link checks.

## 13. Story dependency spine

```text
E0-S1 -> E0-S2 -> E0-S3
                     ├─> E1-S1 -> E1-S2 -> E1-S3
                     ├─> E2-S1 -> E2-S2 -> E2-S3
                     ├─> E3-S1 -> E3-S2 -> E3-S3 -> E3-S4
                     ├─> E4-S1 -> E4-S2 -> E4-S3 -> E4-S4
                     └─> E5-S1 -> E5-S2 -> E5-S3

E1-S1 + E3-S1 + E4-S2 + E5-S1 -> E6-S1/E6-S2/E6-S3
E2-S1 + E2-S2 + E5-S3 -> E6-S4
E4/E5/E3 -> E7 adapters
All MUST stories -> E8 release gate
```

## 14. Release slicing

### Slice 1 — Safe skeleton

E0-S1, E0-S2, E1-S1, E3-S1, E4-S1, E5-S1.

### Slice 2 — Local governed task

E1-S2, E2-S1, E2-S2, E3-S2, E4-S2, E4-S3, E4-S4.

### Slice 3 — User-visible golden path

E3-S3, E3-S4, E5-S2, E5-S3, E6-S1, E6-S2, E6-S3, E6-S4.

### Slice 4 — Production confidence and optional connectivity

E0-S3, E8-S1, E8-S2, E8-S3, then E7 stories according to capacity and protocol readiness.

## 15. Story readiness checklist

A story may enter sprint planning only when:

- Its domain nouns and state transitions are defined.
- Acceptance criteria are testable without subjective interpretation.
- Dependencies are complete or explicitly planned in the same sprint.
- Security/audit/observability impact is stated.
- A representative failure case is named.
- The story can be reviewed independently.
