# Hermes Agent Integration

> **One-time setup. Works automatically forever after.**

[Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research is an
autonomous AI agent framework that supports MCP connections and context files.
NEXUS 2.0 provides a seamless connector that generates everything Hermes needs.

## How It Works

```
┌──────────────┐     MCP (stateless HTTP)     ┌──────────────┐
│ Hermes Agent │ ──── POST /api/mcp ────────▶ │  NEXUS 2.0   │
│  (runtime)   │ ◀── JSON-RPC response ────── │  (memory)    │
│              │                               │              │
│  .mcp.json   │  Auth: Bearer <key>          │  Postgres    │
│  context.md  │  Rate limit: 120/min          │  Audit chain │
└──────────────┘                               └──────────────┘
```

Hermes connects to NEXUS's stateless HTTP MCP transport. Each tool call is a
fresh HTTP POST with a Bearer token. No SSE, no stdio, no sessions to maintain.

## Google A2A (Agent-to-Agent) Inter-Agent Protocol

In addition to MCP, NEXUS 2.0 supports Google's standardized Agent-to-Agent (A2A) protocol:

- **Discovery:** `GET /.well-known/agent.json`
- **Task Creation:** `POST /api/v1/a2a/tasks`
- **SSE Progress Streaming:** `GET /api/v1/a2a/tasks/:id/stream`
- **Outbound Delegation:** `@agentic-os/a2a-server` `A2AClient`

For complete A2A protocol architecture and specifications, see [docs/A2A_PROTOCOL.md](./A2A_PROTOCOL.md).

## One-Time Setup (3 Commands)

```bash
# 1. Ensure NEXUS is running
cd server && npm run dev

# 2. Generate + write integration files with a REAL API key
#    (creates a scoped key in the DB if none exists — no placeholders)
npm run cli -- connect hermes --apply

# 3. Verify the connection works end-to-end
npm run cli -- connect hermes --verify

# 4. Load the context into Hermes
hermes personality load nexus-os-context.md
```

That's it. Hermes will now:

- Auto-connect to NEXUS on every session start
- Call `nexus_recall` before complex tasks
- Call `nexus_remember` after solving problems
- Call `nexus_capture` at session end
- Handle kill switch (423), rate limits (429), and validation errors automatically

## What Gets Generated

### `.mcp.json`

Contains a **real API key** — either from `NEXUS_API_KEY` in `.env`, or a freshly
created scoped principal in the `api_keys` table. The key is stored hashed in the
database; the raw key appears only in this file.

```json
{
  "mcpServers": {
    "nexus": {
      "url": "http://localhost:9900/api/mcp",
      "headers": {
        "Authorization": "Bearer nx_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789",
        "Content-Type": "application/json"
      }
    }
  }
}
```

### `nexus-os-context.md`

A context file that teaches Hermes:

- **When** to call each NEXUS tool (pre-task, post-task, session-end)
- **How** to format arguments (correct kinds, budgets, tags, importance)
- **How** to handle errors (423 kill switch, 429 rate limit, 400 validation)
- **What** the tool signatures are

## Available MCP Tools

| Tool                                                     | When Hermes Calls It   | What It Does                               |
| -------------------------------------------------------- | ---------------------- | ------------------------------------------ |
| `nexus_recall(query, budget)`                            | Before complex tasks   | Retrieves relevant memories/skills/notes   |
| `nexus_remember(kind, title, content, tags, importance)` | After solving problems | Stores a durable typed memory              |
| `nexus_capture(transcript, projectName)`                 | At session end         | Distills transcript into memories + skills |
| `nexus_stats()`                                          | Health check           | Returns counts, token footprint, DB health |
| `nexus_audit_verify()`                                   | Integrity check        | Verifies SHA-256 hash chain                |
| `nexus_feedback(query, itemId, itemType, helpful)`       | After recall           | Records relevance feedback                 |

## Error Handling (Automatic)

The context file instructs Hermes to handle these autonomously:

| Error               | HTTP Code | Hermes Behavior                              |
| ------------------- | --------- | -------------------------------------------- |
| Kill switch engaged | 423       | Stop all writes, inform user NEXUS is locked |
| Rate limited        | 429       | Wait 2 seconds, then retry (no tight loop)   |
| Validation error    | 400       | Read `error.message`, fix payload, retry     |
| Server down         | —         | Gracefully degrade, inform user              |

## Verification

After setup, verify the connection makes **real HTTP requests** against the running server:

```bash
npm run cli -- connect hermes --verify
```

This tests end-to-end:

1. **Health:** `GET /api/v1/health` — server reachable
2. **Auth:** `GET /api/v1/system` — API key accepted (401 if wrong)
3. **Write:** `POST /api/v1/memories` — stores a real test memory (423 if kill switch on)
4. **Read:** `GET /api/v1/recall` — recalls the test memory back
5. **Audit:** `GET /api/v1/audit` — verifies the hash chain is intact after the write

Each step reports pass/fail with timing. Exits non-zero if any step fails.

## Multi-Model Support

Hermes supports any LLM provider (OpenRouter, Anthropic, OpenAI, local models).
The NEXUS integration is model-agnostic — it works with any model Hermes uses,
because NEXUS is accessed via MCP tools, not direct API calls.

Switch models in Hermes without affecting NEXUS:

```bash
hermes model openrouter:anthropic/claude-3.5-sonnet
```

## Platform Support

The integration works across all Hermes execution environments:

- **Local TUI** — `hermes` in the shell
- **Messaging Gateway** — Telegram, Discord, Slack, etc.
- **Docker** — isolated container
- **Serverless** — Modal/Daytona (NEXUS must be network-accessible)

For messaging platforms (Telegram, Discord, etc.), Hermes shares the same NEXUS
memory — so decisions made in Discord are recallable from the CLI.
