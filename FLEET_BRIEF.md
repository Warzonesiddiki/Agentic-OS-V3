# FLEET BRIEF — NEXUS 2.0 / Agentic OS V3 (Fleet of 20, nonstop loop)

> ## RULE #1 — LOOP ENGINEERING DISCIPLINE (all work is AUTOMATIC)
>
> You (every agent) AND the dispatcher are autonomous loop-engineering control loops. No
> hand-holding between iterations. Run forever: TRIGGER -> ACT -> VERIFY -> REMEMBER -> CONTINUE.
>
> - **VERIFY** = run the fleet gate after EVERY change (from repo root):
>   `powershell -ExecutionPolicy Bypass -File fleet/verify-gate.ps1`
>   It writes the live `fleet/scoreboard.json` (server/root tsc + rust check + PERFECT flag) — the
>   fleet-level feedback signal.
> - **CLAIM** work from `fleet/BACKLOG.md` (append your claim) so no two agents double up.
> - The dispatcher owns the control plane (`fleet/` gate/scoreboard/backlog/contracts); you own your
>   namespace. Never edit outside it; never bypass VERIFY.

This file is the canonical operating brief for the 20-agent fleet. Each agent reads ONLY its own
section and edits ONLY its exclusive namespace. The dispatcher (Leader) reviews & merges; agents
never commit or push. Goal: EXTREME PERFECTION, ZERO COMPROMISES, via a nonstop improvement loop
where no two agents touch the same file.

PROJECT ROOT: C:\Users\Tahir\OneDrive\Desktop\nexus-20-ai-agent-os (7)\Agentic OS V3
BRANCH: feat/phases-11-20

================================================================================
COMMON OPERATING RULES (apply to every agent)
================================================================================

ENVIRONMENT GOTCHAS (learned the hard way — follow EXACTLY):

1. The default `node` on PATH is v9.9.1 and CRASHES on ESM `import`. ALWAYS prepend the hermes
   node first (PowerShell):
   $env:PATH = "C:\Users\Tahir\AppData\Local\hermes\node;" + $env:PATH
   Then run TS checks from server/:
   node ./node_modules/typescript/bin/tsc --noEmit --incremental false
2. The CodeGraph index, grep, and semantic_search tools are STALE and return FALSE results (they
   miss real files and match non-existent ones). DO NOT trust them. Verify every fact with
   power---file_read and PowerShell `Test-Path` before acting.
3. aider---run_prompt may intermittently return empty {'updatedFiles':[]} and create NO files. If
   it fails to modify files, FALL BACK to power---file_edit / power---file_write to apply the edit
   directly, then report that you used the fallback.
4. better-sqlite3 native module was built for a different Node ABI and blocks `vitest run` in this
   shell. For unit tests, PREFER tests that do NOT import the native DB module, or use the
   mock/helper path (server/tests/helpers: db-setup.ts, mock-llm.ts). Do not let this block you.
5. Rust (crates/, nexus-tauri/): run from repo root:
   cargo build --workspace
   cargo clippy --all-targets -- -D warnings
   cargo test --workspace
   The Rust tree is DECOUPLED from the running TS app (ADR-0007): editing crates does NOT change
   server/dashboard behavior, but keep it compiling & tested.

PERFECTION BAR (apply to every change):

- `tsc --noEmit --incremental false` = 0 (fresh) for the affected workspace; `cargo clippy -D
warnings` clean for Rust.
- REAL, production-grade implementations. NO stubs / TODO / FIXME / `throw new Error('not
implemented')`.
- Every new behavior gets a unit test. Target >=80% coverage for new code in your area.
- Hono handlers return `c.json(ok(...))` / `c.json(err(...))` with correct arity.
- TS strict mode + camelCase; Rust snake_case + thiserror (never `Box<dyn Error>`); structured
  logging (TS: src/lib/logging.ts `log`; Rust: `tracing`).
- Wire features to the kernel/scheduler seam (enqueueTask / pickNextTask) via the PUBLIC interface
  ONLY — never edit another agent's file.

HARD RULES:

- Edit ONLY your namespace files. NEVER touch FROZEN files:
  server/src/{index.ts,app.ts,proxy.ts,routes.ts,services.ts,typings.d.ts,cli.ts,setup.ts,
  _probe_status.ts}; server/src/db/{client,schema,schema-sqlite,dev-schema}.ts;
  server/src/lib/{envelope,errors,id,hono-env,env,guards,http,zvalidator,schemas,strings,
  payload-limit,protocol-integration,logging,logger}.ts; src/skill-registry.ts.
- If you need a change in a FROZEN file or another agent's namespace, STOP and report it to the
  dispatcher (Leader) — do not edit it.
- If a feature needs new DB tables/columns, DO NOT edit db/schema*.ts — propose the migration to
  the dispatcher and code against a graceful degradation path.
- Do NOT run `npm`/`pnpm install` (shared node_modules contention). Do not edit package.json
  (Bastion owns it) unless your namespace explicitly includes it.
- Do NOT commit or push.

NONSTOP LOOP PROTOCOL (repeat until told to stop):

1. PULL the next item from your backlog (your first-objectives below, then open ADR/phase gaps,
   then any TODO/stub discovered in your namespace).
2. IMPLEMENT real code + unit tests; verify with the relevant tsc/cargo command = 0.
3. REPORT briefly: what changed, files touched, test results, and the NEXT backlog item.
4. CONTINUE immediately. Do not idle.

================================================================================
LOOP ENGINEERING DISCIPLINE (how every agent must operate)
================================================================================

This fleet IS the application of AI-agent Loop Engineering (term coined June 2026 by Addy Osmani &
Boris Cherny): instead of being hand-prompted each turn, each agent designs and runs its OWN
autonomous loop that triggers, acts, verifies, remembers, and reruns itself. You are not a
one-shot executor — you are a self-sustaining control loop with a measurable setpoint (the
Perfection Bar). Distinct from harness engineering: the harness is the execution environment
(context, tool perms, retries, logging, state); loop engineering is the iterative orchestration
ON TOP of it. You own the loop; the platform provides the harness.

THE LOOP (run it continuously):
TRIGGER -> pick the next backlog item (first-objectives -> ADR/phase gaps -> TODOs/stubs).
ACT -> implement real code + unit tests (no stubs).
VERIFY -> `tsc --noEmit --incremental false` = 0 (or `cargo clippy -D warnings`). This is the
feedback signal (the "process variable"); deviations drive the next control action.
REMEMBER -> record what changed, decisions, and the next item (your report / backlog notes /
memory). Persist state so the next iteration is informed.
CONTINUE -> loop back to TRIGGER immediately. Do not idle.

SUBAGENT FAN-OUT (stacking & extending loops):
Within a single loop iteration you MAY parallelize well-scoped sub-tasks by spawning subagents: - PREFERRED: subagents---run_task (delegate a self-contained implementation/test slice). - FALLBACK: tasks---create_task for a background sub-task.
Rules for fan-out: - Every subagent you spawn MUST be pointed ONLY at files INSIDE your exclusive namespace. You
remain responsible for the result; a subagent editing outside your namespace is a breach. - Give each subagent a self-contained prompt (file paths + goal + the verify command). - Aggregate subagent outputs, verify the WHOLE area still compiles/tests, then continue.
If your toolset does not expose subagents---run_task / tasks---create_task, proceed sequentially
— the loop still holds.

ADVISORY GATE PATTERN (canonical example: server/src/services/self-opt/tuners.ts):
Pulse's tuners are the reference implementation of loop engineering in THIS repo: - propose() reads telemetry and emits a candidate delta. - evaluate() runs a significance gate (two-proportion z-test, p<0.05). - the commit goes through an adapter that is ADVISORY until the owner service exposes a live
runtime setter — so no tuner can destabilize a service it does not own.
Apply the same discipline to your own area: changes are proposed, verified against the gate
(compile + tests), and only then considered done. Never bypass the VERIFY step.

================================================================================
AGENT SECTIONS
================================================================================

## FORGE (1) — Kernel, Scheduler & Runtime Loop

NAMESPACE (edit ONLY these):
server/src/services/kernel*.ts, scheduler.ts, task-worker.ts, task-notifier.ts, message-bus.ts,
sse-bus.ts, sse-bridge.ts, sse.ts, pipeline-executor.ts, resource-quota.ts,
preemption-leak-guard.ts, signal-hooks.ts, routes/kernel.ts, routes/kernel-introspect.ts,
routes/sse.ts
FIRST OBJECTIVES:

- Wire Priority-Inheritance held-resources (11.4): implement inheritPriority/restorePriority with
  real lock/resource claims so PIP actually raises priority while a resource is held.
- Quantum context restore (11.6): implement restoreQuantumContext so cooperative yield/checkpoint
  (11.3) resumes correctly; round-trip unit tests.
- Cgroup budget enforcement gating (11.14): gate dispatch in pickNextTask on CgroupBudget; reject
  when over budget, with tests.
- Kernel state-machine route (11.10): add GET /api/kernel/state-machine returning the existing
  Mermaid generator output; wire + test.
- Hierarchical per-team scheduler (11.15) + targeted starvation scoring (11.21): replace blanket
  boost with starvation-scored promotion; wire into dispatch; tests.
- Fairness correction loop (11.22+): implement and test.
- Expose live runtime-loop setters (configureWorker, setSchedulingPolicy) consumed by Pulse.

## ATLAS (2) — Orchestration, DAG & Agent Runtime

NAMESPACE:
server/src/services/{orchestrator,blackboard,dag-executor,planner,agent-dag,agent-runtime,
agent-loop,agent-persistence,agent-permissions,consensus,deadlock-detector,workflow-dsl,
conditional-router,merge-strategies,specialization-registry,action-registry,propagation,
graph-engine,pipeline-io}.ts, routes/{agents,agent-lifecycle,a2a,automation}.ts,
packages/a2a-server/**
FIRST OBJECTIVES:

- Ensure agent-runtime.ts + agent-loop.ts are fully implemented (real loop: perceive→plan→act→
  reflect) with no stubs; unit tests for each transition.
- Integrate deadlock-detector.ts into the DAG executor with compensation; tests.
- Implement workflow-dsl.ts, conditional-router.ts, merge-strategies.ts, specialization-registry.ts,
  action-registry.ts, propagation.ts, graph-engine.ts, pipeline-io.ts as real modules; wire to
  orchestrator; tests.
- Extend packages/a2a-server per ADR-0008 (A2A packaging); ensure task-manager/client/card/auth
  compile and are tested.
- Wire orchestrator to Forge's kernel admission seam (enqueueTask) via the public interface only.

## MNEMOSYNE (3) — Memory Core & Recall

NAMESPACE:
server/src/services/memory-service.ts, memory-search-suggest.ts, memory-search-explanation.ts,
memory-nl-query.ts, memory-graph-browser.ts, memory-attachments.ts, memory-batch.ts,
memory-tag-taxonomy.ts, memory-cluster.ts, memory-clustering.ts, memory-causal-chains.ts,
memory-contradiction.ts, memory-conflict-resolver.ts, memory-provenance.ts, memory-dedup.ts,
memory-privacy-zones.ts, memory-multilingual.ts, memory-multimodal.ts, recall.ts,
federated-recall.ts, embeddings.ts, routes/memory*.ts
FIRST OBJECTIVES:

- Your namespace already compiles (tsc=0). Ensure every memory-*.ts is a REAL implementation with
  no stubs and is WIRED (routes mounted; called by the recall pipeline where relevant).
- memory-clustering.ts / memory-cluster.ts: real clustering + membership; tests.
- memory-contradiction.ts / memory-conflict-resolver.ts / memory-causal-chains.ts: real detection +
  resolution; tests.
- memory-dedup.ts, memory-privacy-zones.ts, memory-multimodal.ts, memory-graph-browser.ts,
  memory-batch.ts, memory-tag-taxonomy.ts, memory-provenance.ts, memory-nl-query.ts,
  memory-search-suggest.ts, memory-search-explanation.ts: real impls + tests.
- Confirm recall.ts / federated-recall.ts / embeddings.ts integrate the above; extend
  server/tests/federated-recall.test.ts.
- If a feature needs new `memories` columns, DO NOT edit db/schema.ts — propose migration to
  dispatcher.

## LETHE (4) — Memory Lifecycle, Training & Maintenance

NAMESPACE:
server/src/services/{memory-decay,memory-forget,memory-hierarchy,memory-templates,memory-quota,
memory-fragmentation,memory-cold-storage,memory-backup,memory-anomaly,memory-stitcher,
memory-consolidation,memory-priming,memory-rehearsal,memory-emotion,memory-export-v3,
memory-diff-sync,memory-trainer}.ts, consolidation.ts, consolidation-budget.ts, dedup-engine.ts
FIRST OBJECTIVES:

- Real implementations + tests for each: decay (exponential), forget, hierarchy (tiering), templates,
  quota, fragmentation, cold-storage, backup, anomaly, stitcher, consolidation, priming, rehearsal,
  emotion, export-v3, diff-sync, memory-trainer.
- consolidation.ts + consolidation-budget.ts + dedup-engine.ts: wire to Mnemosyne's recall/
  consolidation path via the public interface; tests.
- Ensure all are invoked (a scheduler/cron hook or a service entry the kernel/loop calls). Coordinate
  callable entry points with the dispatcher.

## CEREBRUM (5) — LLM Gateway & Inference

NAMESPACE:
server/src/services/{llm,llm-scheduler,llm-router,llm-gateway-v2,llm-client,omniroute,
omniroute-bridge,portkey-bridge,brain,vlm}.ts, providers/**, unified-gateway/**
FIRST OBJECTIVES:

- Every provider adapter in services/providers/* (openai, anthropic, google, ollama, vllm, m3)
  implements the ProviderAdapter contract from llm-gateway-v2.ts with real request/response,
  streaming, retries, token counting, cost tracking; no stubs; tests with mocks.
- llm-router.ts + llm-gateway-v2.ts + llm-client.ts + llm-scheduler.ts: real routing/fallback/
  load-shedding; tests.
- brain.ts + vlm.ts: real inference orchestration; tests.
- unified-gateway/portkey/*: real client/types; tests.
- NOTE: the omniroute security-circumvention docs were DELETED (see AGENTS.md omniroute verdict). Do
  NOT reintroduce them; keep omniroute/omniroute-bridge wired but clean.

## SENTINEL (6) — Security Core, Crypto & Guardrails

NAMESPACE:
server/src/services/{guardrails,guardrail-types,guardrail-registry,guardrail-patterns,
safety.service,security-posture,runtime-security,network-policy,crypto-suite,db-encryption,
memory-encryption,file-watcher,data-classification,dlp-scanner,secrets-scanner,secret-rotator,
cert-manager,vault,rate-limit.service}.ts, lib/{security,security-headers,zero-trust,mfa,
geo-fence,jit-elevation,time-gate,crypto-sign,hsm-provider,env-sanitizer,container,tokens,
auth-context,verify,rate-limit}.ts, scripts/audit-keys-leakage.ts
FIRST OBJECTIVES:

- Real implementations + tests for all guardrail modules (registry/patterns/types) and safety.service;
  wire into the request flow.
- crypto-suite.ts, db-encryption.ts, memory-encryption.ts, cert-manager.ts, secret-rotator.ts,
  hsm-provider.ts: real crypto (scrypt/constant-time, AES-GCM), key rotation; tests.
- zero-trust.ts, mfa.ts, geo-fence.ts, jit-elevation.ts, time-gate.ts, tokens.ts, auth-context.ts,
  verify.ts, env-sanitizer.ts, container.ts, rate-limit.ts, security-headers.ts: real impls + tests.
- dlp-scanner.ts, secrets-scanner.ts, data-classification.ts, file-watcher.ts, network-policy.ts,
  security-posture.ts, runtime-security.ts: real scanners + tests.
- vault.ts: real secret store (integrates crypto-suite); tests. scripts/audit-keys-leakage.ts: runnable.

## AEGIS (7) — Reliability, Resilience, Audit & Compliance

NAMESPACE:
server/src/services/{audit-engine,audit-worker,audit-watchdog,audit-analytics,incident-response,
breach-notifier,anomaly-detector,ransomware-detector,insider-threat,compliance-reporter,
fairness-corrector,evidence-collector,cspm,supply-chain,vendor-assessor,vdp,siem-forwarder,
blockchain}.ts, lib/{audit,auditing}.ts, routes/audit-routes.ts
FIRST OBJECTIVES:

- audit-engine.ts + audit-worker.ts + audit-watchdog.ts: hash-chained append-only audit (SHA-256),
  real worker loop; tests. (supply-chain.ts had 7 undefined-guard errors in an older ledger —
  verify clean now and harden.)
- incident-response.ts, breach-notifier.ts, anomaly-detector.ts, ransomware-detector.ts,
  insider-threat.ts, compliance-reporter.ts, fairness-corrector.ts, evidence-collector.ts, cspm.ts,
  vendor-assessor.ts, vdp.ts, siem-forwarder.ts, blockchain.ts: real impls + tests.
- reliability/* (circuit-breaker-registry etc., if present): ensure circuit-breaker-registry has the
  `name` field; real circuit breaking; tests.
- routes/audit-routes.ts: wire all audit endpoints with correct ok/err arity; tests.
- chaos/SLO/healing modules: implement where present; tests.

## PULSE (8) — Self-Optimization & Improvement

NAMESPACE:
server/src/services/self-improvement-harness.ts, ranking-trainer.ts, self-opt/**, routes/self-opt.ts
FIRST OBJECTIVES:

- The 5 tsc errors in self-opt/tuners.ts are FIXED (gate is green) — do not revisit.
- self-opt/*: ensure index, types, tuners, telemetry, guardrail-guard, gap-items, controller,
  bootstrap, adapters are real and compile; tests.
- self-improvement-harness.ts + ranking-trainer.ts: real auto-tuner control plane that tunes the
  runtime loop live via PUBLIC setters (configureWorker, setSchedulingPolicy) from Forge — never edit
  Forge's files; tests.
- routes/self-opt.ts: wire endpoints; tests.
- Document the interface-only integration contract with Forge.

## METRON (9) — Performance, Observability & Health

NAMESPACE:
server/src/services/{metrics,metrics-validation,tracing,trace-exporter,span-context,
overhead-accounting,probe-harness,health-monitor,shadow-daemon}.ts, lib/{metrics,otel,monitoring,
perf-cache,lru-cache}.ts, routes/{perf,analytics}.ts
FIRST OBJECTIVES:

- metrics.ts, metrics-validation.ts, tracing.ts, trace-exporter.ts, span-context.ts,
  overhead-accounting.ts, probe-harness.ts, health-monitor.ts, shadow-daemon.ts: real
  OTel-compatible impls + tests.
- lib/metrics.ts, otel.ts, monitoring.ts, perf-cache.ts, lru-cache.ts: real caches/metrics; tests.
- routes/perf.ts, routes/analytics.ts: wire endpoints; tests.
- Stateless pool / replica router / cache (Phase 15) modules where present: real impls; tests.

## ARTISAN (10) — DevEx, SDK, Skills, Marketplace & Plugins

NAMESPACE:
server/src/services/{marketplace.service,skill.service,skill-compiler,skill-template-engine,
plugin-manifest,session.service,session-recorder,feedback.service,project.service,workspace-sync,
sandbox,sandbox-worker,wasm-plugin-runtime}.ts, routes/marketplace-routes.ts,
scripts/import-skills.ts, packages/sdk/src/{types,index,errors,client,bindings}.ts, packages/devtools/**
FIRST OBJECTIVES:

- marketplace.service.ts + routes/marketplace-routes.ts: REAL backend (list/publish/install/rate,
  reviews) — no stubs; tests. (An older ledger showed marketplace.service.ts had 1 error — verify
  clean.)
- skill.service.ts, skill-compiler.ts, skill-template-engine.ts, plugin-manifest.ts: real skill
  compile/validate; tests.
- session.service.ts, session-recorder.ts, feedback.service.ts, project.service.ts,
  workspace-sync.ts: real impls; tests.
- sandbox.ts, sandbox-worker.ts, wasm-plugin-runtime.ts: real sandbox + WASM plugin execution; tests.
- packages/sdk/src/{types,index,errors,client,bindings}.ts: complete, typed SDK; tests.
  packages/devtools/**: real devtools; tests.
- scripts/import-skills.ts: runnable.

## HELIX (11) — Enterprise, Org/Tenant & Federated Mesh

NAMESPACE:
server/src/services/{enterprise.service,p2p-swarm}.ts, routes/enterprise.ts
FIRST OBJECTIVES:

- enterprise.service.ts: REAL OIDC/SAML, RBAC, multi-tenant orgs/workspaces, billing hooks — no
  stubs; tests. (Older ledger: 6 errors — verify clean now.)
- p2p-swarm.ts: real federated mesh (peer discovery, sync); tests.
- routes/enterprise.ts: wire endpoints with correct ok/err arity; tests.

## PRISM (12) — Primary Dashboard UI & State

NAMESPACE:
src/pages/_.tsx, src/components/\**, src/store.ts, src/lib/_.ts (except os/ and mcp.ts), src/lib/vault.ts
FIRST OBJECTIVES:

- Root tsc=0 (verified). Ensure every page/component is functional and wired to the backend API (no
  dead UI, no placeholder buttons).
- Fix known gap: src/lib/types.ts only exports Envelope — pages importing Memory/MemoryInput/
  MEMORY_KINDS must use ApiMemory from src/lib/api-types.ts (canonical). Reconcile imports; tests.
- Charts: there is NO charting library in the repo — visualize with Tailwind CSS bars / custom SVG /
  motion only.
- src/store.ts: ensure zustand/jotai/react-query state is complete and consistent; tests.
- Add/extend component unit tests (Vitest + RTL) to raise coverage.

## HALCYON (13) — OS Kernel Admin & Enterprise Admin Pages

NAMESPACE:
src/pages/os/**, src/pages/admin/**, src/osStore.ts, src/lib/os/**
FIRST OBJECTIVES:

- Ensure all src/pages/os/* (Kernel, Analytics, Approvals, Cli, Dream, Graph, LiveAgents, Evals) and
  src/pages/admin/* are fully functional and wired to backend.
- src/osStore.ts + src/lib/os/*: complete kernel-admin state + operations; tests.
- No stubs; every control (kill-switch, ring policy, scheduler policy, approvals) calls the real API.

## FERRIC (14) — Rust Core, Config, Provider-Types & Providers

NAMESPACE:
crates/core/**, crates/config/**, crates/provider-types/**, crates/providers/**
FIRST OBJECTIVES:

- Keep cargo build/clippy/test green for these crates.
- crates/provider-types: canonical types (conversation, thinking, formats openai/anthropic/ollama/
  ollama_responses, request_log, retry, mcp_utils, canonical registry/name_builder/model, json,
  base, errors, utils, permission, goose_mode) — real, consistent; tests.
- crates/providers: real provider clients (openai, anthropic, ollama, openai_compatible, api_client,
  stream, tokens, http_status, declarative) implementing ProviderAdapter-like traits; tests (mock
  HTTP).
- crates/core (types, error via thiserror AgenticError), crates/config (config/engine/provider/
  skill): real config loading/validation; tests.
- NOTE: Rust is decoupled from TS app (ADR-0007); editing here does not change server behavior, but
  keep it production-grade & tested.

## RUSTY (15) — Rust Tools, Safety, Installer, Observability, Search & CLI

NAMESPACE:
crates/tools/**, crates/safety/**, crates/installer/**, crates/observability/**,
crates/nexus-search/**, crates/cli/**, crates/nexus-cli/**
FIRST OBJECTIVES:

- Keep cargo build/clippy/test green.
- crates/safety: real safety_checker (injection, jailbreak, pii, profanity) — real detectors + tests.
- crates/tools: tool registry/lifecycle/builtin/tool — real registry; tests.
- crates/installer: download/installer/self_update — real; tests.
- crates/observability: real tracing/metrics; tests.
- crates/nexus-search: real semantic search; tests.
- crates/cli + crates/nexus-cli: real CLI commands; tests.

## TESS (16) — Tauri Desktop Shell

NAMESPACE:
nexus-tauri/**
FIRST OBJECTIVES:

- Ensure nexus-tauri/src-tauri/{lib.rs,main.rs,build.rs} + nexus-tauri/src/{App.tsx,vite.config.ts}
  build and run; `cargo build` in src-tauri green.
- Wire the desktop shell to the backend (API/WS) — no dead UI; real commands/events.
- Add tests for Rust command handlers / TS components where feasible.

## AEON (17) — Protocols, MCP & External Connectors

NAMESPACE:
server/src/mcp.ts, mcp-http.ts, services/mcp-registry.ts, connectors/**, src/lib/mcp.ts,
packages/sdk/src/acp.ts, packages/sdk/src/webhooks.ts
FIRST OBJECTIVES:

- mcp.ts + mcp-http.ts + mcp-registry.ts: full MCP server (14 tools, 4 resource URI patterns) — real
  impls, no stubs; tests.
- connectors/** (e.g. hermes.ts): real connector adapters; tests.
- src/lib/mcp.ts (frontend) + packages/sdk/src/acp.ts (Agent Client Protocol) + webhooks.ts: real,
  typed; tests.
- Ensure MCP tools are registered and callable end-to-end; extend with new tools as needed.

## LOREKEEPER (18) — Docs, ADRs, Plans & Personas

NAMESPACE:
docs/**, README*, CHANGELOG.md, CONTRIBUTING.md, SECURITY.md, MASTER_MISSION_BRIEF.md, PLAN.md,
REDEMPTION_PLAN.md, PHASES_11_30_MASTER_PLAN.md, PHASES_11_30_GAP_UPDATE.md, TASKBOARD.md
FIRST OBJECTIVES:

- Keep docs coherent with ACTUAL repo state (the "Current Reality" block in AGENTS.md is the
  coherence anchor). Correct any doc claiming something the code does not do.
- ADRs 0001–0009 are referenced; 0002/0003/0006 are MISSING from docs/adr/ — author them (or mark
  reserved with rationale) in consultation with the owning agents.
- Maintain PLAN_TRACKER.md as the single source of truth: after each fleet wave, update the tsc error
  ledger and phase statuses with GROUND TRUTH (verify via tsc; don't trust stale numbers).
- PERSONA_REGISTRY.md: keep aligned with ADR-0008 AgentCapability and the fleet.

## QUILL (19) — Quality, Testing & Merge Gate

NAMESPACE:
server/tests/**, tests/** (root), server/src/tests/**, _.test.ts/_.spec.ts, server/tests/helpers/**,
server/vitest.config.ts
FIRST OBJECTIVES:

- Own the MERGE GATE. Ensure each agent's area has real unit tests and >=80% coverage for new code.
- IMPORTANT: vitest is currently blocked by a better-sqlite3 Node-ABI mismatch in THIS shell. Prefer
  tests that don't import the native DB module; use server/tests/helpers (db-setup, mock-llm) and
  mocks. Coordinate with Bastion to rebuild the native module so `pnpm run validate` can go green.
- Do NOT edit production code outside test files (your namespace is tests only). If you find a bug in
  production code, report it to the dispatcher with the owning agent — do not patch their files.
- Add/extend tests for any stub/low-coverage area you discover; track coverage.

## BASTION (20) — Build, CI/CD, Infra & Tooling Config

NAMESPACE:
Dockerfile*, docker-compose*, nginx*, entrypoint.sh, .github/workflows/**, vite.config.ts,
vite.config.standalone.ts, tsconfig*.json, eslint.config.mjs, server/package.json, root
package.json scripts, server/src/routes/v3-upgrade.ts, scripts/{verify-system-readiness,
profile-system-performance}.ts, docs/DEPLOYMENT.md, docs/PRODUCTION_CHECKLIST.md, docs/DR_RUNBOOK.md
FIRST OBJECTIVES:

- Ensure `pnpm run validate` (lint + typecheck + test + build) can go GREEN. Currently blocked ONLY
  by the better-sqlite3 Node-ABI mismatch (native module built for ABI 127, runtime is 147). Rebuild
  better-sqlite3 for the runtime Node (or pin Node) so `vitest run` works; verify.
- CODEOWNERS (just created) is the collision-free map — ensure CI enforces it (add a check or document
  the review rule).
- Dockerfile*/docker-compose*/nginx*/entrypoint.sh: production-ready, multi-stage, non-root;
  tests/smoke where feasible.
- .github/workflows/**: CI must run pnpm -r lint/typecheck/test/build and enforce CODEOWNERS/merge
  gate.
- tsconfig*/eslint.config.mjs/vite.config*: strict, consistent.
- scripts/verify-system-readiness.ts + profile-system-performance.ts: runnable; routes/v3-upgrade.ts
  wired.
- deploy docs (DEPLOYMENT/PRODUCTION_CHECKLIST/DR_RUNBOOK): accurate to current deploy path.
