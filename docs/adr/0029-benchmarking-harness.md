# ADR-0029: Benchmarking Harness

- Status: Accepted
- Date: 2026-07-09
- Deciders: Metron (owner), Bastion, Pulse, Leader

## Context

Phase 15 (perf) and the self-opt harness (ADR-0014) need reproducible benchmarks to
measure the effect of tuning changes and to catch regressions before merge. Ad-hoc
timing snippets don't give comparable, version-stamped numbers.

## Decision

A benchmarking harness lives under Metron + Bastion tooling:

- **Scripts:** `scripts/profile-system-performance.ts` (Bastion-owned) profiles the
  running system (latency percentiles, throughput, overhead) and emits a
  version-stamped report. `scripts/verify-system-readiness.ts` gates readiness.
- **Metrics source:** the harness reads from `server/src/services/metrics.ts` +
  `tracing.ts` (ADR-0025) so benchmark numbers and production telemetry share one
  definition of "latency"/"throughput" — no dual accounting.
- **Self-opt loop:** the benchmark output feeds `ranking-trainer.ts` and the self-opt
  tuners: a proposed change is accepted only if the benchmark shows improvement
  within the guardrail envelope (Sentinel), else reverted.
- **CI integration:** benchmarks run as a CI check (ADR-0027) with a regression
  threshold; a slowdown beyond the threshold blocks merge (Quill gate).
- **Overhead accounting:** `overhead-accounting.ts` attributes cost per span so the
  benchmark isolates loop overhead from payload cost.

## Consequences

- Tuning decisions are evidence-based: every self-opt change is measured against a
  reproducible benchmark before it sticks.
- Benchmark + production share the OTEL/metrics definition, so "Lab fast" means
  "prod fast".
- Regressions are caught in CI, not after deploy.
- Tests: the harness has its own smoke benchmark asserting the report schema; the
  real numbers come from CI runs, not unit tests.
- Operational note: benchmarks need a warm, isolated runner; CI pins the runner
  spec so numbers are comparable across runs.
