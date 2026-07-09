# omniroute

## Purpose
OmniRoute model-tier catalog + pure routing decision. `getTiers()` lists tiers; `routeModel(tier, preferred)`
returns a `RouteDecision` (provider + model) with health awareness. NOTE: this is NEXUS's own OmniRoute
bridge; the `docs/omniroute/` directory is a FOREIGN product and is unrelated (see Lorekeeper disclaimer).
(Cerebrum area.)

## Public exports
- `type ProviderId`.
- `interface ModelTierDef`, `interface RouteDecision`.
- `function getTiers(): ModelTierDef[]`.
- `function routeModel(tier: string, preferred?: ProviderId): RouteDecision`.
- `function providerHealthSnapshot()`.

## Env vars
None directly (reads provider health from `omniroute-bridge`).

## Test file
- `server/tests/omniroute.test.ts` (routeModel tier resolution, health snapshot).
