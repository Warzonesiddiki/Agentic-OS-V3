# ADR-0025: Observability & OpenTelemetry (OTEL)

- Status: Accepted
- Date: 2026-07-09
- Deciders: Metron (owner), Pulse, Aegis, Leader

## Context

Phases 15/18/20 need uniform tracing + metrics across the TS server, the runtime
loop, and the LLM gateway so that self-optimization (ADR-0014) and chaos healing
(ADR-0020) can reason over real signals. Ad-hoc `console.log` metrics don't
compose. We adopt the OpenTelemetry standard as the single observability seam.

## Decision

- **OTEL API:** `server/src/lib/otel.ts` is the OTEL entry point —
  `isOtelEnabled()`, `initOtel()`, `shutdownOtel()` — wrapping `@opentelemetry/api`.
  Disabled by default; enabled via env so local/dev stays lightweight.
- **Tracing seam:** `server/src/services/tracing.ts` provides `withSpan`,
  `startLLMSpan`, `startToolSpan`, `recordTokenUsage`, `recordSpanError`,
  `endTracedSpan`, `generateTraceId`/`generateSpanId`, `parseTraceparent`/
  `formatTraceparent`, `injectTraceparent`, `getTracer`, `runWithTraceContext`.
  All inference (LLM gateway, ADR-0018) and tool calls emit spans; FROZEN core
  (`app.ts`, `db/client.ts`, `llm.ts`, `http.ts`, `propagation.ts`) imports these
  symbols, so the export surface is contract-stable (ADR-0011 rule).
- **Metrics:** `server/src/services/metrics.ts` + `server/src/lib/metrics.ts`
  define counters/histograms (latency, throughput, queue depth, token usage);
  `overhead-accounting.ts` attributes cost to spans; `trace-exporter.ts` /
  `span-context.ts` ship spans to the collector.
- **Health:** `health-monitor.ts` + `probe-harness.ts` expose liveness/readiness
  consumed by Bastion's CI/deploy probes and the chaos SLO path (ADR-0020).

## Consequences

- One observability contract (OTEL + `tracing.ts`) spans inference, tools, and the
  loop — self-opt and chaos both consume it without bespoke instrumentation.
- The `tracing.ts` export surface is FROZEN-core-imported, so changes there require
  the full fresh-gate re-validation (ADR-0011) — protecting the shared seam.
- OTEL is opt-in (env) so dev stays fast; production turns it on for SLO/burn-rate.
- Tests: `tracing.test.ts` / `metrics.test.ts` cover span lifecycle, token
  attribution, and traceparent round-trip.
- Operational note: span volume is bounded; high-frequency internal events use
  `metrics` not traces to control collector cost.
