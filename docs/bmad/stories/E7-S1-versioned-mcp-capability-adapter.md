# Story E7-S1 — Versioned MCP capability adapter

**Epic:** E7 Interoperability and optional shared mode
**Priority:** P2
**Estimate:** 8
**Status:** done
**Sprint:** sprint-7
**Dependencies:** E4-S1, E4-S3, E5-S2

## User story
As a developer, I want to connect a selected MCP server through NEXUS policy so that tool integrations do not bypass governance.

## Acceptance criteria
- [x] Supported MCP version and transports are declared in a compatibility matrix.
- [x] Server discovery/listing is authorization-aware and deterministic.
- [x] Tool schemas are validated; annotations are treated as untrusted.
- [x] Local STDIO environment is filtered; remote HTTP uses configured auth/origin/timeout controls.
- [x] Tool calls flow through capability policy, approval, receipt, audit, and trace boundaries.
- [x] Unsupported protocol behavior fails with a clear capability error.

## Implementation
- SDK `MCPAdapter` with `MCPCompatibilityMatrix` versions ['2024-11-05','2024-10-07'] transports ['stdio','http','sse'] default 2024-11-05 deprecated 2024-10-07.
- `filterEnv` removes secrets (password|secret|token|api key etc) and only allows PATH/HOME/USER/NEXUS_ prefixed, enforcing local STDIO env filtered.
- Remote HTTP: auth type bearer/oauth requires token, origin must be https or localhost, timeout validated <=60s.
- Discovery: `discover(owner)` lists servers for owner, checks `isOwnerAuthorized`, sorts deterministically by id.
- Tool schema validation: `validateToolSchema` requires type or properties, annotations stored but ignored for policy (untrusted).
- Tool calls: `callTool` validates server exists/enabled, transport in matrix, tool exists, schema valid, required args, policy check via `capabilityPolicyCheck` returning allow/deny/approval_required, approval required must have approvalId, remote origin check, timeout control.
- Receipt: generates receiptId, returns result with policyDecision, telemetry span kind tool.
- SQL: `r1_mcp_servers` table id/name/version/transport/endpoint/command/env/owner/scopes/enabled/auth with indexes.
- Routes: GET /mcp/compatibility, GET /projects/:id/mcp/servers, POST /mcp/servers, GET /servers/:id/tools, POST /servers/:id/call (requires memory:write, policy, approval, receipt, audit, trace).
- Frontend: r1-client wrappers mcpCompatibility, listMcpServers, registerMcpServer, callMcpTool.

## Evidence
- packages/sdk/src/r1-mcp-adapter.ts
- packages/sdk/src/sql-e7-repositories.ts SqlMCPRepo
- server/src/db/migrations/0053_r1_sync.sql (r1_mcp_servers)
- server/src/services/r1-extended-runtime.ts (MCPAdapter with SqlMCPRepo)
- server/src/routes/r1-extended.ts (MCP routes)
- src/lib/r1-client.ts

## Validation
- Unsupported version throws clear capability error with supported list.
- STDIO env secrets filtered, remote origin https enforced.
- Policy denied and approval required paths fail closed.
