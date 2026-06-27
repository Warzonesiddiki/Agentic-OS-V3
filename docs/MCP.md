# MCP (Model Context Protocol) Integration

## Overview

NEXUS 2.0 exposes tools, resources, and prompts over the Model Context Protocol.

- **Browser build** (`src/lib/mcp.ts`): tool definitions exist but no transport is wired — the tools can be called via the in-app API Console but no external MCP client can connect.
- **Server build** (`server/src/mcp.ts` + `server/src/mcp-http.ts`): real Streamable HTTP transport over `@modelcontextprotocol/sdk`, mounted at `/api/mcp`, auth required.

## Server MCP endpoint

```
POST /api/mcp
Authorization: Bearer <api-key>
Content-Type: application/json
```

Stateless mode: no session ID, no SSE, plain JSON responses. The server creates a fresh `McpServer` + `StreamableHTTPServerTransport` per request.

## Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `nexus_recall` | memory:read | Token-budgeted recall across memories, skills, and notes |
| `nexus_remember` | memory:write | Store a durable memory |
| `nexus_capture` | memory:write | Capture + distill a session transcript (transcript always preserved) |
| `nexus_feedback` | memory:write | Record recall relevance feedback |
| `nexus_audit_verify` | audit:read | Verify hash-chained audit log integrity |
| `nexus_stats` | memory:read | Return brain statistics (counts) |

## Resources

| URI | Description |
|-----|-------------|
| `nexus://brain/stats` | Memory/skill counts |
| `nexus://brain/health` | DB reachability, kill switch, audit status |
| `nexus://brain/ambient` | Compact top-importance memory context (markdown) |

## Prompts

| Name | Description |
|------|-------------|
| `recall-and-execute` | Ground a task in recalled memory, then execute |
| `resume-work` | Summarize where work left off and propose next step |
| `capture-session` | Distill a transcript into memories and skills |

## Scope enforcement

Every tool checks the caller's scopes before executing. If the caller lacks the required scope, the tool returns a `FORBIDDEN` error with the missing scope name. Tools never bypass auth or the kill switch.

## Connecting a client

```bash
# Generate an MCP config snippet
nexus mcp-config
```

Or manually:

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

For Claude Code, place in `.mcp.json` at project root. For Cursor, place in `.cursor/rules/nexus.mdc`. For generic MCP clients, use the URL + auth header directly.
