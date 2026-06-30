# Testing

> This build target has **no test runner** (no vitest/eslint configured in the
> template). Instead, NEXUS ships an **in-app eval + safety harness** that runs
> deterministic assertions against the **real live engine**. The cases below mirror
> the unit/integration/security/MCP test plan from the spec.

## In-app harness

**Agent OS → Evals & Safety → Run eval suite** executes:

| Case | Asserts |
|------|---------|
| remember + recall round trip | a stored memory is returned by recall |
| transcript preserved on failure | `forceFail` capture still saves the raw transcript |
| destructive command blocked | `rm -rf /` is hard-blocked |
| path traversal blocked | `..` escape is rejected |
| prompt injection flagged | injection patterns detected |
| secret detected | key patterns detected |
| SSRF metadata IP blocked | link-local address classified private |
| post-tool observation captured | a failed tool produces a lesson |
| handoff create + accept | a handoff loads context for a new agent |
| compact context under budget | tier-B context ≤ 800 tokens |
| dream consolidation ran | dedup/promotion/decay deterministic |
| scope enforcement | a non-scoped agent is blocked |

Metrics: `pass_rate`, `cases_passed/total`, `tokens_saved`, `session_capture_success_rate`, `latency_ms`.

## In-app safety benchmark

Live, editable inputs proving the perimeter controls: destructive command,
prompt injection, secret/key, SSRF, path traversal.

## Manual verification

- **Developer → API & MCP → API Console**: `POST /memories` with no key → 401;
  invalid key → 401; valid key → 201. Oversized body → 413.
- **Operations → Audit**: chain shows `valid`, verified entry count.
- **Operations → Safety**: live security lab.

## Porting to vitest (target)

Each pure function in `lib/core.ts`, `lib/os/policy.ts`, `lib/brain.ts`,
`lib/recall.ts`, `lib/os/kernel.ts` is directly unit-testable. The eval cases
above are 1:1 with intended vitest specs.
