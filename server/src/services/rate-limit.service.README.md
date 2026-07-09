# rate-limit.service

## Purpose
Token-bucket rate limiter used by the API gateway. `configurePolicy` sets the global policy; `check(key,cost)`
returns a `RateLimitDecision` (allowed/retryAfter); `guard(key,cost)` throws on breach. In-memory + optional
Redis backend. (Sentinel-owned.)

## Public exports
- `interface RateLimitPolicy`, `configurePolicy(policy): void`.
- `interface RateLimitDecision`, `check(key, cost?): RateLimitDecision`.
- `function guard(key, cost?): void` — throws when over limit.

## Env vars
- `NEXUS_RATE_LIMIT_RPS`, `NEXUS_RATE_LIMIT_BURST` (policy defaults).

## Test file
- `server/tests/rate-limit.service.test.ts` (configure, check allow/deny, guard throw).
