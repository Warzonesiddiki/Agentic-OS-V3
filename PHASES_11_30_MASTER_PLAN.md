# NEXUS 2.0: Phases 11-30 Master Plan

## Zero-Compromise Expansion — Research-Backed, 200 Tasks, 10 Phases

**Generated:** 2026-07-07
**Based on:** 20 parallel research+brainstorming agents analyzing 50+ competing projects, 15+ reference architectures, and 10 domain-specific deep dives
**Prerequisite:** Complete Phases 1-10 from `MASTER_MISSION_BRIEF.md` first

---

## HOW TO USE THIS DOCUMENT

This is a complete expansion plan. Each phase has:

- **Rationale** — why this phase matters now
- **Key research insight** — what we learned from the landscape analysis
- **20 specific tasks** with file paths, implementation details, and verification steps
- **Dependencies** — what must be done before this phase

Execute in order. Do not skip phases. Each phase builds on the previous.

---

## RESEARCH INSIGHTS SUMMARY (from 10 landscape agents)

### Key Competitor Learnings

| Source                        | Key Takeaway                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| OpenFang (16-layer security)  | Capability inheritance validation, WASM dual-metering, Merkle audit trails — gold standard for agent security |
| LangGraph (90K★)              | State-graph model + checkpointer for workflow DAG with human-in-the-loop interrupts                           |
| OpenClaw (250K★)              | Ring/capability security model closest to NEXUS; suffered CVE chains in 2026                                  |
| Dify (65K★)                   | Low-code + API dual-mode UX pattern; tenant isolation model                                                   |
| Semantic Kernel (28K★)        | DI container plugin pattern; CRITICAL: never trust LLM output (CVE-2026-25592, CVSS 10.0)                     |
| KhaledSaeed18 boilerplate     | Closest TS stack match (Express→Hono swap, Drizzle, Zod, Vitest)                                              |
| Grafana frontend architecture | Widget-per-panel, JSON-serializable dashboards, 3-stage boot                                                  |
| Phoenix (observability)       | OTel-native, free LLM-as-judge, easiest self-host setup                                                       |
| Langfuse (observability)      | Best prompt management, agent graph DAG view, ClickHouse-backed                                               |

### Key Architecture Decisions for Phases 11-30

1. **Stack**: Hono + Drizzle + Zod + Vitest + tsyringe DI
2. **Real-time**: SSE primary, WebSocket for interactive control, TanStack Query cache bridge
3. **State**: Three-layer (TanStack Query server state + Zustand client + Jotai atomic)
4. **Security**: OAuth 2.1 + PKCE, Ed25519 JWTs, strict CSP nonces, capability-based rings
5. **Database**: pgvector HNSW, LISTEN/NOTIFY doorbell, hash-chained audit with Merkle blocks
6. **Testing**: AI Assurance Pyramid (5 layers), property-based with fast-check, diff coverage gates
7. **Docs**: C4 model, ADRs per decision, Mintlify conceptual + MkDocs reference split
8. **CI/CD**: Turborepo cache, `drizzle-kit migrate` (never push), CodeQL + Trivy, deploy via SSH

---

## PHASE 11: Advanced Kernel & Scheduling

**Prerequisite:** Phase 2 (services.ts split), Phase 6 (DI container)
**Rationale:** The kernel is the heart of NEXUS. Before adding more features, the scheduling foundation must be production-grade with MLFQ, priority inheritance, and preemption.

### Key Research Insight

OpenFang's kernel model and AIOS academic research both converge on a **scheduling-aware kernel** as the critical differentiator between a toy agent system and a production OS. LangGraph's state-graph checkpointer shows the value of pause/resume for agent workflows.

### Tasks

1. **Multi-Level Feedback Queue (MLFQ) Scheduler**
   File: `server/src/services/scheduler.ts`
   Replace flat priority+age sort in `pickNextTask()` with true MLFQ: Q0 (highest priority, smallest timeslice) → Q4 (largest timeslice). Boost all to Q0 every 5s.
   Verify: Enqueue 100 tasks; interactive tasks complete first while CPU-bound migrate to lower queues.

2. **Priority Inheritance Protocol (PIP)**
   File: `server/src/services/kernel.ts`
   When high-priority agent waits on resource held by low-priority agent, boost holder's priority. Implement `inheritPriority()` and `restorePriority()` hooks.
   Verify: Low-pri agent holds lock, high-pri waits; confirm low executes at boosted priority.

3. **Cooperative vs Preemptive Scheduling Mode**
   File: `server/src/services/kernel.ts`, `task-worker.ts`
   Add `schedulingMode: 'cooperative' | 'preemptive'` to `SpawnAgentInput`. Cooperative yields via `kernel.yield()`. Preemptive gets hard wall-clock timeout.
   Verify: Cooperative agent that never yields blocks worker. Preemptive agent with 500ms quantum gets preempted and rescheduled.

4. **Earliest-Deadline-First (EDF) Hard-Real-Time Scheduler**
   File: `server/src/services/scheduler.ts`
   Add `deadline?: Date` to task input. Parallel scheduler path picks by `deadline ASC` with admission control.
   Verify: 3 tasks with deadlines 1s/5s/10s from now + 50 best-effort tasks; 1s-deadline executes first.

5. **Per-Ring Resource Budget Controller (cgroups-style)**
   File: `server/src/services/kernel.ts`
   Define `maxConcurrency`, `maxTokensPerMin`, `maxAPICallsPerMin` per ring. Track rolling-window usage. Block dispatch for a ring when budget exhausted.
   Verify: Set Ring 3 to 2 API calls/min; only 2 of 10 agents succeed, rest queued with `ring_budget_exceeded`.

6. **Scheduler Quantum Enforcement with Context Save/Restore**
   File: `server/src/services/task-worker.ts`
   Each task gets `quantumMs`. Worker snapshots execution state on timeout, pushes task back to `queued`. Next `pickNextTask()` deserializes and restores.
   Verify: Set quantum to 100ms; task preempted, re-queued, resumes from snapshot within 3 quanta.

7. **Kernel Event Bus — Typed Subscription System**
   File: `server/src/services/kernel.ts`
   Typed events for `task.enqueued`, `task.completed`, `agent.spawned`, `agent.preempted`, `ring.budget_exceeded`. Services subscribe and bus publishes to message-bus.
   Verify: Subscribe to `task.completed`; confirm handler fires with correct payload and message appears on matching topic.

8. **Scheduling Policy Plugin Architecture**
   File: `server/src/services/scheduler.ts`
   Interface `{ pick(tasks: QueuedTask[]): QueuedTask }`. Implement MLFQPolicy, EDFPolicy, FairSharePolicy. Swappable at runtime via API.
   Verify: Switch from MLFQ to FairSharePolicy; task distribution is 33/33/33 within 5%.

9. **Backpressure Signaling — Scheduler-to-Enqueuer Flow Control**
   File: `server/src/services/kernel.ts`
   When queue depth > `highWatermark`, `enqueueTask()` returns 429 with `Retry-After`.
   Verify: Set Q0 watermark to 5; calls 6-10 return backpressure; drain re-enables.

10. **Agent State Machine Visualizer (Mermaid Export)**
    File: `server/src/services/kernel.ts`
    Walk agents table, emit Mermaid `stateDiagram-v2` with transitions from audit log. Expose `GET /api/kernel/state-machine`.
    Verify: Paste output into Mermaid renderer; verify all agent transitions present.

11. **Kernel-Health-Aware Scheduling**
    File: `server/src/services/task-worker.ts`, `kernel.ts`
    Workers report health metrics. Scheduler deprioritizes workers with health score < 0.3. Probe tasks only.
    Verify: Simulate high memory on worker; stops receiving new tasks.

12. **Schedule-Aware Agent Lifecycle Hooks**
    File: `server/src/services/kernel.ts`
    Agents register `onPreempt` and `onResume` hooks. Scheduler executes hook on preempt to persist checkpoint.
    Verify: Register `onPreempt = "save_checkpoint"`; audit log shows `agent.checkpoint_saved`.

13. **Hot-Reload Ring Policy Registry**
    File: `server/src/services/kernel.ts`
    Move `RING_TOOL_ACCESS` to DB-backed `RingPolicyStore`. Expose `PATCH /api/kernel/ring-policy`.
    Verify: Remove `shell` from Ring 1 ACL via API; Ring-1 agent shell execution denied without restart.

14. **Agent Control Groups with Recursive Budget Inheritance**
    File: `server/src/services/kernel.ts`
    Agents spawned with `parentId` inherit proportional slice. `cgroup: { cpuWeight, memWeight, tokenShare }`.
    Verify: Parent pauses; all children in cgroup atomically pause.

15. **Hierarchical Scheduler — Per-Team Nested Schedulers**
    File: `server/src/services/scheduler.ts`
    Teams get independent schedulers with global time budget allocation.
    Verify: 70% budget to Team-A, 30% to Team-B; 100 tasks each → ~70 vs ~30 completion.

16. **Gang Scheduling — Co-Schedule Dependent Groups**
    File: `server/src/services/kernel.ts`
    Agents declare `gangId`. All-or-nothing dispatch. `gangQuantum` for concurrent execution.
    Verify: 3-agent gang, one blocked; none execute. Unblock third; all 3 run within same tick.

17. **Scheduler Profiling — Per-Queue Latency Percentiles**
    File: `server/src/services/scheduler.ts`
    HdrHistogram tracking p50/p90/p99/p999 queue wait times per queue. Expose via `GET /api/scheduler/latency`.
    Verify: Enqueue 1000 tasks; p50 < p90 < p99 values reflect actual wait times.

18. **Distributed Barrier Synchronization**
    File: `server/src/services/kernel.ts`
    Agents await `barrier.wait("phase-2", timeoutMs)`. Releases all simultaneously when all arrive.
    Verify: 3 agents on barrier "sync-1"; all 3 resume within 50ms of each other.

19. **Scheduler Replay & Dry-Run Mode**
    File: `server/src/services/scheduler.ts`
    `dryRun` boolean for what-if analysis. Logs full schedule trace without execution.
    Verify: Dry-run 20 tasks; output shows valid schedule order without side effects.

20. **Deadline-Aware Admission Control**
    File: `server/src/services/scheduler.ts`
    Reject tasks where `deadline - now < estimatedDuration * safetyFactor`.
    Verify: Task with impossible deadline returns 422 before enqueuing.

---

## PHASE 12: Advanced Memory Systems

**Prerequisite:** Phase 4 (database optimizations), Phase 2 (recall consolidation)
**Rationale:** Memory is NEXUS's core differentiator. Current hybrid recall is solid; this phase adds forgetting curves, clustering, consolidation, and causal chains.

### Key Research Insight

Mem0, Letta, and vstash all converge on **tiered memory** (STM→MTM→LTM) with importance decay. The Ebbinghaus forgetting curve is the consensus mechanism. Zep/Graphiti's bi-temporal knowledge graph shows the value of time-versioned facts.

### Tasks

1. **Hierarchical Memory Compression Pipeline (STM→MTM→LTM)**
   File: `server/src/services/memory-hierarchy.ts`
   Background cron: STM (raw, 7d TTL). LLM compresses 3-5 related STM to MTM summary. LTM further compresses to archetype.
   Verify: 10 related STM items → ≤4 MTM with compressed content, 1 LTM archetype. Token count shrinks 60%+ per tier.

2. **Ebbinghaus Forgetting Curve Decay Engine**
   File: `server/src/services/memory-decay.ts`
   `decayImportance()` runs scheduled. `importance *= e^(-Δt / halflife)`. Halflife per kind (episodic=12h, semantic=7d).
   Verify: Insert memory importance 1.0, fast-forward 24h, run decay; importance < 0.3.

3. **Memory Topic Clustering (HDBSCAN + LLM Labeling)**
   File: `server/src/services/memory-clustering.ts`
   HDBSCAN on embeddings. LLM labels clusters. Stored in `memory_clusters` table.
   Verify: 5 "rust async" + 5 "UI colors" memories → 2 clusters with relevant labels.

4. **Cross-Session Memory Stitcher**
   File: `server/src/services/memory-stitcher.ts`
   On session end, find memories with cosine similarity > 0.85 + ≥2 shared entities. Create `session_links`.
   Verify: 3 memories across 2 sessions mentioning "vector DB" → session link created, importance boosted.

5. **Episodic → Semantic Consolidation Refinery**
   File: `server/src/services/consolidation.ts`
   Weekly cron: high-importance episodic memories → LLM extracts factual statements → new semantic memories with `source_chain`.
   Verify: 3 episodic memories about Rust borrow checker → ≥1 new semantic memory with factual rule.

6. **Memory Contradiction Detector**
   File: `server/src/services/memory-contradiction.ts`
   On insert, batch overlap check. LLM entailment judge classifies as supporting/contradicting/neutral.
   Verify: "prefers dark mode" then "switched to light mode" → contradiction created.

7. **Interactive Memory Graph Browser**
   File: `src/components/memory-graph.tsx`, `server/src/routes/memory-graph.ts`
   React D3 force-directed graph. Nodes = memories, edges = clusters, chains, contradictions.
   Verify: Open `/memory-graph`; visible graph with ≥10 nodes and colored edges.

8. **Schema-Versioned Multi-Brain Export/Import**
   File: `server/src/services/brain.ts`
   Version 3 schema with clusters, links, contradictions, attachments. Migration path v2→v3.
   Verify: Export with all features, wipe DB, import → all structures restored.

9. **Semantic Deduplication Merger**
   File: `server/src/services/memory-dedup.ts`
   Cosine similarity > 0.92 pairs merged: higher-importance title, concatenated content, summed recallCount.
   Verify: "likes React" and "really likes React.js" → 1 merged memory with combined content.

10. **Memory Rehearsal Scheduler (Spaced Repetition)**
    File: `server/src/services/memory-rehearsal.ts`
    SM-2 algorithm variant. `nextReviewAt` exponentially advances (1d→3d→7d→30d). Due memories get importance boost.
    Verify: Memory with `nextReviewAt = yesterday` appears in recall despite low semantic match.

11. **Feedback-Weighted Ranking Trainer**
    File: `server/src/services/ranking-trainer.ts`
    Train lightweight linear ranker from feedback triples. Replace static W_RRF/W_IMPORTANCE/etc with learned blend.
    Verify: 100 feedback records; W_SEMANTIC increases relative to W_BM25; ranking improves.

12. **Emotional/Mood Tagging on Write**
    File: `server/src/services/memory-emotion.ts`
    Emotion classifier extracting {joy, surprise, fear, anger, sadness, disgust, trust, anticipation} with intensity 0-1.
    Verify: "I'm thrilled!" → emotion.joy > 0.7. "Bug keeps crashing" → anger > 0.4.

13. **Temporal Causal Chain Builder**
    File: `server/src/services/memory-causal-chains.ts`
    LLM infers causal relationships from memory sequences. Stores in `memory_causal_edges`.
    Verify: Timeline "set up PG → migrated → timeout → increased pool → fast" → edges connecting each step.

14. **Multi-Modal Memory Attachment Store**
    File: `server/src/services/memory-attachments.ts`
    `memory_attachments` table for image/code/audio/file. Upload API, thumbnail generation, code syntax highlighting.
    Verify: Upload PNG → row created. Upload Python snippet → stored as text.

15. **Memory Consolidation Budget Controller**
    File: `server/src/services/consolidation-budget.ts`
    Knapsack selector: high-importance promoted, low-importance archived (not deleted) when budget exceeded.
    Verify: Budget 500 tokens, 20k STM → exactly 500 promoted, rest marked archival_candidate.

16. **Memory Influence Provenance Tracker**
    File: `server/src/services/memory-provenance.ts`
    Log which memories injected into context window. Track in `memory_influence` table.
    Verify: Recall + agent action → row linking action to recalled memory with influence score.

17. **Sparse Priming Memory Injector**
    File: `server/src/services/memory-priming.ts`
    At session start, find top-5 memories by task embedding similarity. Inject compressed forms within priming budget.
    Verify: Task "debug Rust build error" → ≥2 memories about Rust/debugging primed. Total ≤ 500 tokens.

18. **Memory Health Dashboard**
    File: `server/src/routes/memory-health.ts`, `src/components/memory-health.tsx`
    Returns total count, fragmentation ratio, decay percentiles, dedup rate, contradiction count, budget utilization.
    Verify: 7 metric cards with trend lines; pie chart matches DB counts.

19. **Anomalous Memory Access Detector**
    File: `server/src/services/memory-anomaly.ts`
    Rolling window (7d) per agent. High-importance memory not accessed >48h → anomaly event triggers rehearsal.
    Verify: Insert high-importance memory, fast-forward 72h → anomaly row emitted.

20. **Natural-Language Self-Query Interface**
    File: `server/src/services/memory-nl-query.ts`
    `POST /api/memories/query` accepts NL like "what did I learn about React last week?" Extracts time+topic, recalls, formats answer.
    Verify: "React.memo" memory from 5 days ago → query returns it. "Python" query → no match.

---

## PHASE 13: Multi-Agent Orchestration

**Prerequisite:** Phase 11 (kernel/scheduling), Phase 6 (DI container, MessageBus)
**Rationale:** Single agents are useful; orchestrated teams are transformative. This phase builds the coordination layer.

### Key Research Insight

LangGraph's state-graph model with typed nodes/edges + checkpointers is the ideal reference for workflow orchestration. AG2 (AutoGen)'s event-driven messaging + nested chats shows the communication pattern. OpenAI SDK's guardrail-as-first-class-primitive and sandbox agents align with NEXUS ring model.

### Tasks

1. **Hierarchical Orchestrator (Manager → Sub-Agents)**
   File: `server/src/services/orchestrator.ts`
   `OrchestratorAgent` spawns typed sub-agents with contracts, monitors via heartbeat, merges outputs.
   Verify: Spawns 3 research sub-agents, each returns partial findings, orchestrator synthesizes final output.

2. **Blackboard Shared Memory Space**
   File: `server/src/services/blackboard.ts`
   Pub/sub key-value store with versioning, write locks, delta propagation.
   Verify: Agent A writes `{findings:"x"}` to `research.data`, Agent B reads → both values in final snapshot.

3. **Swarm Broadcast & Gossip Protocol**
   File: `server/src/services/swarm-protocol.ts`
   Broadcast (fan-out to all) and gossip (epidemic propagation to N neighbors).
   Verify: 5-agent swarm broadcasts "probe" → all 5 receive within 500ms. Gossip "rumor" → all converge within 2s.

4. **Declarative Workflow DSL (YAML Pipelines)**
   File: `server/src/services/workflow-dsl.ts`
   YAML DSL with stages: parallel, sequential, map, reduce, choose, loop. Compiled to internal DAG.
   Verify: Parse `{mode:parallel, agents:[A,B]} then {mode:reduce, agent:C}` → A and B parallel, C receives both.

5. **Agent Specialization Registry + Skill Matching**
   File: `server/src/services/specialization-registry.ts`
   Agents declare capabilities. Matcher scores against task requirements, returns top-N with confidence.
   Verify: 3 agents, query `{requires:["research","data-analysis"]}` → top-ranked has both skills.

6. **Dynamic Agent Team Formation (Auto-Assembly)**
   File: `server/src/services/team-builder.ts`
   `TeamBuilder` queries registry, selects optimal agents, assigns roles, provisions blackboard.
   Verify: Complex task → manifest has ≥2 agents, distinct roles, blackboard namespace, orchestrator ID.

7. **Agent Handoff Protocol (State Transfer)**
   File: `server/src/services/handoff.ts`
   Serialize Agent A's full state to `HandoffPackage`. Agent B deserializes and resumes.
   Verify: A processes 3 steps, handoffs to B, B continues 2 → all 5 steps in sequence with zero data loss.

8. **Agent Output Voting & Consensus**
   File: `server/src/services/consensus.ts`
   Strategies: majority, weighted-by-confidence, Borda count, approval.
   Verify: 3 agents return "42" (0.9), "42" (0.7), "43" (0.8) → majority winner is "42".

9. **Recursive Agent Delegation with Depth Limit**
   File: `server/src/services/recursive-delegation.ts`
   Runtime detects sub-goals exceeding complexity, delegates to children, enforces `maxDepth`.
   Verify: `maxDepth=3`, goal needs 4 → stops at depth 3 with "max delegation depth exceeded".

10. **Real-Time DAG Visualization**
    File: `server/src/services/orchestration-viz.ts`, `src/components/OrchestrationViz.tsx`
    SSE stream emitting node status changes. React force-directed graph with color-coded nodes.
    Verify: Execute 5-node DAG; each node transitions green/red on frontend within 1s.

11. **Conditional Branching / Dynamic Routing**
    File: `server/src/services/conditional-router.ts`
    `RouterNode` evaluates predicate against accumulated state, routes to one of N branches.
    Verify: `if score>0.8 route "expert-review" else "auto-approve"` with score=0.9 → only "expert-review" executed.

12. **Human-in-the-Loop Handoff Gates**
    File: `server/src/services/hitl-gate.ts`
    Pauses workflow at configured nodes, sends notification, awaits human decision, resumes or forks.
    Verify: DAG pauses at HITL node, POST approve → resumes on approved branch.

13. **Pluggable Agent Output Validation Gates**
    File: `server/src/services/validation-gate.ts`
    Zod schema, semantic similarity, constraint scan, toxicity filter between DAG nodes.
    Verify: Gate with `z.string().min(10)`, agent returns "short" → gate fails, triggers compensation.

14. **Parallel Execution with Formal Merge Strategies**
    File: `server/src/services/merge-strategies.ts`
    Union, intersection, concatenation, weighted-sum, custom reducer. Handles partial failures.
    Verify: 3 agents return [1,2], [3,4], [5,6] with concatenation → merged [1,2,3,4,5,6].

15. **Typed Agent-to-Agent Communication (A2A++)**
    File: `server/src/services/agent-comm.ts`
    Request/response with timeout, streaming, progress, cancellation. Schema-validated envelopes.
    Verify: Agent A sends `AnalyzeRequest` to B, B responds with `AnalysisResult` → trace-id propagated.

16. **Resource Budget Controller (Per-Team)**
    File: `server/src/services/resource-controller.ts`
    Tracks token usage, LLM calls, wall-clock time per team. Preempts over-budget agents.
    Verify: Team budget=500, A consumes 300, B preempted at 200 → B paused with "budget exceeded".

17. **Agent Liveness / Heartbeat Monitoring**
    File: `server/src/services/agent-health.ts`
    Periodic heartbeats. Orchestrator detects stale agents (>3 missed beats), quarantines, reassigns work.
    Verify: Agent stops heartbeating → after 4 missed beats marked "stale", task re-queued and completes.

18. **Workflow Checkpoint & Resume (Crash Recovery)**
    File: `server/src/services/checkpoint-engine.ts`
    Periodic checkpointing at DAG wave boundaries. On crash, reconstruct from last successful wave.
    Verify: Crash mid-wave-3 of 5 → waves 1-2 from checkpoint, wave 3 re-executes, 4-5 complete.

19. **Agent Output Deduplication / Idempotency**
    File: `server/src/services/dedup-engine.ts`
    Content hashing over output + idempotency keys. Identical parallel outputs merged.
    Verify: 2 agents return `{id:"r1", data:"hello"}` → dedup collapses to one.

20. **Workflow SLA Enforcement & Escalation**
    File: `server/src/services/sla-watchdog.ts`
    SLA per DAG (duration, criticality). Watchdog warns at 50%, escalates at 80%, auto-aborts at 100%.
    Verify: SLA=5s, inject 10s delay → escalation at 4s, aborted at 5s with "SLA exceeded".

---

## PHASE 14: Security Hardening & Compliance

**Prerequisite:** Phase 1 (security baseline) complete
**Rationale:** After Phases 11-13 add kernel and orchestration complexity, security must scale with it. This phase adds enterprise-grade controls.

### Key Research Insight

OpenFang's 16-layer security model is the reference: capability inheritance validation, WASM dual-metering, Merkle audit trails, taint tracking. MCP Security Standard specifies AUTHZ-01 through SUPPLY-02. OWASP Agentic Top 10 (2026) adds ASI-02 (Tool Misuse) through ASI-10 (Supply Chain).

### Tasks

1. **SIEM Forwarder (Structured Audit Export)**
   File: `server/src/services/siem-forwarder.ts`
   Tails `audit_log`, ships structured JSON to Splunk HEC/Elasticsearch/Datadog Logs API. Configurable batch/flush/circuit breaker.
   Verify: Deploy local ELK, run agent workflow, confirm exact audit entries in Kibana.

2. **Anomaly Detection on Audit Chain**
   File: `server/src/services/anomaly-detector.ts`
   Sliding-window analyzer computing per-actor/action frequency baselines (1h/24h/7d). Flags >3σ deviations.
   Verify: Burst 1000 tool calls from one agent → anomaly alert fires with window stats.

3. **Automated Incident Response (Quarantine)**
   File: `server/src/services/incident-response.ts`
   Policy engine on SSE bus. Auto-quarantines agent on 3 consecutive auth failures or scan pattern.
   Verify: Synthetic policy violation → agent transitions to `quarantined`, no new tasks execute.

4. **HSM-Backed Key Management**
   File: `server/src/lib/hsm-provider.ts`
   Abstraction for HashiCorp Vault/AWS KMS/Azure Key Vault. API keys encrypted with KMS-derived DEK.
   Verify: Rotate key through Vault, sign payload, confirm signature verifies and raw key never in logs.

5. **Zero-Trust Request Verification**
   File: `server/src/lib/zero-trust.ts`
   Every request carries attestation JWT with principal_id, ring, scope, nonce. Every hop re-verifies.
   Verify: Tamper with internal IPC JWT → rejected with `ZERO_TRUST_FAILURE`.

6. **Session Recording & Playback**
   File: `server/src/services/session-recorder.ts`
   Full event stream recorded per session. Deterministic replay log in `session_recordings` table.
   Verify: Run multi-tool agent task, retrieve recording, replay in sandbox → all tool call results match.

7. **Agent Output DLP Scanner**
   File: `server/src/services/dlp-scanner.ts`
   Streaming scanner on all agent output channels. Regex + ML-light: PII, PHI, PCI, credential leakage.
   Verify: Agent outputs synthetic credit card → DLP blocks SSE message, logs `dlp.violation`.

8. **Periodic Secrets Scan of Memory Store**
   File: `server/src/services/secrets-scanner.ts`
   Background cron scans memories and notes using `detectSecrets`. Auto-redacts matches in-place.
   Verify: Insert memory with GitHub token → scanner replaces with `***REDACTED***`, audit logged.

9. **Time-Based Ring Escalation Control**
   File: `server/src/lib/time-gate.ts`
   Ring promotion only during configurable hours. Out-of-hours requires `admin:emergency` scope.
   Verify: Set window to past time → escalation denied. Slide to cover now → same request succeeds.

10. **Geographic/IP Access Restrictions**
    File: `server/src/lib/geo-fence.ts`
    Middleware resolves IP via MaxMind GeoIP. Rejects/flags non-allowed countries/ASNs.
    Verify: Allowlist US only, request from simulated RU IP → 403 GEO_BLOCKED.

11. **MFA for High-Ring Operations**
    File: `server/src/lib/mfa.ts`
    TOTP second factor for Ring 0-1 operations. One-time backup codes stored hashed.
    Verify: Ring-1 endpoint without MFA → MFA_REQUIRED. Valid TOTP → success.

12. **Audit Analytics Dashboard API**
    File: `server/src/routes/audit-analytics.ts`
    Query audit chain: aggregate by action/actor/ring, export CSV/JSON, filter facets.
    Verify: GET summary?window=24h&groupBy=action → counts match manual SQL query.

13. **Compliance Report Generator (SOC2/HIPAA/GDPR)**
    File: `server/src/services/compliance-reporter.ts`
    Template-driven engine querying audit + agent + memory tables. Renders PDF with system-of-record statements.
    Verify: GDPR SAR for test principal → PDF lists every audit entry with that principal.

14. **Attack Surface Probe Harness**
    File: `server/tests/security/probe-harness.ts`
    Programmatic pentest suite: SQLi, JWT alg confusion, path traversal, SSRF, prompt injection, timing side-channel.
    Verify: Run `npm run test:security` → 50+ probes report correct blocked/allowed status.

15. **Secrets-Mutated Env Scanner on Startup**
    File: `server/src/lib/env-sanitizer.ts`
    On boot, scans all env vars against secret patterns. Refuses boot with raw blockchain key.
    Verify: Set `MY_TEST_VAR=sk-abc123` → boot warns SECRET_LEAK, marks value [REDACTED].

16. **Rate Limit Per-Principal × Per-Endpoint**
    File: `server/src/lib/rate-limit.ts`
    Multi-dimensional token bucket: (principal_id, route_prefix, method). Prevents one agent starving another.
    Verify: 10/min memory:write budget → 10 succeed, 11th returns 429. Concurrent reads still succeed.

17. **Just-in-Time (JIT) Scope Elevation**
    File: `server/src/lib/jit-elevation.ts`
    Temporary scope elevation with justification logged to audit. Auto-expires.
    Verify: Ring-3 requests safety:write → denied. Requests memory:write with justification → granted 30s, then expires.

18. **Database Encryption at Rest + Audit WAL Shipping**
    File: `server/src/db/encryption.ts`
    Column-level encryption for apiKeys.keyHash, vault content, provider keys. WAL shipper to S3.
    Verify: Query apiKeys via psql → keyHash is ciphertext. Trigger WAL ship → S3 has correct entries.

19. **Dependency Supply Chain Verification**
    File: `server/scripts/verify-supply-chain.ts`
    Pre-boot verifies lockfile hashes, npm audit for critical CVEs, `--ignore-scripts` used.
    Verify: Introduce mock vulnerable dependency → boot fails with SUPPLY_CHAIN_VULNERABLE.

20. **Security Posture Telemetry & Health Endpoint**
    File: `server/src/services/security-posture.ts`
    Live `/api/v1/health/security` reporting every control's status. SSE pushes posture changes.
    Verify: GET /health/security → 20+ control booleans. Toggle kill switch → SSE pushes "posture: CRITICAL".

---

## PHASE 15: Performance & Scalability

**Prerequisite:** Phase 11 (kernel stability), Phase 14 (security baseline audited)
**Rationale:** Before Phases 16-20 add ecosystem and enterprise features, the platform must scale to handle 10x load.

### Key Research Insight

Grafana's three-stage boot (index→initApp→app), Datadog's adaptive refresh rates (10s for short windows, 3min for long), and Prometheus's scrape-based monitoring provide the scalability patterns. The vLLM team's KV cache management and PgBouncer connection pooling are the DB-layer references.

### Tasks

1. **Stateless Kernel Node Pool with Redis Session Offload**
   File: `server/src/services/kernel.ts`
   Per-agent session state in Redis hashes. Kernel nodes become stateless workers behind round-robin LB.
   Verify: Deploy 3 kernel nodes, kill one mid-request → session resumes on another without data loss.

2. **PostgreSQL Read-Replica Query Router**
   File: `server/src/db/query-router.ts`
   Hono middleware routes SELECTs to replica pool, writes to writer pool. Two Drizzle instances.
   Verify: Deploy read replica; read throughput doubles. SHOW ALL on replica confirms zero write queries.

3. **PgBouncer Transaction-Pooling Integration**
   File: `server/src/db/index.ts`
   Replace direct node-pg pool with PgBouncer transaction mode. Health endpoint checks SHOW STATS.
   Verify: pgbench -c 200 -T 60 shows zero connection errors; SHOW STATS shows <5% wait ratio.

4. **CDN Edge-Cache for Agent Definitions + Plugin Bundles**
   File: `server/src/services/cdn/publish.ts`
   Content-hash URLs with `Cache-Control: immutable`. Upload on publish.
   Verify: curl -I returns cf-cache-status: HIT. Load test shows 0ms origin latency.

5. **Multi-Tier Response Cache with Invalidation**
   File: `server/src/services/cache/response-cache.ts`
   Three tiers: Redis (60s TTL) → per-node LRU (5s TTL) → origin. Mutation events publish invalidation keys.
   Verify: k6 run shows p95 from 200ms→8ms for cached routes. Mutation triggers immediate cache miss.

6. **Automated Slow-Query Capture + Index Advisor**
   File: `server/src/db/slow-query-analyzer.ts`
   Query `pg_stat_statements` every 5min, log top 20, suggest missing indexes.
   Verify: After 24h, slow-queries/ has data. Deploy suggested index → total_exec_time drops 50%+.

7. **Batch Memory Compaction Pipeline**
   File: `server/src/services/memory/compaction-worker.ts`
   Buffer writes in Redis sorted sets, flush as batched INSERT when 100 items or 1s age.
   Verify: k6 memory-write-test → throughput 200/s → 2,000/s. No duplicates.

8. **Adaptive Chunked Transfer with Client Backpressure**
   File: `server/src/routes/stream.ts`
   Track client drain events. Double chunk size if client <50 KB/s, halve if >500 KB/s.
   Verify: curl --limit-rate 50k shows chunk size adapting. No client-side buffer bloat.

9. **WebSocket Connection Multiplexer**
   File: `server/src/services/ws/multiplexer.ts`
   Single WebSocketServer per node. Routes messages by agentId → channel. Backpressure per-channel.
   Verify: 5000 concurrent WS connections → CPU 80%→30%. All channels receive correct messages.

10. **Memory-Mapped Snapshot Store for Agent State**
    File: `server/src/services/memory/mmap-store.ts`
    `fs.open` with MAP_SHARED for snapshots >100MB. Write-ahead log for crash recovery.
    Verify: Loading 500MB snapshot: 2.3s → 40ms. Kill mid-write → WAL replay restores consistent state.

11. **Predictive Kernel Warm-Up Scheduler**
    File: `server/src/services/kernel/warmup-scheduler.ts`
    Analyze last 24h invocations via Redis time-series. Pre-load top-10 agent definitions, pre-warm KV cache.
    Verify: After 1 week, cold_start_ratio <5% during peak hours. Warm cache hit rate >95%.

12. **Dynamic Import Graph Audit + Bundle Slimming**
    File: `server/scripts/bundle-audit.ts`
    `madge` dependency graph. Flag >50 transitive deps. Replace static imports with dynamic where rare.
    Verify: Baseline memory drops 120MB; cold start 200ms faster.

13. **Rust Native Memory Search via napi-rs**
    File: `crates/nexus-search/src/lib.rs`
    Port top-100 similarity search to Rust. half f16 vectors, SIMD dot product, napi::tokio async.
    Verify: node bench/search.js — before: 45ms, after: 3ms. 1000 concurrent searches — 0 contention.

14. **Autonomous Vacuum Scheduler with Bloat Detection**
    File: `server/src/db/vacuum-scheduler.ts`
    Query n_dead_tup/n_live_tup every 10min. 20% bloat → VACUUM. 50% → VACUUM FULL in maintenance window.
    Verify: Over 1 week, average bloat 35%→8%. No FULL during peak hours.

15. **Content-Type-Aware Tiered Compression**
    File: `server/src/middleware/compression.ts`
    Brotli level 6 for JSON, Gzip level 3 for SSE streams, no compression for WS/binary.
    Verify: curl -H "Accept-Encoding: br" returns brotli. SSE latency: gzip adds 2ms vs brotli 15ms.

16. **Self-Healing Connection Pool with Circuit Breaker**
    File: `server/src/db/pool-health.ts`
    SELECT 1 every 5s. 3 consecutive failures → circuit opens (10s, 503s). Auto-recover.
    Verify: Kill Postgres → clients get 503. Status transitions healthy→degraded→down→recovering→healthy.

17. **Zero-Downtime Deployment with Graceful Drain**
    File: `server/src/server.ts`
    On SIGTERM: unregister from discovery, stop new connections, drain in-flight (max 30s), close.
    Verify: Rolling deploy with kubectl — zero errors. wrk -c 100 -d 60s shows 0 errors, max spike <200ms.

18. **Time-Based Agent Session Sharding**
    File: `server/src/db/shard-manager.ts`
    Partition by (tenant_id hash % N, created_at week range). Routing table in Redis.
    Verify: EXPLAIN ANALYZE shows 5x buffer hit reduction. No partition pruning warnings.

19. **HTTP/2 Server Push for Agent Bootstrap**
    File: `server/src/index.ts`
    On WS upgrade, push agent schema, plugin manifests via HTTP/2 PUSH_PROMISE.
    Verify: Chrome DevTools shows "Push" initiator. Time-to-first-agent-message 800ms→200ms.

20. **Tree-Shakable ESM Plugin System**
    File: `server/src/services/plugins/loader.ts`
    Convert `require` → `await import`. Each plugin exports named functions. Rollup tree-shakes unused.
    Verify: npm run build output shrinks 40%. Cold start 200ms faster.

---

## PHASE 16: Developer Experience & SDK

**Prerequisite:** Phase 15 (performance for SDK responsiveness)
**Rationale:** Developer adoption determines project success. This phase makes NEXUS a joy to build on.

### Key Research Insight

LangChain's docs.langchain.com is the gold standard for developer docs. Dify's low-code + API dual-mode shows the UX pattern. OpenAI SDK's minimal primitives (Agent, Handoff, Guardrail, Session) prove less is more for DX. Plinth's billing and Meterplex's usage metering show the payoff of good SDK design.

### Tasks

1. **TypeScript SDK Package (@nexus-ai/sdk)**
   File: `packages/sdk/src/client.ts`
   Typed HTTP client wrapping Hono REST API. Full generics on every resource. ESM + CJS dual build.
   Verify: npm t passes; consumer imports `createAgent`, `listKernels` with full TS intellisense.

2. **Python SDK (nexus-ai-python)**
   File: `packages/sdk-python/nexus/client.py`
   httpx + pydantic. Data scientists pip install and call from Jupyter.
   Verify: pytest passes; notebook cell instantiates client and queries kernel status.

3. **OpenAPI → Typed Client Generator**
   File: `server/src/routes/openapi.ts`
   Annotate all routes with `@hono/zod-openapi`, emit openapi.json, run openapi-typescript to regenerate SDK types.
   Verify: Changing route schema triggers type-change in SDK; TypeScript catches breakage at compile time.

4. **TUI CLI Dashboard**
   File: `crates/nexus-cli/src/tui/`
   Full-screen terminal: agent task queue, memory browser, logs, MCP status. Arrow-key navigable.
   Verify: `nexus dashboard` opens TUI; task completion animates in real time.

5. **VS Code Extension**
   File: `packages/vscode-nexus/src/extension.ts`
   Webview panel: agent health, memory inspector, kernel graph, one-click plugin restart.
   Verify: Install .vsix; panel shows live data; hover on nexus.yaml shows schema errors.

6. **Plugin SDK + Hot-Reload**
   File: `server/src/plugins/hot-reload.ts`
   Watch plugins/*/ with chokidar. On save, compile with esbuild, hot-swap plugin instance.
   Verify: Edit plugin handler, save; next request hits new handler without server restart.

7. **One-Command Dev Environment**
   File: `dev-setup.ps1` + `dev-setup.sh` + `.devcontainer/devcontainer.json`
   Checks for Node 20+, Rust 1.80+, Docker. Installs, builds, seeds demo data.
   Verify: Fresh clone → ./dev-setup.sh → nexus dev → dashboard at localhost:9900.

8. **API Playground (Scalar)**
   File: `server/src/routes/scalar.ts`
   Auto-generated from OpenAPI spec. Live "Try it" against local server.
   Verify: Navigate to /docs, execute endpoint, see real response.

9. **Webhook System**
   File: `server/src/services/webhooks.ts`
   Register URL per event type. POST signed JSON with HMAC-SHA256. Retry 3x with backoff.
   Verify: POST /api/webhooks {url, events:["agent.completed"]}; trigger agent; webhook receives payload.

10. **Starter Kit (create-nexus-app)**
    File: `packages/create-nexus-app/src/index.ts`
    `npm create nexus-app@latest` → interactive prompt → scaffolds full project with example.
    Verify: npm create nexus-app → cd my-agent && npm run dev → agent responds to prompt.

11. **Human-Readable Error Messages**
    File: `server/src/middleware/error-handler.ts`
    Map all errors to `{ code, message, suggestion, docsUrl }`. CLI prints with hint color and clickable link.
    Verify: Trigger timeout; see "E_KERNEL_TIMEOUT: ... Try increasing timeout in nexus.yaml".

12. **Agent Execution Trace Viewer**
    File: `server/src/services/tracer.ts`
    Every agent step emits span. SDK provides `agent.run({ trace: true })` returning waterfall DAG.
    Verify: Run agent with trace:true; waterfall shows each LLM call, tool use, kernel step.

13. **Shell Auto-Completion**
    File: `crates/nexus-cli/src/completions.rs`
    `nexus completion` generates bash/zsh/fish/powershell completions. Covers subcommands and dynamic values.
    Verify: source <(nexus completion zsh) → type `nexus agent ` + Tab → shows live agent names.

14. **Integration Test Framework**
    File: `packages/nexus-test/src/index.ts`
    `nexus test` starts server in-memory (SQLite), loads plugin, runs .test.ts files.
    Verify: nexus test plugins/my-agent/ runs tests, exits 0 on pass, prints TAP output.

15. **Performance Profiler Plugin**
    File: `packages/plugin-profiler/src/index.ts`
    Plugin hook recording wall-clock + CPU per tool/kernel call. `nexus profile` prints flame-chart.
    Verify: Run agent with profiler; nexus profile shows top-5 slowest calls with line numbers.

16. **GitHub Actions CI Template**
    File: `packages/create-nexus-app/templates/github/ci.yml`
    Scaffolds CI.yml with test, lint, build, Docker. Release.yml for publishing.
    Verify: Push scaffolded repo to GitHub; Actions tab shows green CI run.

17. **API Versioning Strategy**
    File: `server/src/middleware/versioning.ts`
    Routes under /api/v1/. Accept-version: v2 routes to v2 handler. Deprecated endpoints set Sunset header.
    Verify: GET /api/v1/agents returns v1; Accept-version: v2 returns v2; sunset on deprecated routes.

18. **Feature Flag System**
    File: `server/src/services/feature-flags.ts`
    Runtime flags in DB `feature_flags` table. Admin API to toggle without restart.
    Verify: Toggle sandbox-mode off via PATCH /api/admin/flags; sandbox endpoint returns 403 immediately.

19. **Sandbox Execution Environment**
    File: `server/src/services/sandbox.ts`
    Ephemeral Docker container: network isolation, 5s CPU, 128MB RAM, read-only FS. Falls back to subprocess.
    Verify: POST with `while true; do :; done` → sandbox kills after 5s, host unaffected.

20. **Telemetry Dashboard**
    File: `src/pages/Telemetry.tsx`
    Request count, p50/p95/p99, error rate per endpoint, active plugins. Sparkline charts.
    Verify: Hit endpoints 20x; dashboard charts update within 2s.

---

## PHASE 17: Enterprise Features

**Prerequisite:** Phase 14 (security compliance baseline), Phase 15 (scalability for multi-tenant)
**Rationale:** Enterprise sales require SSO, RBAC, tenant isolation, billing, and compliance reports.

### Key Research Insight

Multi-tenant SaaS research concludes: **pooled + RLS for 80% of tenants** ($1,800/1k tenants/mo), schema-per-tenant for mid-tier, DB-per-tenant for enterprise ($24k/1k tenants/mo). Neon makes DB-per-tenant viable at $0.35/GB-mo. Defense in depth: app wrapper (99%) + RLS (1%) + cross-tenant E2E tests.

### Tasks

1. **OIDC SSO Authentication Provider**
   File: `server/src/lib/sso-oidc.ts`
   Passport-style OIDC strategy validating id_token against JWKS endpoint. Maps claims to Principal.
   Verify: curl with valid Google id_token → returns principal name matching token's email.

2. **SAML 2.0 IdP Integration**
   File: `server/src/lib/sso-saml.ts`
   samlify handling POST /saml/acs. Parses NameID, upserts org-scoped principal, issues session JWT.
   Verify: POST valid SAMLResponse → Set-Cookie with session JWT containing orgId and role.

3. **Organization & Workspace Hierarchy**
   File: `server/src/db/schema.ts`
   organizations, workspaces, org_members tables. orgId FK on api_keys, memories, skills, projects.
   Verify: SELECT * FROM organizations returns seeded default; api_keys.org_id non-null after migration.

4. **Custom RBAC Engine with Role Definitions**
   File: `server/src/lib/rbac.ts`
   Roles (admin, developer, viewer, auditor) as sets of scopes + resource-level policies.
   Verify: Assign viewer role to key; POST /api/v1/memories → 403 FORBIDDEN.

5. **Row-Level Security for PostgreSQL Tenant Isolation**
   File: `server/src/db/schema.ts`
   RLS policies on all tenant-scoped tables. set_config('nexus.org_id') at pool checkout.
   Verify: Key from org-A querying /api/v1/memories sees zero rows from org-B.

6. **Billing Usage Metering Counter**
   File: `server/src/services/metering.ts`
   Fire-and-forget increment on API call, token spend, seat active. Aggregated into usage_hours.
   Verify: Hit 10 endpoints → api_calls count = 10 for the org.

7. **Rate Limit Tiers Per Plan**
   File: `server/src/lib/rate-limit.ts`
   Load organizations.tier, map to multiplier: free=60, pro=600, enterprise=6000.
   Verify: Free tier exceeds 60 req/min → 429 with Retry-After.

8. **User Management CRUD API**
   File: `server/src/routes/admin-users.ts`
   GET/POST/PATCH/DELETE /api/v1/admin/users. Email uniqueness within org. Links to api_keys.
   Verify: POST {email, role:"developer"} → 201. GET lists new user.

9. **Admin Dashboard UI (React)**
   File: `src/pages/admin/`
   Users, API Keys, Usage, Audit, Settings pages. Table views with search/pagination. recharts.
   Verify: Navigate to /admin/users as admin → table shows org members. Viewer → 403.

10. **Audit Trail Viewer with Filters & Export**
    File: `src/pages/admin/audit.tsx`
    Filterable by actor, action, date range, orgId. Cursor pagination. CSV export.
    Verify: Filter by action=memory.create, click export → CSV matches matching rows.

11. **Data Retention Policy Engine**
    File: `server/src/services/retention.ts`
    Cron deletes from memories/trajectory_logs/usage_events per org's retention_policies.
    Verify: Set memories retention to 1 day on 2-day-old row → gone after next cron.

12. **SLA Monitoring with Uptime/Latency Tracking**
    File: `server/src/services/sla-monitor.ts`
    Probe /health every 30s. Track p50/p95/p99, error_rate, uptime_pct per 30d window.
    Verify: After 2min, hit /admin/sla → {uptimePct: 100, p95Ms: 12, errorRate: 0}.

13. **Automated Backup with Point-in-Time Recovery**
    File: `server/src/scripts/backup.ts`
    pg_dump --format=custom to S3/GCS. Cron scheduled. PITR via pg_restore.
    Verify: Run backup → file on S3. GET /admin/backups shows new entry with completedAt.

14. **Customer-Managed Encryption Keys**
    File: `server/src/services/kms.ts`
    Envelope encryption: random DEK → AES-256-GCM, DEK wrapped with CMK via AWS KMS.
    Verify: Insert with CMK enabled; raw DB shows ciphertext; API read returns plaintext.

15. **White-Label / Custom Branding**
    File: `src/lib/theme.ts`
    organizations.branding stores logoUrl, primaryColor, customDomain, appName.
    Verify: Update primaryColor to #ff6600 → all primary buttons are orange on refresh.

16. **API Usage Analytics Dashboard**
    File: `src/pages/admin/analytics.tsx`
    Per-endpoint call count, latency p50/p95, error rate, top actors. Date range picker.
    Verify: 50 calls to /memories, wait for hourly rollup → row shows count ≥ 50.

17. **Enterprise Onboarding Wizard**
    File: `src/pages/onboarding/`
    Multi-step: Create Org → Admin → SSO → Retention → Invite → API Key → Checklist.
    Verify: Complete all 7 steps → organizations.onboarding_completed = true.

18. **SCIM Provisioning Endpoint**
    File: `server/src/routes/scim.ts`
    RFC 7644 SCIM 2.0: POST/GET/PATCH /scim/v2/Users, /Groups. Validate bearer token.
    Verify: POST /scim/v2/Users {userName:"a@b.com"} → 201 → GET /admin/users includes user.

19. **Audit Log Real-Time SIEM Streaming**
    File: `server/src/services/audit-streamer.ts`
    After every appendAudit(), push to in-memory channel. Worker POSTs to webhooks. Batches 100/5s.
    Verify: Register webhook.site URL, trigger audit → webhook.site receives POST within 5s.

20. **Org-Level Compliance Report Generator**
    File: `server/src/services/compliance-report.ts`
    POST /admin/compliance/report {framework, orgId, startDate, endDate} → JSON + PDF.
    Verify: SOC2 report for 30 days → {framework:"soc2", status:"pass", findingCount:0} with downloadUrl.

---

## PHASE 18: AI-Native Self-Optimization

**Prerequisite:** Phase 15 (metrics foundation), Phase 12 (memory maturity)
**Rationale:** NEXUS should optimize itself. This phase adds auto-tuning, self-healing, and autonomous improvement.

### Key Research Insight

The self-improvement-harness.ts already exists — this phase makes it systematic. Semantic Kernel's plugin DI pattern and Langfuse's prompt management show the path. The key insight from autonomous-loop research is that self-optimization needs **safe exploration** (A/B testing, gradual rollouts) and **hard guardrails** (circuit breakers, budget enforcement).

### Tasks

1. **Scheduler Quantum Auto-Tuner (PID Controller)**
   File: `server/src/services/scheduler.ts`
   Replace static maxConcurrentJobs with PID controller reading queue depth + p95 latency.
   Verify: Submit 50 burst tasks; maxConcurrentJobs climbs until latency hits target, then plateaus.

2. **Memory Importance Threshold Self-Calibration**
   File: `server/src/services/recall.ts`
   Nelder-Mead optimization of importance threshold against user feedback NDCG@10.
   Verify: Seed low-importance memories; threshold drops until they appear when relevant.

3. **Prompt Variant A/B Testing Engine**
   File: `server/src/services/llm-router.ts`
   Route N% of requests to variant prompts. Compare via LLM-as-judge. Auto-promote at p<0.05.
   Verify: Deploy "be concise" variant → rolled_out proposal with positive quality delta.

4. **Latency-Aware LLM Provider Auto-Failover**
   File: `server/src/services/llm-gateway-v2.ts`
   Sliding window p50/p95 per provider-model. Route to fastest healthy. Failover <500ms.
   Verify: Kill primary OpenAI key; secondary serves within 1s with zero 5xx.

5. **Agent Watchdog with State Recovery**
   File: `server/src/services/kernel.ts`
   Background loop pings heartbeats every 3s. On miss, replay from last committed checkpoint.
   Verify: kill -9 running agent; task continues from last checkpoint within 5s.

6. **CI Benchmark Comparison Gate**
   File: `server/src/services/metrics.ts`, `.github/workflows/ci.yml`
   On PR, compare benchmark histograms. Fail if any metric regresses >5% (Mann-Whitney U, p<0.01).
   Verify: Introduce slow query; CI fails with "recall p95 degraded 12% (p=0.003)".

7. **Queue-Depth Auto-Scaler for Worker Pools**
   File: `server/src/services/scheduler.ts`
   When queue depth > 2× baseline for >10s, spawn workers up to ceil(depth/5). Scale down when idle >30s.
   Verify: Burst 100 tasks; worker count spikes to ~20, drains to baseline within 60s.

8. **Predictive Cache Warming for Recall**
   File: `server/src/services/recall.ts`
   Markov chain on query→memory sequences. Pre-fetch top-3 predicted next-query results.
   Verify: 10 sequential queries; latency drops from ~50ms→~2ms for items 6-10.

9. **Behavioral Anomaly Detection & Quarantine**
   File: `server/src/services/kernel.ts`
   Mahalanobis distance from behavioral fingerprint centroid. Auto-quarantine after 3 flags in 5min.
   Verify: Agent calls shell 50×/min → quarantine within 60s with audit trail.

10. **Test Generation from Audit Trails**
    File: `server/src/services/audit-engine.ts`
    Parse audit logs into (input→output) sequences. Deduplicate, parameterize, emit Vitest regression tests.
    Verify: Generator on 1000 audit entries → ~15 regression tests that all pass.

11. **API Doc Self-Generation from Route Definitions**
    File: `server/src/routes.ts`
    Parse Hono routes + Zod schemas → Markdown API reference. Diff against previous. Flag undocumented changes.
    Verify: Add new route; /docs/api.md updated with endpoint, params, example response.

12. **Semantic LLM Request Batching**
    File: `server/src/services/llm-scheduler.ts`
    Accumulate similar requests within 200ms. Embed, cosine-cluster, send as batch. ~60% cost reduction.
    Verify: 20 "summarize memory X" requests in 1s → 3 batch calls instead of 20 individual.

13. **Automatic Index Advisor from Query Patterns**
    File: `server/src/services/recall.ts`
    Log all SQL plans. When seq scans on tables >10k rows cause >100ms, propose CREATE INDEX.
    Verify: Run unindexed LIKE query → proposal "Add gin_trgm index on memories.content" within 5min.

14. **Resource Demand Forecasting & Proactive Scaling**
    File: `server/src/services/metrics.ts`
    Prophet-style time-series on CPU/memory/tokens with weekly seasonality. Pre-scale when >80% forecast.
    Verify: Schedule load spike at :30; NEXUS pre-scales at :28.

15. **RRF Weight Online Optimization**
    File: `server/src/services/recall.ts`
    Bayesian optimization over W_RRF/W_IMPORTANCE/W_RECENCY/W_FEEDBACK. Maximize NDCG@10 on held-out queries.
    Verify: W_FEEDBACK rises when user gives more thumbs-up; NDCG improves >5%.

16. **Token Budget Recycling & Redistribution**
    File: `server/src/services/kernel.ts`
    Agents finishing under budget donate to shared pool. Agents near ceiling draw from pool (up to 20% bonus).
    Verify: 5 agents with tight budgets; 2 finish early; remaining 3 each get +20% tokens mid-flight.

17. **Semantic LLM Response Cache with Auto-Invalidation**
    File: `server/src/services/llm-gateway-v2.ts`
    Embed query → Redis with TTL. Top-1 cached by cosine similarity >0.95. Invalidate on prompt/memory change.
    Verify: Repeat "summarize project X" → second call ~2ms vs ~2s. Edit project → cache invalidated.

18. **Guardrail Threshold Auto-Calibration**
    File: `server/src/services/guardrails.ts`
    Track false positive rate. FPR >5% over 24h → relax threshold 10%. FNR >1% → tighten 20%.
    Verify: Submit safe text triggering false positive; threshold relaxes within 1h.

19. **Task-to-Skill Auto-Compilation Advisor**
    File: `server/src/services/skill-template-engine.ts`
    Repeating task labels >10× → propose compiled script with token savings estimate.
    Verify: 15 identical "check status" calls → proposal: "Compile → save ~45k tokens/week".

20. **Scheduling Policy Evolution via RL**
    File: `server/src/services/scheduler.ts`
    Reward = throughput × (1 - deadline_miss_ratio). Cross-entropy method updates QUEUE_PRIORITY.
    Verify: Mixed Q0-Q4 load; Q3 priorities rise if maintenance tasks keep missing SLA.

---

## PHASE 19: Ecosystem & Marketplace

**Prerequisite:** Phase 16 (SDK/plugin system), Phase 14 (security for plugin sandbox)
**Rationale:** A thriving ecosystem of plugins, agents, and integrations is the long-term moat.

### Key Research Insight

WordPress plugin directory (60k+ plugins), VS Code marketplace (30k+ extensions), and MCP's emerging ecosystem all converge on: **curation > quantity**, **security review > trust**, and **discoverability > distribution**. Dify's tool marketplace proves this works for AI platforms.

### Tasks

1. **Real Marketplace Backend (replace mock data)**
   File: `server/src/routes/marketplace.ts`, `server/src/db/schema.ts`
   marketplace_plugins, marketplace_versions tables. DB-backed pagination, category filtering, search.
   Verify: GET /marketplace/plugins?category=storage → real DB rows instead of hardcoded fixtures.

2. **Plugin Publishing Pipeline (package, sign, publish)**
   File: `server/src/services/plugin-publisher.ts`
   Accept WASM + signed manifest. Verify ed25519 signature. Content-addressed storage.
   Verify: POST signed manifest + WASM → query marketplace → new plugin listed with correct version.

3. **Plugin Sandbox Execution Engine**
   File: `server/src/services/plugin-sandbox.ts`
   Wasmtime-based: fuel limit, wall-clock timeout, network/filesystem gating. Signed receipt.
   Verify: WASM exceeding maxFuel → sandbox terminates with non-zero exit code.

4. **Community Rating & Review System**
   File: `server/src/db/schema.ts`, `server/src/routes/marketplace.ts`
   marketplace_reviews table (rating 1-5, review text). Aggregate stats. Duplicate guard.
   Verify: Two reviews → rating: 4.5, reviewCount: 2, histogram {5:1, 4:1}.

5. **Plugin Versioning & Upgrade Flow**
   File: `server/src/services/plugin-version-manager.ts`
   Semver ordering. Version history, upgrade, rollback. diffManifests for capability changes.
   Verify: Install v1.0.0, publish v1.1.0, upgrade → plugin switches, diff shows changes.

6. **Plugin Dependency Resolution & Graph**
   File: `server/src/services/plugin-dependency-resolver.ts`
   Parse dependsOn, build DAG, detect cycles (Tarjan), resolve transitive deps.
   Verify: A→B→C; install A → B and C installed first. Cycle A→B→A → install fails with error.

7. **Automated Plugin Testing Framework**
   File: `server/src/services/plugin-test-runner.ts`
   Manifest declares test cases (input→expected). Sandbox invokes, compares, reports.
   Verify: Submit with test `{input:{text:"hello"}, expected:{length:5}}` → PASS/FAIL, blocks publish on FAIL.

8. **Plugin Telemetry & Usage Analytics**
   File: `server/src/services/plugin-analytics.ts`
   Per-plugin invocation count, error rate, latency p50/p95/p99, fuel consumption.
   Verify: Invoke 100 times → count=100, latency percentiles populated, error rate calculated.

9. **Plugin Security Review Queue**
   File: `server/src/services/plugin-security-review.ts`
   pending_review status. Review queue. Auto-approve plugins with ring≤1 and no network/filesystem.
   Verify: Publish with allowNetwork:true → in queue. Ring 1 with no network → auto-approved.

10. **Plugin API Compatibility Testing**
    File: `server/src/services/plugin-compatibility.ts`
    Registry of NEXUS API versions. Test plugin against current API before activation.
    Verify: Register referencing deprecated capability → compatibility warning with migration path.

11. **Agent Template Marketplace**
    File: `server/src/routes/agent-templates.ts`
    agent_templates table with JSON config. Install = create agent with pre-populated config. Fork support.
    Verify: Install "Daily Standup Summarizer" → new agent with correct ring, cron, prompt.

12. **Memory Strategy Template Marketplace**
    File: `server/src/routes/memory-templates.ts`
    memory_strategy_templates: consolidation, decay, embedding, tags, reranking config.
    Verify: Apply "Recency-Frequency-Memory" → system_meta updated with decay_curve, tag_taxonomy.

13. **Dashboard Widget Marketplace**
    File: `server/src/routes/widgets.ts`
    widget manifest (JS snippet, data query, refresh, sizes). Widget host component.
    Verify: Install "Token Usage Gauge" → appears on Dashboard with live data, draggable.

14. **Custom Tool Development SDK**
    File: `packages/nexus-tool-sdk/`
    npm package with defineTool(), createManifest(), dev server, publish CLI.
    Verify: npm create @nexus/tool my-tool → nexus-tool dev → registers locally. nexus-tool publish → in marketplace.

15. **Webhook-Based Integration Framework**
    File: `server/src/services/webhook-bridge.ts`
    HMAC auth, payload validation, sandboxed invocation. Retry with backoff, dead-letter after 5.
    Verify: POST with valid HMAC → plugin executes. Bad HMAC → 401. Invalid payload → 422.

16. **Integration Directory (External Services)**
    File: `server/src/routes/integrations.ts`
    Catalog of supported services (Slack, Gmail, GitHub, Discord, Notion). OAuth guide, rate limits, linked plugins.
    Verify: Integrations page shows 20+ services. "Slack" shows OAuth instructions and 3 plugins.

17. **Plugin Install Scoped Sandbox Profiles**
    File: `server/src/services/plugin-profile-generator.ts`
    On install, analyze manifest capabilities → auto-generate kernel ACL profile. Revoke on uninstall.
    Verify: Install with llm.invoke → profile shows allow:["llm.invoke"] with maxCallsPerMin:30. Uninstall → gone.

18. **Plugin Receipt Verification API**
    File: `server/src/routes/receipts.ts`
    Merkle proof per receipt. GET /plugin-receipts/:id/proof. POST /verify.
    Verify: Invoke plugin, GET /proof → Merkle proof. POST receipt+proof → {valid:true}.

19. **Plugin Migration & Compatibility Matrix**
    File: `server/src/services/plugin-migration.ts`
    On runtime update, scan all installed plugins. Compatibility report: compatible/needs-rebuild/deprecated.
    Verify: Bump API version → 3 "needs-rebuild," 12 "compatible," 1 "deprecated." Deprecated auto-disables.

20. **Featured Collection & Editorial Curation System**
    File: `server/src/routes/collections.ts`
    marketplace_collections and collection_items. Admin CRUD, scheduled, community with upvote.
    Verify: Admin creates "Top 5 MCP Servers" → hero carousel. Community "My Favorites" → upvotable.

---

## PHASE 20: Production Reliability & Chaos Engineering

**Prerequisite:** Phase 15 (scalability foundation), Phase 14 (observability baseline)
**Rationale:** Before Phases 21-30 (future), the system must be proven reliable under stress with SLOs, chaos experiments, and incident response automation.

### Key Research Insight

Google SRE practices + Netflix Chaos Monkey provide the framework. The research consensus: **SLOs with burn-rate alerts** (faster detection than threshold-based), **chaos experiments as CI step** (not one-off events), and **post-mortem automation** (reduce MTTR by 40-60%).

### Tasks

1. **SLO Definition Engine**
   File: `server/src/services/slo/definitions.ts`
   Structured SLOs per critical endpoint: p99 < 500ms, availability 99.999%, throughput floors.
   Verify: Unit test each SLO compiles to valid Prometheus recording rule.

2. **Burn-Rate Alerting Pipeline**
   File: `server/src/services/slo/burn-rate.ts`
   Sliding-window burn-rate calculator. Alerts at 2×/10×/1000× budget in 1h/6h/3d windows.
   Verify: Seed half-exhausted SLO; alert fires at correct threshold.

3. **Chaos Experiment Runner**
   File: `crates/chaos/src/experiment.rs`
   Fault injection: kill pod, add 2s latency, drop 5% DB connections, corrupt Redis values.
   Verify: manifest.yaml → report.json with pass/fail and evidence spans.

4. **Automated Failover Drill**
   File: `server/src/services/reliability/failover-drill.ts`
   Every 6h: promote replica, verify consistency via checksum query, fail back.
   Verify: Checksum mismatch → page fired and rollback occurred.

5. **Restore-from-Backup Validator**
   File: `server/src/services/reliability/backup-validator.ts`
   Nightly: spin Postgres container, restore dump, run query set, diff against live.
   Verify: Corrupt backup → non-zero exit and alert payload in logs.

6. **Circuit-Breaker Registry**
   File: `server/src/services/circuit-breaker/registry.ts`
   Every external dependency wrapped with configurable circuit breaker. Exposed at GET /_/circuits.
   Verify: Point OpenAI at blackhole → breaker opens on 6th call, 14 remaining return 503.

7. **Tenant Isolation Bulkhead**
   File: `server/src/services/bulkhead/tenant-pool.ts`
   K connection pools. Each with max connections, queue depth, timeout. Exposed at GET /_/bulkhead.
   Verify: Load-test tenant-A 200 concurrent; tenant-B single request completes < 50ms.

8. **Degraded-Mode Controller**
   File: `server/src/services/degraded/degraded-mode.ts`
   When breaker opens, transition subsystem (gpt-4o→gpt-4o-mini, skip embeddings, serve stale cache).
   Verify: Break OpenAI circuit → subsequent requests have X-Nexus-Degraded: true and fallback model.

9. **Canary Release Orchestrator**
   File: `server/src/services/canary/orchestrator.ts`
   5% traffic → probe suite → 25% → 50% → 100% or rollback on failure.
   Verify: Bad revision (2% 500s) → rollback within 3 probe cycles.

10. **Incident Response Runbook Engine**
    File: `server/src/services/incident/runbook.ts`
    YAML runbook steps (diagnose→mitigate→notify→postmortem). Auto-execute on alert.
    Verify: Fire high-latency alert → runbook completes in < 60s.

11. **Post-Mortem Automation**
    File: `server/src/services/incident/postmortem.ts`
    On incident closure: timeline, key metrics, action items, severity. Writes to _postmortems/.
    Verify: Create test incident → output contains all 5 sections.

12. **Latency Budget Tracker**
    File: `server/src/services/telemetry/latency-budget.ts`
    Each request carries X-Latency-Budget-Ms. Each layer deducts observed latency. Zero = 503 with partial results.
    Verify: Send with budget=50ms → 503 with "budget_exhausted": true.

13. **Dependency Health Dashboard**
    File: `server/src/services/reliability/health-board.ts`
    HTML page (or JSON): green/yellow/red per dependency, 1-week sparkline, circuit state.
    Verify: Mock Redis down → dashboard shows red with correct last-failure.

14. **Capacity Planner**
    File: `server/src/services/capacity/planner.ts`
    Daily cron: linear + seasonal model on 7d metrics. Forecast 7d. Page if >80% utilization.
    Verify: Seed 7d linear increase → forecast >80% CPU on day 5 with scaling recommendation.

15. **Load Shedder**
    File: `server/src/services/load-shed/strategic-shed.ts`
    CPU >90% or queue >10K → shed by priority: analytics first, then embeddings, then background jobs.
    Verify: 5000 req/s → analytics 429s while chat API <5% error rate.

16. **Migration Rollback Harness**
    File: `server/src/db/migrations/runner.ts`
    Every migration has up/down enforced by CI. Wraps in transaction. Auto-rollback on failure.
    Verify: Inject broken migration → automatic rollback and log entry.

17. **Self-Healing Orchestrator**
    File: `server/src/services/healing/agent.ts`
    Watches circuits, bulkhead, degraded. Stuck state >5min → auto-recover (restart pool, rotate key).
    Verify: Flip breaker open → 60s later self-healing logged "restarted pool".

18. **Latency SLO Compliance Dashboard**
    File: `server/src/services/slo/dashboard.ts`
    Real-time SLO burn-down bars: remaining budget, burn-rate sparkline, days-to-exhaustion.
    Verify: Seed SLOs with varying consumption → correct percentage and color (green>50%, yellow, red<25%).

19. **Failure Mode Taxonomy Exporter (FMEA)**
    File: `server/src/services/reliability/fmea.ts`
    Live FMEA table: failure_mode, effect, severity(1-5), detection, mitigation, last_tested.
    Verify: Simulate "DB connection refused" → FMEA auto-updates last_tested timestamp.

20. **Reliability Scorecard Webhook**
    File: `server/src/services/reliability/scorecard.ts`
    Daily score (0-100): SLO compliance 40%, MTTD 20%, MTTR 20%, chaos coverage 10%, post-mortem rate 10%.
    Verify: Perfect day → score = 96. Day with 2 incidents + missed post-mortem → score < 60.

---

## PHASES 21-30: Strategic Direction (Abbreviated)

### Phase 21: Mobile & Edge

- React Native companion app
- Edge worker for agent execution (CloudFlare Workers)
- Offline-first memory sync
- Push notifications for agent events

### Phase 22: Advanced Analytics & BI

- Custom query builder UI
- Report scheduling and delivery
- Data export pipelines (to data warehouses)
- ML-powered trend analysis on memory patterns

### Phase 23: Federated Agent Networks

- Cross-instance agent communication (NEXUS-to-NEXUS)
- Federated memory sharing with privacy controls
- Distributed task execution across instances
- Global agent discovery directory

### Phase 24: Regulatory Compliance Automation

- Automated GDPR/CCPA data subject request handling
- HIPAA BAAs and audit automation
- SOX compliance for financial agent actions
- EU AI Act compliance (risk classification, transparency reports)

### Phase 25: Multi-Modal Agent Capabilities

- Image generation and analysis agents
- Audio processing and speech agents
- Video analysis pipeline
- Multi-modal memory (text+image+audio+code)

### Phase 26: Agent-to-Agent Economies

- Agent service market (agents pay other agents)
- Token-based micro-transactions between agents
- Reputation and trust scoring for agents
- Automated negotiation protocols

### Phase 27: Real-Time Collaboration

- Multi-user agent sessions
- Shared agent workspaces with presence
- Agent output streaming to collaborative documents
- Real-time agent state sharing

### Phase 28: Advanced Data Pipeline Integration

- Native Kafka/Pulsar connectors
- ETL pipeline for agent data
- Streaming analytics on agent behavior
- Data lake integration (S3, GCS, ADLS)

### Phase 29: Hardware Acceleration

- GPU-accelerated embedding search
- FPGA/TPU inference support
- NVIDIA Triton Inference Server integration
- WASM SIMD for local execution

### Phase 30: General AI Safety & Alignment

- Constitutional AI integration for agents
- Runtime value alignment monitoring
- Agent behavior auditing with interpretability tools
- Recursive self-improvement safety bounds

---

## APPENDIX: GLOBAL DEPENDENCY MAP

```
Phase 11 (Kernel) ──────────────────────────────┐
    │                                             │
    ├── Phase 12 (Memory) ───────────────────────┤
    │       │                                     │
    │       └── Phase 13 (Orchestration) ────────┤
    │               │                             │
    └───────────────┼── Phase 14 (Security) ─────┤
                    │       │                     │
                    │       └── Phase 17 (Enterprise) ── Phase 24 (Regulatory)
                    │       │                             │
                    │       └── Phase 20 (Reliability) ── Phase 27 (Collaboration)
                    │                                     │
                    └── Phase 15 (Performance) ───────────┤
                            │                             │
                            ├── Phase 16 (DevEx/SDK) ────┤
                            │       │                     │
                            │       └── Phase 19 (Ecosystem) ── Phase 23 (Federated) ── Phase 26 (Economies)
                            │                                     │
                            └── Phase 18 (Self-Optimization) ─────┤
                                    │                             │
                                    └── Phase 21 (Mobile/Edge) ──┘
                                    └── Phase 30 (Safety)
```

## FINAL VERIFICATION SCRIPT

```bash
echo "=== PHASE 11: KERNEL ==="
grep -c 'MLFQ\|mlfq' server/src/services/scheduler.ts
# Expected: 3+ (MLFQ class, Q0-Q4, boost)

echo "=== PHASE 12: MEMORY ==="
Test-Path "server/src/services/memory-hierarchy.ts"
# Expected: True

echo "=== PHASE 13: ORCHESTRATION ==="
grep -c 'orchestrator\|Orchestrator' server/src/services/orchestrator.ts
# Expected: 5+

echo "=== PHASE 14: SECURITY ==="
Test-Path "server/src/services/siem-forwarder.ts"
Test-Path "server/src/services/anomaly-detector.ts"
# Expected: True, True

echo "=== PHASE 15: PERFORMANCE ==="
Test-Path "server/src/db/query-router.ts"
# Expected: True

echo "=== PHASE 16: DEVERIENCE ==="
Test-Path "packages/sdk/src/client.ts"
# Expected: True

echo "=== PHASE 17: ENTERPRISE ==="
grep -c 'organizations\|organizations' server/src/db/schema.ts
# Expected: 3+ (table + FK + settings)

echo "=== PHASE 18: SELF-OPTIMIZATION ==="
grep -c 'PID\|auto.*tune\|self.*calibrat' server/src/services/scheduler.ts server/src/services/recall.ts
# Expected: 2+

echo "=== PHASE 19: ECOSYSTEM ==="
grep -c 'marketplace_plugins\|marketplace_versions' server/src/db/schema.ts
# Expected: 2+

echo "=== PHASE 20: RELIABILITY ==="
Test-Path "server/src/services/slo/definitions.ts"
Test-Path "crates/chaos/src/experiment.rs"
# Expected: True, True

echo "=== ALL PHASES 11-20 VALIDATIONS MET ==="
```

---

_Generated from 20 parallel research and brainstorming agents analyzing 50+ competing projects and 10 domain-specific deep dives. Ready for execution by autonomous AI agent._
