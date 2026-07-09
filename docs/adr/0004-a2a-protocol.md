# 0004 – Google A2A Protocol Integration

**Status:** Final
**Author:** Atlas
**Date:** 2026-07-01

## Context

NEXUS is not a single agent — it is an agentic operating system that hosts,
orchestrates, and routes work across multiple agents. Agents need to
delegate subtasks to each other and to remote agents running in other
runtimes.

Google's Agent-to-Agent (A2A) protocol (specification v0.3) standardizes
how agents discover each other, submit tasks, and stream progress. The
ecosystem also includes the Agent Card discovery format (`.well-known/agent.json`)
for capability advertisement.

NEXUS already had an internal agent runtime and task scheduler. A2A adds
interoperability: a Claude Code agent running in the local OS can delegate
a subtask to a remote A2A agent, and external A2A clients can offload work
into NEXUS.

## Decision

### Endpoint layout

All A2A endpoints are mounted under `/api/v1/a2a/` on the Hono server
(`packages/a2a-server`):

| Method | Path                           | Purpose                                 |
| ------ | ------------------------------ | --------------------------------------- |
| `GET`  | `/.well-known/agent.json`      | Agent Card (capabilities, skills, auth) |
| `GET`  | `/.well-known/agent-card.json` | Alias for agent discovery               |
| `GET`  | `/api/v1/a2a/agents`           | List local agent descriptors            |
| `POST` | `/api/v1/a2a/tasks`            | Create a subtask                        |
| `GET`  | `/api/v1/a2a/tasks/:id`        | Poll task status                        |
| `GET`  | `/api/v1/a2a/tasks/:id/stream` | SSE task event stream                   |

### Agent Card (`/.well-known/agent.json`)

Standard A2A discovery metadata: protocol version 0.3.0, capabilities
(streaming + state transition history), bearer auth scheme, and a skills
manifest derived from the NEXUS skill registry.

### Task lifecycle

```
pending → running → completed
                ↘ failed
```

1. **Task creation** (`POST /api/v1/a2a/tasks`): receives a `goal` string
   and optional `input` JSON. Returns `taskId`, `contextId`, and initial
   `status: "pending"`. The request is validated for bearer token and
   optional SHA-256 HMAC signature (`X-A2A-Signature` header).
2. **Execution** (async): the `A2ATaskManager` enqueues the goal into the
   NEXUS agent runtime — same scheduler, same queues, same audit chain.
3. **Status polling** (`GET /api/v1/a2a/tasks/:id`): returns current status,
   steps, and log output.
4. **SSE streaming** (`GET /api/v1/a2a/tasks/:id/stream`): real-time events
   (`task.started`, `task.step`, `task.completed`, `task.failed`).

### Outbound A2A client (`A2AClient`)

NEXUS can also delegate work _to_ external A2A agents:

```typescript
const client = new A2AClient({ bearerToken: process.env.A2A_BEARER_TOKEN });
const card = await client.discover('http://remote-agent:3000');
const task = await client.submitTask('http://remote-agent:3000', {
  goal: 'Perform static security analysis',
});
await client.streamTaskProgress(url, task.taskId, (event) => { ... });
```

### Security

- Bearer token authentication (shared secret, configurable).
- Optional SHA-256 HMAC request signing (`X-A2A-Signature`) for
  non-repudiation.
- All A2A task execution passes through the NEXUS auth/scope/policy
  pipeline (rings, approval gates, audit).
- The A2A surface is behind the same Hono middleware stack as REST and
  MCP endpoints.

## Consequences

Positive:

- Interoperable: any A2A-compliant agent (Google ADK, Vertex AI Agent
  Builder, custom agents) can delegate into NEXUS and receive delegations.
- Reuses the existing agent scheduler, audit chain, and policy engine —
  A2A tasks are not special, they are agent tasks with an A2A wrapper.
- Streaming via SSE gives callers real-time progress without polling.

Negative:

- Push notifications are not implemented (the Agent Card advertises
  `pushNotifications: false`). Clients must poll or use the SSE stream.
- The HMAC signing adds a per-request signature verification step that
  is rarely exercised — risk of the codepath bit-rotting.
- Protocol is at v0.3 — breaking changes between spec revisions will
  require endpoint migration.
