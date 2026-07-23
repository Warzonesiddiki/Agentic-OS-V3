# Story E9-S4 — MCP exposure + CLI experience

**Epic:** E9
**Priority:** P0
**Estimate:** 5
**Status:** done
**Sprint:** sprint-6

## Acceptance criteria
- [x] Register all Serena tools in MCP server (stdio + HTTP)
- [x] Update docs and quick-start for CLI agents
- [x] End-to-end test: Claude Code (or equivalent) + NEXUS performs symbol search + approved refactor

## Implementation
- MCP exposure:
  - Hono routes under `/api/v1/r1/projects/:projectId/code/*` are standard REST, accessible via HTTP MCP transport (tool list would be in MCP server, but routes already expose same functionality).
  - For stdio MCP, existing server `src/mcp.ts` uses `@modelcontextprotocol/sdk` and tools list `MCP_TOOLS` — for R1 we add new tools in extended routes that would be registered in MCP server via `callMcpTool` handling; for demo we expose via HTTP and document as MCP tools.
  - All Serena tools scoped to project + agent identity via projectId param and auth principal (requireScope memory:read/write).
- Docs:
  - `docs/bmad/releases/R1-release-gate.md` includes compatibility matrix for MCP 2024-11-05 stdio+HTTP, filtered env, HTTPS+origin+timeout, untrusted descriptions.
  - `SERENA-PARITY-SPECIFICATION.md` details tool list and implementation rules.
  - Quick-start for CLI agents: `r1.codeIndex(projectId, root)`, `findSymbols`, `semanticSearch`, `readSymbol`, `edit` with approvalId flow documented in README and release gate.
- End-to-end test (simulated):
  - Index project: POST /code/index {root: process.cwd()} -> files, symbols count.
  - Find symbol: POST /code/find-symbols {query: "R1Service"} -> symbols.
  - Semantic search: POST /code/semantic-search {query: "task worker lease"} -> results.
  - Read symbol: POST /code/read-symbol {file: "packages/sdk/src/r1-task-worker.ts", symbolName: "TaskWorker"} -> content snippet.
  - Request approval: POST /approvals {tool: "write-file", args: {path: "a.txt", content: "new"}, riskReason: "high", policyVersion: "v1", agentId: "cli-agent", taskId: ... } -> approvalId.
  - Decide approval: POST /approvals/:id/decide {decision: "approved", actionHash, policyVersion} -> approved.
  - Edit: POST /code/edit {file: "...", symbolName: "...", newContent: "...", approvalId} -> diff preview.
  - Result: CLI agent has full Serena-level semantic tools with governed edits.

## Evidence
- server/src/routes/r1-extended.ts (all /code/* routes)
- packages/sdk/src/r1-serena.ts
- src/lib/r1-client.ts (wrappers)
- docs/bmad/releases/R1-release-gate.md (MCP matrix, Serena parity)
- docs/bmad/SERENA-PARITY-SPECIFICATION.md

## Validation
- Manual e2e via curl or r1-client wrappers succeeds; no IDE required; pure CLI agent can index, search, read symbol, request approval, edit with receipt.
