# ADR-0020: Production Reliability & Chaos Engineering (Phase 20)

- Status: Accepted
- Date: 2026-07-09
- Deciders: Aegis (owner), Forge, Metron, Pulse, Leader
- Supersedes: — (new capability, Phase 20)

## Context

Phases 11–19 delivered a sophisticated runtime. Phase 20 requires **proving**
its resilience: define SLOs, inject faults on purpose (chaos), and self-heal.
We needed a reliability sub-system that does not disturb the kernel/scheduler
source (Forge's exclusive namespace) but observes and reacts from the side.

## Decision

Reliability lives in `server/src/services/reliability/**` (subfolder) plus the
broader Aegis suite:

- **SLO / burn-rate:** `reliability/slo.ts` + `burn-rate.ts` track error budgets
  from Metron metrics; `latency-budget.ts` enforces per-call ceilings.
- **Chaos:** `reliability/chaos.ts` defines experiments via `defineExperiment` /
  `runExperiment` / `listExperiments` — fault injection (latency, kill,
  partition, resource pressure) gated behind a `chaos` capability and a
  kill-switch-aware guard (Phase 1.7). Experiments are reversible and time-boxed.
- **Self-healing:** `self-healing.ts`, `circuit-breaker-registry.ts`,
  `failover-drill.ts`, `canary-orchestrator.ts` react to SLO breaches; the
  feedback loop routes tuning proposals to the self-opt harness (ADR-0014).
- **Drills & game-days:** `backup-validator.ts`, `migration-rollback.ts`,
  `chaos-dashboard.ts`, plus `gap/` (sev-framework, oncall, break-glass,
  network-partition, game-day, cascade-analysis) provide operational runbooks.
- **No kernel edits:** chaos/heal act through the **same live setters** Pulse's
  harness uses (`setSchedulingPolicy`, worker config) — never by editing kernel
  source. Forge's `kernel-panic.ts` remains the last-resort boundary.

## Consequences

- Resilience is now **measured and exercised**, not assumed; SLO breaches trigger
  automated, reversible responses.
- Chaos is opt-in and kill-switch-safe, so drills cannot wedge production.
- All healing flows through the sanctioned live-setter seam → zero namespace
  collisions with Forge.
- Tests: `chaos.test.ts` covers experiment define/run/list, SLO burn-rate trigger,
  circuit-breaker trip, and self-heal rollback.
- Operational note: enable chaos only in staging or during approved game-days;
  production chaos requires the `chaos` capability + operator ack.
