# 0003 – MCP Protocol Integration (Streamable HTTP)

**Status:** Final
**Author:** Atlas
**Date:** 2026-07-01

## Context

NEXUS exposes its internal tools, memory, and audit system to external AI
agents (Claude Code, Cursor, custom clients). The Model Context Protocol
(MCP) is the emerging standard for this integration, defining how clients
discover and call tools, read resources, and use prompts.

The MCP specification defines two transport modes:

1. **Stdio transport:** spawn a child process and communicate over stdin/stdout.
2. **Streamable HTTP transport:** stateless HTTP POST with JSON-RPC 2.0, no
   persistent connection required.

For a running Hono server already listening on port 9900, stdio transport
would require a separate process per client — wasteful and complex. Streamable
HTTP maps naturally onto the existing REST infrastructure: one port, one auth
layer, one set of middlewares.

## Decision

### Transport: Streamable HTTP via `@modelcontextprotocol/sdk`

The MCP endpoint is mounted at `POST /api/mcp` on the existing Hono server
(`server/src/mcp-http.ts`). Each request creates a fresh `McpServer` +
`StreamableHTTPServerTransport` pair — fully stateless.

No SSE, no session IDs, no persistent connections. Every request carries its
own authorization header.

### Tool surface

| Tool                 | Scope        | Description                                              |
| -------------------- | ------------ | -------------------------------------------------------- |
| `nexus_recall`       | memory:read  | Token-budgeted recall across memories, skills, and notes |
| `nexus_remember`     | memory:write | Store a durable memory                                   |
| `nexus_capture`      | memory:write | Capture + distill a session transcript                   |
| `nexus_feedback`     | memory:write | Record recall relevance feedback                         |
| `nexus_audit_verify` | audit:read   | Verify hash-chained audit log integrity                  |
| `nexus_stats`        | memory:read  | Return brain statistics                                  |

> **Current Reality (2026-07-09 reconciliation):** the original ADR ratified the 6 tools above as
> the _foundational_ MCP surface. The implemented server (`server/src/mcp.ts` + `mcp-http.ts` +
> `services/mcp-registry.ts`) has since grown to **~14 tools and 4 resource URI patterns** (per
> `AGENTS.md`). The 6 here remain valid as the core set; newer tools (e.g. kernel/scheduler
> introspection, self-opt control, marketplace/skill ops) are registered via the same
> `server.tool()` mechanism described in §Consequences. The authorization chain (auth → scope →
> dispatch) is unchanged.### Resource surface

| URI                     | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `nexus://brain/stats`   | Memory/skill counts                              |
| `nexus://brain/health`  | DB reachability, kill switch, audit status       |
| `nexus://brain/ambient` | Compact top-importance memory context (markdown) |

### Prompt surface

| Name                 | Description                                         |
| -------------------- | --------------------------------------------------- |
| `recall-and-execute` | Ground a task in recalled memory, then execute      |
| `resume-work`        | Summarize where work left off and propose next step |
| `capture-session`    | Distill a transcript into memories and skills       |

### Authentication and authorization

Every tool call passes through the same auth chain as REST routes:

```
MCP JSON-RPC → route guard → key hash lookup → scope resolution → tool dispatch
```

All mutations (`nexus_remember`, `nexus_capture`, `nexus_feedback`) require
a valid bearer token. Destructive operations additionally require the
`brain:admin` scope.

Each tool declares its required scopes; the SDK middleware enforces them
during the `CallToolRequest` handler before any business logic runs.

### Client configuration

MCP clients configure the server via the standard `mcpServers` block in
their project's `.mcp.json`:

```json
{
  "mcpServers": {
    "nexus": {
      "url": "http://localhost:9900/api/mcp",
      "headers": {
        "Authorization": "Bearer nx_live_..."
      }
    }
  }
}
```

### Browser build (separate path)

The browser-only build (`src/lib/mcp.ts`) defines the same tool signatures
but has no transport — tools are callable via the in-app API Console only.
An external MCP client cannot connect to the browser build. This is an
acknowledged limitation: the browser build lives in a web origin with no
MCP-compatible HTTP endpoint.

## Consequences

Positive:

- Single auth layer for MCP and REST — no separate key management.
- Stateless design fits serverless and container orchestration without
  sticky sessions.
- MCP tools share the same Zod validation, scope enforcement, and audit
  logging as the HTTP API.
- Adding a new tool is a single `server.tool()` registration.

Negative:

- No push/notification support — clients must poll for task completion.
- The stateless transport re-creates the `McpServer` on every request
  (negligible cost but not idiomatic MCP usage).
- Client-side tool discovery only works if the MCP config snippet is
  manually pasted into each client project.
