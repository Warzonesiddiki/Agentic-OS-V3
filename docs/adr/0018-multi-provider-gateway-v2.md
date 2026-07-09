# ADR-0018: Multi-Provider LLM Gateway v2

- Status: Accepted
- Date: 2026-07-09
- Deciders: Cerebrum (owner), Pulse, Metron, Leader
- Supersedes: ADR-0007 (Cross-language boundary — TS provider-adapter gateway)

## Context

`server/src/services/llm-gateway-v2.ts` is the unified gateway wrapping
per-provider adapters (`services/providers/openai`, `anthropic`, `google`,
`ollama`, `vllm`, `m3`) behind a `ProviderAdapter` interface. As models multiplied
we needed: (a) dynamic provider/model selection by cost/latency/quality,
(b) failover across providers, (c) a single OTEL-traced path for all inference.

## Decision

- **Adapter contract:** every provider implements `ProviderAdapter`
  (`llm-gateway-v2.ts`); new providers are added by implementing the interface —
  no changes to callers.
- **Router:** `llm-router.ts` + `omniroute.ts` / `omniroute-bridge.ts` select a
  provider per request using live metrics (Metron) and cost; on provider error the
  gateway fails over to the next healthy adapter (bounded retries).
- **Unified gateway:** `services/unified-gateway/portkey` wraps the selection +
  failover behind one `complete()` call used by `brain.ts` and the voice/agent
  paths, so all inference funnels through one traced seam
  (`tracing.ts` `startLLMSpan`).
- **No Rust coupling:** per ADR-0007 the Rust `crates/providers` remain a parallel,
  dormant implementation; the TS gateway is the single source of truth.
- **Token accounting:** `recordTokenUsage` (Metron) is called on every response so
  cost/quota (Pulse, `resource-quota.ts`) stay accurate across providers.

## Consequences

- Adding a model/provider is now a localized adapter drop-in; routing, failover,
  tracing, and cost accounting come for free.
- Failover improves resilience; bounded retries prevent cascading stalls.
- All inference is observable and cost-attributed through one seam.
- Tests: `llm-gateway-v2.test.ts` / `llm-router.test.ts` cover adapter selection,
  failover, and token-accounting wiring.
- Operational note: provider health is sourced from Metron probes; a provider with
  no healthy signal is skipped before routing.
