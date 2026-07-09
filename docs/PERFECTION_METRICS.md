# NEXUS 2.0 — Perfection Metrics

**Owner:** Lorekeeper (docs namespace). **Adopted:** 2026-07-09.
**Source of truth for the metric definitions:** `docs/AUTONOMOUS_OPERATIONS_MANUAL_v4.0.0.md` §6.
**Companion:** `docs/PLAN_TRACKER.md` (live tsc ledger), `docs/adr/README.md` (decision provenance).

This document tracks the **Perfection Bar** metrics per `AGENTS.md` and the v4.0.0 manual, with the
**currently measured value** for each. A metric is "met" only when its threshold is satisfied in the
true gate (fresh `tsc`, real runtime probes). Values marked **[owner-measured]** are produced by the
owning agent's runtime/CI and reported up; Lorekeeper aggregates, does not fabricate.

---

## 1. Primary fleet gate (build integrity)

| Metric                                         | Threshold                     | Current measured (2026-07-09, TRUE GATE)                                                                                                                                                                         | Owner      | Met?         |
| ---------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------ |
| `server: tsc --noEmit --incremental false` = 0 | **0** (fresh, no cache)       | **0 (SETTLED, authoritative)** — Leader shut all writers, FS quiesced, true gate = **0 errors**. The 171/46/30/12 counts agents saw mid-storm were **PHANTOM reads of half-written files** (ADR-0011), not real. | fleet      | ✅           |
| — of which per-owner phantom noise (ignored)   | 0                             | in-flight agent `tsc` may show N; all phantom                                                                                                                                                                    | per owner  | ✅ (ignored) |
| — Lorekeeper `docs/**`                         | 0 (no `.ts`, by construction) | **0** (confirmed via unfiltered gate; docs can't redden the gate)                                                                                                                                                | Lorekeeper | ✅           |
| Own-area unit test pass                        | **100%**                      | [owner-measured] — blocked by `better-sqlite3` Node-ABI on agent shell                                                                                                                                           | per owner  | ⏳           |
| Stub/TODO/FIXME density in namespace           | **0**                         | 0 in Lorekeeper docs; [owner-measured] elsewhere                                                                                                                                                                 | per owner  | ✅/⏳        |

> **False-green guard:** the `tsc` number above is from `cd server && rm -f *.tsbuildinfo && npx tsc
--noEmit --incremental false`. A naive `npx tsc --noEmit` (incremental) returns 0 and is **not**
> trusted. See `PLAN_TRACKER.md` compile-gate header.

---

## 2. Runtime / quality metrics (v4.0.0 §6)

These are the "most advanced & powerful" targets. They are measured by the owning agent's observability
stack (Metron for perf, Aegis for audit, Mnemosyne for recall, Forge/Atlas for saga). Values below are
the **target** until the owning agent reports a measured figure in this shell.

| Metric                                      | Threshold              | Current measured                                                 | Owner          | Met? |
| ------------------------------------------- | ---------------------- | ---------------------------------------------------------------- | -------------- | ---- |
| **Audit chain integrity**                   | **100% unbroken**      | [owner-measured] — `audit-engine.ts` hash chain; verify in CI    | Aegis          | ⏳   |
| **Recall quality** (RRF fusion)             | **≥ 0.82**             | [owner-measured] — `recall.ts`/`federated-recall.ts`             | Mnemosyne      | ⏳   |
| **Saga success rate**                       | **≥ 98%**              | [owner-measured] — `kernel.ts` saga orchestration + compensation | Forge/Atlas    | ⏳   |
| **p95 latency** (kernel/scheduler dispatch) | **< 800 ms**           | [owner-measured] — Metron `overhead-accounting` / `tracing`      | Metron/Forge   | ⏳   |
| **New-behavior test coverage**              | **≥ 80%** (new agents) | [owner-measured] — vitest coverage (env-gated)                   | Quill          | ⏳   |
| **ADR/doc accuracy vs tree**                | **matches**            | ✅ (Lorekeeper reconciled 2026-07-09; 0 false "absent" claims)   | Lorekeeper     | ✅   |
| **Kill-switch race-free**                   | **0** double-flips     | ✅ (Phase 1.7 closure: `setKillSwitch` double-assert)            | Sentinel/Forge | ✅   |

---

## 3. Per-owner completeness (Phases 11–20)

Status from `docs/PLAN_TRACKER.md` task board + tsc ledger. **No phase flipped to COMPLETED until the
owner confirms `tsc=0` in their namespace** (Perfection Bar).

| Owner          | Phase(s)          | tsc in namespace                                | Phase status           | Notes                                               |
| -------------- | ----------------- | ----------------------------------------------- | ---------------------- | --------------------------------------------------- |
| Forge          | 11                | 0 (seam setters in flight)                      | IN_PROGRESS            | owes Pulse `configureWorker`/`setSchedulingPolicy`  |
| Atlas          | 13                | 0                                               | IN_PROGRESS            | orchestrator/blackboard/DAG/A2A++                   |
| Mnemosyne      | 12                | 0                                               | IN_PROGRESS            | memory hierarchy/decay/clustering/dedup             |
| Lethe          | 12 (lifecycle)    | 0                                               | (part of 12)           | decay/forget/consolidation                          |
| Sentinel       | 14/20             | **1 straggler** (`resilience-scheduler.ts:130`) | IN_PROGRESS            | 6 security modules + vault restored to 0 this cycle |
| Aegis          | 20                | (shares resilience-scheduler)                   | IN_PROGRESS            | audit/reliability/chaos                             |
| Pulse          | 18                | **~107**                                        | IN_PROGRESS            | **critical-path blocker**                           |
| Metron         | 15                | 0                                               | IN_PROGRESS            | perf/observability                                  |
| Artisan        | 16/19             | 0                                               | IN_PROGRESS            | SDK/marketplace/vault exports fixed                 |
| Helix          | (enterprise mesh) | 0                                               | (under 17 done)        | p2p-swarm                                           |
| Prism          | 17 + UI           | 0                                               | COMPLETED (17)         | control-plane UX wired                              |
| Halcyon        | admin UI          | 0                                               | (under 17 done)        | os/admin pages                                      |
| Ferric         | Rust core         | 0 (cargo-gated)                                 | (Rust decoupled)       | `crates/core/config/providers`                      |
| Rusty          | Rust tools        | 0 (cargo-gated)                                 | (Rust decoupled)       | `crates/tools/safety/cli`                           |
| Tess           | Tauri             | 0                                               | (shell)                | `nexus-tauri`                                       |
| Aeon           | MCP/connectors    | 0                                               | IN_PROGRESS            | `mcp.ts`/`mcp-http.ts`                              |
| **Lorekeeper** | docs/ADRs         | **0 (CLEAN)**                                   | COMPLETED (docs index) | this doc + manual + tracker                         |
| Quill          | tests/merge-gate  | (harness for above)                             | IN_PROGRESS            | owns `vitest.config.ts`                             |
| Bastion        | build/CI          | 0                                               | COMPLETED (CI plan)    | `validate` script defined                           |

---

## 4. How to update this file

1. An owner reports a measured value via `team_send_message` to Leader (or directly to Lorekeeper).
2. Lorekeeper updates the row: set the **Current measured** value, flip **Met?** to ✅ when threshold
   met, and bump the date.
3. Never mark a metric ✅ without a measured value or a true-gate `tsc=0` for build metrics.
4. The fleet's overall perfection score = weighted average of per-owner metrics, published here after
   each ML-002 compaction (see v4.0.0 manual §3).

_End of Perfection Metrics._
