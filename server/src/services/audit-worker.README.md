# audit-worker

## Purpose
Background worker for the hash-chained audit ledger. Computes tamper-evident hashes asynchronously
(`computeHashAsync` / `computeHashSync`) and runs a periodic verification/forwarding loop; `terminateAuditWorker`
stops it cleanly. (Aegis area.)

## Public exports
- `async function computeHashAsync(prevHash: string, payload: string): Promise<string>`.
- `function computeHashSync(prevHash: string, payload: string): string`.
- `async function terminateAuditWorker(): Promise<void>`.

## Env vars
None directly.

## Test file
- `server/tests/audit-worker.test.ts` (hash async/sync determinism, terminate).
