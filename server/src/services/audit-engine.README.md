# audit-engine

## Purpose
Hash-chained, append-only audit ledger + secret redaction. Logs agent trajectories and tool receipts,
redacts secrets from payloads, and provides `verifyAndAutoKill` — verifies the chain integrity and trips
the kill-switch if tampering is detected.

## Public exports
- `function redactSecrets(input: string): string` — pure secret scrubber.
- `function redactPayload(payload: unknown): unknown` — pure payload scrubber.
- `interface TrajectoryInput` / `interface ToolReceiptInput`.
- `function hashState(state: string): string` — pure chain hash.
- `async function logTrajectory(input): Promise<void>`.
- `async function logToolReceipt(input): Promise<void>`.
- `async function verifyAndAutoKill(): Promise<{ healthy: boolean; reason?: string }>`.

## Env vars
None directly (uses the audit table + crypto suite).

## Test file
- `server/tests/audit-engine.test.ts` (redaction, hash chain, verifyAndAutoKill).
