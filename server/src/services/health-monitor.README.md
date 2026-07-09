# health-monitor

## Purpose
Subsystem health monitor. `runShadowCycle()` runs the background shadow/self-healing daemon tick; subsystems
register `HealthCheck`s; `runHealthChecks()` returns a per-subsystem `RunResult`. Tracks `HealthLevel`
(ok/degraded/down) and exposes a summary + per-subsystem lookup.

## Public exports (selected)
- `function runShadowCycle(): void` — shadow daemon tick.
- `type HealthLevel`, `interface HealthStatus`, `interface SubsystemHealth`, `interface HealthCheck`.
- `function registerHealthCheck(check)`, `unregisterHealthCheck(subsystem)`.
- `interface RunResult`, `async function runHealthChecks(): Promise<RunResult>`.
- `function getHealthSummary()`, `getSubsystemHealth(subsystem)`.

## Env vars
None directly.

## Test file
- `server/tests/health-monitor.test.ts` (register, runHealthChecks, summary).
