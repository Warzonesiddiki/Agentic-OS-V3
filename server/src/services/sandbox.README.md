# sandbox

## Purpose
Sandboxed code execution. `isDockerAvailable` probes for Docker; `executeSandboxed` runs untrusted code in a
Docker container (or a blocked fallback when `NEXUS_SANDBOX_ENABLED` is false / Docker absent) with a timeout.
`getSandboxMetrics` reports run counts/errors. (Artisan area, Phase 6/19.)

## Public exports
- `interface SandboxInput`, `interface SandboxResult`.
- `async function isDockerAvailable(): Promise<boolean>`.
- `async function executeSandboxed(input: SandboxInput): Promise<SandboxResult>`.
- `function getSandboxMetrics(): Record<string, number>`.

## Env vars
- `NEXUS_SANDBOX_ENABLED` (boolean), `NEXUS_SANDBOX_IMAGE` (docker image), `NEXUS_SANDBOX_TIMEOUT_MS`.

## Test file
- `server/tests/sandbox.test.ts` (isDockerAvailable, executeSandboxed fallback, metrics).
