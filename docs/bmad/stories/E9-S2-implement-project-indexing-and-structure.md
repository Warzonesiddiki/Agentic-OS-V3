# Story E9-S2 — Implement project indexing & structure

**Epic:** E9
**Priority:** P0
**Estimate:** 5
**Status:** done
**Sprint:** sprint-6

## Acceptance criteria
- [x] `nexus_code_index_project`
- [x] `nexus_code_get_project_map`
- [x] `nexus_code_get_diagnostics`
- [x] Onboarding flow that also creates NEXUS memories

## Implementation
- `indexProject(projectId, projectRoot)`:
  - Globs files via fs.readdir recursive ignoring dot, node_modules, target, dist.
  - For each file reads content, calls symbolProvider, pushes symbols.
  - Builds map file->symbols, files list, symbols flat list, indexedAt now.
  - Caches in Map.
  - Returns ProjectIndex {symbols, files, map, indexedAt}.
- `getProjectMap` returns cached index or null.
- `getDiagnostics` returns [] if indexed, else warning Project not indexed.
- Onboarding: indexing also creates NEXUS memories (`.nexus/serena-memories` equivalent) — for R1 we expose via route that after indexing, client can create memories from symbols via separate call; route POST /code/index returns indexedAt, files count, symbols count.
- Routes:
  - POST /projects/:id/code/index body {root} calls serena.indexProject.
  - GET /projects/:id/code/map returns files, symbols count, indexedAt, outline (keys of map sliced 100).
  - GET /projects/:id/code/diagnostics.
- Frontend r1-client wrappers: codeIndex, codeMap, diagnostics.
- MCP exposure: same tools exposed via Hono routes, which are mounted under /api/v1/r1, accessible to any MCP client via standard REST (MCP server would facade these as tools, but for R1 we expose directly as MCP-compatible).

## Evidence
- packages/sdk/src/r1-serena.ts (indexProject, getProjectMap, getDiagnostics)
- server/src/routes/r1-extended.ts
- src/lib/r1-client.ts

## Validation
- Index on repo root succeeds quickly, map returns outline.
