# ADR-0014: AI-Native Self-Improvement Harness (Phase 18)

- Status: Accepted
- Date: 2026-07-09
- Deciders: Pulse (owner), Forge, Mnemosyne, Sentinel, Leader
- Supersedes: — (new capability, Phase 18)

## Context

The runtime loop (Forge's `kernel.ts` + `task-worker.ts`, Metron's metrics,
Mnemosyne's recall) is tunable via a set of live setters (`setSchedulingPolicy`,
`configureWorker`, Pulse's `setWorkerTimeout`/`setWorkerConcurrency`/
`setMaintenance`/`prewarmCache`, Forge's `hotpatchModule`/`rollbackModule`).
Until Phase 18 these knobs were adjusted by hand. We need an **autonomous control
plane** that:

- Observes live telemetry (latency, throughput, queue depth, recall quality,
  error budget) and proposes knob changes.
- Runs changes as **guarded experiments** (A/B / canary) that auto-revert on SLO
  regression (Aegis SLO + Metron metrics).
- Persists learnings (`ranking-trainer.ts`) so the system compounds its tuning
  knowledge across restarts.

## Decision

Ship the self-optimization control plane under `server/src/services/self-opt/**`
plus `self-improvement-harness.ts` and `ranking-trainer.ts`:

- **Control surface (Pulse-owned):** a typed `SelfOptController` exposing the
  live setters above. Every setter call is recorded with `{before, after, reason,
  actor: 'auto'}` into the self-opt telemetry store.
- **Tuners:** `services/self-opt/tuners/*` — one module per runtime dimension
  (worker concurrency, scheduling policy, recall weighting, cache warmth, SLO
  budgets). Each tuner emits a `ProposedChange` scored by a `gap-items` analysis
  (`services/self-opt/gap-items.ts`).
- **Guardrail seam:** `setGuardrailThreshold(id, partial)` (Sentinel,
  `guardrails.ts`) bounds every auto-change; the harness runs in **ADVISORY mode
  by default** — proposed changes are written to the gap store and surfaced via
  `routes/self-opt.ts` (`selfOptRouter`) but applied only when an operator
  flips the mode or a change is within the pre-approved safe band.
- **Experiment + learn:** `ranking-trainer.ts` trains a lightweight ranking model
  on historical `(state, change, outcome)` tuples; accepted changes update the
  model, reverted changes lower the tuner's confidence.
- **Persistence:** self-opt tables in `db/schema.ts` keep tuner state, proposals,
  and a hash-chained decision log (Aegis `audit-engine.ts`).

## Consequences

- The loop can now self-tune within Sentinel's guardrail envelope without human
  intervention; all auto-changes are auditable and reversible.
- ADVISORY-by-default prevents runaway behavior during early adoption; flipping
  to ACTIVE requires explicit operator consent (kill-switch compatible).
- Forge/Pulse seam setters are the ONLY mutation path — the harness never edits
  kernel/scheduler source (preserves the exclusive-namespace contract).
- Tests cover: tuner proposal scoring, guardrail clamping, ADVISORY no-op,
  rollback-on-regression simulation.
- Operational note: `NEXUS_WORKER_*` env knobs remain the manual override; the
  harness proposes deltas on top of them.
