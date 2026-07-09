# NEXUS 2.0 — Team Ownership & Boundary Governance (v3, 20-agent fleet)

**Adopted:** 2026-07-09 (Leader directive: "upgrade whole team to all-rounders, one agent per area, no collisions")
**Supersedes:** v2 (9-agent predecessor) — retained below as _Historical_ for traceability.
**Authoritative source of truth:** `AGENTS.md` §Multi-Agent Operating Model (Fleet of 20). This
document is the canonical ownership mapping; GitHub `CODEOWNERS` (see below) enforces it at review
time.
**Owner of this document:** Lorekeeper (docs namespace). Do not edit without Lorekeeper/Leader sign-off.

---

## 1. Principle

The fleet is **20 all-rounder agents**, each owning ONE **exclusive, non-overlapping file
namespace**. Every agent perfects its area end-to-end (backend + frontend + tests + docs) with full
autonomy, in a **nonstop improvement loop**, until it reaches the Perfection Bar (§6). Edits never
collide because the namespace map below is the _only_ file an agent may edit. Cross-area needs route
to the **Leader** and integrate only through stable public interfaces.

> **Frozen vs namespaced:** A small set of _common-infrastructure_ files (§4) is shared and was the
> historical source of collisions. Those are **Leader/Forge sign-off only** — agents consume them via
> public exports, never edit them.

---

## 2. Exclusive namespace map (20 agents — the ONLY files each agent may edit)

| #   | Agent          | Area                                                       | Exclusive files (edit ONLY these)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Forge**      | Kernel, Scheduler & Runtime Loop                           | `server/src/services/kernel*.ts` (kernel, -schema, -persistence, -panic, -introspect, -introspect-state, -hotpatch, -bootstrap, ring-audit), `scheduler.ts`, `task-worker.ts`, `task-notifier.ts`, `message-bus.ts`, `sse-bus.ts`, `sse-bridge.ts`, `sse.ts`, `pipeline-executor.ts`, `resource-quota.ts`, `preemption-leak-guard.ts`, `signal-hooks.ts`, `routes/kernel.ts`, `routes/kernel-introspect.ts`, `routes/sse.ts`                                                                                                                                    |
| 2   | **Atlas**      | Orchestration, DAG & Agent Runtime                         | `server/src/services/{orchestrator,blackboard,dag-executor,planner,agent-dag,agent-runtime,agent-loop,agent-persistence,agent-permissions,consensus,deadlock-detector,workflow-dsl,conditional-router,merge-strategies,specialization-registry,action-registry,propagation,graph-engine,pipeline-io}.ts`, `routes/{agents,agent-lifecycle,a2a,automation}.ts`, `packages/a2a-server/**`                                                                                                                                                                         |
| 3   | **Mnemosyne**  | Memory Core & Recall                                       | `server/src/services/{memory.service,memory-search-suggest,memory-search-explanation,memory-nl-query,memory-graph-browser,memory-attachments,memory-batch,memory-tag-taxonomy,memory-clustering,memory-cluster,memory-causal-chains,memory-contradiction,memory-conflict-resolver,memory-provenance,memory-dedup,memory-privacy-zones,memory-multilingual,memory-multimodal}.ts`, `recall.ts`, `federated-recall.ts`, `embeddings.ts`, `routes/memory-*.ts`                                                                                                     |
| 4   | **Lethe**      | Memory Lifecycle, Training & Maintenance                   | `server/src/services/{memory-decay,memory-forget,memory-hierarchy,memory-templates,memory-quota,memory-fragmentation,memory-cold-storage,memory-backup,memory-anomaly,memory-stitcher,memory-consolidation,memory-priming,memory-rehearsal,memory-emotion,memory-export-v3,memory-diff-sync}.ts`, `consolidation.ts`, `consolidation-budget.ts`, `memory-trainer.ts`, `dedup-engine.ts`                                                                                                                                                                         |
| 5   | **Cerebrum**   | LLM Gateway & Inference                                    | `server/src/services/{llm,llm-scheduler,llm-router,llm-gateway-v2,llm-client}.ts`, `omniroute.ts`, `omniroute-bridge.ts`, `portkey-bridge.ts`, `brain.ts`, `vlm.ts`, `services/providers/**`, `services/unified-gateway/**`                                                                                                                                                                                                                                                                                                                                     |
| 6   | **Sentinel**   | Security Core, Crypto & Guardrails                         | `server/src/services/{guardrails,guardrail-types,guardrail-registry,guardrail-patterns,safety.service,security-posture,runtime-security,network-policy,crypto-suite,db-encryption,memory-encryption,file-watcher,data-classification,dlp-scanner,secrets-scanner,secret-rotator,cert-manager,vault,rate-limit.service}.ts`, `server/src/lib/{security,security-headers,zero-trust,mfa,geo-fence,jit-elevation,time-gate,crypto-sign,hsm-provider,env-sanitizer,container,tokens,auth-context,verify,rate-limit}.ts`, `server/src/scripts/audit-keys-leakage.ts` |
| 7   | **Aegis**      | Reliability, Resilience, Audit & Compliance                | `server/src/services/{audit-engine,audit-worker,audit-watchdog,audit-analytics,incident-response,breach-notifier,anomaly-detector,ransomware-detector,insider-threat,compliance-reporter,fairness-corrector,evidence-collector,cspm,supply-chain,vendor-assessor,vdp,siem-forwarder,blockchain}.ts`, `server/src/lib/{audit,auditing}.ts`, `routes/audit-routes.ts`                                                                                                                                                                                             |
| 8   | **Pulse**      | Self-Optimization & Improvement                            | `server/src/services/self-improvement-harness.ts`, `ranking-trainer.ts`, `services/self-opt/**` (index, types, tuners, telemetry, guardrail-guard, gap-items, controller, bootstrap, adapters), `routes/self-opt.ts`                                                                                                                                                                                                                                                                                                                                            |
| 9   | **Metron**     | Performance, Observability & Health                        | `server/src/services/{metrics,metrics-validation,tracing,trace-exporter,span-context,overhead-accounting,probe-harness,health-monitor,shadow-daemon}.ts`, `server/src/lib/{metrics,otel,monitoring,perf-cache,lru-cache}.ts`, `routes/{perf,analytics}.ts`                                                                                                                                                                                                                                                                                                      |
| 10  | **Artisan**    | DevEx, SDK, Skills, Marketplace & Plugins                  | `server/src/services/{marketplace.service,skill.service,skill-compiler,skill-template-engine,plugin-manifest,session.service,session-recorder,feedback.service,project.service,workspace-sync,sandbox,sandbox-worker,wasm-plugin-runtime}.ts`, `routes/marketplace-routes.ts`, `scripts/import-skills.ts`, `packages/sdk/src/{types,index,errors,client,bindings}.ts`, `packages/devtools/**`                                                                                                                                                                   |
| 11  | **Helix**      | Enterprise, Org/Tenant & Federated Mesh                    | `server/src/services/{enterprise.service,p2p-swarm}.ts`, `routes/enterprise.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 12  | **Prism**      | Primary Dashboard UI & State                               | `src/pages/*.tsx` (top-level), `src/components/**`, `src/store.ts`, `src/lib/*.ts` (frontend lib, except `os/` and `mcp.ts`), `src/lib/vault.ts`                                                                                                                                                                                                                                                                                                                                                                                                                |
| 13  | **Halcyon**    | OS Kernel Admin & Enterprise Admin Pages                   | `src/pages/os/**`, `src/pages/admin/**`, `src/osStore.ts`, `src/lib/os/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 14  | **Ferric**     | Rust Core, Config, Provider-Types & Providers              | `crates/core/**`, `crates/config/**`, `crates/provider-types/**`, `crates/providers/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 15  | **Rusty**      | Rust Tools, Safety, Installer, Observability, Search & CLI | `crates/tools/**`, `crates/safety/**`, `crates/installer/**`, `crates/observability/**`, `crates/nexus-search/**`, `crates/cli/**`, `crates/nexus-cli/**`                                                                                                                                                                                                                                                                                                                                                                                                       |
| 16  | **Tess**       | Tauri Desktop Shell                                        | `nexus-tauri/**` (both `src-tauri/` and `src/`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 17  | **Aeon**       | Protocols, MCP & External Connectors                       | `server/src/mcp.ts`, `server/src/mcp-http.ts`, `server/src/services/mcp-registry.ts`, `server/src/connectors/**`, `src/lib/mcp.ts`, `packages/sdk/src/acp.ts`, `packages/sdk/src/webhooks.ts`                                                                                                                                                                                                                                                                                                                                                                   |
| 18  | **Lorekeeper** | Docs, ADRs, Plans & Personas                               | `docs/**`, `README*`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `MASTER_MISSION_BRIEF.md`, `PLAN.md`, `REDEMPTION_PLAN.md`, `PHASES_11_30_MASTER_PLAN.md`, `PHASES_11_30_GAP_UPDATE.md`, `TASKBOARD.md`, `docs/PERSONA_REGISTRY.md`                                                                                                                                                                                                                                                                                                                     |
| 19  | **Quill**      | Quality, Testing & Merge Gate                              | `server/tests/**`, `tests/**` (root), `server/src/tests/**`, all `*.test.ts`/`*.spec.ts`, test helpers (`server/tests/helpers/**`), `server/vitest.config.ts`. Owns the merge gate.                                                                                                                                                                                                                                                                                                                                                                             |
| 20  | **Bastion**    | Build, CI/CD, Infra & Tooling Config                       | `Dockerfile*`, `docker-compose*`, `nginx*`, `entrypoint.sh`, `.github/workflows/**`, `vite.config.ts`, `vite.config.standalone.ts`, `tsconfig*.json`, `eslint.config.mjs`, `server/package.json` (dep bumps, sign-off), root `package.json` scripts, `routes/v3-upgrade.ts`, `scripts/{verify-system-readiness,profile-system-performance}.ts`, deploy docs (`docs/DEPLOYMENT.md`, `docs/PRODUCTION_CHECKLIST.md`, `docs/DR_RUNBOOK.md`)                                                                                                                        |

---

## 3. CODEOWNERS-equivalent enforcement

A root `CODEOWNERS` (to be added by **Bastion**, #20) maps each glob above to its agent so GitHub
blocks cross-namespace edits at review time. Until it lands, this document is the canonical mapping
and is treated as binding. The intended `CODEOWNERS` shape:

```
# Kernel / scheduler / runtime (Forge)
/server/src/services/kernel*.ts            @forge
/server/src/services/scheduler.ts          @forge
/server/src/services/task-worker.ts        @forge
/server/src/services/{message-bus,sse-bus,sse-bridge,sse,pipeline-executor,resource-quota,preemption-leak-guard,signal-hooks}.ts   @forge
/server/src/routes/{kernel,kernel-introspect,sse}.ts   @forge

# Orchestration (Atlas)
/server/src/services/{orchestrator,blackboard,dag-executor,planner,agent-dag,agent-runtime,agent-loop,agent-persistence,agent-permissions,consensus,deadlock-detector,workflow-dsl,conditional-router,merge-strategies,specialization-registry,action-registry,propagation,graph-engine,pipeline-io}.ts   @atlas
/server/src/routes/{agents,agent-lifecycle,a2a,automation}.ts   @atlas
/packages/a2a-server/**                    @atlas

# ... (one block per agent, mirroring §2) ...

# Docs / governance (Lorekeeper)
/docs/**                                   @lorekeeper
/README*                                   @lorekeeper

# Tests / merge gate (Quill)
/server/tests/**                           @quill
/**/*.test.ts                              @quill
/server/vitest.config.ts                   @quill

# Build / CI (Bastion)
/.github/workflows/**                      @bastion
/tsconfig*.json                            @bastion
/Dockerfile*                               @bastion
```

> **Review rule:** a PR editing a file whose `CODEOWNERS` owner ≠ the PR author is **blocked** unless
> the owner (or Leader) approves. This is the structural guarantee of collision-freedom.

---

## 4. FROZEN common infrastructure (Leader/Forge sign-off only — no agent edits without approval)

Shared-contract files that were the historical source of collisions. Agents consume them via public
exports only:

- `server/src/index.ts`, `app.ts`, `proxy.ts`, `routes.ts`, `services.ts`, `typings.d.ts`, `cli.ts`, `setup.ts`, `_probe_status.ts`
- `server/src/db/client.ts`, `db/schema.ts`, `db/schema-sqlite.ts`, `db/dev-schema.ts`
- `server/src/lib/{envelope,errors,id,hono-env,env,guards,http,zvalidator,schemas,strings,payload-limit,protocol-integration,logging,logger}.ts`
- `src/skill-registry.ts` (root shared skill registry)

---

## 5. Integration seams (collision-free coordination)

- **Kernel/scheduler seam:** the universal integration point is `enqueueTask(idempotencyKey)` +
  `pickByPolicy`. Atlas (DAG/orchestrator), Pulse (auto-tuner via setters `configureWorker` /
  `setSchedulingPolicy`), and Forge (kernel) coordinate through this seam without editing each
  other's code. Pulse tunes the loop via setters without touching loop code.
- **A2A envelope seam:** cross-agent RPC uses `A2AEnvelope` / `DagEvent` / `AgentCapability` from
  `@agentic-os/a2a-server` (ADR-0008). Extend there; do not duplicate.
- **Interface-only integration:** an agent consumes another area's functionality via its public
  exports; it never edits the producing file.

---

## 6. Perfection Bar (per area, zero compromise)

For its namespace, each owner must reach:

- `tsc` = 0 (fresh, `--incremental false`) — `cd server && npx tsc --noEmit --incremental false`.
- Its unit tests pass (`vitest run` for the agent's own area).
- Handlers return `c.json(ok/err)` with correct arity.
- **No stubs / TODO / FIXME** anywhere in the namespace.
- Real implementations; feature wired to the kernel/scheduler seam where applicable.
- Coverage ≥ 80% for new agents (per `docs/AGENT_DEV_GUIDE.md`).

> A phase is flipped to **COMPLETED** in `docs/PLAN_TRACKER.md` only when the owner confirms
> `tsc = 0` **and** no stubs in their namespace (Lorekeeper verifies before the flip; Leader ratifies).

---

## 7. Nonstop loop protocol (per agent)

Each agent runs the same continuous cycle forever:

1. **Pull** — next item from its area backlog (issue/PR labeled `<agent>`, open ADR/phase gap Phases
   11–20, or a `TODO`/`stub` discovered in its namespace).
2. **Implement** — real, production-grade code (no stubs), with unit tests for every new behavior.
3. **Local gate** — `tsc --noEmit` (fresh, `--incremental false`) = 0 AND `vitest run` for the
   agent's area passes.
4. **Open PR** — title prefixed with the agent name (e.g., `Forge: close GAP 11.13 ring-policy PATCH`).
5. **Merge gate (Quill)** — full `cd server && npm run validate` must be green; Quill blocks merge on
   any regression. Leader/human merges.
6. **Loop** — return to step 1. The loop never stops; idle agents pick the next highest-value area
   improvement (perf, coverage, docs, hardening).

---

## 8. Historical — v2 (9-agent predecessor, retained for traceability only)

> The 9-agent model below was superseded on 2026-07-09 by the 20-agent fleet (§2). It is kept so
> older audit/plan notes that reference "Atlas/Mnemosyne/Forge/Sentinel/Bastion/Artisan/Prism/Pulse/
> Lorekeeper" by 9-agent role still map. **Do not use §8 as the current contract.**

| Agent      | Area (v2)                               | Exclusive files (v2, paths pre-`server/` prefix)                                                                                                                                                                                                                                                         |
| ---------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forge      | Kernel + Scheduler + Runtime (Phase 11) | `src/services/kernel.ts`, `src/services/kernel-*.ts`, `src/services/scheduler.ts`, `src/services/pipeline-executor.ts`, `src/services/runtime/**`, `src/services/message-bus.ts`, `src/services/sse-bus.ts`                                                                                              |
| Mnemosyne  | Memory Systems (Phase 12)               | `src/services/memory-*.ts`, `src/db/schema-sqlite.ts` + `schema.ts` (memory/feedback tables only)                                                                                                                                                                                                        |
| Atlas      | Orchestration (Phase 13)                | `src/services/orchestrator.ts`, `blackboard.ts`, `dag-executor.ts`, `planner.ts`, `agent-dag.ts`, `consensus.ts`, `deadlock-detector.ts`, `workflow-dsl.ts`, `conditional-router.ts`, `merge-strategies.ts`, `specialization-registry.ts`, `agent-runtime.ts`, `routes/a2a.ts`, `packages/a2a-server/**` |
| Sentinel   | Security + Reliability (14/20)          | `src/services/security/**`, `src/services/reliability/**`, `src/lib/audit.ts`, `src/services/audit-*.ts`, `src/services/guardrails.ts`, `src/services/self-opt/gap-items.ts` (audit-side ONLY)                                                                                                           |
| Bastion    | Performance + Infra/CI (15)             | `src/services/performance/**`, `routes/perf.ts`, `server/package.json` (deps), `.github/workflows/**`, `vitest.config.ts`, `tsconfig`                                                                                                                                                                    |
| Artisan    | DevEx + Marketplace (16/19)             | `packages/sdk/**`, `packages/devtools/**`, `src/services/marketplace*.ts`, `routes/marketplace*.ts`, `src/services/skill-compiler.ts`, `src/services/plugin-registry.ts`                                                                                                                                 |
| Prism      | Enterprise + Frontend (17 + UI)         | `src/services/enterprise*.ts`, `routes/enterprise.ts`, `src/routes/enterprise*`, frontend `src/**` (React)                                                                                                                                                                                               |
| Pulse      | Self-Optimization (18)                  | `src/services/self-opt/**` (except `gap-items.ts` audit-side owned by Sentinel), `routes/self-opt.ts`, `src/services/self-opt.ts`                                                                                                                                                                        |
| Lorekeeper | Docs / ADRs / Plan-Tracking             | `docs/**`, `README*`; no source edits                                                                                                                                                                                                                                                                    |

---

_End of TEAM_OWNERSHIP_GOVERNANCE.md v3._
