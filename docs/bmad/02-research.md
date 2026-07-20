# BMAD Research — NEXUS 2.0 / Agentic OS V3

**Date:** 2026-07-21  
**Status:** Research complete for product-brief input  
**Product direction:** Integrated Agentic OS  
**Initial user:** Solo developer  
**Initial deployment:** Hybrid local-first with optional shared backend  
**Research scope:** Agent memory, orchestration, interoperability, security/governance, observability, local-first storage, and repository readiness

## 1. Executive summary

The research supports the NEXUS direction, but it also sharpens the product boundary:

> NEXUS should not try to replace every agent framework. It should provide a governed, portable control and context layer that makes agents durable, observable, interoperable, and safe to operate across local and shared deployments.

The highest-leverage product differentiators are:

1. **Portable durable context** across model vendors, agent runtimes, sessions, and local/shared deployments.
2. **Explicit execution governance**: identity, scope, approvals, kill switch, audit, provenance, and rollback.
3. **Protocol-aware interoperability**: MCP for tools/resources/prompts and A2A for agent-to-agent task collaboration.
4. **Operator-grade observability** that connects agent runs, model calls, retrieval, tool calls, approvals, costs, and outcomes.
5. **A local-first path** that does not make the user provision a full backend before the product is useful.

The major product risk is scope: all five pillars are justified, but they cannot be delivered as five independent platforms in the first sprint. The PRD should define a shared platform kernel and one end-to-end golden path that exercises the pillars together.

## 2. External research findings

### 2.1 Agent memory and statefulness

- [Mem0 Platform overview](https://docs.mem0.ai/platform/overview) positions managed memory as a separate layer that extracts facts from conversations, links entities, and retrieves relevant memories at query time. This validates demand for a memory layer but also establishes a low-friction hosted competitor.
- [Letta core concepts](https://docs.letta.com/core-concepts/) treats agents as persistent server-side entities with database-backed memory, stable identity, and memory management across sessions. Its [memory blocks documentation](https://docs.letta.com/guides/core-concepts/memory/memory-blocks) highlights read-only blocks and shared blocks as important controls for memory mutation and collaboration.
- [PGlite documentation](https://pglite.dev/docs/about) confirms that Postgres can run in WASM in the browser, Node.js, and Bun, with persistence through IndexedDB or a filesystem and support for pgvector. This supports NEXUS's local-first concept, but not automatic synchronization or conflict policy by itself.

**Implications for NEXUS**

- Memory must be explicitly scoped by user, project, agent, session, and source; a single undifferentiated memory pool is unsafe.
- Durable memory needs provenance, confidence, contradiction status, retention/forgetting rules, and mutation history.
- Read-only and approval-required memory zones should be first-class, especially for policies, identity, credentials, and shared knowledge.
- Local and server copies need an explicit sync contract: identity, ordering, conflict resolution, tombstones, encryption, and recovery. PGlite is an enabling storage primitive, not the product-level sync solution.
- NEXUS should differentiate from hosted memory services through portability, self-hosting, cross-vendor integrations, auditability, and governed memory mutation.

### 2.2 Durable orchestration and human-in-the-loop execution

- [LangGraph durable execution](https://docs.langchain.com/oss/python/langgraph/durable-execution) documents checkpoint persistence, thread identifiers, durability modes, and the need to wrap non-deterministic or side-effecting operations so replay does not repeat them.
- [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts) documents pausing execution indefinitely, persisting state, and resuming from a stable identifier after external input. The [human-in-the-loop guide](https://docs.langchain.com/oss/python/langchain/human-in-the-loop) models approve, edit, reject, and respond decisions for tool calls.

**Implications for NEXUS**

- A task is not complete merely because an LLM returned text; it needs a durable lifecycle, checkpoints, idempotency keys, retry policy, timeout policy, and terminal outcome.
- Side effects need receipts and replay-safe boundaries. Approval must pause durable execution and release worker capacity rather than hold an in-memory process open.
- Human decisions should be typed, auditable, scoped to the exact proposed action, and bound to the execution version that produced it.
- Saga compensation and rollback must be modeled as domain operations, not generic best-effort cleanup.

### 2.3 MCP tool interoperability and security

- The [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) defines HTTP authorization around OAuth 2.1-related standards, protected-resource metadata, authorization-server discovery, and resource-bound access tokens. STDIO deployments use the host environment rather than the HTTP authorization flow.
- The [MCP tools specification](https://modelcontextprotocol.io/specification/latest/server/tools) describes tools as model-controlled, recommends a human in the loop with the ability to deny invocations, requires tool schemas, supports authorization-dependent tool lists, and warns that tool annotations are not a security guarantee.
- [OWASP's Agentic Security Initiative](https://genai.owasp.org/initiatives/agentic-security-initiative/) provides a dedicated agentic-security program and links the 2026 Agentic Applications Top 10, secure MCP server guidance, third-party MCP guidance, and governance resources.

**Implications for NEXUS**

- Tool metadata must be treated as untrusted input. `readOnly`, `destructive`, or similar hints cannot replace policy evaluation.
- Tool discovery must be deterministic, authorization-aware, paginated, and versioned. The exposed tool set is part of the agent's effective capability boundary.
- Every tool call should pass through: identity resolution → scope/policy check → argument validation → approval decision where required → bounded execution → receipt/audit → redacted result.
- Local STDIO and remote HTTP MCP servers require different credential and transport controls. NEXUS should expose a single policy model while keeping transport-specific enforcement.
- MCP version support should be explicit, with adapters and compatibility tests rather than silently assuming draft behavior.

### 2.4 A2A agent interoperability

- The [A2A 1.0 specification](https://a2a-protocol.org/latest/specification/) defines discovery, capability/modality negotiation, collaborative tasks, synchronous and streaming interactions, asynchronous push notifications, and secure exchange without requiring agents to expose internal state, memory, or tools.
- The specification separates a canonical data model, abstract operations, and protocol bindings. It identifies `AgentCard`, `Task`, `Message`, `Part`, `Artifact`, and `Extension` as core concepts and states that the protocol buffer definition is the normative source for protocol objects.

**Implications for NEXUS**

- NEXUS should distinguish internal kernel tasks from external A2A tasks and retain a correlation ID across both.
- Agent Cards should be treated as capability declarations that require trust, signature/identity verification, version compatibility checks, and policy filtering before use.
- A2A task states and artifacts should map to NEXUS task state without losing protocol-specific information.
- Asynchronous tasks and `input-required`/human-review states belong in the same approval and scheduler model as local agent tasks.
- Generated protocol bindings must come from the normative schema; hand-maintained parallel types create drift risk.

### 2.5 Observability and cost control

- [OpenTelemetry's GenAI observability guidance](https://opentelemetry.io/blog/2026/genai-observability/) shows an agent trace with `invoke_agent`, `chat`, and `execute_tool` spans, standard model/token/finish-reason attributes, and optional content capture.
- The same guidance explicitly notes that prompt content and tool arguments are not captured by default because they can contain sensitive data, while token and latency metrics support cost and performance analysis.

**Implications for NEXUS**

- The trace model must cover the entire execution graph: user request, agent run, memory retrieval, LLM calls, tool calls, subprocesses, approvals, retries, and final outcome.
- Content capture must be opt-in, redacted, access-controlled, and retention-limited. Metadata-only traces should be a safe default.
- Standard OTel attributes should be used where available, with NEXUS-specific attributes for memory IDs, policy decisions, ring/scope, audit sequence, and task correlation.
- Product success metrics should include task success, approval latency, retry/compensation rate, retrieval usefulness, token cost, tool failure rate, and time to recovery—not only HTTP uptime.

### 2.6 Governance and risk management

- [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework) remains a voluntary framework organized around trustworthiness and the Govern, Map, Measure, and Manage lifecycle. NIST's page also identifies the Generative AI Profile and a 2026 critical-infrastructure profile concept note.
- OWASP's agentic initiative focuses on autonomous agents and multi-step workflows, including secure MCP server use and an agentic risk taxonomy.

**Implications for NEXUS**

- Governance must be a product workflow, not only a documentation section: define risk, map the action, measure behavior, and manage interventions.
- Every agent, tool, skill, memory source, and model provider needs an inventory record and owner.
- High-impact actions need explicit policy, approval, and post-action evidence.
- The system should support exportable evidence packages for incident review: task history, approvals, policy versions, tool receipts, relevant memory provenance, trace IDs, and hashes.

### 2.7 Retrieval and vector search

- [pgvector's current README](https://github.com/pgvector/pgvector/blob/master/README.md) documents exact and approximate nearest-neighbor search, HNSW/IVFFlat indexing, multiple vector types/distances, and the ability to keep vectors with transactional Postgres data.
- pgvector's filtering guidance notes that approximate index filtering is applied after the index scan and may require iterative scans, filter indexes, partial indexes, or partitioning depending on selectivity and tenant layout.

**Implications for NEXUS**

- Hybrid retrieval remains appropriate: lexical matching, vector similarity, importance, recency, feedback, and provenance should be evaluated as separate signals.
- Retrieval quality must be measured with a versioned evaluation set, not assumed from an index existing.
- Tenant/project/agent filters must be enforced before or as part of candidate selection; post-filtering approximate results can reduce recall or leak cross-scope candidates.
- Embedding model and dimension are compatibility concerns. Rebuilds, model versioning, backfills, and degraded lexical-only operation need explicit state.

## 3. Repository readiness research

The following is a baseline inspection of the repository at commit `01ed48c82c30253bf827accfdb4269bb98d203e6` on the working branch. These are observations, not proof that every issue is a production defect.

| Signal | Observation | Product/engineering implication |
|---|---:|---|
| Server TypeScript files | 320 | The platform is broad; architecture and ownership boundaries matter. |
| Browser TypeScript/TSX files | 123 | Local-first UX is already a substantial surface. |
| Server test files | 247 | There is a large test surface to classify by unit, integration, and end-to-end confidence. |
| Rust workspace crates | 11 | Rust boundaries and actual runtime integration need to be documented before expanding them. |
| `: any` matches in tracked TS/TSX | 244 | Zero-compromise type goals are not yet reflected uniformly in the codebase. |
| File-level or generic explicit-any disables | 16 | Type quality work must be scoped and justified rather than assumed complete. |
| TODO/FIXME markers | 48 | Roadmap and implementation status need reconciliation. |
| `db.` references in `server/src/routes.ts` | 14 | Route/service separation should be verified against actual code, not only mission-brief instructions. |
| Existing migrations | Includes `0003_task_notify.sql`, `0046_v3_100x.sql`, `0047_audit_log_append_only.sql`, and `0048_vector_hnsw_indexes.sql` | Existing planning documents may have stale filenames or assumptions; schema migration state must be authoritative. |
| Local validation prerequisites | `node_modules` and `server/node_modules` are absent; `pnpm` is not installed in the environment | Tests, lint, typecheck, and builds are not yet baseline-verified in this session. |

### Repository evidence consulted

- `README.md` — product positioning, documented capabilities, deployment modes, and architecture map.
- `MASTER_MISSION_BRIEF.md` — intended hardening priorities and non-negotiable invariants; treated as desired state, not verified state.
- `PLAN.md` — current broad perfection-loop framing.
- `package.json` and `server/package.json` — runtime, scripts, dependency, and validation shape.
- `server/src/`, `src/`, `packages/`, and `crates/` — implementation footprint and domain inventory.

## 4. Competitive and strategic positioning

| Alternative/category | Strong point | NEXUS opportunity |
|---|---|---|
| Managed memory layer | Fast integration, hosted retrieval, minimal infrastructure | Portable/self-hosted memory with provenance, governance, cross-vendor access, and local-first mode |
| Stateful agent runtime | Persistent agent identity and memory, mature pause/resume patterns | A runtime-neutral control plane spanning multiple agent runtimes and model providers |
| Workflow/graph framework | Durable execution and human interrupts inside a chosen framework | Cross-framework execution records, approvals, audit, policy, and external protocol interoperability |
| MCP ecosystem | Standardized access to tools/resources/prompts | Policy gateway and auditable tool governance rather than an untrusted tool directory |
| A2A ecosystem | Standardized agent discovery and task collaboration | Secure adapter, task correlation, shared governance, and operator visibility across local and remote agents |
| APM/LLM observability tool | Traces, metrics, and cost dashboards | Combine telemetry with enforceable policy, memory provenance, approvals, and remediation |

## 5. Research-derived product principles

1. **Local-first, backend-optional:** a user should be able to create, inspect, and recall data locally; shared mode adds durability and coordination rather than being the only path.
2. **Portable by default:** do not bind memory, skills, traces, or tasks to one model vendor or framework.
3. **Policy before power:** every capability has an owner, scope, risk classification, and audit path.
4. **Durable by design:** checkpoints, idempotency, receipts, retries, and compensation are part of the core task model.
5. **Evidence over assertion:** memories, actions, and outcomes carry source/provenance and confidence.
6. **Explicit human control:** approvals are typed and durable; the system must make denial and recovery easy.
7. **Protocol adapters, not protocol forks:** support MCP and A2A semantics through versioned adapters and conformance tests.
8. **Safe telemetry defaults:** capture useful metadata by default; protect prompt, memory, and tool content by default.
9. **Measured retrieval:** every ranking change is evaluated against known queries, budgets, scopes, and usefulness feedback.
10. **Narrow vertical slices:** the platform vision is broad, but each increment must produce a complete user-visible outcome.

## 6. Key research risks and open questions

1. What is the minimum local-first experience that remains useful without an LLM provider or backend?
2. Which memory classes may an agent write automatically, and which require user approval?
3. What is the first high-value workflow for a solo developer: coding task, research task, project planning, or maintenance automation?
4. How should local data synchronize with the shared backend when both copies change offline?
5. Which action categories require approval by default: file writes, shell commands, network calls, data deletion, credentials, or agent spawning?
6. What compatibility target is required for MCP and A2A in the first release, and which versions are explicitly unsupported?
7. Should the first runtime integration be NEXUS-native only, or must it import/export an existing framework's task/checkpoint format?
8. What data is allowed in audit and telemetry, for how long, and under which access scopes?
9. How will memory quality be evaluated for the solo developer's real projects?
10. Which parts of the Rust workspace are product-critical versus optional tooling?

## 7. Recommended product-brief direction

The product brief should define an integrated platform with one golden path:

> A solo developer runs a local or shared NEXUS agent on a real project. The agent recalls governed project context, proposes a multi-step task, requests approval for risky actions, executes through scoped tools, records durable checkpoints and receipts, exposes the run in the control plane, and leaves behind useful, provenance-backed memory and reusable skill evidence.

This golden path naturally exercises all five strategic pillars without requiring all documented features to be production-complete at once.

## 8. Research exit decision

**Research outcome:** Proceed to product brief.  
**Scope stance:** Keep all five pillars in the product vision, but define the MVP around one end-to-end golden path and a small number of supported action types.  
**Primary product risk:** uncontrolled platform breadth, not lack of technical opportunity.
