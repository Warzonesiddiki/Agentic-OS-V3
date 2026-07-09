# llm-gateway-v2

## Purpose
Unified provider-gateway. Defines the `ProviderAdapter` contract and registers adapters (`providers/*`,
`portkey-bridge`), a routing policy + `pickProvider`, circuit-breaker snapshots, token budget control
(`setBudget`/`getBudget`/`chargeBudget`), per-session kill (`killSession`), and `callLLMGateway` /
`streamLLMGateway`. Also exposes A/B prompt-variant + batching + token-budget setters for self-tuning.
(Cerebrum area.)

## Public exports (selected)
- `interface ChatMessage`, `interface ProviderRequest`, `interface ProviderResponse`, `interface ProviderAdapter`.
- `function listProviders(): ProviderAdapter[]`.
- `interface RoutingPolicy`, `function pickProvider(req, policy): ProviderAdapter`.
- `async function canCallProvider(provider): boolean`.
- `async function getBreakerSnapshot()`.
- `async function setBudget(opts)`, `getBudget(provider)`, `chargeBudget(provider, tokens)`.
- `async function killSession(sessionId, reason)`.
- `interface GatewayCall`, `async function callLLMGateway(call): Promise<ProviderResponse>`.
- `async function streamLLMGateway(call): Promise<ReadableStream<Uint8Array>>`.
- `function setPromptVariant(v)`, `setBatchingPolicy(p)`, `setTokenBudget(partial)`.

## Env vars
Reads provider env (`NEXUS_LLM_*`, `PORTKEY_*`) via registered adapters.

## Test file
- `server/tests/llm-gateway-v2.test.ts` (pickProvider, budget, breaker, call/stream).
