# sandbox-worker

## Purpose
Background worker variant of sandboxed execution. `executeInWorker` runs untrusted code off the request path
(with its own timeout/resource ceiling) and returns a `SandboxResult`. Shares `SandboxInput`/`SandboxResult`
shapes with `sandbox.ts`. (Artisan area.)

## Public exports
- `interface SandboxInput`, `interface SandboxResult` (re-exports).
- `async function executeInWorker(input: SandboxInput): Promise<SandboxResult>`.

## Env vars
- `NEXUS_SANDBOX_ENABLED`, `NEXUS_SANDBOX_TIMEOUT_MS` (delegated to `sandbox.ts`).

## Test file
- `server/tests/sandbox-worker.test.ts` (executeInWorker happy path + timeout).
