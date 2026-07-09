# Error-Code Reference

**Last updated:** 2026-07-09 (Lorekeeper)
**Scope:** Canonical error codes emitted by NEXUS 2.0 server + SDK.

## Format

All errors follow a structured envelope:

```json
{
  "code": "DOMAIN_SLUG_ACTION",
  "httpStatus": 400,
  "message": "human-readable",
  "details": { "field": "value" },
  "retryable": false
}
```

Codes are namespaced: `<DOMAIN>_<SLUG>_<ACTION>`. Domains: `KERNEL`, `SCHED`, `MEM`,
`A2A`, `SAFETY`, `SEC`, `AUTH`, `API`, `CONFIG`, `VAULT`.

## Kernel / Scheduling

| Code                           | HTTP | Meaning                                                              | Retryable           |
| ------------------------------ | ---- | -------------------------------------------------------------------- | ------------------- |
| `KERNEL_RING_BUDGET_EXHAUSTED` | 429  | Per-ring rolling-window budget consumed (`acquireRingBudget` failed) | yes (after backoff) |
| `KERNEL_GANG_INCOMPLETE`       | 409  | Gang-schedule could not co-claim all members                         | yes                 |
| `KERNEL_NO_RING_POLICY`        | 500  | `RingPolicyStore` missing policy for ring                            | no                  |
| `SCHED_PIP_DEADLOCK`           | 500  | Priority-inheritance cycle detected on held resource                 | no                  |
| `SCHED_DEADLINE_MISS`          | 422  | EDF admission rejected (cannot meet `deadline`)                      | no                  |
| `SCHED_NO_POLICY`              | 500  | `getSchedulingPolicyName()` returned unknown                         | no                  |

## Safety / Security

| Code                              | HTTP    | Meaning                                                         | Retryable          |
| --------------------------------- | ------- | --------------------------------------------------------------- | ------------------ |
| `SAFETY_KILL_SWITCH_INCONSISTENT` | 500     | Post-write re-read of killSwitch row diverged (Phase 1.7 guard) | no                 |
| `SAFETY_KILL_SWITCH_ACTIVE`       | 423     | Operation blocked while kill-switch engaged                     | no (until cleared) |
| `SEC_OWASP_LLM_*`                 | 400/403 | Guardrail tripped (prompt-injection, SSRF, etc.)                | no                 |
| `AUTH_SCOPE_MISSING`              | 403     | API key lacks required scope (`ALL_SCOPES` in `security.ts`)    | no                 |
| `AUTH_RATE_LIMITED`               | 429     | Per-key rate limit exceeded                                     | yes                |

## A2A

| Code                       | HTTP | Meaning                                           | Retryable |
| -------------------------- | ---- | ------------------------------------------------- | --------- |
| `A2A_ENVELOPE_INVALID`     | 422  | `A2ATask` envelope failed schema/signature check  | no        |
| `A2A_AGENT_UNKNOWN`        | 404  | `AgentCard` not found in registry                 | no        |
| `A2A_IDEMPOTENCY_CONFLICT` | 409  | Duplicate `idempotencyKey` with differing payload | no        |

## Config / API

| Code                       | HTTP | Meaning                                              | Retryable |
| -------------------------- | ---- | ---------------------------------------------------- | --------- |
| `CONFIG_VALIDATION_FAILED` | 500  | `kernel-schema.ts` / env parse failed at boot        | no        |
| `API_NOT_FOUND`            | 404  | Route/resource missing                               | no        |
| `API_STREAM_LIMIT`         | 413  | Streaming payload exceeded `streaming payload limit` | no        |

## Adding a code

1. Define a `const` in `server/src/lib/errors.ts` (typed `AgenticError`).
2. Add the row to this table with HTTP status + retryable flag.
3. Emit via the project error helpers — never a bare `throw "string"`.
