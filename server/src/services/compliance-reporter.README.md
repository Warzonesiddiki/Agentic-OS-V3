# compliance-reporter

## Purpose
Compliance control registry + report generator (Phase 14). Register `ComplianceControl`s (mapped to SOC2 /
ISO27001 / GDPR), generate an aggregate report (`generateReport`), and supply a `defaultControls()` baseline.
(Sentinel-owned.)

## Public exports
- `type ControlStatus = 'implemented'|'partial'|'missing'|'not_applicable'`.
- `interface ComplianceControl`, `registerControls(controls)`.
- `async function generateReport(): Promise<{ generatedAt; controls; summary }>`.
- `function defaultControls(): ComplianceControl[]`.

## Env vars
None directly.

## Test file
- `server/tests/compliance-reporter.test.ts` (register, generateReport, defaultControls).
