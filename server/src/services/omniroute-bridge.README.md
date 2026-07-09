# omniroute-bridge

## Purpose
Runtime bridge for OmniRoute adaptive routing. Classifies request complexity from a `ProviderRequest`,
tracks per-provider health (`getProviderHealth`/`isProviderHealthy`/`recordProvider{Success,Failure}`), and
`resolveOmniRoute(req, policy)` returns the best provider/model. Exposes `MODEL_TIER_CATALOG` and a
`is5xxOrTransientError` helper for circuit breaking. (Cerebrum area.)

## Public exports (selected)
- `type TaskComplexity`, `interface ProviderHealth`, `interface CandidateTarget`, `interface OmniRouteDecision`.
- `const MODEL_TIER_CATALOG`.
- `function classifyComplexity(req): TaskComplexity`.
- `function getProviderHealth(provider): ProviderHealth`, `isProviderHealthy(provider)`,
  `recordProviderSuccess(provider, ms)`, `recordProviderFailure(provider, err, ms?)`.
- `function resolveOmniRoute(req, policy?): OmniRouteDecision`.
- `function is5xxOrTransientError(err): { is5xx; isTransient }`.

## Env vars
None directly.

## Test file
- `server/tests/omniroute-bridge.test.ts` (classify, health, resolve, error classification).
