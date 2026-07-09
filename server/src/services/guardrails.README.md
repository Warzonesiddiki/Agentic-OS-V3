# guardrails

## Purpose
Runtime guardrails: register metric thresholds, check before acting (`assertWithinGuardrail` — Phase 18.18
seam Pulse's auto-tuner calls), report input/output violations, and redact unsafe text. `setGuardrailThreshold`
is the live tuner seam; `seedDefaults` installs the baseline guardrail set. (Sentinel-owned.)

## Public exports (selected)
- `type GuardrailMetric` — metric kinds.
- `interface GuardrailThreshold`, `registerGuardrail(t)`, `getGuardrailThreshold(id)`,
  `listGuardrails()`, `setGuardrailThreshold(id, partial)`.
- `interface GuardrailCheck`, `assertWithinGuardrail(id, value, actor?): GuardrailCheck`.
- `interface GuardrailViolation`, `reportGuardrailViolation(...)`.
- `clearGuardrailViolation(agentId, guardrailId)`, `resetGuardrailReport()`, `getGuardrailReport()`.
- `applyInputGuardrails(text)`, `applyOutputGuardrails(text)`, `seedDefaults()`.

## Env vars
None directly.

## Test file
- `server/tests/guardrails.test.ts` (register, setGuardrailThreshold, assert, redact, report).
