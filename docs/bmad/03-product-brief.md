# BMAD Product Brief — NEXUS 2.0 / Agentic OS V3

**Date:** 2026-07-21  
**Status:** Draft for PRD (Zero-Compromise Expanded)  
**Product type:** Local-first, hybrid Agentic OS and developer control plane  
**Primary user:** Solo developer  
**Initial deployment:** Local-first with optional shared backend  
**Product vision:** Integrated platform across memory, orchestration, governance, interoperability, and developer operations  
**Master BMAD Doc:** `docs/bmad/README.md` — Full workflow, checklists, and perfection target

## 1. Product vision

NEXUS gives a solo developer a durable, portable, and governable AI partner for real project work. It remembers useful context without treating every statement as truth, executes multi-step work without losing state, asks for approval before risky actions, exposes what happened, and can operate locally or through a shared backend without locking the developer to one model vendor or agent framework.

## 2. Product mission

Make autonomous AI work trustworthy enough to use repeatedly:

- **Remember** project context with evidence, scope, confidence, and controlled retention.
- **Plan and execute** durable tasks with checkpoints, retries, receipts, and recovery.
- **Control** capabilities through identity, scopes, policy, approvals, and a kill switch.
- **Connect** to tools and other agents through protocol-aware MCP and A2A adapters.
- **Learn** from outcomes by turning successful patterns into reviewable skills.
- **Explain** every meaningful decision and side effect through an operator-friendly control plane.

## 3. Target users

### Primary persona: Independent builder

A solo developer who uses multiple AI coding or automation agents across personal and professional projects.

**Needs**

- Keep project decisions, preferences, constraints, and past outcomes available across sessions.
- Use different models and agent clients without rebuilding memory and tools.
- Let agents perform useful work while retaining control over destructive or external actions.
- Recover from failed or interrupted work without starting over.
- Understand cost, latency, tool usage, and what changed.
- Run locally for privacy and offline resilience, then optionally sync selected data to a shared backend.

**Pain points**

- Repeating the same context and correcting the same mistakes.
- Unclear or over-broad permissions for tools and agents.
- Long-running tasks that disappear after a terminal closes or a process crashes.
- Difficulty determining whether a failure came from memory, the model, a tool, or orchestration.
- Vendor-specific memory and agent state that is difficult to export.

### Secondary personas (later expansion)

- **Small engineering team:** shares governed project memory, workflows, and audit evidence.
- **Platform operator:** manages agents, policies, health, queues, incidents, and recovery.
- **Security/compliance reviewer:** inspects identities, approvals, receipts, provenance, and retention.

The first release must remain useful to the primary persona without requiring the secondary personas or a multi-tenant SaaS control plane.

## 4. Core user problem

A developer can ask an AI agent to do work, but cannot reliably make that work persist, remain scoped, recover after failure, or produce trustworthy evidence. Existing tools typically optimize one layer—memory, workflow execution, protocol access, or observability—leaving the developer to assemble and secure the boundaries themselves.

## 5. Product promise

> Start locally, connect the agents and tools you already use, give them durable project context and bounded capabilities, approve sensitive actions, recover from failure, and retain a trustworthy record of what happened.

## 6. Golden path for the first production slice

1. The developer initializes NEXUS for a project.
2. NEXUS creates a local project scope and imports or captures selected project context.
3. The developer asks an agent to perform a bounded multi-step task.
4. The agent recalls relevant, provenance-backed project memories within a token budget.
5. NEXUS creates a durable task with checkpoints and a visible execution trace.
6. The agent proposes a tool action that matches an approval policy.
7. The developer reviews the exact action, arguments, risk, and expected side effect.
8. After approval, NEXUS executes the scoped tool and records a receipt.
9. The task completes or enters an explicit recoverable failure state.
10. NEXUS shows the outcome, cost, actions, approvals, and evidence in the control plane.
11. The developer marks the result useful/not useful; the system stores a candidate memory or skill only according to configured policy.
12. The developer can export or sync the selected project state to an optional shared backend.

This is the first user-visible definition of "Agentic OS". It is intentionally narrow enough to test end to end.

## 7. Product pillars

**New Strategic Pillar (Serena Parity):** NEXUS must give CLI agentic AIs the full power of modern IDE code intelligence (symbol navigation, semantic search, precise refactoring) through MCP. This is now a core requirement for any serious agentic OS.

### Pillar 1 — Trusted Agent Memory

- Typed memories: project fact, decision, preference, episodic outcome, procedure, and reference.
- Explicit scope: project, agent, session, user, and shared/read-only.
- Provenance, confidence, freshness, contradiction status, and retention policy.
- Hybrid lexical/semantic recall with token budgets and feedback.
- Reviewable capture, correction, forgetting, export, and import.

### Pillar 2 — Reliable Agent Orchestration

- Durable tasks with state transitions and checkpoints.
- Idempotency, bounded retries, timeouts, cancellation, and compensation.
- Human approval/input as a durable pause, not an in-memory modal.
- Local worker and optional shared worker execution.
- Correlation across internal tasks, MCP calls, and A2A tasks.

### Pillar 3 — Operator Control Plane

- Current agents, tasks, approvals, failures, costs, and system health.
- Execution timeline with model calls, memory retrieval, tool calls, and receipts.
- Safe controls: approve, deny, retry, cancel, quarantine, and kill switch.
- Evidence export for debugging and incident review.
- Clear degraded-mode indicators when embeddings, backend, or provider services are unavailable.

### Pillar 4 — Secure Tool and Agent Gateway

- Scoped MCP tools/resources/prompts with explicit transport and version support.
- A2A Agent Card discovery and task delegation behind trust and policy checks.
- Tool/schema validation, origin/credential controls, rate limits, and sandbox boundaries.
- Capability inventory, source provenance, version pinning, and approval classification.
- Immutable or tamper-evident action receipts.

### Pillar 5 — Agent Developer Workbench

- Local setup and project initialization.
- Run/replay/inspect a task from the browser or CLI.
- Memory inspection and correction.
- Policy and approval simulation.
- Test fixtures and evaluation datasets for recall and execution behavior.
- Skill candidates based on successful, reviewable outcomes.

## 8. MVP scope

### Must include

1. Local project initialization and scoped storage.
2. Create, list, inspect, update, and delete typed memories with provenance.
3. Budgeted hybrid recall with a lexical-only fallback.
4. One durable task runner with checkpoints, idempotency, retry, cancellation, and a terminal outcome.
5. A small, explicit tool set (for example: read project file, write project file, run a constrained command) behind policy checks.
6. Human approval for at least file writes and command execution.
7. Audit receipts for task transitions, approvals, and tool invocations.
8. A dashboard view for memories, task timeline, pending approvals, and failures.
9. Local export/import and optional sync of one project scope to a backend.
10. Testable provider abstraction with at least one configured provider path and a safe no-provider/degraded mode.
11. Security defaults: least privilege, redaction, payload limits, rate limits, and kill switch.
12. End-to-end test coverage for the golden path and adversarial approval/authorization cases.

### Should include

- MCP adapter for a small set of trusted local or remote tools.
- A2A adapter limited to discovery plus task submission/status for one supported version.
- OTel-compatible traces and metrics with metadata-only defaults.
- Feedback loop for recall usefulness and task outcome.
- Candidate skill creation that always requires review before activation.

### Defer until after the first production slice

- Full multi-tenant SaaS and organization billing.
- Broad marketplace/registry of third-party skills.
- Autonomous skill installation or hot reload.
- Unbounded agent spawning and recursive delegation.
- Blockchain anchoring and cross-chain features.
- Full desktop actuation and VLM-driven GUI control.
- Every possible MCP/A2A binding and protocol version.
- Automatic memory mutation from untrusted external content.
- Comprehensive framework-specific importers for every agent runtime.

## 9. Differentiation

NEXUS is not only a vector memory product, a workflow framework, or an MCP registry. Its differentiation is the combination of:

- Model- and framework-neutral durable state.
- Memory that carries provenance and governance rather than only similarity scores.
- Tool and agent interoperability with policy and audit at the boundary.
- A local-first product path with optional shared coordination.
- A control plane that makes approvals, failures, and recovery first-class.
- Exportable evidence and safe defaults suitable for production use by a small team.

## 10. Success definition

The first release is successful when a solo developer can complete a real project task through the golden path and answer:

- What did the agent know, and where did that knowledge come from?
- What did the agent plan to do?
- Which actions required approval, and what exactly was approved?
- What tools ran, with what arguments and results?
- If something failed, can I resume or recover without duplicating side effects?
- What did the task cost and how long did it take?
- Can I export or sync the project state without losing its meaning or evidence?

## 11. Initial outcome metrics

Targets will be baselined during the PRD and implementation phases.

| Metric | Initial target direction |
|---|---|
| Golden-path task completion | At least 90% of deterministic acceptance runs complete without manual data repair. |
| Approval correctness | 100% of approval-required actions pause before side effects; denied actions produce no side effect. |
| Recovery | Interrupted tasks resume from a checkpoint without replaying a confirmed side effect. |
| Recall usefulness | At least 80% of sampled golden-path queries return a useful top-k result within budget; evaluation set and rubric documented. |
| Evidence completeness | 100% of task transitions, approvals, tool calls, and outcomes have correlated audit records. |
| Scope isolation | No cross-project or cross-agent memory/tool access in adversarial tests. |
| Local usability | A new project can initialize and complete a no-backend demo path using documented steps. |
| Sync safety | Offline edits converge deterministically or surface an explicit conflict; no silent overwrite. |
| Operational visibility | A failed task can be located and classified from the control plane without reading raw server logs. |

## 12. Non-goals for the initial release

- NEXUS is not a general-purpose autonomous employee or unrestricted shell agent.
- NEXUS is not a replacement for a model provider, IDE, source-control platform, or cloud scheduler.
- NEXUS does not promise that retrieved memories are true; it presents evidence and uncertainty.
- NEXUS does not treat protocol metadata or model output as trusted policy.
- NEXUS does not enable silent high-impact actions by default.
- NEXUS does not claim full compliance certification through the existence of audit logs.

## 13. Product risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope explosion from "everything" | One golden path; explicit Must/Should/Defer boundaries; phase-gated epics. |
| Memory poisoning or stale context | Provenance, scope, confidence, contradiction states, write policy, user correction, and adversarial tests. |
| Unsafe tool execution | Least privilege, typed policy engine, approval gates, sandboxing, receipts, and kill switch. |
| Duplicate side effects during retry/replay | Idempotency keys, durable step state, side-effect receipts, and compensation design. |
| Local/shared divergence | Versioned sync protocol, deterministic conflict rules, tombstones, and visible conflicts. |
| Privacy leakage through traces/export | Metadata-only defaults, redaction, encrypted storage, retention controls, and scoped export. |
| Protocol churn | Versioned MCP/A2A adapters, conformance fixtures, and explicit compatibility matrix. |
| False production confidence | Clean baseline, measurable acceptance tests, adversarial code review, and no feature marked complete without validation. |

## 14. Product brief decisions

- **Direction:** Integrated NEXUS Agentic OS, not a single isolated feature.
- **Primary user:** Solo developer.
- **Deployment:** Hybrid local-first with optional shared backend.
- **First release shape:** Narrow vertical slice covering all pillars at minimum depth.
- **Primary proof:** A real project task that is remembered, planned, approved, executed, audited, recoverable, and optionally synced.
- **Next BMAD phase:** Convert this brief into a testable PRD with user stories, functional requirements, quality attributes, acceptance criteria, and a release boundary.
