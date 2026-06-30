# AGENTIC OS V3 — 100× UPGRADE MASTER PLAN

> **Mission:** Take NEXUS 2.0 / Agentic-OS-V3 from a 50-agent capability surface to a **self-improving, federated, plugin-extensible, multi-modal Agentic Operating System** that is *demonstrably* 100× more capable, more autonomous, and more developer-friendly than the current shipping baseline.
>
> **Operating constraint:** All build work executes through **one agent on aioncli/aionr**. No other CLIs (npm / docker / git / pnpm / yarn / cargo / go) at the agent runtime. Source-of-truth is the file system; CI runs in aionr-side runners.
>
> **North-star metric:** A 100× upgrade means **each unit of developer effort produces 100× more capability** — through (a) autonomous self-improvement, (b) a federated knowledge graph, (c) a WASM plugin runtime that turns the OS into a platform, (d) a multi-provider LLM gateway, and (e) a visual pipeline builder that lets non-engineers compose agents.

---

## 1. Where We Are Today (Baseline)

The audited baseline (`Agentic-OS-V3-audit-fresh/` @ 3415e20) has:

| Surface | State |
| --- | --- |
| Multi-agent microkernel (kernel.ts) | ✅ Working, but P0 hardening needed |
| 19 Drizzle tables, PGlite + Postgres dual-mode | ✅ Schema OK, indexing & FK tightening needed |
| Hono HTTP server, OTEL tracing, Prometheus | ✅ Wired but not end-to-end verified |
| MCP server (`@modelcontextprotocol/sdk`) | ✅ Tools ship; auth gap (no API-key) |
| libp2p swarm, viem chain listener | ✅ Working in dev; no gossip signing |
| Skill compiler (compiled-scripts hot-swap) | ✅ Working; no on-disk caching tier |
| Brain / recall / vault / sandbox | ✅ Functional; recall uses `LIKE '%q%'` (P0) |
| Frontend (React 19 + Vite 7 + Tailwind 4) | ✅ Compiles; no virtual scroll, no code-split |
| Shadow daemon, desktop actuator, browser, VLM | ✅ Real code, no integration tests |
| **Llm-router** | ⚠️ Single-provider stub; falls back to "echo" silently |
| **Plugin runtime** | ❌ Only in-process modules; no sandbox |
| **Federated recall** | ❌ Roadmap only — no protocol |
| **A2A signed RPC** | ❌ All RPC is plaintext |
| **Self-improvement harness** | ❌ No metric → action loop |
| **Visual pipeline builder** | ❌ None — only JSON config |
| **Voice UI** | ❌ Roadmap only |

**Bottom line:** the kernel is real, but the OS is still **single-instance, single-provider, in-process-only, manually-tuned**. The 100× upgrade is the leap from "an agent OS" to "an agent platform".

---

## 2. The 100× Upgrade — Five Pillars

### Pillar I — Self-Improvement Harness (the heart of "100×")
The OS monitors its own runtime metrics (latency p50/p95/p99, queue depths, tool error rates, LLM token spend, cache hit ratio) and **proposes + tests + applies** improvements autonomously.

- Loop: `metric → regression detector → hypothesis → A/B test → safe rollout`
- Proposals land as Drizzle `improvement_proposals` rows; Sentinel reviews BLOCKING ones.
- First proposal types: connection-pool right-sizing, recall query rewrite, cache TTL tuning, GC schedule.

### Pillar II — WASM Plugin Runtime
Turn the OS into a platform. Third parties (or this agent) ship plugins as `.wasm` blobs with a signed manifest. Plugins execute in a **sandbox** (WASI + capability token) and may only call tools permitted by their manifest.

- Manifest schema: `plugin.toml` (capabilities, version, author pubkey, SHA-256).
- Plugin store: signed IPFS / local CAS, content-addressed.
- Hot-load / hot-unload; default-deny; every plugin call goes through the audit engine.

### Pillar III — Federated Recall Protocol
A privacy-preserving protocol so multiple NEXUS instances can **share memories without leaking raw content**.

- Wire format: gossipsub topic `nexus.recall.v1`.
- Payload: `MemoryProof = hash(content) ‖ embedding ‖ topic_tags ‖ origin_pubkey ‖ sig`.
- Recipient decides locally whether to materialize (privacy budget per topic).
- Trust via signed provenance + rate limits.

### Pillar IV — Multi-Provider LLM Gateway v2
Today the llm-router silently falls back to "echo". The upgrade makes routing **observable, cost-aware, model-aware, and provider-pluggable**.

- Providers: OpenAI, Anthropic, Google, Ollama, llama.cpp, vLLM (OpenAI-compat), M3 (aionr-side).
- Routing keys: cost, latency, capability (vision, tools, 1M context).
- Fallback chain with circuit breakers.
- **Token-budgeted sessions** with hard kill switches.
- **Stream-stable**: SSE → React without backpressure loss.

### Pillar V — Visual Pipeline Builder + Plugin Marketplace UI
Two complementary front-end surfaces that turn the OS into something a non-engineer can use.

- **Pipeline Builder** (drag-drop): chain `Trigger → Agent → Tool → Guardrail → Output`. Each node renders its config inline. Saves to `pipelines` table; `executor.ts` interprets the DAG.
- **Plugin Marketplace**: browse/search/install signed plugins from local + remote stores. One-click enable/disable. Star ratings.

---

## 3. Delivery Phases (single-agent, sequential)

| Phase | Scope | Output files | Single-agent budget |
| --- | --- | --- | --- |
| **0. Foundation** | Apply P0 fixes from the audit manual (lint, schema, ACL, env validation, audit). | edits across `server/src/**` | 1 PR |
| **1. Perf** | Apply perf manual (indexes, cache tier, OTEL/Prom, frontend virtualization, code-split). | edits + migration `0042_perf_indexes.sql` | 1 PR |
| **2. Self-Improvement Harness** | New service + proposals table + regression detector. | `self-improvement-harness.ts`, `proposals.ts`, migration `0043_proposals.sql`, route, page. | 1 PR |
| **3. WASM Plugin Runtime** | New runtime + manifest validator + plugin store + audit hook. | `wasm-plugin-runtime.ts`, `plugin-store.ts`, `plugin-manifest.ts`, migration `0044_plugins.sql`, route, page. | 1 PR |
| **4. Federated Recall** | New protocol + gossip handler + privacy budget. | `federated-recall.ts`, `memory-proof.ts`, route, page. | 1 PR |
| **5. LLM Gateway v2** | Provider adapters + circuit breaker + budgeted sessions. | `llm-gateway-v2.ts`, `providers/{openai,anthropic,google,ollama,vllm,m3}.ts`, `circuit-breaker.ts`. | 1 PR |
| **6. Pipeline Builder** | DAG executor + drag-drop UI. | `pipeline-executor.ts`, `pages/PipelineBuilder.tsx`, migration `0045_pipelines.sql`. | 1 PR |
| **7. Plugin Marketplace UI** | Browse/install UI backed by the runtime. | `pages/PluginMarketplace.tsx`. | 1 PR |
| **8. Voice UI** | WebRTC capture + Whisper / M3 streaming STT → agent. | `services/voice.ts`, `pages/VoiceConsole.tsx`. | 1 PR |
| **9. Docs + ADRs** | Update MASTER_SPEC, README, runbooks. | markdown | 1 PR |

Each PR is mergeable independently. Sentinel BLOCKING findings from the harness pause the next PR until cleared.

---

## 4. What 100× Looks Like — Concrete Numbers

| Capability | Baseline | After 100× |
| --- | --- | --- |
| LLM providers | 1 (stub-echo fallback) | 6 (OpenAI/Anthropic/Google/Ollama/vLLM/M3) |
| Plugin runtime | in-process only | WASM-sandboxed, signed, content-addressed |
| Recall | single-node `LIKE` | federated across instances, semantic + lexical |
| Self-tuning | manual | automated A/B + rollout |
| Pipeline authoring | JSON in DB | visual DAG builder |
| Audit | hash-chained DB rows | hash-chained DB + signed WASM receipts |
| KB reach | one repo | one repo + plugin marketplace |
| Front-end cold-start | monolith bundle | per-route code-split + virtual scroll |
| p95 recall | unmeasured | measured, alerted, self-tuned |
| Dev velocity | 1 engineer-week per feature | 1 engineer-day per feature (after platform) |

The last two rows are the actual 100×: dev velocity and observability. Everything else makes that possible.

---

## 5. Architecture After 100×

```
                    ┌──────────────────────────────────────────┐
                    │          Visual Pipeline Builder         │
                    │  (drag-drop DAG → DB → executor.ts)      │
                    └────────────────┬─────────────────────────┘
                                     │
                                     ▼
   ┌──────────────────────────────────────────────────────────────┐
   │              NEXUS KERNEL (microkernel.ts)                   │
   │  scheduler · ACL · context-switch · audit · A2A signed RPC    │
   └──┬──────────────┬──────────────┬──────────────┬───────────────┘
      │              │              │              │
      ▼              ▼              ▼              ▼
 ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌────────────┐
 │  LLM    │   │  WASM    │   │ Federated│   │  Self-     │
 │ Gateway │   │  Plugin  │   │  Recall  │   │ Improve-   │
 │  v2     │   │  Runtime │   │ Protocol │   │ ment       │
 │ 6 provs │   │ (sandbox)│   │ (gossip) │   │ Harness    │
 └─────────┘   └──────────┘   └──────────┘   └────────────┘
      │              │              │              │
      └──────────────┴──────────────┴──────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────┐
                  │  Drizzle / PGlite / Postgres   │
                  │  23 tables + 4 migrations      │
                  └────────────────────────────────┘
```

---

## 6. Safety Model — Non-Negotiable

- **Default-deny** for every new capability (plugin, federated peer, provider).
- **All** mutations land in the hash-chained audit log.
- **Sentinel review** is required for any proposal with `risk_class ∈ {BLOCKING, network, fs.write}`.
- **Quarantine ring 4** is one-call; ring 4 cannot mutate.
- **Plugin manifests** must be signed by a publisher key in the trust store or they don't load.
- **Federated recall** never exfiltrates raw content — only `MemoryProof` envelopes.

---

## 7. What This Plan Is NOT

- Not a rewrite. We layer on top of the audited baseline.
- Not a research project. Every Pillar ships behind a feature flag and a roll-back path.
- Not "AI generates code". The agent on aioncli/aionr writes the code; humans review the diffs. Sentinel is the human-side gate.
- Not a single big-bang PR. Each Pillar is its own mergeable unit.

---

## 8. Success Criteria

1. All nine phases merged behind feature flags.
2. Sentinel reports zero BLOCKING findings open at end of phase 9.
3. Self-improvement harness has shipped ≥3 auto-proposals in staging.
4. Federated recall has ≥2 nodes exchanging ≥100 memory-proofs/day without privacy-budget violations.
5. WASM plugin runtime has ≥1 community plugin installed and audited.
6. LLM gateway v2 routes across ≥3 providers with measured p95 < 800 ms.
7. Pipeline builder has ≥1 user-built pipeline executing end-to-end.

When those are green, **NEXUS 3.0** ships.

---

*Document version 1.0 · Owner: Atlas · Status: ACTIVE BUILD*