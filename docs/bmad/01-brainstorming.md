# BMAD Brainstorming — NEXUS 2.0 / Agentic OS V3

**Date:** 2026-07-21  
**Status:** Discovery in progress  
**Workflow:** Full BMAD workflow  
**Outcome target:** Production-ready system

## 1. Product context

NEXUS 2.0 is positioned as a persistent memory, recall, skills, governance, and coordination layer for AI agents. The repository currently describes a pnpm monorepo containing:

- A React/Vite browser control plane with an embedded PGlite mode.
- A Hono/Node backend with PostgreSQL/SQLite support.
- Memory, semantic recall, skills, sessions, audit, safety, scheduler, kernel, MCP, and agent-runtime capabilities.
- Shared TypeScript packages and a decoupled Rust workspace.
- A Tauri desktop shell.

This is a repository-level product discovery exercise. Capabilities listed in existing documentation are hypotheses until verified during research and implementation planning.

## 2. Core problem hypothesis

AI agents are powerful but difficult to operate reliably over time because they lose context between sessions, cannot consistently reuse successful procedures, have weak cross-agent coordination, and require stronger controls for identity, authorization, provenance, auditing, and human intervention.

## 3. Desired product promise

> Give AI agents durable context and reusable capability while giving operators a trustworthy, observable, and governable execution layer.

## 4. Brainstorming lenses

### How Might We…

1. Make an agent remember only what is useful, supported by evidence, and safe to reuse?
2. Let an operator understand what every agent is doing, why it is doing it, and what it changed?
3. Coordinate multiple agents without losing task state, auditability, or rollback capability?
4. Make external tools and MCP/A2A agents discoverable without weakening security boundaries?
5. Turn repeated successful work into reusable skills without silently introducing unsafe automation?
6. Make the system deployable and operable in production with clear health, recovery, and compliance signals?

### Reverse brainstorming: how could we make NEXUS unsafe or unusable?

- Hide failed tasks and partial writes from operators.
- Allow privilege escalation through agent or tool boundaries.
- Mix tenants, projects, or memory scopes.
- Leak API keys through subprocesses, logs, exports, or tool receipts.
- Make recall authoritative without provenance, confidence, or contradiction handling.
- Require a complex backend setup before a user can understand the product.
- Add features faster than they can be tested and operated.

These failure modes become non-negotiable product and architecture constraints.

## 5. Candidate product initiatives

| ID | Initiative | Primary user | User value | Why it fits the repository | Main uncertainty |
|---|---|---|---|---|---|
| A | **Operator Control Plane** | Platform/operator team | See agent health, tasks, approvals, failures, audit, and recovery in one place | Existing dashboard, kernel, SSE, audit, metrics, and safety concepts provide a foundation | Which operator workflows are essential for a first production release? |
| B | **Trusted Agent Memory** | Individual developer or AI agent builder | Reliable cross-session recall with provenance, feedback, privacy, and export/import | Existing typed memories, recall pipeline, embeddings, feedback, checkpoints, and vault bridge | What retrieval quality and privacy guarantees are actually needed? |
| C | **Reliable Agent Orchestration** | Engineering/platform team | Run multi-step and multi-agent work with retries, compensation, scheduling, and visibility | Existing kernel, task worker, DAG/saga, bus, scheduler, and runtime concepts align directly | Which workflows and failure states must be supported first? |
| D | **Secure Tool and Agent Gateway** | Enterprise platform/security team | Govern MCP/A2A tools and agents with scoped access, receipts, approvals, and policy | Existing MCP, scopes, auth, audit, sandbox, and ring model are relevant | Which protocol and identity integrations are required for adoption? |
| E | **Agent Developer Workbench** | Agent developer | Develop, test, inspect, and replay agent behavior locally before deployment | Existing browser dashboard, SDK, devtools, tracing, sandbox, and desktop shell are potential building blocks | What is the smallest workflow that creates repeatable developer value? |

## 6. Initial prioritization hypothesis

Scoring is provisional and must be validated with user input and research.

| Initiative | User impact | Strategic fit | Production leverage | Delivery risk | Initial signal |
|---|---:|---:|---:|---:|---|
| A. Operator Control Plane | High | High | High | Medium | Strong candidate |
| B. Trusted Agent Memory | High | High | Medium | Medium | Strong candidate |
| C. Reliable Agent Orchestration | High | High | High | High | Valuable, likely narrower first |
| D. Secure Tool and Agent Gateway | High | High | High | High | Valuable for enterprise adoption |
| E. Agent Developer Workbench | Medium/High | Medium | Medium | High | Defer until core workflows are validated |

## 7. Suggested discovery direction

For a production-ready outcome, begin with one thin vertical slice rather than attempting to productionize every documented subsystem at once. The strongest initial candidates are:

1. **Operator Control Plane for safe agent execution**, using health, task state, approvals, audit, and kill-switch workflows.
2. **Trusted Agent Memory**, using capture → recall → feedback → provenance as a measurable end-to-end loop.
3. **Reliable Agent Orchestration**, using one representative workflow with retries, compensation, and operator visibility.

No initiative is selected yet. Research and the product brief should be scoped only after the product owner selects a primary direction.

## 8. Decisions needed from the product owner

1. Which candidate initiative should become the first BMAD delivery target: A, B, C, D, or E?
2. Who is the first user: solo developer, agent developer, platform operator, security/compliance operator, or another persona?
3. What is the first deployment context: local/self-hosted, single-team server, or multi-tenant SaaS?
4. Should the first release optimize for a focused production vertical slice or a broad platform foundation?

## 9. Product-owner direction

The product owner selected **everything**: NEXUS should be treated as an integrated Agentic OS rather than a single isolated capability. The first user is a **solo developer**, and the initial production context is **hybrid**: a local-first experience with an optional shared backend.

This means the candidate initiatives become coordinated product pillars:

1. Trusted Agent Memory
2. Reliable Agent Orchestration
3. Operator Control Plane
4. Secure Tool and Agent Gateway
5. Agent Developer Workbench

The full product vision may include all five pillars. The PRD and sprint plan must still define an explicit delivery sequence, thin vertical slices, and deferred depth so that "everything" does not become an unbounded first sprint.

## 10. Exit criteria for brainstorming

- Product direction: integrated NEXUS Agentic OS.
- Initial user: solo developer.
- Initial deployment: hybrid local-first with optional shared backend.
- All five product pillars are in the strategic vision.
- Research should validate the cross-cutting platform assumptions and identify the safest sequencing for the first production slice.
