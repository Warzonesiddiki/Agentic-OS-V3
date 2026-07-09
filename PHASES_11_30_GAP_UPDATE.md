# NEXUS 2.0: Phases 11-30 Gap Update

## ~280 Missing Tasks Identified by 20 Parallel Gap-Analysis Agents

**Date:** 2026-07-07
**How to use:** This document augments `PHASES_11_30_MASTER_PLAN.md`. Each section lists additional tasks to INSERT into the corresponding phase. Tasks are numbered for easy merge (e.g., `11.21` = Phase 11, task 21).

---

## GAP ANALYSIS SUMMARY

| Source                     | Gaps Found | Coverage                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 1 Security           | 15         | API key rotation, audit retention, session invalidation, CSRF, HSTS, DB TLS, incident plan, secret scanning, dependency vulns, backup encryption, admin audit, distributed rate limit bypass, CSP nonce verification, kill switch DB enforcement                                                                                                 |
| Phase 2 Architecture       | 13         | API gateway layer, config management, service discovery, health framework, graceful shutdown, request correlation, circuit breakers, feature flags, error taxonomy, event schema registry, caching layer, structured logging, data flow docs                                                                                                     |
| Phase 3 Code Quality       | 15         | Full strict mode, ESLint performance rules, formatting CI, naming conventions, import ordering, barrel file elimination, API doc generation, complexity gate, deprecation strategy, dead code detection, enum best practices, type testing, security ESLint, architectural linting, Rust clippy CI                                               |
| Phase 4 Database           | 15         | Connection pooling, migration rollback, zero-downtime migrations, audit log archival, backup strategy, column encryption, query performance monitoring, DB role management, replication, partitioning, circuit breaker, leak detection, SQLite/Postgres parity, seed data, migration naming                                                      |
| Phase 5 Frontend           | 14         | Auth flow, SSE integration, animation library, form validation, frontend testing, bundle budget, Web Vitals, error tracking, responsive design, state persistence, optimistic updates, advanced code splitting, design system, PWA                                                                                                               |
| Phase 6 Backend            | 15         | Webhook delivery, email service, file upload, distributed rate limiting, feature flag service, notification service, idempotency keys, batch operations, cache invalidation, health aggregation, graceful degradation, WS manager, distributed locking, backpressure, event store                                                                |
| Phase 7 Rust               | 15         | napi-rs bridge, benchmarks, fuzz testing, CI pipeline, cargo-deny, cross-compilation, toolchain pinning, LTO optimization, feature flags, stub tools, WASM compilation, profiling, miri testing, docs coverage, TS integration tests                                                                                                             |
| Phase 8 Testing            | 15         | Frontend tests, Playwright E2E, test data factories, property-based, load testing, API contract, mutation testing, Testcontainers, DAST security, module coverage, flaky detection, a11y, smoke tests, soak tests, frontend CI                                                                                                                   |
| Phase 9 DevOps             | 15         | K8s manifests, Helm charts, Terraform IaC, DB backup automation, blue-green, auto-scaling, container scanning, SBOM, GitOps, secret management, log aggregation, APM, DB migration pipeline, preview environments, cost monitoring                                                                                                               |
| Phase 10 Docs              | 14         | docs/README index, CONTRIBUTING.md, OpenAPI spec, SDK docs, migration guides, config reference, deployment guide, agent dev guide, plugin dev guide, error code reference, DR runbook, security hardening guide, perf tuning guide, deprecation policy                                                                                           |
| Phase 11 Kernel            | 15         | Starvation detection, bootstrap ordering, preemption security, panic handler, fair-share guarantees, resource quotas, introspection API, kernel audit trail, ring escalation audit, config validation, scheduler overhead accounting, deadlock detection, hot-patch system, property-based scheduler tests, state persistence                    |
| Phase 12 Memory            | 15         | Memory encryption, differential sync, multilingual search, conflict auto-resolution, quota enforcement, cold storage, backup/restore, GDPR forget, fragmentation analyzer, tag taxonomy, batch operations, search autocomplete, memory templates, privacy zones, search explanation                                                              |
| Phase 13 Orchestration     | 15         | Workflow templates, orchestrator HA, MCP agent discovery, cross-orchestrator bridge, capability versioning, workflow analytics, agent load balancing, message backpressure, cost estimation, agent reputation, per-node schema validation, audit trail, compensation engine, cost-optimized selection, hot-patch DAG                             |
| Phase 14 Security          | 15         | Data classification, breach notification, secrets rotation, cert lifecycle, container runtime security, network policies, CSPM scanner, VDP, pentest scheduler, insider threat detection, crypto agility, evidence collection, vendor assessment, agent permission boundaries, ransomware detection                                              |
| Phase 15 Performance       | 12         | Cache stampede prevention, cache hit ratio monitoring, client-side caching, query timeout enforcement, TLS termination strategy, request coalescing, index usage tracking, event loop monitoring, memory leak detection, perf budget CI, load testing baseline, WS compression, cold start optimization                                          |
| Phase 16 DevEx             | 14         | LSP for config files, DAP debugger, SDK telemetry, error code registry, migration guide tools, plugin scaffolding CLI, devcontainer spec, env var doc generator, API changelog generator, compat matrix, event type registry, language gotchas guide, rate limit docs, contribution guidelines                                                   |
| Phase 17 Enterprise        | 14         | Config change audit, cross-org sharing, org hierarchy, invoice generation, payment methods, seat management, JIT provisioning, IdP-initiated SSO, custom domains, data residency, budget alerts, custom role API, scheduled audit export, plan migration                                                                                         |
| Phase 18 Self-Optimization | 15         | A/B test analysis dashboard, global circuit breaker, mass rollback, parameter versioning, cost-aware optimization, dry-run mode, statistical power calculator, ε-greedy budget, experiment tracking, cross-agent knowledge sharing, fairness guard, explainability reports, user satisfaction feedback, meta-optimization, hypothesis generation |
| Phase 19 Ecosystem         | 10         | Plugin monetization, author dashboard, SLA monitoring, dev docs portal, community discussions, translation, certification badges, enterprise approval workflow, code signing, health monitoring                                                                                                                                                  |
| Phase 20 Reliability       | 14         | Severity classification, on-call schedule, triage roles, comms templates, SLA breach notification, break-glass access, chaos schedule, chaos approval, network partition testing, game day guide, chaos dashboard, cert monitoring, cascade impact analysis, incident metrics dashboard                                                          |

**Total: ~280 additional tasks across 20 gap domains**

---

## PHASE 11: Advanced Kernel — ADDITIONAL TASKS

Insert after existing task 20.

### 11.21 Agent Priority Aging & Starvation Detection

**File:** `server/src/services/scheduler.ts`
Add `starvationScore` to task schema. On each `pickNextTask()`, increment score for all skipped tasks. Force-promote to Q0 when score > threshold with `STARVATION_PROMOTED` audit event.
**Verify:** Enqueue 50 low-priority tasks behind 50 high-priority; confirm low-pri tasks eventually execute.

### 11.22 Kernel Bootstrap Ordering & Dependency Resolution

**File:** `server/src/services/kernel-bootstrap.ts`
Define `KernelService` interface with `init(): Promise<void>`, `BootstrapGraph` topo-sorts services by dependencies. Fail-fast on circular deps.
**Verify:** Register service that depends on missing service → boot fails with clear error.

### 11.23 Preemption Hook Security — State Leak Prevention

**File:** `server/src/services/task-worker.ts`, `server/src/services/kernel.ts`
`preemptionGuard: { disable(), enable(), isDisabled() }`. Wraps sensitive operations (DB writes, ring escalations). Preemption skips tasks with active guard.
**Verify:** Agent mid-DB-write when preemption fires → preemption deferred, `preemption.deferred` logged.

### 11.24 Kernel Panic Handler & Crash Dump

**File:** `server/src/services/kernel-panic.ts`
`kernelPanic(reason, context)` halts workers, snapshots in-memory state to `panic_dumps/`, broadcasts `kernel.panic` SSE, transitions to emergency mode.
**Verify:** Trigger fake panic → panic dump file created, SSE event received, system in emergency mode.

### 11.25 Fair-Share Scheduler Measurement & Correction

**File:** `server/src/services/scheduler.ts`
`FairnessTracker` computes per-queue/team/ring `actualShare/entitlementShare` each tick. FairSharePolicy adjusts weights via deficit round-robin when deviation >20%.
**Verify:** 3 teams with equal entitlement → all process equal tasks within 5% over 100-tick window.

### 11.26 Agent Resource Quota (Disk I/O, Network Bandwidth)

**File:** `server/src/services/resource-quota.ts`
Per-agent `diskWriteBps`, `diskReadBps`, `netEgressBps`. Wrap `fs` and HTTP outbound in rate-limit decorators. Excess → ring-4 demotion.
**Verify:** Agent writes 10MB/s with quota 1MB/s → writes throttled, demotion event logged.

### 11.27 Kernel Introspection API (Live Scheduler State)

**File:** `server/src/routes/kernel-introspect.ts`
`GET /api/kernel/introspect` returns atomic snapshot: queue depths, running tasks with quantum remaining, ring budgets, gang locks, barrier waiters.
**Verify:** Hit endpoint during active load → all fields populated with realistic values within 50ms.

### 11.28 Kernel Event Audit Trail (Structured Scheduling History)

**File:** `server/src/services/kernel-audit.ts`
`KernelAuditLogger` with typed methods: `scheduleDecision()`, `preemptionFired()`, `ringBudgetAction()`. Persisted to `kernel_audit_events` table.
**Verify:** Run 10 scheduler ticks → query `eventType=scheduleDecision` returns 10+ entries with correct data.

### 11.29 Ring Escalation/De-escalation Audit & Oscillation Detection

**File:** `server/src/services/ring-audit.ts`
`ring_change` table with agentId, fromRing, toRing, reason. `RingOscillationDetector` flags agents changing rings >3× in 60s.
**Verify:** Agent bounces between rings rapidly → oscillation alert within 60s.

### 11.30 Kernel Configuration Schema & Validation

**File:** `server/src/config/kernel-schema.ts`
Zod schema for all kernel config with cross-field validation (highWatermark > lowWatermark, quantumMs % tickIntervalMs === 0).
**Verify:** Set quantumMs to 7 (not divisible by tick) → boot fails with field-level validation error.

### 11.31 Scheduler Overhead Accounting

**File:** `server/src/services/scheduler-metrics.ts`
Instrument each scheduler function with `hrtime()`: scheduleOverheadMs, pickOverheadMs, policyPluginOverheadMs. Alert if overhead >10% of quantum.
**Verify:** GET /api/scheduler/overhead returns breakdown where sum of parts ≈ total measured overhead.

### 11.32 Scheduler Deadlock Detection (Wait-For Graph)

**File:** `server/src/services/deadlock-detector.ts`
Build wait-for graph from agentTasks each tick. On cycle, select victim by lowest priority, preempt, audit `deadlock.victim_selected`.
**Verify:** Create deadlock with 2 agents waiting on each other's resources → victim preempted within 3 ticks.

### 11.33 Kernel Hot-Patch System (Live Upgrade)

**File:** `server/src/services/kernel-hotpatch.ts`
`kernel.patch(moduleName, newImpl)` migrates in-memory state, drains in-flight ops before swap. Rollback via `kernel.rollback(moduleName, version)`.
**Verify:** Patch ring policy → new policy applied to new tasks, old tasks complete under old policy.

### 11.34 Scheduler Property-Based Testing Framework

**File:** `server/tests/services/scheduler-property.test.ts`
fast-check generates random task sequences. Assert: monotonic wait-time growth, starvation bound, EDF ordering, gang all-or-nothing, fairness bounds.
**Verify:** 500 random sequences → all invariants hold.

### 11.35 Kernel State Persistence & Recovery Across Restarts

**File:** `server/src/services/kernel-persistence.ts`
Serialize volatile scheduler state to DB every N ticks. On startup, restore ring budgets, MLFQ timers, barrier waits. Fallback to defaults if stale.
**Verify:** Restart server mid-schedule → queue depths, budgets, and fairness state restored within 1 tick.

---

## PHASE 12: Advanced Memory — ADDITIONAL TASKS

Insert after existing task 20.

### 12.21 Memory Encryption at Rest

**File:** `server/src/services/memory-encryption.ts`
AEAD encryption with per-memory nonce derived from `memory.id`. Encrypt content on write, decrypt on read. Skip for importance <0.2.
**Verify:** Read raw memory from DB → content is ciphertext. Read via API → plaintext. Export encrypted brain → requires key to import.

### 12.22 Memory Differential Sync Export

**File:** `server/src/services/memory-diff-sync.ts`
`since: Date` parameter on export. Only return memories where `updatedAt > since` plus deleted IDs manifest. Client applies insert/update/remove.
**Verify:** Export full → export with since=1min-ago → second export returns only newly created/changed memories.

### 12.23 Multilingual Memory Search Support

**File:** `server/src/services/memory-multilingual.ts`
`language` auto-detection on write. Per-language embedding model routing. Cos similarity is language-agnostic — works cross-lingually.
**Verify:** Write "I learned about React" in English. Query in Spanish "¿qué aprendí sobre React?" → returns the memory.

### 12.24 Memory Conflict Auto-Resolution

**File:** `server/src/services/memory-conflict-resolver.ts`
Strategies: newest_wins, highest_importance, llm_merge, prompt_user. On llm_merge, produce new memory with `resolution_of`, mark originals superseded.
**Verify:** Create 2 contradictory memories, run auto-resolve with newest_wins → winner kept, loser superseded. Same with llm_merge → synthesis created.

### 12.25 Memory Quota Enforcement (Per-Agent / Per-Team)

**File:** `server/src/services/memory-quota.ts`
`agent_memory_quotas` table with maxCount, maxTokens. Reject write with `429 QUOTA_EXCEEDED` when over. Soft warning at 80%.
**Verify:** Set agent quota to 3 memories. Write 4th → 429. Delete one → write succeeds.

### 12.26 Memory Cold Storage Tier

**File:** `server/src/services/memory-cold-storage.ts`
`memory_archive` table + S3/GCS. Cron moves memories where importance <0.1 and updatedAt >90d. Recall checks hot then cold.
**Verify:** Archive memory → not in hot DB. Query recall with includeColdStorage=true → returned. IncludeColdStorage=false → not returned.

### 12.27 Memory Backup & Restore Strategy

**File:** `server/src/services/memory-backup.ts`
Scheduled backup: dump memories, clusters, attachments to compressed JSON, upload to S3. Retention: daily 7d, weekly 4w, monthly 12m.
**Verify:** Run backup → S3 file created with checksum. Restore from backup → all memories match pre-backup state.

### 12.28 GDPR Right to Erasure — ForgetMe

**File:** `server/src/services/memory-forget.ts`
`forgetMe(identifier)` searches all memories for identifier, soft-deletes with `deletedAt`, hard-deletes after 30d retention window. Returns forgetReport.
**Verify:** Call forgetMe("john@email.com") → all memories with that email soft-deleted. Query recall with that email → empty results.

### 12.29 Memory Fragmentation Analyzer

**File:** `server/src/services/memory-fragmentation.ts`
Compute: silhouette score, singleton cluster ratio, average intra-cluster distance, unclustered memory %. Add to health dashboard as Fragmentation Score (0-100).
**Verify:** After HDBSCAN clustering → fragmentation score computed. Alert triggers below threshold.

### 12.30 Memory Tag Taxonomy Management

**File:** `server/src/services/memory-tag-taxonomy.ts`
`tag_taxonomy` table with parentId, aliases. API: rename (cascade to all memories), merge, tree view. Orphan detection for unused tags.
**Verify:** Rename tag "react"→"reactjs" → all memories with "react" now show "reactjs". Create hierarchy "frontend > react" → tree view shows nesting.

### 12.31 Memory Batch Operations

**File:** `server/src/routes/memory-batch.ts`
POST /api/memories/batch/delete with filter {tags, importance_lt, createdBefore}. POST /api/memories/batch/tag with add/remove lists.
**Verify:** Create 10 temp memories → batch delete {tags:["temp"]} → 0 remain. Batch tag {add:["archived"]} → all tagged.

### 12.32 Memory Search Autocomplete / Suggestions

**File:** `server/src/routes/memory-search-suggest.ts`
Trie built on memory titles + content bigrams. Frequency-boosted. Debounced 200ms frontend call.
**Verify:** Create memories titled "React performance" and "React hooks" → type "rea" → suggests both.

### 12.33 Memory Template System

**File:** `server/src/services/memory-templates.ts`
`memory_templates` table with schema (JSON Schema). Structured form UI. POST /api/memory-templates/apply/:templateId on existing memories.
**Verify:** Create "bug-report" template → create memory with ?template=bug-report → UI shows structured form with reproSteps field.

### 12.34 Memory Privacy Zones

**File:** `server/src/services/memory-privacy.ts`
`privacyZone` column: public|agent_only|team_only|never_prime|local_only. Enforcement in recall, priming, export, federation.
**Verify:** Create memory with never_prime → priming session does not include it. Create with local_only → brain export skips it.

### 12.35 Memory Search Result Explanation

**File:** `server/src/services/memory-search-explanation.ts`
`?explain=true` returns per-result breakdown: bm25Score, cosineScore, importanceScore, rrfScore, finalScore, matchedTerms. UI tooltip shows colored breakdown.
**Verify:** Recall with explain=true → each result has breakdown showing why it was returned. Excluded items show whyExcluded.

---

## PHASE 13: Multi-Agent Orchestration — ADDITIONAL TASKS

Insert after existing task 20.

### 13.21 Workflow Template / Blueprint System

**File:** `server/src/services/workflow-templates.ts`
`WorkflowTemplate { name, paramsSchema, build(params): PipelineDAG }`. Store in DB. Instantiate with Zod-validated parameter injection.
**Verify:** Create "research" template → instantiate with params → DAG has correct nodes with injected values.

### 13.22 Orchestrator Self-Healing / High Availability

**File:** `server/src/services/orchestrator-ha.ts`
`WorkflowSupervisor` attaches DB lease row per orchestrator. On heartbeat stall, standby acquires lease, loads last checkpoint, resumes.
**Verify:** Kill orchestrator mid-DAG → standby resumes from last completed wave within 5s.

### 13.23 Agent Discovery via MCP Integration

**File:** `server/src/services/agent-discovery-bridge.ts`
Wraps MCPRegistry, translates MCP server capabilities into AgentCapability[], pushes to specialization registry.
**Verify:** Register MCP server with tools → agent discovery finds it → team builder can select it for workflows.

### 13.24 Cross-Orchestrator Communication Bridge

**File:** `server/src/services/orchestrator-bridge.ts`
Parent→child RPC (pause/resume/cancel) + child→parent SSE progress streaming via A2A protocol.
**Verify:** Parent pauses child orchestrator → child agents pause. Parent resumes → child resumes from checkpoint.

### 13.25 Agent Capability Versioning & Drift Detection

**File:** `server/src/services/capability-versioning.ts`
Snapshots agent capabilities per version hash. Team builder compares current vs snapshot, flags drift, supports pin-to-version.
**Verify:** Agent loses a skill → team builder detects drift, warns "agent X no longer qualifies for workflow Y". Pin to version → runs old config.

### 13.26 Workflow Analytics / Step Telemetry Persistence

**File:** `server/src/services/workflow-analytics.ts`
Post-run, persist per-node {durationMs, tokens, status} to `workflow_metrics` table. GET /api/workflows/:id/analytics.
**Verify:** Run 3-node DAG → query analytics → 3 rows with populated durationMs and tokens. Repeat → trends visible.

### 13.27 Agent Load Balancing Across Orchestrators

**File:** `server/src/services/orchestrator-scheduler.ts`
Monitors queue depth per orchestrator, assigns new workflows to least-loaded node via consistent hashing.
**Verify:** 3 orchestrators, load one heavily → new workflows assigned to less-loaded ones until balance restored.

### 13.28 Agent Communication Backpressure (Message Throttle)

**File:** `server/src/services/message-throttle.ts`
Sliding-window rate limit per subscriber (max msg/sec, max pending queue). Exponential backoff or dead-letter on threshold.
**Verify:** Fast producer sends 1000 msg/sec to slow consumer → consumer receives at its max rate, overflow goes to dead-letter queue.

### 13.29 Workflow Cost Estimation Pre-Execution

**File:** `server/src/services/workflow-cost-estimator.ts`
Cross-references DAG node types against historical workflow_metrics averages. Returns {estimatedTokens, estimatedDurationMs, confidence}.
**Verify:** Run workflow → record actuals. Run cost estimator for same DAG → estimates within 20% of actuals.

### 13.30 Agent Reputation / Trust Scoring

**File:** `server/src/services/agent-reputation.ts`
Scores agents by (success_rate × quality × timeliness). Team builder filters out agents below configurable threshold.
**Verify:** Agent fails 3 workflows → reputation drops below threshold → excluded from team building. Completes 10 successfully → reinstated.

### 13.31 Per-Node Input/Output Schema Validation

**File:** `server/src/services/pipeline-schema.ts`
Extend PipelineNode with optional inputSchema/outputSchema. Validates before execution, after output. Failure triggers compensation.
**Verify:** Node expects z.string() output but returns number → validation fails, compensation triggered, error logged.

### 13.32 Full Workflow Audit Trail / Execution Event Log

**File:** `server/src/services/workflow-audit-trail.ts`
Records every {nodeId, fromStatus, toStatus, timestamp, actor} in immutable `workflow_events` table.
**Verify:** Run 5-node DAG → query workflow_events for workflow ID → 15+ entries showing all state transitions.

### 13.33 Agent Compensation Transactions (Undo Side Effects)

**File:** `server/src/services/compensation-engine.ts`
PipelineNode has optional `compensate` action. On failure, walks completed nodes in reverse topo order, executing each compensation.
**Verify:** DAG with 3 compensated nodes fails at node 3 → node 2's compensation runs, then node 1's. Side effects undone.

### 13.34 Cost-Optimized Agent Selection

**File:** `server/src/services/cost-optimized-selector.ts`
Adds cost coefficient: `score = skill_score - (historical_tokens × token_price × cost_weight)`.
**Verify:** 2 agents with equal skill but 10× cost difference → cost selector picks cheaper one. Advisor mode shows cost breakdown.

### 13.35 Dynamic Workflow Hot-Patch (Mid-Execution Modification)

**File:** `server/src/services/workflow-hotpatch.ts`
POST /api/workflows/:id/hotpatch {action: 'add'|'remove'|'swap', node, edges}. Validates acyclicity, inserts into running wave.
**Verify:** DAG running with node A→B→C. Hotpatch: add node D between B and C → remaining execution goes A→B→D→C.

---

## PHASE 14: Security Hardening — ADDITIONAL TASKS

Insert after existing task 20.

### 14.21 Data Classification & Sensitivity Auto-Tagging

**File:** `server/src/services/data-classifier.ts`
Streaming middleware on memory/kv write paths. Regex + entropy + keyword → tags (PHI, PCI, CREDENTIAL, PUBLIC). DLP and retention engines consume tags.
**Verify:** Write "SSN: 123-45-6789" → memory tagged PHI. Write "BEGIN RSA PRIVATE KEY" → tagged CREDENTIAL.

### 14.22 Breach Notification Workflow

**File:** `server/src/services/breach-notifier.ts`
Subscribes to incident-response bus. On CONTAINMENT_COMPLETE, dispatches regulation-specific templates (GDPR 72h, HIPAA 60d) via email/Slack.
**Verify:** Trigger simulated security incident → breach notification email sent with required fields (affected_principals, timeline, remediation).

### 14.23 Secrets Rotation Scheduler

**File:** `server/src/services/secret-rotator.ts`
Cron with per-secret rotation policy (DB creds 90d, provider tokens 30d). Generate→deploy→verify→revoke old→audit. Rollback on failure.
**Verify:** Set DB password rotation to 1min → new password generated, old one revoked after verification. Query with old password → rejected.

### 14.24 Certificate Lifecycle Manager (TLS + mTLS)

**File:** `server/src/lib/cert-manager.ts`
Internal CA for mTLS. ACME client for public TLS. Auto-renew 30d before expiry. Watches expiry, rotates without restart.
**Verify:** Create cert expiring in 7d → auto-renewal triggered. mTLS between services works with auto-rotated certs.

### 14.25 Container Runtime Security (Seccomp/AppArmor/Falco)

**File:** `server/src/services/runtime-security.ts`
Generates seccomp profile from manifest's allowed syscalls. AppArmor for subprocess sandbox. Falco rules on execve/mount/ptrace.
**Verify:** WASM plugin tries `unshare(CLONE_NEWNS)` → seccomp kills it. Falco rule on unexpected execve → alert sent.

### 14.26 Network Policy Enforcement

**File:** `server/src/services/network-policy-controller.ts`
Renders K8s NetworkPolicies from `network_policies` DB table. Default-deny per namespace. Agent-scoped from manifest's network_access field.
**Verify:** Agent with allow:["api.stripe.com"] → NetworkPolicy blocks all other egress. Change to allow:["*"] → all egress allowed.

### 14.27 Cloud Security Posture Management (CSPM) Scanner

**File:** `server/src/services/cspm-scanner.ts`
Periodic scanner via AWS Config API / GCP SCC. Checks CIS benchmarks. Drift → alert via incident-response.
**Verify:** Create public S3 bucket → CSPM detects, creates `cspm_finding`, triggers security alert.

### 14.28 Vulnerability Disclosure Program (VDP)

**File:** `server/static/.well-known/security.txt`
Static `security.txt` served at `/.well-known/security.txt` with contact, policy URL, encryption key. VDP doc with scope and remediation SLAs.
**Verify:** curl /.well-known/security.txt returns valid RFC 9116 format.

### 14.29 Automated Pentest Scheduler & Remediation Tracker

**File:** `server/src/services/pentest-scheduler.ts`
Cron-driven probe harness runs. Findings stored with CVSS. Track acceptance (risk-accepted/fix-by-date). Re-run on fix → auto-close.
**Verify:** Probe finds SQLi vulnerability → finding created with CVSS 8.5. Fix deployed → re-run → finding auto-closed.

### 14.30 Insider Threat Detection (Cross-Actor Correlation)

**File:** `server/src/services/insight-detector.ts`
Graph-based correlation: adjacency matrix of (actor, resource, action, hour). Flags: off-hours access, impossible IP sequences, >95th-percentile export.
**Verify:** 3 users each export 500 rows in same hour → cross-actor correlation detects coordinated exfiltration pattern.

### 14.31 Cryptography Agility Layer

**File:** `server/src/lib/crypto-suite.ts`
Config-driven algorithm selection per data classification. Auto-rotation of DEKs. Versioned migration path for algorithm deprecation.
**Verify:** Switch PHI encryption from AES-256-GCM to ChaCha20-Poly1305 → existing data re-encrypted on read, new data uses new algorithm.

### 14.32 Compliance Evidence Collection Automation

**File:** `server/src/services/evidence-collector.ts`
Periodic collector per framework: SOC2→org chart, risk assessment, access reviews; HIPAA→BAA list, PHI inventory; GDPR→data flow map.
**Verify:** Run SOC2 collector → evidence_artifacts table populated with org chart snapshot, IAM policy dump, network policy export.

### 14.33 Third-Party Vendor Security Assessment

**File:** `server/src/services/vendor-assessor.ts`
For each integration: sends questionnaire, tracks response, scores risk. Vendor risk register in vendor_assessments table.
**Verify:** Register new MCP server → assessment created with "pending" status. Complete questionnaire → risk score calculated.

### 14.34 Agent Permission Boundary Documentation & Enforcement

**File:** `server/src/lib/agent-permissions.ts`, `docs/security/AGENT_PERMISSION_BOUNDARIES.md`
Agent manifest declares `permissions: { network: [...], syscalls: [...], filesystem: [...] }`. Kernel enforces at dispatch.
**Verify:** Agent manifest with network:["api.stripe.com"] → kernel denies connection to api.github.com. Manifest omits filesystem → file writes blocked.

### 14.35 Ransomware / Mass-Deletion Detection

**File:** `server/src/services/ransomware-detector.ts`
Sliding-window on DELETE/UPDATE rate per principal per resource type. >10 deletes/1m on memories → alert. >50% modified/5m → quarantine.
**Verify:** Agent issues 15 DELETE /memories commands in 30s → ransomware alert fires. Agent quarantined on 3rd alert within 5min.

---

## PHASE 15: Performance & Scalability — ADDITIONAL TASKS

Insert after existing task 20.

### 15.21 Cache Stampede Prevention (Mutex-on-Miss)

**File:** `server/src/services/cache/response-cache.ts`
On cache miss, atomic SETNX "reloading" flag in Redis (2s TTL). Only winner recomputes; others poll-wait.
**Verify:** 20 concurrent requests for expired cache key → only 1 recompute hits origin, 19 wait and get cached result.

### 15.22 Cache Hit Ratio Monitoring & Alerting

**File:** `server/src/services/cache/cache-metrics.ts`
Prometheus `cache_hit_ratio{layer="redis|lru|origin"}` per cache tier. Alert when <80%.
**Verify:** Run workload → Grafana shows cache_hit_ratio. Simulate cache miss spike → alert fires.

### 15.23 Client-Side HTTP Caching Headers

**File:** `server/src/middleware/cache-headers.ts`
Hono middleware computes SHA-256 of response body → `ETag`. On `If-None-Match`, return 304. Configurable Cache-Control per route group.
**Verify:** GET /agents → response has ETag. Repeat with If-None-Match → 304 with empty body. Response time drops from 50ms to 2ms.

### 15.24 Database Query Timeout Enforcement

**File:** `server/src/db/index.ts`
SET statement_timeout='30s' per connection. Per-query timeout via client.query({statementTimeout: 5000}). Log violations.
**Verify:** Submit slow query (pg_sleep(60)) → connection closed at 30s, error returned. Query event_log for timeout.

### 15.25 SSL/TLS Termination Performance Strategy

**File:** `server/src/index.ts`, `ops/reverse-proxy/nginx.conf`
Delegate TLS to reverse proxy (nginx with ssl_engine). Hono listens on HTTP. Session ticket resumption + OCSP stapling.
**Verify:** TLS handshake time on first connection < 100ms. Repeat connection < 10ms (session resumption). OCSP response cached.

### 15.26 Request Coalescing (Dedup In-Flight Requests)

**File:** `server/src/services/cache/request-coalescer.ts`
Map of `<method+path+bodyHash>` → pending promises. Second caller attaches to existing promise. TTL 5s on dedup entry.
**Verify:** 10 concurrent GET /agents/my-agent → 1 hits DB, 9 wait and share result. All 10 receive same response.

### 15.27 Database Index Usage Statistics Tracking

**File:** `server/src/db/index-usage-reporter.ts`
Query pg_stat_user_indexes where idx_scan=0 over 7d. Auto-generate DROP INDEX CONCURRENTLY suggestions.
**Verify:** Unused index detected → suggestion generated. After DROP → write throughput improves, disk usage drops.

### 15.28 Event Loop Lag Monitoring

**File:** `server/src/services/monitor/event-loop.ts`
`setInterval(1000)` with `process.hrtime.bigint()` delta. Lag >50ms → warn. >200ms → alert.
**Verify:** Introduce CPU-bound computation → event loop lag rises. Alert fires. Remove computation → lag drops, alert clears.

### 15.29 Memory Leak Detection Automation

**File:** `server/scripts/memory-leak-check.ts`
Compare heap snapshots before/after 1000 iterations. CI: flag if >5% growth.
**Verify:** Run with known leak (detached DOM nodes in closure) → test fails with "heap grew 12%". Without leak → passes.

### 15.30 Performance Budget Enforcement in CI

**File:** `.github/workflows/performance-budget.yml`
k6 smoke test + bundle size check. Assert p95<200ms, bundle<500KB, cold start<300ms. Fail on >10% regression.
**Verify:** Introduce slow middleware → CI fails with "p95 degraded 35% (baseline 120ms, current 162ms)".

### 15.31 Load Testing Baseline Suite

**File:** `load-tests/smoke/`, `load-tests/stress/`, `load-tests/soak/`
k6 scripts per major path. Run daily on main. Store baseline. Alert on p95 >2x 7d rolling median.
**Verify:** Baseline established after 7 days. PR introduces regression → CI fails with comparison against baseline.

### 15.32 WebSocket Per-Message-Deflate Compression

**File:** `server/src/services/ws/multiplexer.ts`
Enable `permessage-deflate` with `zlibDeflateOptions: {level:6}`. ~80% reduction on 200KB state messages.
**Verify:** WS message 200KB → compressed to ~40KB. Client with deflate disabled → receives uncompressed. Bandwidth drops 80%.

### 15.33 Cold Start Optimization for Container Deployments

**File:** `server/src/lifecycle/warmup.ts`
On boot: eagerly import plugins, pre-warm DB pool, parse agent schemas before accepting traffic. Provisioned concurrency config.
**Verify:** First request after cold start → response time < 500ms (vs 2s+ without warmup). All plugins registered before first request.

---

## PHASE 16: Developer Experience — ADDITIONAL TASKS

Insert after existing task 20.

### 16.21 IDE Language Server (LSP) for Config Files

**File:** `packages/nexus-lsp/src/server.ts`
`vscode-languageserver` for nexus.yaml, plugin manifests, agent DSL. Hover docs, completion, diagnostics. Auto-started by VS Code extension.
**Verify:** Open nexus.yaml → hover reveals doc, diagnostics show validation errors. neovim user gets same via generic LSP client.

### 16.22 Debug Adapter Protocol (DAP) for Agent Execution

**File:** `packages/nexus-dap/src/debug-adapter.ts`
Maps agent concepts to debugger: agent step→next, tool call→stepIn, kernel switch→breakpoint. VS Code "Debug Agent" button.
**Verify:** Set breakpoint on tool call → agent pauses before tool execution. Step over → tool runs, shows result. Inspect memory state.

### 16.23 SDK Usage Analytics & API Telemetry

**File:** `packages/sdk/src/telemetry.ts`
Opt-in anonymous POST of {method, duration, errorCode, sdkVersion} to /api/sdk-telemetry. Dashboard shows method call rank, error heatmap.
**Verify:** Install SDK, make calls → SDK dashboard shows method frequency. Deprecated method usage flagged.

### 16.24 Error Code Registry & Search API

**File:** `server/src/errors/registry.ts`
Centralized ErrorCodeDef {code, httpStatus, message, suggestion, docsUrl}. GET /api/v1/errors lists all. CLI: nexus errors.
**Verify:** GET /api/v1/errors → 50+ error codes. Search "timeout" → E_KERNEL_TIMEOUT with suggestion and docs link.

### 16.25 Automated Migration Guide & Breaking Change Detection

**File:** `server/src/lib/detect-breaking-changes.ts`
Compares two OpenAPI specs, outputs structured breaking changes. CLI: nexus migrate check v1 v2.
**Verify:** Remove field from route → "Breaking change: response.body removed from POST /agents". Add field → "Non-breaking: addition".

### 16.26 Plugin Scaffolding CLI (beyond basic template)

**File:** `packages/nexus-cli-plugin/src/index.ts`
`nexus plugin init my-agent` interactive: target language, plugin type, needs config schema, needs DB tables. Outputs validated scaffold.
**Verify:** nexus plugin init my-tool --type=step → creates src/index.ts with handler, nexus-plugin.yaml, tsconfig.json. Vitest test passes.

### 16.27 Full Dev Container Specification

**File:** `.devcontainer/devcontainer.json`, `.devcontainer/docker-compose.yml`
image, features (rust, docker-in-docker), forwardPorts, postCreateCommand, extensions, mounts for sandbox.
**Verify:** Open in Codespaces → port 9900 forwarded, Rust analyzer works, docker sandbox works. `npm run dev` starts server.

### 16.28 Live Environment Variable Documentation Generator

**File:** `tools/generate-env-docs.ts`
Extract @env annotations from source, cross-ref with .env.example, generate markdown table. Serve at /api/v1/docs/env.
**Verify:** Add new env var @env → npm run generate:env-docs → markdown includes it. Remove from .env.example → CI fails.

### 16.29 API Changelog Generator from Git History

**File:** `tools/generate-api-changelog.ts`
Compare OpenAPI specs across git tags. Output grouped by added/deprecated/changed/removed. GET /api/v1/changelog.
**Verify:** Tag v2.0 → v2.1 changelog shows new endpoints. Deprecation shows Sunset header + changelog entry.

### 16.30 SDK Version Compatibility Matrix

**File:** `tools/generate-compat-matrix.ts`
CI matrix test: each SDK version × each server version. Output compat table. SDK warns on handshake mismatch.
**Verify:** SDK 1.2 against server 2.0 → warning "server version 2.0 may have incompatibilities with SDK 1.2". Table confirms.

### 16.31 Realtime API Event Type Registry & Explorer

**File:** `server/src/events/registry.ts`
Centralized event type definitions with JSON Schema. GET /api/v1/events lists all with examples. SDK typed event emitter.
**Verify:** GET /api/v1/events → agent.completed has schema, delivery guarantee "at-least-once", example payload. SDK: client.on('agent.completed', handler).

### 16.32 Language-Specific Gotchas & Pitfalls Guide

**File:** `docs/guide/gotchas.md`, `docs/guide/gotchas-python.md`, `docs/guide/gotchas-typescript.md`
Curated guide: Python GIL vs event loop, TS ESM/CJS dual-build, async context propagation differences.
**Verify:** Python gotcha about httpx vs aiohttp documented. TS gotcha about decorator compatibility with nexus.yaml. CI enforces: SDK PR must update gotchas if cross-lang behavioral diff introduced.

### 16.33 Per-Endpoint Rate Limit Documentation

**File:** `server/src/middleware/rate-limit-docs.ts`
Annotate each route with @rateLimit {tier, rpm, burst}. GET /api/v1/rate-limits returns per-endpoint limits. 429 response includes Retry-After + docsUrl.
**Verify:** Rate-limited endpoint → GET /api/v1/rate-limits shows its limit. Hit limit → 429 with docs link. SDK withRetry respects Retry-After.

### 16.34 SDK Contribution Guidelines

**File:** `CONTRIBUTING.md` (SDK section)
Checklist: every API method has TS + Python wrapper, error codes mapped, integration test covers happy+3 error paths, docs PR filed alongside.
**Verify:** New SDK method without Python wrapper → CI fails. Missing error mapping for E_KERNEL_TIMEOUT → CI warning.

---

## PHASE 17: Enterprise Features — ADDITIONAL TASKS

Insert after existing task 20.

### 17.21 Enterprise Config Change Audit Logger

**File:** `server/src/services/config-audit.ts`
Middleware on PATCH /admin/ snapshots previousValue and newValue to `config_audit_log` table. Filterable by audit-trail-viewer.
**Verify:** Change SSO IdP URL → config_audit_log has {principal, resource_type:"sso_settings", diff: {old:"url1", new:"url2"}}.

### 17.22 Cross-Org Resource Sharing

**File:** `server/src/db/schema.ts`, `server/src/routes/sharing.ts`
`shared_resources` table (resource_type, resource_id, source_org_id, target_org_id, permission_level, expires_at). RLS exempts shared rows.
**Verify:** Share agent from org A to org B → org B can read + execute agent. Audit log shows share event. Expiry reached → access revoked.

### 17.23 Parent/Sub-Org Hierarchy Tree

**File:** `server/src/db/schema.ts` (parent_org_id on organizations), `server/src/services/org-tree.ts`
Add parent_org_id + org_hierarchy_path (LTREE) for ancestry queries. Billing queries walk tree. RLS inherits from parent.
**Verify:** Create parent org with 2 sub-orgs → billing report shows consolidated usage across all 3. Policy set at parent flows to children.

### 17.24 Billing Invoice Generation & PDF Delivery

**File:** `server/src/services/billing/invoicing.ts`
Monthly cron reads usage_hours, computes tiered pricing, creates invoice row. PDF via Puppeteer. Email via SES/SendGrid.
**Verify:** Run invoice generation → PDF created with correct line items, subtotal, tax, total. Email sent with attachment.

### 17.25 Payment Method Management

**File:** `server/src/services/billing/payment-methods.ts`
CRUD at /api/v1/billing/methods. Stripe for card/ACH. PO method with document upload. Default method auto-pays invoices.
**Verify:** Add Stripe card → stored. PO with document → auto-approved up to limit. Invoice issued → auto-paid via default method.

### 17.26 Seat License Management & Active User Tracking

**File:** `server/src/services/billing/seats.ts`
seat_licenses table (plan_seats, used, suspended). Create user increments used. At limit → 429 SEAT_LIMIT_EXCEEDED.
**Verify:** Plan has 5 seats, 5 active users → 6th gets 429. Suspend inactive user → seat freed. 6th user succeeds.

### 17.27 JIT User Provisioning on SSO Login

**File:** `server/src/services/sso-jit-provisioning.ts`
On first SSO login, extract claims, create user, assign to default workspace. Seat check before creation.
**Verify:** SSO login from new user with okta@company.com → user auto-created with role from SAML groups. At seat capacity → returns "contact admin".

### 17.28 IdP-Initiated SAML/SSO Flow

**File:** `server/src/lib/sso-saml.ts`
On POST /saml/acs, check InResponseTo. If absent (IdP-initiated), parse NameID, resolve org from issuer, upsert session, redirect.
**Verify:** Click Okta app tile → IdP POSTs SAMLResponse → user logged in and redirected to dashboard. IdP entity ID in audit log.

### 17.29 Custom Domain / Dedicated Subdomain per Org

**File:** `server/src/services/org-domains.ts`
custom_domains table + tenant-resolving middleware. ACME auto-provision. CNAME verification via TXT record.
**Verify:** Add custom.domain.com → Let's Encrypt certificate provisioned. Navigate to custom.domain.com → loads org A's dashboard. Org B's data invisible.

### 17.30 Multi-Region Data Residency Controls

**File:** `server/src/services/data-residency.ts`
data_residency_policy per org (us_east, eu_west, ap_southeast). Region-router maps writes to configured PG cluster. Cross-region queries blocked.
**Verify:** Set EU org to eu_west → all memory writes go to EU Postgres. Query from US region → blocked with "data_residency.cross_region_access_blocked" audit entry.

### 17.31 Usage Alerts & Budget Notification Engine

**File:** `server/src/services/budget-alerting.ts`
budget_alerts table per org (metric, threshold_type, threshold_value, channels). Cron evaluates every 5min. On fire: email + webhook.
**Verify:** Set alert at 100k API calls → hit 100k → email sent, webhook POSTed. Alert cooldown prevents re-fire within configured window.

### 17.32 Custom Role Creation API

**File:** `server/src/routes/admin-roles.ts`
POST /api/v1/admin/roles with name + scope list. Scope patterns support memory:_, admin:users:_, billing:read. Deny overrides allow.
**Verify:** Create "auditor" role with audit:read only → user with auditor role cannot write memories. Create "billing-admin" with billing:* → can read + manage billing.

### 17.33 Scheduled Audit Log Export

**File:** `server/src/services/audit-export-scheduler.ts`
export_schedules table (cron, format, destination). Cron evaluator streams audit log to S3/email/webhook. Encrypted at rest.
**Verify:** Schedule daily CSV export to S3 → file appears in bucket with correct data. Encryption header present. On failure → retry with backoff.

### 17.34 Enterprise Plan Change Management

**File:** `server/src/services/billing/plan-migration.ts`
On plan change: validate limits vs usage, grace period to end of billing period. Pre-migration report. Scheduled job applies limits.
**Verify:** Downgrade Enterprise→Pro with 90d retention → warning "Pro has 30d retention, your data will be trimmed at period end". After period → memories older than 30d archived.

---

## PHASE 18: Self-Optimization — ADDITIONAL TASKS

Insert after existing task 20.

### 18.21 A/B Test Results Analysis Dashboard

**File:** `server/src/services/ab-analysis.ts`
Computes Cohen's d, Bayesian posterior, segment breakdown (query length, model, ring). GET /api/v1/optimization/experiments/:id/analysis returns p-value, effect_size, recommendation.
**Verify:** Run A/B test → dashboard shows effect size, confidence interval, segment breakdown. "recommendation: promote" when p<0.05 and power>0.8.

### 18.22 Self-Optimization Global Circuit Breaker

**File:** `server/src/services/optimization-circuit-breaker.ts`
If `reverted` count >3 in 300s OR p95 degradation >20%, set NEXUS_OPTIMIZATION_FROZEN=true. Auto-thaw after 30min no degradation.
**Verify:** 3 optimizations reverted in 4min → frozen. Optimization proposals rejected with "optimization_frozen". 30min passes → thawed, proposals accepted.

### 18.23 Automated Mass Rollback on Detected Harm

**File:** `server/src/services/rollback-manager.ts`
After each measureAndFinalize, check if ANY metric worsened vs baseline. If so, revert ALL proposals applied in last N minutes.
**Verify:** PID tuner and queue scaler interact badly → combined p95 degrades → both reverted atomically. Pre-patch snapshots in optimization_snapshots.

### 18.24 Optimization Parameter Versioning & History

**File:** `server/src/db/schema.ts` (optimization_state_snapshots table)
Periodic snapshot of all NEXUS env vars, guardrail thresholds, PID gains, RRF weights. API to diff two snapshots.
**Verify:** PID gain changes → snapshot created. Diff snapshot v1 vs v2 → shows "Kp changed from 0.5 to 0.7". Rollback to v1 restores Kp to 0.5.

### 18.25 Cost-Aware Optimization Budget Controller

**File:** `server/src/services/optimization-cost-controller.ts`
Track cost per optimization cycle. Estimate monthly savings. Reject if ROI <2×. Dashboard at /api/v1/optimization/roi.
**Verify:** Optimization costs $10/month to run but saves $5/month → rejected with "ROI 0.5x < 2.0x minimum". Dashboard shows cost-vs-savings chart.

### 18.26 Optimization Dry-Run / Simulation Mode

**File:** `server/src/services/optimization-simulator.ts`
Replay last 1000 metric snapshots through proposed patch. Predict p50/p95/p99 deltas. `dryRun: true` produces proposal status "simulated".
**Verify:** Propose change with dryRun=true → proposal created with status "simulated". Predicted p95 improvement: 8-12%. Actual impact when applied falls within predicted range.

### 18.27 A/B Test Statistical Power Calculator

**File:** `server/src/services/ab-power-analyzer.ts`
Before auto-promotion, compute minimum sample size. Reject if n_actual < n_required. Show "need 47 more samples".
**Verify:** A/B test with N=10 → "need 40 more samples for 80% power at α=0.05, effect=10%". After N=50 → promotion allowed with adequate power.

### 18.28 Exploration vs Exploitation Budget Manager

**File:** `server/src/services/exploration-budget.ts`
ε-greedy schedule: 20% explore, 80% exploit. Decay ε from 0.3→0.05 over 30 days. Track regret.
**Verify:** Day 1: 30% of cycles explore random params. Day 30: 5% explore. Regret < threshold → acceptable. Reset on threshold breach.

### 18.29 Optimization Experiment Tracking Database

**File:** `server/src/db/schema.ts` (extend improvement_proposals)
Add cohort_id, hyperparams jsonb, tags text[], git_sha, model_version, reproducible boolean, stopping_reason.
**Verify:** Run experiment with tags ["pid", "scheduler"] → filter by tags shows all related proposals. git_sha links to code version.

### 18.30 Cross-Agent Optimization Knowledge Sharing

**File:** `server/src/services/optimization-knowledge-base.ts`
After optimization, write structured summary to `optimization_learnings`. Other optimizers query "has anyone tuned PID on queue-depth?".
**Verify:** PID tuner learns Kp=0.7 works for queue-depth. RL scheduler queries knowledge base → finds Kp=0.7 recommendation. Saves 50% tuning time.

### 18.31 Optimization Fairness Guard

**File:** `server/src/services/optimization-fairness-guard.ts`
Per-segment impact (agent ring, task kind, cohort). Fairness metric: min(benefit)/max(benefit) > 0.5. Block proposals with unfair impact.
**Verify:** Optimization improves Ring-0 latency 30% but degrades Ring-3 latency 20% → blocked with fairness report. Recommend ring-specific tuning instead.

### 18.32 Optimization Explainability & Transparency Report

**File:** `server/src/services/optimization-reporter.ts`
On each status change, generate Markdown report: "PID gains changed from {Kp:0.5} to {Kp:0.7} because p95 was 1200ms. Delta: -15%. Decision: rolled_out."
**Verify:** After optimization cycle → /docs/optimization-changelog/ contains explainability report. GET /api/v1/optimization/reports returns latest.

### 18.33 User Satisfaction Feedback Loop

**File:** `server/src/services/user-satisfaction-tracker.ts`
After user-facing interaction, collect thumbs up/down, rephrasing rate satisfaction signals. Correlate with active optimizations. Auto-revert on >5% satisfaction drop.
**Verify:** PID tuner reduces latency but outputs become nonsensical → satisfaction drops 8% → optimization auto-reverted. Audit: "satisfaction.misaligned auto-revert".

### 18.34 Meta-Optimization (Optimizing the Optimizer)

**File:** `server/src/services/meta-optimizer.ts`
Track optimizer KPIs: acceptance rate, mean delta, reversion rate, false positive rate. Bayesian optimization adjusts: regression threshold, window size, grace duration, ε.
**Verify:** Meta-optimizer increases regression detection threshold from 15% to 22% after 10 false positives. Reversion rate drops 40%.

### 18.35 Automated Hypothesis Generation

**File:** `server/src/services/hypothesis-generator.ts`
Every 12h, lightweight LLM prompt with current metrics. "Given {summary}, suggest 3 changes to improve p95 latency >10% with <5% risk." Creates draft proposals.
**Verify:** Cache hit ratio at 60% → hypothesis: "predictive warming policy could increase to 85%". Human approves → concrete proposal with patch values generated.

---

## PHASE 19: Ecosystem & Marketplace — ADDITIONAL TASKS

Insert after existing task 20.

### 19.21 Plugin Monetization / Payment System

**File:** `server/src/services/plugin-payments.ts`
price, pricingModel (free/one_time/subscription/per_seat), revenueSharePct on plugins. Stripe/LemonSqueezy integration. License key generation.
**Verify:** Publish paid plugin at $9.99 → checkout flow works. Purchase → license key generated. Install requires valid license.

### 19.22 Plugin Author Dashboard & Identity

**File:** `server/src/services/plugin-author-dashboard.ts`
plugin_authors table. Aggregated: installs over time, earnings per period, rating trends, receipt volume, crash rate.
**Verify:** Author publishes plugin → dashboard shows 10 installs, $0 earnings (free). Revenue share calculation visible.

### 19.23 Plugin SLA & Uptime Monitoring

**File:** `server/src/services/plugin-sla-monitor.ts`
Periodic health check per installed plugin. Track uptime over 24h/7d/30d windows. Breach → webhook notification.
**Verify:** Plugin goes down → SLA breach event created. 99.5% uptime over 30d → SLA met. 95% → breach notification sent.

### 19.24 Plugin Developer Documentation Portal

**File:** `server/src/routes/plugin-docs.ts`
Serve manifest schema as JSON Schema, capability catalog with descriptions, SDK reference. Auto-generated from code.
**Verify:** GET /api/v1/plugins/docs/manifest-spec → valid JSON Schema. GET /api/v1/plugins/docs/capabilities → list with descriptions and ring requirements.

### 19.25 Community Forum / Discussions per Plugin

**File:** `server/src/services/plugin-discussions.ts`
plugin_discussions table. Threading, pinning, resolved-state tracking. POST/GET /api/v1/plugins/:id/discussions.
**Verify:** Create discussion on plugin → appears on plugin page. Reply → threaded. Mark resolved → badge shows on discussion.

### 19.26 Plugin Translation / Localization System

**File:** `server/src/services/plugin-i18n.ts`
plugin_translations table per locale. Auto-translate endpoint via LLM gateway on publish. GET /api/v1/plugins/:id?locale=fr.
**Verify:** Publish plugin with default English → auto-translate to French. GET with locale=fr → French name and description returned.

### 19.27 Plugin Featured Badge / Certification Program

**File:** `server/src/services/plugin-certification.ts`
Badge tiers: none, verified_publisher, security_reviewed, partner_certified, nexus_approved. assignBadge/revokeBadge API.
**Verify:** Plugin passes security review → badge "security_reviewed" appears in marketplace. Filter by badge → only certified plugins shown.

### 19.28 Plugin Enterprise Approval Workflow

**File:** `server/src/services/plugin-enterprise-gate.ts`
plugin_approval_queue table. In enterprise mode, install queues for admin approval. Approve/reject endpoints.
**Verify:** Enterprise org user tries to install plugin → install queued with "pending" status. Admin approves → plugin installed. Admin rejects → user notified.

### 19.29 Plugin Code Signing & Notarization Chain

**File:** `server/src/services/plugin-notary.ts`
On publish, submit plugin hash + signature to notary timestamping service. Store notarizedAt, notarySignature. Verify chain on load.
**Verify:** Publish plugin → notary certificate created. Load plugin → full chain verified. Tampered manifest → chain verification fails, load rejected.

### 19.30 Plugin Ecosystem Health Monitoring

**File:** `server/src/services/plugin-ecosystem-health.ts`
healthStatus (active/unmaintained/deprecated/removed), deprecatedAt, replacedBy fields. Cron detects unmaintained (no update >6mo). Deprecation notifications.
**Verify:** Plugin has no updates for 6 months → marked "unmaintained". Author notified. Successful replacement exists → "deprecated" with migration hint.

---

## PHASE 20: Production Reliability — ADDITIONAL TASKS

Insert after existing task 20.

### 20.21 Incident Severity Classification Framework

**File:** `server/src/services/incident/severity.ts`
P0-P4 definitions with scope, data loss impact, revenue effect, response SLA, stakeholders notified. Enum + classifier fn.
**Verify:** Anomaly detector fires → severity P2 assigned (multi-tenant latency spike, no data loss). Runbook routes to SRE within 15min SLA. P0 (data loss) → pages within 5min.

### 20.22 On-Call Schedule & Escalation Management

**File:** `server/src/services/incident/oncall.ts`
Calendared rotation, tiered escalation: P0→primary(5min)→secondary(10min)→eng-manager(15min). Webhook to PagerDuty/Opsgenie.
**Verify:** P0 fires, primary doesn't acknowledge 5min → secondary paged. Secondary 10min → eng-manager paged. Rotation config via API.

### 20.23 Incident Triage Roles & Coordination

**File:** `server/src/services/incident/triage-roles.ts`
On severity assignment: auto-declare incident commander, comms lead, scribe. Auto-create Slack channel. Reference in runbook.
**Verify:** P0 fires → Slack channel #incident-042 created. Commander role assigned, comms lead assigned. Runbook steps say "[commander] assess scope".

### 20.24 Communication Templates & Status Page Integration

**File:** `server/src/services/incident/comms.ts`
Templates: investigating→identified→mitigated→resolved. Push to statuspage.io at each phase for P2+. Customer-facing.
**Verify:** P2 fires → "Investigating" posted to status page. Mitigated → "Mitigating" posted. Resolved → "Resolved" posted. All customers subscribed get email.

### 20.25 SLA Breach Notification to Customers

**File:** `server/src/services/sla/breach-notify.ts`
On SLO budget exhaustion: generate customer-facing report (window, impact, remediation ETA). Email + status page update.
**Verify:** SLO exhausted for customer → report generated with {sla_window, impact, eta}. Customer email sent. Status page shows SLA breach.

### 20.26 Emergency Break-Glass Access Procedure

**File:** `server/src/services/security/break-glass.ts`
Time-limited (15min) emergency token via separate signing key in HSM. Every usage logged to immutable audit + pages security team.
**Verify:** Auth system down → break-glass token generated, used to access system. Audit log shows {action:"break_glass_used", duration:15min}. Sec team paged.

### 20.27 Chaos Experiment Schedule & Cadence

**File:** `server/src/services/chaos/scheduler.ts`
CRON: critical experiments (DB kill, Redis fail) every 6h. Moderate (pod kill, latency) every 24h. Exploratory weekly.
**Verify:** Experiments run on schedule. Critical: 4×/day minimum. Weekly report shows coverage: "12 of 18 fault classes tested this week".

### 20.28 Chaos Experiment Approval Workflow

**File:** `server/src/services/chaos/approval.ts`
Pre-flight: blast-radius analysis, rollback plan, traffic-level guard. P0 experiments require 2 approvals. Auto-deny if CPU >70%.
**Verify:** Submit experiment → blast radius analysis shows 30% endpoints affected → requires 2 approvals. CPU at 75% → auto-denied with "cluster under load".

### 20.29 Network Partition Testing

**File:** `crates/chaos/src/faults/network-partition.rs`
Use iptables to drop traffic between subnet A→B while B→A stays up. Verify CP still elects leader.
**Verify:** Partition network between kernel nodes → leader election completes on majority side. Minority side returns 503. Partition heals → full functionality restored.

### 20.30 Chaos Game Day Facilitation Guide

**File:** `docs/chaos/game-day-guide.md`
4 phases: pre-brief, inject, observe, retro. Scenario cards: "DB CPU 100%", "Redis master dies during deploy". Participant roles.
**Verify:** Team runs game day with "DB CPU" scenario → timeline recorded. Retro identifies 3 process improvements. Guide updated with learnings.

### 20.31 Chaos Evidence Dashboard (Historical)

**File:** `server/src/services/chaos/dashboard.ts`
GET /_/chaos: pass/fail rate over 30d, coverage map (faults × services), top-5 regressions. Feed into reliability scorecard.
**Verify:** 90% pass rate over 30d. Coverage map shows DB faults tested, network faults untested. Regressions: 2 circuits failed to open on Redis failure.

### 20.32 Certificate Expiry Monitoring & Auto-Renewal

**File:** `server/src/services/reliability/cert-watch.ts`
Daily scan of all TLS certs. Page at 14d, auto-renew via ACME at 7d. GET /_/certs with expiry timestamps.
**Verify:** Cert expires in 14d → page sent. Cert expires in 7d → auto-renewed via ACME. GET /_/certs shows new expiry 90d out.

### 20.33 Dependency Cascade Impact Analysis

**File:** `server/src/services/reliability/cascade.ts`
Build dependency graph from circuit-breaker registry. On dependency failure, compute blast radius: endpoints affected, revenue impact, data exposure.
**Verify:** Redis failure → cascade analysis shows "60% of endpoints degraded, 3 revenue-critical flows blocked, 0 data exposure". Dashboard shows cascade risk per dependency.

### 20.34 Incident Metrics Dashboard (MTTD/MTTR/MTBF Trends)

**File:** `server/src/services/incident/metrics-dashboard.ts`
GET /_/incident-metrics: MTTD, MTTR, MTBF trends over 7/30/90d by severity. P50/P90/P99.
**Verify:** Log 10 incidents → dashboard shows MTTD trend (improving: 12min→8min), MTTR (stable: 25min), MTBF (degrading: 4h→2h between incidents). Badge when MTTR exceeds SLO.
