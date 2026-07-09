# NEXUS 2.0 — Phase 18: AI-Native Self-Optimization

## Control Surface Design (v1 — Safe-Exploration Layer)

**Owner:** Pulse (Runtime Engineer)
**Phase:** 18 — AI-Native Self-Optimization (auto-tune, A/B, self-heal)
**Status:** CONTROL SURFACE DESIGN — first deliverable (precedes module implementation)

---

## 0. Design Thesis

Phase 18 does **not** replace the platform's hand-tuned heuristics. It wraps them in a
**safe-exploration layer** that:

1. Observes runtime telemetry (latency, recall NDCG@10, token cost, queue depth, error rate).
2. Proposes parameter/strategy changes inside **hard guardrails** (budget caps, confidence
   gates, rollback-on-regression, emergency circuit breakers).
3. Writes accepted changes back through the **existing** interfaces owned by other agents —
   it never reaches into kernel internals directly.

Every tuner is a **candidate → shadow → ramp → promote** actor. No parameter change is
applied without: a shadow validation window, a statistical-significance gate, and a
reversibility guarantee (param versioning + one-command rollback).

---

## 1. Control Surface Topology

```
                          ┌─────────────────────────────────────────────┐
                          │        SelfOptController (single instance)   │
                          │  ┌──────────────────────────────────────┐   │
                          │  │ ControlPlane API  /control/self-opt/*  │   │
                          │  └──────────────────────────────────────┘   │
                          └───────┬──────────────┬──────────────┬───────┘
                                  │              │              │
                ┌─────────────────┴──┐  ┌─────────┴────┐ ┌──────┴─────────┐
                │ Tuner Registry     │  │ TelemetrySink │ │ GuardrailGuard │
                │ (18 tuners)        │  │ (OTEL pull)   │ │ (budget/breaker)│
                └────────────────────┘  └──────────────┘ └────────────────┘
                                  │
        ┌─────────────────────────┼───────────��──────────────────────────┐
        │ TUNERS (read-only read, write via adapter)                      │
        ├───────────────────────────────────────────────────────────────┤
        │ 18.1 SchedulerPIDTuner    → services/scheduler.ts (setPidGain)  │
        │ 18.2 MemoryCalibrator     → services/recall.ts (threshold set)  │
        │ 18.3 PromptABEngine       → services/llm-gateway-v2.ts          │
        │ 18.4 LatencyFailover      → services/omniRouteAdapter.ts        │
        │ 18.5 AgentWatchdog        → services/kernel.ts (restart/heal)   │
        │ 18.6 CIBenchmarkGate      → CI status + perf budget gate        │
        │ 18.7 QueueAutoScaler      → services/scheduler.ts (capacity)    │
        │ 18.8 PredictiveCacheWarmer→ services/llmCache.ts (prewarm)      │
        │ 18.9 BehavioralAnomalyQB   → services/kernel.ts quarantine      │
        │ 18.10 AuditTestGen        → services/testGenFromAudit.ts        │
        │ 18.11 ApiDocGenerator      → scripts/gen-openapi.ts (cron)      │
        │ 18.12 SemanticBatching     → services/llm-gateway-v2.ts (batch) │
        │ 18.13 IndexAdvisor         → services/recall.ts (index toggles) │
        │ 18.14 DemandForecaster     → services/queueAutoScaler.ts        │
        │ 18.15 RRFOnlineOptimizer   → services/recall.ts (rrf weights)   │
        │ 18.16 TokenBudgetRecycler  → services/llm-gateway-v2.ts budget  │
        │ 18.17 SemanticRespCache    → services/llmCache.ts (cache store) │
        │ 18.18 GuardrailCalibrator  → services/guardrails.ts (thresholds)│
        │ 18.19 SkillCompilationAdv  → services/skillCompiler.ts suggest  │
        │ 18.20 RLSchedulingPolicy   → services/scheduler.ts (policy net) │
        └───────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┴────────────────────────────────────────────┐
        │ ADAPTERS — thin, typed wrappers over existing service APIs.    │
        │ Each adapter = read state + propose delta + validate + commit. │
        │ Never touches state outside its owns-the-interface owner.      │
        └───────────────────────────────────────────────────────────────┘
```

**Hard rule:** A tuner MAY read any telemetry it needs, but it may only **write** through its
own adapter. The adapter is the only writer to its owner's tunable surface. This preserves
the "you own your interface" boundary from the Phase 11/12/13/14/15/17 specs and keeps
Phase 18 deltas auditable + reversible.

---

## 2. Safe-Exploration Guardrail Core (the spine)

All 20 tuners share one guardrail enforcer. Tuners call `guard.propose(delta)`; the guard
either commits or rejects.

### 2.1 Layered guardrail stack (per change)

```
L0 budget_enforcer   — tokens/day + $ cap; rejects > remaining budget
L1 cost_controller   — $/1k tok; kill-switch if 7-day avg > threshold
L2 circuit_breaker   — global breaker: opens if error-rate > 5% or P99 > 3× baseline
L3 param_versioning  — every change is a row in self_opt_param_versions (immutable)
L4 fairness_guard    — rejects changes that shift latency/quality <0 across cohorts
L5 explanation_budget— logs WHY + expected effect; feeds 18.34 explainability
L6 satisfaction_loop — user thumbs (👍/👎) override auto-promote; decay by 14d
L7 meta_optimizer    — governs the OTHER guardrails' thresholds (Bayesian)
```

### 2.2 Change lifecycle (all tuners identical)

```
propose(delta)
  → guard.validate(delta)           # L0–L7 checks
  → shadow_window (default 30m)     # run candidate alongside incumbent
  → measure(shadow metrics)
  → significance_gate(p < 0.05, min N)       # tuner-specific metric
  → promote | rollback | extend_shadow
```

`rollback` restores the prior param version atomically (single `UPDATE` to
`self_opt_param_versions SET status='rolled_back'`).

### 2.3 Emergency overrides (operator + automated)

- **Global circuit breaker** (18.22): any tuner may trip it; opens ALL writes for
  `global_circuit_breaker_ms` (default 60s, configurable). Sentinel owns the degraded-mode
  contract.
- **Mass rollback** (18.23): one call rolls every active change back to its prior version
  (used during incidents / bad deploys).
- **Exploration budget** (18.27): tuner-specific daily cap on write-apply rate; when
  exhausted, tuner switches to shadow-only (observe, don't act).
- **Dry-run simulator** (18.26): `?dryRun=1` on every endpoint; planner emits deltas, applies
  nothing.
- **Power calculator** (18.28): a-priori N for the A/B gate (default α=0.05, power=0.8,
  MDE=2%).

---

## 3. Telemetry Contract (what every tuner reads)

All tuners subscribe to a single `TelemetrySink` fed by OTEL (`server/src/lib/otel.ts`).
Metrics exposed (Prometheus scrape on `/metrics`):

| Signal                                                     | Source           | Used by            |
| ---------------------------------------------------------- | ---------------- | ------------------ |
| `scheduler.pid.kp`, `ki`, `kd`                             | scheduler.ts     | 18.1               |
| `recall.ndcg10`, `threshold.version`, `index.hit_rate`     | recall.ts        | 18.2, 18.13, 18.15 |
| `prompt.ab.impressions`, `accept_rate`, `judge_score`      | llm-gateway-v2   | 18.3               |
| `provider.p99_ms`, `provider.error_rate`, `failover.count` | omniroute-bridge | 18.4, 18.20        |
| `agent.restart.count`, `oom.count`, `watchdog.heal_ms`     | kernel.ts        | 18.5               |
| `queue.depth`, `queue.wait_ms`, `queue.reject_rate`        | scheduler.ts     | 18.7, 18.14        |
| `cache.warm_hit_rate`, `cache.miss_rate`                   | llmCache.ts      | 18.8, 18.17        |
| `guardrail.violation_rate`, `judge.false_positive`         | guardrails.ts    | 18.18              |
| `billing.token.cost_usd`                                   | llm-gateway-v2   | 18.16 (recycler)   |
| `audit.trail.count`, `audit.error_rate`                    | audit-engine     | 18.10              |

---

## 4. Tuner-by-Tuner Control Surface

> Each entry: **Interface owned by** · **Read surface** · **Write adapter** · **Safety gate**
> · **Coordination note**.

### 18.1 Scheduler PID Auto-Tuner

- **Owns:** `services/scheduler.ts` `setPidGain(partial)`.
- **Reads:** `scheduler.pid.kp/ki/kd`, `queue.wait_ms`, `queue.reject_rate`.
- **Algorithm:** Bayesian optimization (Expected Improvement) over (kp,ki,kd) constrained to
  safe box around current values (`±25%`).
- **Gate:** P99 queue wait < +10% AND reject_rate flat vs baseline → else rollback.
- **Note:** Coordinate with Forge (owner). Writes only via `setPidGain`.

### 18.2 Memory Threshold Self-Calibration (Nelder-Mead vs NDCG@10)

- **Owns:** `services/recall.ts` `setThreshold(partial)`.
- **Objective:** maximize `recall.ndcg10` subject to `cache.miss_rate` budget.
- **Method:** Nelder-Mead simplex around current thresholds; bounded; obj = NDCG@10.
- **Safety:** 18.3 global CB trips if `recall.ndcg10` drops >2% in shadow window.
- **Coord:** Mnemosyne (owner).

### 18.3 Prompt A/B Engine (LLM-as-judge, auto-promote p<0.05)

- **Owns:** `services/llm-gateway-v2.ts` `setPromptVariant(v)`.
- **Method:** Thompson-sampling multi-armed-bandit; two-arm; auto-promote on
  `binomial z-test p<0.05` AND `min_impressions` (default 2k/arm).
- **Judge:** `llmAsJudge()` scores both arms on `accept_rate`, `task_success`,
  `user_thumbs`. Judge prompt is versioned (18.33).
- **Coord:** reads `prompt.ab.*` from 18.3 telemetry.

### 18.4 Latency-Aware Provider Failover

- **Owns:** `services/omniRouteAdapter.ts` `setFailoverPolicy(p)`.
- **Method:** contextual bandit (latency, cost, success) re-weights provider scores.
- **Gate:** must keep `provider.p99_ms` within SLO; global CB (18.22) overrides.
- **Coord:** Forge owns scheduler PID; this owns failover policy only.

### 18.5 Agent Watchdog w/ State Recovery

- **Owns:** `services/kernel.ts` `setWatchdogPolicy(p)` → restart/heal/OOM-throttle.
- **Hard guardrails (L0–L2):** error-rate >5% OR P99 > 3× baseline → open; auto-heal
  capped; `max_restarts_per_min` enforced; state recovery = restore from
  `agent_snapshots` table.
- **Coord:** Sentinel owns degraded-mode contract; Pulse owns the watchdog policy params.

### 18.6 CI Benchmark Comparison Gate

- **Owns:** CI status + a declarative `perf_budget.json`.
- **Behavior:** on CI perf-bench, compare vs baseline; if Δlatency/P99/cost exceed budget →
  **block merge** via status check + post comment.
- **Coord:** read-only to CI; writes `perf_budget.json` (versioned). Bastion owns CI.

### 18.7 Queue Auto-Scaler

- **Owns:** `services/scheduler.ts` `setQueueCapacity(partial)` + `setConcurrency(partial)`.
- **Method:** PID output (18.1) feeds target; EWMA + Prophet forecast (18.14) drive desired
  capacity. Kalman filter on `queue.wait_ms` for smoothing.
- **Gate:** L0 budget (tokens/day) + L2 CB (error-rate/P99) bound the actuator.
- **Coord:** Forge (owner).

### 18.8 Predictive Cache Warming

- **Owns:** `services/llmCache.ts` `prewarmEntries(keys)`.
- **Method:** demand forecast (18.14) + access-history LSTM pick top-K keys by EWMA.
- **Guardrail:** L0 budget; never prewarm > `cache.warm_budget_keys`.
- **Coord:** writes through cache owner.

### 18.9 Behavioral Anomaly Quarantine (Mahalanobis)

- **Owns:** `services/kernel.ts` `quarantineAgent(id, reason, ttl)`.
- **Method:** rolling-window feature vector per agent; Mahalanobis distance vs cohort;
  auto-quarantine + `agent_snapshots` state-recovery on breach.
- **Gate:** quarantine is shadow-only first (observe 1 cycle) unless `behavioral_anomaly_qb`
  config sets hard mode.
- **Coord:** Sentinel owns degraded-mode; quarantine is a _request_, kernel decides.

### 18.10 Test-Gen from Audit Trails

- **Owns:** `services/testGenFromAudit.ts` (new file).
- **Method:** cluster past violations/regressions → synthesize boundary/counterexample tests.
- **Gate:** generated tests must pass in CI before merge (consumes 18.6 gate).
- **Coord:** writes to `tests/auto/`; emits PR; no direct prod writes.

### 18.11 API Doc Self-Gen

- **Owns:** `scripts/gen-openapi.ts` (cron, off-peak).
- **Method:** scan `routes/*` + zod schemas → OpenAPI 3.1 + markdown; drift check vs
  `openapi.json` in CI.
- **Coord:** read-only; pure local generation.

### 18.12 Semantic LLM Batching

- **Owns:** `services/llm-gateway-v2.ts` `setBatchingPolicy(p)` (similarity threshold,
  max-batch).
- **Method:** embedding cosine-cluster; auto-tune threshold to hit `batch.hit_rate` target
  without P99 regression.
- **Gate:** reject if `batch.p99_ms` regresses >5%.
- **Coord:** writes through gateway owner.

### 18.13 Automatic Index Advisor

- **Owns:** `services/recall.ts` `setIndexToggles(toggles)`.
- **Method:** workload-shape heuristic + what-if cost estimate; suggests index create/drop/
  covering-index.
- **Gate:** dry-run (18.26) first; auto-apply only in shadow window + L0 budget.
- **Coord:** Mnemosyne (owner).

### 18.14 Demand Forecasting (Prophet-style)

- **Owns:** `services/queueAutoScaler.ts` `setForecast(p)` (horizon, seasonality).
- **Method:** additive seasonal decomposition → forecasts `queue.depth`, `provider.load`,
  `agent.spawn_rate`; feeds 18.7, 18.8.
- **Coord:** feeds others; no direct state writes.

### 18.15 RRF Online Optimization (Bayesian)

- **Owns:** `services/recall.ts` `setRrfWeights(w)`.
- **Method:** Bayesian optimization (Gaussian Process) over signal weights; objective =
  NDCG@10.
- **Gate:** 18.2 global CB bounds; rollback on NDCG regression.
- **Coord:** Mnemosyne (owner).

### 18.16 Token Budget Recycling

- **Owns:** `services/llm-gateway-v2.ts` `setTokenBudget(partial)`.
- **Method:** PID on `billing.token.cost_usd` keeps under budget; surplus near month-end
  recycles to low-priority traffic (`recycle_to_queue` config).
- **Guardrail:** L0 budget + L1 cost controller hard kill-switch.
- **Coord:** writes through gateway owner.

### 18.17 Semantic LLM Response Cache

- **Owns:** `services/llmCache.ts` `setCachePolicy(p)` (admit threshold, TTL, semantic
  match radius, invalidation policy).
- **Method:** semantic-hash + lease; auto-tune admit threshold to target
  `cache.hit_rate` ≥ target while holding `cache.miss_rate` within budget.
- **Gate:** 18.2 global CB on `cache.miss_rate` regression.
- **Coord:** writes through cache owner.

### 18.18 Guardrail Threshold Calibration

- **Owns:** `services/guardrails.ts` `setGuardrailThreshold(id, partial)`.
- **Method:** Bayesian optimization maximizing `judge.f1` (precision/recall) subject to
  `guardrail.violation_rate` ceiling; monotonicity + fairness (18.24) constraints.
- **Gate:** L4 fairness guard; 18.3 global CB bounds; rollback on violation-rate breach.
- **Coord:** Sentinel owns degraded-mode; Pulse owns threshold params only.

### 18.19 Skill-Compilation Advisor

- **Owns:** `services/skillCompiler.ts` `setSuggestion(id, s)` (advisory only).
- **Method:** compilation-graph cost model → suggests inlining/tuning; emits
  `skill_compilation_suggestions` table; PR auto-opened for human review.
- **Guardrail:** advisory only; never auto-applies to prod without approval.
- **Coord:** Artisan (owner).

### 18.20 RL Scheduling Policy

- **Owns:** `services/scheduler.ts` `setRlPolicy(p)` (PPO actor-critic; offline training,
  online inference, bounded action; reward = −(wait_ms·α + reject_rate·β)).
- **Gate:** L2 CB + L3 param versioning + satisfaction loop (18.25) override.
- **Coord:** Forge (owner); this is the top-most actuator — sits downstream of 18.1/18.7.

---

## 5. Gap Items (18.21 – 18.35) — Control-Surface Additions

These are meta-control / cross-cutting surfaces layered ON TOP of the 20 tuners:

| #     | Gap                    | Control Surface                                                                  | Owner (delegated) |
| ----- | ---------------------- | -------------------------------------------------------------------------------- | ----------------- |
| 18.21 | A/B Analysis Dashboard | `GET /control/self-opt/dashboard` — live arms, p-values, promote/revert          | Pulse             |
| 18.22 | Global Circuit Breaker | `setGlobalCircuitBreaker(state)` — opens ALL writes; Sentinel owns degraded-mode | Pulse + Sentinel  |
| 18.23 | Mass Rollback          | `POST /control/self-opt/rollback-all` — one-call revert every active change      | Pulse             |
| 18.24 | Param Versioning       | `self_opt_param_versions` table — immutable, tagged, diffable, rollback          | Pulse             |
| 18.25 | Cost Controller        | `CostController` — $/1k-tok kill-switch; reads `billing.token.cost_usd`          | Pulse             |
| 18.26 | Dry-Run Simulator      | `?dryRun=1` everywhere; planner emits deltas, applies nothing                    | Pulse             |
| 18.27 | Power Calculator       | `PowerCalculator` — a-priori N from α, power, MDE                                | Pulse             |
| 18.28 | Exploration Budget     | per-tuner `exploration_budget` daily cap; shadow-only when exhausted             | Pulse             |
| 18.29 | Experiment Tracking    | `ExperimentRegistry` — arm def, metric, window, result, status                   | Pulse             |
| 18.30 | Knowledge Sharing      | `KnowledgeBus` — publish/subscribe optimized configs across agents               | Pulse (Atlas)     |
| 18.31 | Fairness Guard         | `FairnessGuard` — cohort-aware; rejects regressions <0 across cohorts            | Pulse             |
| 18.32 | Explainability         | `ExplainabilityStore` — every change logs WHY + expected effect (18.5 L5)        | Pulse             |
| 18.33 | Satisfaction Loop      | 👍/👎 override auto-promote; 14-day decay                                        | Pulse             |
| 18.34 | Meta-Optimizer         | `MetaOptimizer` — tunes the OTHER guardrails' thresholds via Bayesian opt        | Pulse             |
| 18.35 | Hypothesis Generator   | `HypothesisGenerator` — from deltas/regressions → candidate experiments          | Pulse             |

> All gap items are **control-plane level**: they sit above the 20 tuners and are owned
> exclusively by Pulse. They do not alter the per-tuner optimization logic.

---

## 6. Persistence & APIs

### 6.1 Tables (Drizzle, `server/src/db/schema/self-opt.ts`)

- `self_opt_param_versions` — immutable param history (owner, tuner, before/after JSON,
  status, created_by, parent_id, experiment_id).
- `self_opt_experiments` — experiment registry (18.29).
- `self_opt_knowledge_bus` — published optimized configs (18.30).
- `self_opt_events` — append-only audit of every propose/commit/rollback/trip.

### 6.2 Control-plane API (`server/src/routes/self-opt.ts`)

```
GET    /control/self-opt/tuners
GET    /control/self-opt/tuners/:id
GET    /control/self-opt/tuners/:id/status
POST   /control/self-opt/tuners/:id/propose     { delta, dry_run?, force? }
POST   /control/self-opt/tuners/:id/rollback
POST   /control/self-opt/tuners/:id/pause       { reason }
GET    /control/self-opt/dashboard              (18.21)
POST   /control/self-opt/rollback-all           (18.23)
POST   /control/self-opt/circuit-breaker        (18.22)
GET    /control/self-opt/experiments            (18.29)
POST   /control/self-opt/simulate               (18.26 dry-run)
```

All mutating routes require `role >= operator` + `scope: self_opt`. Every write is
double-audited to `self_opt_events`.

### 6.3 Config (`server/config/self-opt.toml`)

```toml
[control_surface]
enable = true
dry_run_default = true          # safety: no live writes until explicitly enabled
max_write_apply_per_day = 50    # global exploration cap (18.27)
shadow_window_seconds = 1800
significance_alpha = 0.05
min_sample_size = 2000
ci_benchmark_gate_enabled = true
global_circuit_breaker_ms = 60000
satisfaction_loop_decay_days = 14
exploration_budget_per_tuner = 20

[guardrails]
budget_tokens_per_day = 50000
cost_kill_switch_usd_per_1k = 0.01
error_rate_open_pct = 5.0
p99_latency_multiplier = 3.0
fairness_min_delta = 0.0         # reject changes that regress any cohort

[meta_optimizer]
enabled = true
optimize_interval_seconds = 3600
```

---

## 7. Coordination Contract (hard boundaries)

| Tuner                    | Interface Owner              | Writes via                      | Reads from             |
| ------------------------ | ---------------------------- | ------------------------------- | ---------------------- |
| 18.1 Scheduler PID       | **Forge**                    | `scheduler.setPidGain`          | scheduler.ts telemetry |
| 18.2 Memory Calibration  | **Mnemosyne**                | `recall.setThreshold`           | recall.ts              |
| 18.3 Prompt A/B          | **Atlas** (orchestration)    | `llm-gateway.setPromptVariant`  | gateway metrics        |
| 18.4 Latency Failover    | **Forge**                    | `omniRoute.setFailoverPolicy`   | omniRoute-bridge       |
| 18.5 Agent Watchdog      | **Sentinel** (degraded-mode) | `kernel.setWatchdogPolicy`      | kernel.ts              |
| 18.7 Queue Auto-Scaler   | **Forge**                    | `scheduler.setQueueCapacity`    | scheduler.ts           |
| 18.8 Cache Warming       | **Mnemosyne**                | `llmCache.prewarmEntries`       | cache metrics          |
| 18.9 Anomaly Quarantine  | **Sentinel**                 | `kernel.quarantineAgent`        | kernel.ts              |
| 18.12 Semantic Batching  | **Atlas**                    | `llm-gateway.setBatchingPolicy` | gateway metrics        |
| 18.13 Index Advisor      | **Mnemosyne**                | `recall.setIndexToggles`        | recall.ts              |
| 18.14 Demand Forecast    | **Forge**                    | `queueAutoScaler.setForecast`   | queue metrics          |
| 18.15 RRF Optimizer      | **Mnemosyne**                | `recall.setRrfWeights`          | recall.ts              |
| 18.16 Token Budget       | **Atlas**                    | `llm-gateway.setTokenBudget`    | gateway metrics        |
| 18.17 Resp Cache         | **Mnemosyne**                | `llmCache.setCachePolicy`       | cache metrics          |
| 18.18 Guardrail Calib    | **Sentinel**                 | `guardrails.setThreshold`       | guardrails.ts          |
| 18.19 Skill-Compiler Adv | **Artisan**                  | `skillCompiler.setSuggestion`   | skillCompiler.ts       |
| 18.20 RL Scheduling      | **Forge**                    | `scheduler.setRlPolicy`         | scheduler.ts           |

> Phase 18 is a **safe-exploration layer**. It proposes deltas; the interface owners
> (Forge, Mnemosyne, Atlas, Sentinel) own the right to reject. The control surface never
> reaches past an adapter into another agent's internals.

---

## 8. Build Order (recommended)

1. **This doc** — control surface (done).
2. `schema/self-opt.ts` + Drizzle migration.
3. `lib/guardrail-guard.ts` (the spine: §2).
4. `services/self-opt/*` — TunerRegistry + TelemetrySink + adapters.
5. `routes/self-opt.ts` — control-plane API (§6.2).
6. Per-tuner modules 18.1 → 18.20 (each ~one focused file, same shape).
7. Gap items 18.21 → 18.35 (control-plane level, layered on top).
8. Wire activation into `server/src/index.ts` SchedulerRegistry + OTEL metrics.
9. Unit + integration tests under `server/tests/self-opt/`.
10. Frontend `ControlPlane` dashboard (Prism-owned, Phase 17) consumes
    `GET /control/self-opt/dashboard`.

---

_Next step (per leader directive): implement §3 telemetry contract + §4 adapter seams as the
first code drop, then proceed tuner-by-tuner. Each tuner module is a focused, independently
testable unit that registers with the ControlPlane and respects the §2 guardrail spine._
