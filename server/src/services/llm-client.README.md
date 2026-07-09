# llm-client

## Purpose
Trajectory-aware LLM helper. Wraps an LLM call with a rolling conversation trajectory (`TrajectoryEntry`)
and offers `callLLMWithTrajectory` + `callLLMStructuredWithTrajectory<T>` so callers keep structured memory
of prior turns without re-passing full history. (Cerebrum area.)

## Public exports
- `interface TrajectoryEntry`.
- `interface ClientOptions`.
- `async function callLLMWithTrajectory(opts): Promise<string>`.
- `async function callLLMStructuredWithTrajectory<T>(opts): Promise<T>`.

## Env vars
None directly (delegates to `llm.ts`).

## Test file
- `server/tests/llm-client.test.ts` (trajectory accumulation + structured).
