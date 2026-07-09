# message-bus

## Purpose
In-process IPC message bus (EventEmitter-backed) for cross-agent communication. Supports pub/sub,
filtered subscriptions, request/response (RPC) with correlation ids, dead-letter capture, and stats.
Backend is `memory` or `redis` (via `NEXUS_BUS_BACKEND`).

## Public exports (selected)
- Types: `MessageKind`, `BusMessage`, `BusSubscription`, `DeadLetterEntry`, `RpcRequest`, `RpcResponse`,
  `BusStats`, `MessageFilter`.
- `class MessageBus extends EventEmitter` — `publish`, `subscribe`, `request`/`respond` (RPC),
  `getStats`, `getDeadLetters`.
- `function getMessageBus()`, `resetMessageBus()`.

## Env vars
- `NEXUS_BUS_BACKEND` — `memory` (default) | `redis`.
- `NEXUS_REDIS_URL` — required when backend is `redis`.

## Test file
- `server/tests/message-bus.test.ts` (publish/subscribe, RPC, dead-letter, filters).
