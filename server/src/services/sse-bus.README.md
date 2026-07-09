# sse-bus

## Purpose
Server-sent-event fan-out bus. Tracks connected SSE clients, returns an unsubscribe handle on join, and
broadcasts typed events to all clients. Backs the `/api/v1/sse/events` stream.

## Public exports
- `interface SSEWriter` — `{ write(event) , close() }` (StreamWriter-like).
- `function addSSEClient(writer: SSEWriter): () => void` — returns unsubscribe.
- `function getSSEClientCount(): number`.
- `function broadcastSSE(event: { type: string; data: unknown; timestamp: number }): void`.

## Env vars
None directly.

## Test file
- `server/tests/sse-bus.test.ts` (client add/remove, broadcast delivery, count).
