# NEXUS V3 — Complete API Route Specification
## REST + SSE Streaming. Every Route. Every Type. Every Status Code.

> **Purpose:** This document is the authoritative API contract. A low-level AI can implement a route handler, write frontend API calls, or build integration tests using only this spec. Every route includes: method, path, auth requirement, request body, response body, error codes, and implementation notes.

---

## CONVENTIONS

| Convention | Value |
|---|---|
| Base URL | `/api/v1` |
| Auth header | `Authorization: Bearer <token>` |
| Response envelope | `{ success: boolean, data?: any, error?: { code: string, message: string } }` |
| Pagination | Query params `?page=1&limit=50`, Response includes `{ total, page, limit, pages }` |
| Streaming | Server-Sent Events (SSE) at `/api/v1/events` |
| Error codes | `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `INTERNAL_ERROR` |
| Content type | `application/json` (except SSE which is `text/event-stream`) |

---

## SECTION 1: AUTHENTICATION ROUTES

### POST /api/v1/auth/login
**Auth:** None required

**Request Body:**
```typescript
{
  email: string;
  password: string;
}
```

**Response 200:**
```typescript
{
  success: true,
  data: {
    token: string;       // JWT
    refreshToken: string;
    user: {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'user' | 'viewer';
    }
  }
}
```

**Error Responses:**
- `400` — `VALIDATION_ERROR`: Missing email or password
- `401` — `UNAUTHORIZED`: Invalid credentials
- `429` — `RATE_LIMITED`: Too many login attempts

### POST /api/v1/auth/register
**Auth:** None required

**Request Body:**
```typescript
{
  email: string;
  password: string;      // Min 8 chars, 1 uppercase, 1 number
  name: string;
  inviteCode?: string;   // Optional, for team invites
}
```

**Response 201:**
```typescript
{
  success: true,
  data: { token: string; user: { id: string; email: string; name: string; role: 'user' } }
}
```

### POST /api/v1/auth/refresh
**Auth:** Bearer token (refresh token type)

**Request Body:**
```typescript
{ refreshToken: string }
```

**Response 200:**
```typescript
{ success: true, data: { token: string; refreshToken: string } }
```

### POST /api/v1/auth/logout
**Auth:** Required

**Response 200:**
```typescript
{ success: true }
```

---

## SECTION 2: AGENT ROUTES

### GET /api/v1/agents
**Auth:** Required
**Query Params:** `?page=1&limit=50&projectId=uuid&status=active|inactive&role=string`

**Response 200:**
```typescript
{
  success: true,
  data: Agent[],  // Array of agent objects
  total: number,
  page: number,
  limit: number
}
```

**Agent type:**
```typescript
interface Agent {
  id: string;
  name: string;
  slug: string;
  role: string;
  goal: string | null;
  backstory: string | null;
  model: string;
  provider: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string | null;
  tools: ToolConfig[];
  memory: MemoryConfig;
  config: Record<string, any>;
  enabled: boolean;
  projectId: string | null;
  lastRunAt: string | null;
  totalRuns: number;
  createdAt: string;
  updatedAt: string;
}
```

### POST /api/v1/agents
**Auth:** Required

**Request Body:**
```typescript
{
  name: string;                    // Required, unique per project
  role: string;                    // Required, e.g. 'researcher', 'coder', 'reviewer'
  goal: string;                    // Required
  backstory?: string;
  model?: string;                  // Default: 'gpt-4o'
  provider?: string;               // Default: 'openai'
  temperature?: number;            // 0-2, default 0.7
  maxTokens?: number;              // Default: 4096
  systemPrompt?: string;
  tools?: string[];                // Tool identifiers
  projectId?: string;
}
```

**Response 201:** `{ success: true, data: Agent }`
**Error:** `400` — name required, role required, goal required. `409` — slug already exists.

### GET /api/v1/agents/:id
**Auth:** Required

**Response 200:** `{ success: true, data: Agent }`
**Error:** `404 — NOT_FOUND: Agent not found`

### PUT /api/v1/agents/:id
**Auth:** Required
**Body:** Partial Agent update fields
**Response 200:** `{ success: true, data: Agent }`

### DELETE /api/v1/agents/:id
**Auth:** Required (admin)
**Response 200:** `{ success: true }`
**Error:** `404 — Not found`

### POST /api/v1/agents/:id/run
**Auth:** Required

**Request Body:**
```typescript
{
  input: string | Record<string, any>;  // Task input
  stream?: boolean;                      // Enable SSE streaming
  timeout?: number;                      // Seconds, default 300
}
```

**Response 200 (non-streaming):**
```typescript
{
  success: true,
  data: {
    taskId: string;
    result: any;
    tokensUsed: { input: number; output: number; total: number };
    durationMs: number;
  }
}
```

**Response (streaming — SSE at /api/v1/agents/:id/run?stream=true):**
```
event: token
data: {"text": "partial output..."}

event: tool_call
data: {"tool": "web_search", "input": {...}, "output": {...}}

event: complete
data: {"taskId": "...", "result": {...}, "tokensUsed": {...}, "durationMs": ...}
```

### POST /api/v1/agents/:id/train
**Auth:** Required (admin)

**Request Body:**
```typescript
{
  feedback: Array<{ input: string; expectedOutput: string }>;
}
```

**Response 200:** `{ success: true, data: { trained: number; improvements: Record<string, number> } }`

---

## SECTION 3: MEMORY ROUTES

### GET /api/v1/memories
**Auth:** Required
**Query:** `?type=episodic|semantic|working|procedural&agentId=uuid&projectId=uuid&q=search&page=1&limit=50`

**Response 200:**
```typescript
{
  success: true,
  data: Array<{
    id: string;
    type: string;
    content: string;
    importance: number;
    metadata: Record<string, any>;
    tags: string[] | null;
    source: string | null;
    createdAt: string;
    similarity?: number;  // Only when q parameter provided
  }>,
  total: number,
  page: number,
  limit: number
}
```

### POST /api/v1/memories
**Auth:** Required

**Request Body:**
```typescript
{
  type: 'episodic' | 'semantic' | 'working' | 'procedural';
  content: string;              // Required
  agentId?: string;
  projectId?: string;
  importance?: number;          // 0-10, default 0
  metadata?: Record<string, any>;
  tags?: string[];
  source?: string;
}
```

**Response 201:** `{ success: true, data: Memory }`

### POST /api/v1/memories/search
**Auth:** Required
**Semantic search** — uses embeddings to find similar memories.

**Request Body:**
```typescript
{
  query: string;                          // Search text (will be embedded)
  type?: string;                          // Filter by memory type
  agentId?: string;
  projectId?: string;
  limit?: number;                         // Default: 10
  minSimilarity?: number;                 // 0-1, default 0.7
}
```

**Response 200:**
```typescript
{
  success: true,
  data: Array<{
    id: string;
    content: string;
    type: string;
    similarity: number;  // Cosine similarity score 0-1
    importance: number;
    createdAt: string;
  }>
}
```

### DELETE /api/v1/memories/:id
**Auth:** Required

### POST /api/v1/memories/consolidate
**Auth:** Required (admin)
**Triggers memory consolidation — summarizes old, low-importance memories.**

**Response 200:**
```typescript
{
  success: true,
  data: {
    consolidated: number;     // Count of consolidated records
    deleted: number;          // Count of deleted records
    tokensSaved: number;      // Estimated token savings
  }
}
```

---

## SECTION 4: KNOWLEDGE BASE ROUTES

### GET /api/v1/knowledge
**Auth:** Required
**Query:** `?projectId=uuid&page=1&limit=50`

**Response 200:** List of knowledge bases with document count.

### POST /api/v1/knowledge
**Auth:** Required
**Create a knowledge base.**

**Request Body:**
```typescript
{ name: string; description?: string; projectId?: string; }
```

### POST /api/v1/knowledge/:id/documents
**Auth:** Required
**Upload documents.** Accepts multipart/form-data with file attachments.

**Form fields:**
- `files: File[]` — One or more files (PDF, DOCX, TXT, MD, HTML, CSV)
- `chunkSize?: number` — Default: 500
- `chunkOverlap?: number` — Default: 50

**Response 201:**
```typescript
{
  success: true,
  data: { documents: number; chunks: number; tokens: number; }
}
```

### GET /api/v1/knowledge/:id/search
**Auth:** Required

**Request Body:**
```typescript
{ query: string; limit?: number; minScore?: number; }
```

**Response 200:**
```typescript
{
  success: true,
  data: Array<{ content: string; source: string; score: number; metadata: Record<string, any> }>
}
```

### DELETE /api/v1/knowledge/:id
**Auth:** Required (admin)

---

## SECTION 5: SKILL & TOOL ROUTES

### GET /api/v1/skills
**Auth:** Required
**Query:** `?projectId=uuid&type=function|prompt|workflow|plugin&enabled=true|false`

**Response 200:** List of skills.

### POST /api/v1/skills
**Auth:** Required

```typescript
{
  name: string;                    // Required, unique per project
  type: 'function' | 'prompt' | 'workflow' | 'plugin';
  description?: string;
  code?: string;                   // For function/plugin types
  prompt?: string;                 // For prompt type
  tools?: ToolDef[];
  config?: Record<string, any>;
  projectId?: string;
}
```

### PUT /api/v1/skills/:id
**Auth:** Required

### DELETE /api/v1/skills/:id
**Auth:** Required (admin)

### POST /api/v1/skills/:id/compile
**Auth:** Required (admin)
**Compiles a skill (for function/plugin types).**

**Response 200:** `{ success: true, data: { compiled: boolean; errors?: string[] } }`

### GET /api/v1/tools
**Auth:** Required
**Lists all available built-in tools.**

**Response 200:**
```typescript
{
  success: true,
  data: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, any>;  // JSON Schema
    outputSchema: Record<string, any>;
    category: string;
    enabled: boolean;
  }>
}
```

### POST /api/v1/tools/mcp
**Auth:** Required (admin)
**Register an MCP tool server.**

```typescript
{
  name: string;
  command: string;        // e.g. "npx @anthropic/mcp-github"
  args?: string[];
  env?: Record<string, string>;
}
```

---

## SECTION 6: WORKFLOW ROUTES

### GET /api/v1/workflows
**Auth:** Required

### POST /api/v1/workflows
**Auth:** Required

```typescript
{
  name: string;
  description?: string;
  steps: Array<{
    id: string;
    type: 'agent' | 'tool' | 'condition' | 'parallel' | 'human_input';
    agentId?: string;
    toolName?: string;
    input: Record<string, any>;
    next?: string;                    // Next step ID (for sequential)
    branches?: Record<string, string>; // For condition: true -> step_id, false -> step_id
    parallelSteps?: string[];         // For parallel type
    timeout?: number;
  }>;
}
```

### POST /api/v1/workflows/:id/execute
**Auth:** Required
**Executes a workflow, returns task IDs.**

**Response 201:**
```typescript
{
  success: true,
  data: {
    workflowId: string;
    taskIds: string[];   // IDs of spawned agent tasks
    status: 'running' | 'awaiting_input';
  }
}
```

### GET /api/v1/workflows/:id/status
**Auth:** Required

```typescript
{
  success: true,
  data: {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_input';
    progress: number;                   // 0-100
    currentStep: string;
    completedSteps: string[];
    failedSteps: string[];
    result?: any;
    error?: string;
  }
}
```

---

## SECTION 7: PROJECT & TEAM ROUTES

### GET /api/v1/projects
**Auth:** Required

### POST /api/v1/projects
**Auth:** Required

```typescript
{ name: string; slug: string; description?: string; }
```

### GET /api/v1/projects/:id
**Auth:** Required

### PUT /api/v1/projects/:id
**Auth:** Required (admin)

### DELETE /api/v1/projects/:id
**Auth:** Required (admin)

### GET /api/v1/projects/:id/members
**Auth:** Required

### POST /api/v1/projects/:id/members
**Auth:** Required (admin)
**Invite a member.**

```typescript
{ email: string; role: 'admin' | 'editor' | 'viewer'; }
```

### DELETE /api/v1/projects/:id/members/:userId
**Auth:** Required (admin)

---

## SECTION 8: AUDIT & OBSERVABILITY ROUTES

### GET /api/v1/audit
**Auth:** Required (admin)
**Query:** `?eventType=string&actorId=string&resourceType=string&from=ISO&to=ISO&page=1&limit=50`

**Response 200:** Paginated audit log entries.

### GET /api/v1/trajectory
**Auth:** Required
**Query:** `?sessionId=string&agentId=string&taskId=string&page=1&limit=50`

**Response 200:** Agent reasoning traces.

### GET /api/v1/trajectory/:id
**Auth:** Required
**Full trace detail including thought process, tool calls, and latency breakdown.**

### GET /api/v1/metrics/costs
**Auth:** Required (admin)

**Query:** `?from=ISO&to=ISO&groupBy=model|provider|agent|project`

```typescript
{
  success: true,
  data: {
    total: { inputTokens: number; outputTokens: number; costUsd: number };
    breakdown: Array<{ group: string; inputTokens: number; outputTokens: number; costUsd: number }>;
    daily: Array<{ date: string; costUsd: number; tokens: number }>;
  }
}
```

### GET /api/v1/metrics/performance
**Auth:** Required (admin)

```typescript
{
  success: true,
  data: {
    avgDurationMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    errorRate: number;
    totalRuns: number;
  }
}
```

---

## SECTION 9: SCHEDULER & AUTOMATION ROUTES

### GET /api/v1/cron
**Auth:** Required
**Query:** `?projectId=uuid&status=active|paused|disabled`

### POST /api/v1/cron
**Auth:** Required

```typescript
{
  name: string;
  agentId: string;
  projectId?: string;
  cronExpression: string;    // Standard cron format
  taskInput: Record<string, any>;
  maxRetries?: number;       // Default: 3
}
```

**Validation:** `cronExpression` must be valid 5-field cron (validated server-side with `cron-parser`).

### PUT /api/v1/cron/:id
**Auth:** Required

### DELETE /api/v1/cron/:id
**Auth:** Required (admin)

### POST /api/v1/cron/:id/trigger
**Auth:** Required
**Manually trigger a cron job immediately.**

### GET /api/v1/webhooks
**Auth:** Required

### POST /api/v1/webhooks
**Auth:** Required

```typescript
{
  name: string;
  url: string;            // Webhook endpoint
  events: string[];       // e.g. ['task.completed', 'agent.error', 'memory.created']
  secret?: string;        // For HMAC verification
  projectId?: string;
}
```

### DELETE /api/v1/webhooks/:id
**Auth:** Required (admin)

---

## SECTION 10: SANDBOX ROUTES

### POST /api/v1/sandbox/execute
**Auth:** Required (admin)

```typescript
{
  code: string;              // Code to execute
  language: string;          // 'javascript' | 'typescript' | 'python' | 'bash'
  timeout?: number;          // Seconds, max 120
  memoryLimit?: number;      // MB, max 512
  networkAccess?: boolean;   // Default false
}
```

**Response 200:**
```typescript
{
  success: true,
  data: {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    memoryUsedMb: number;
  }
}
```

### GET /api/v1/sandbox/executions
**Auth:** Required (admin)
**Query:** `?agentId=uuid&page=1&limit=50`

---

## SECTION 11: SSE STREAMING

### GET /api/v1/events
**Auth:** Required (via query param: `?token=JWT`)
**Content-Type:** `text/event-stream`

**Events sent:**
```
event: agent_start
data: {"agentId": "uuid", "taskId": "uuid", "timestamp": "ISO"}

event: agent_thought
data: {"agentId": "uuid", "thought": "...", "step": 1}

event: agent_tool_call
data: {"agentId": "uuid", "tool": "name", "input": {}, "durationMs": 123}

event: agent_output
data: {"agentId": "uuid", "text": "..."}

event: agent_complete
data: {"agentId": "uuid", "taskId": "uuid", "result": {}, "durationMs": 5000}

event: agent_error
data: {"agentId": "uuid", "taskId": "uuid", "error": "..."}

event: heartbeat
data: {"timestamp": "ISO"}
```

---

## SECTION 12: API KEY ROUTES

### GET /api/v1/api-keys
**Auth:** Required (admin)

### POST /api/v1/api-keys
**Auth:** Required (admin)

```typescript
{
  name: string;
  scopes: string[];     // e.g. ['agents:read', 'agents:write', 'memories:read']
  expiresAt?: string;   // ISO date
  projectId?: string;
}
```

**Response 201:**
```typescript
{
  success: true,
  data: {
    id: string;
    name: string;
    key: string;      // Full key — only shown once!
    keyPrefix: string;
    scopes: string[];
    expiresAt: string | null;
  }
}
```

### DELETE /api/v1/api-keys/:id
**Auth:** Required (admin)

---

## SECTION 13: HEALTH & SYSTEM ROUTES

### GET /api/v1/health
**Auth:** None

```typescript
{
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptime: number;
  db: { connected: boolean; latencyMs: number };
  redis?: { connected: boolean; latencyMs: number };
  timestamp: string;
}
```

### GET /api/v1/plugins
**Auth:** Required
**Query:** `?enabled=true|false`
**Response 200:** List of installed plugins with version, status, permissions.

### POST /api/v1/plugins/:name/install
**Auth:** Required (admin)
**Install a plugin from the registry or local path.**

```typescript
{ source?: 'registry' | 'local'; version?: string; }
```

### POST /api/v1/plugins/:name/uninstall
**Auth:** Required (admin)

### POST /api/v1/plugins/:name/toggle
**Auth:** Required (admin)
```typescript
{ enabled: boolean }
```

---

## SECTION 14: SETTINGS ROUTES

### GET /api/v1/settings
**Auth:** Required
**Query:** `?scope=user|project|system`

### PUT /api/v1/settings
**Auth:** Required

```typescript
{
  scope: 'user' | 'project' | 'system';
  settings: Record<string, any>;
}
```

---

## ROUTE COVERAGE MATRIX TEMPLATE (to update after Phase 0)

| Route | Phase | Frontend Call | Server Handler | Status |
|---|---|---|---|---|
| POST /api/v1/auth/login | 1 | ? | ? | ? |
| GET /api/v1/agents | 2 | ? | ? | ? |
| ... | ... | ... | ... | ... |

**After Phase 0 audit, fill this table completely.**

---

## ERROR HANDLING PATTERNS

```typescript
// Standard error response format
interface ApiError {
  code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN' | 
        'RATE_LIMITED' | 'CONFLICT' | 'INTERNAL_ERROR' | 'PAYLOAD_TOO_LARGE' |
        'DEPENDENCY_FAILURE' | 'TIMEOUT';
  message: string;
  details?: Record<string, any>;  // e.g. validation errors per field
}

// Implementation pattern (Hono):
// app.onError((err, c) => {
//   if (err instanceof ValidationError) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.message, details: err.details } }, 400);
//   if (err instanceof NotFoundError) return c.json({ success: false, error: { code: 'NOT_FOUND', message: err.message } }, 404);
//   // ... etc
// })
```

---

## RATE LIMITING

| Endpoint Group | Rate Limit | Burst |
|---|---|---|
| Auth (login, register) | 10/min | 20 |
| Agent execution | 60/min | 100 |
| Memory read/search | 120/min | 200 |
| Memory write | 60/min | 100 |
| Knowledge operations | 30/min | 50 |
| Admin operations | 120/min | 200 |
| Public (health) | 1000/min | No limit |
| API keys | Varies by tier | Varies |

Rate limit headers returned:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1700000000
```

---

## SSE RECONNECTION LOGIC (Frontend)

```typescript
// Use built-in EventSource with reconnection:
// - EventSource auto-reconnects on connection drop
// - Exponential backoff: 1s → 2s → 4s → 8s → max 30s
// - On reconnect, server sends missed events from last known event ID
// - EventSource.onerror → attempt reconnect, show "Reconnecting..." indicator
// - After 5 failed reconnects, prompt user to reload
```
