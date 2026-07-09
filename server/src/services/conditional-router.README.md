# conditional-router

## Purpose
Conditional routing for DAG/pipeline edges. Zod `RouteRule`/`Condition` schemas; pure `resolveField` reads a
nested field from a context object; `evalCondition` evaluates a comparison (`eq`/`ne`/`gt`/`lt`/`in`/...);
`route` returns the list of target route ids whose rules match the context. Fully pure (testable).

## Public exports
- `RouterOpSchema` / type `RouterOp` (operators).
- `ConditionSchema` / type `Condition`.
- `interface RouteRule`, `RouteRuleSchema`.
- `function resolveField(ctx, field): unknown` — pure.
- `function evalCondition(cond, ctx): boolean` — pure.
- `function route(rules: RouteRule[], ctx): string[]` — pure.

## Env vars
None directly.

## Test file
- `server/tests/conditional-router.test.ts` (resolveField, evalCondition, route selection).
