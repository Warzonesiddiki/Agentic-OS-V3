# Google Gemini CLI A2A (Agent-to-Agent) Protocol Specification & Architecture

> **Google A2A Standard Compliant Inter-Agent Protocol Implementation for Nexus Agentic OS V3.**

## Overview

The `packages/a2a-server` package and `/api/v1/a2a/*` routes expose Google's Agent-to-Agent (A2A) inter-agent protocol. This enables Nexus Agentic OS to:

1. Serve standardized discovery metadata at `/.well-known/agent.json` and `/.well-known/agent-card.json`.
2. Accept remote subtask creation via `POST /api/v1/a2a/tasks`.
3. Provide status progress polling via `GET /api/v1/a2a/tasks/:id`.
4. Stream real-time task log events to calling remote agents via Server-Sent Events (`GET /api/v1/a2a/tasks/:id/stream`).
5. Discover and delegate subtasks to external A2A agents via the outbound `A2AClient`.
6. Enforce bearer token authentication and SHA-256 HMAC request signature verification (`X-A2A-Signature`).

---

## Architecture & Endpoints

```
                               ┌─────────────────────────────────┐
                               │     External Remote Agent       │
                               └─────────────────────────────────┘
                                                │
       ┌────────────────────────────────────────┼────────────────────────────────────────┐
       │                                        │                                        │
       ▼                                        ▼                                        ▼
GET /.well-known/agent.json       POST /api/v1/a2a/tasks                 GET /api/v1/a2a/tasks/:id/stream
(Agent Card Discovery)            (Task Payload & Auth/Sig)              (Real-Time SSE Streaming)
       │                                        │                                        │
       └────────────────────────────────────────┼────────────────────────────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │         A2ATaskManager          │
                               └─────────────────────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │       Nexus Agent Runtime       │
                               │    (runAgent Action Engine)     │
                               └─────────────────────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │       SHA-256 Audit Engine      │
                               └─────────────────────────────────┘
```

---

## Endpoint Reference

### 1. Agent Discovery (`GET /.well-known/agent.json`)

Serves standard AgentCard JSON metadata detailing capabilities, skills, and authentication:

```json
{
  "name": "Nexus Agentic OS V3 A2A Agent",
  "description": "Google Gemini CLI A2A Inter-Agent Protocol Server for task creation, agent discovery, and real-time streaming.",
  "url": "http://localhost:3000/",
  "provider": {
    "organization": "Nexus AI",
    "url": "https://nexus-ai.org"
  },
  "protocolVersion": "0.3.0",
  "version": "2.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": true
  },
  "securitySchemes": {
    "bearerAuth": {
      "type": "http",
      "scheme": "bearer"
    }
  },
  "security": [{ "bearerAuth": [] }],
  "skills": [...]
}
```

### 2. Local Agent Listing (`GET /api/v1/a2a/agents`)

Returns all active local agent descriptors and capabilities.

### 3. Task Creation (`POST /api/v1/a2a/tasks`)

Creates a task execution instance:

**Headers:**

- `Authorization: Bearer <A2A_BEARER_TOKEN>` _(optional/enforced if configured)_
- `X-A2A-Signature: <sha256_hmac>` _(optional/enforced if configured)_

**Body:**

```json
{
  "goal": "Execute code audit and recall database settings",
  "input": { "depth": "full" },
  "actor": "remote-agent-1"
}
```

**Response (201 Created):**

```json
{
  "ok": true,
  "data": {
    "taskId": "task_abc123",
    "contextId": "ctx_def456",
    "status": "pending"
  }
}
```

### 4. Task Status (`GET /api/v1/a2a/tasks/:id`)

Returns current status (`pending`, `running`, `completed`, `failed`), steps, and logs.

### 5. SSE Real-Time Streaming (`GET /api/v1/a2a/tasks/:id/stream`)

Streams real-time event logs and step outputs:

```
data: {"type":"task.started","taskId":"task_abc123","timestamp":1780500000,"data":{...}}

data: {"type":"task.step","taskId":"task_abc123","timestamp":1780500005,"data":{"step":{...}}}

data: {"type":"task.completed","taskId":"task_abc123","timestamp":1780500010,"data":{...}}
```

---

## Outbound A2A Client (`A2AClient`) Usage

```ts
import { A2AClient } from '@agentic-os/a2a-server';

const client = new A2AClient({
  bearerToken: process.env.A2A_BEARER_TOKEN,
  timeoutMs: 15000,
});

// 1. Discover remote agent
const card = await client.discover('http://remote-agent:3000');

// 2. Submit task
const taskRes = await client.submitTask('http://remote-agent:3000', {
  goal: 'Perform static security analysis',
});

// 3. Stream progress
await client.streamTaskProgress('http://remote-agent:3000', taskRes.taskId, (event) => {
  console.log('Received remote event:', event.type, event.data);
});
```
