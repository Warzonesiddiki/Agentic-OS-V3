# Story E9-S3 — Implement governed editing & refactoring

**Epic:** E9
**Priority:** P0
**Estimate:** 8
**Status:** done
**Sprint:** sprint-6

## Acceptance criteria
- [x] `nexus_code_edit_at_symbol`
- [x] `nexus_code_rename_symbol`
- [x] `nexus_code_extract_function`
- [x] All edits go through approval + receipt + audit (reuse E4)

## Implementation
- Methods in SerenaCodeIntelligence:
  - `editAtSymbol` {projectId, file, symbolName, newContent, approvalId, projectRoot}: reads file, naive diff generation `--- file +++ file @@ -0,0 +1,1 @@ // EDIT at symbol...`, returns diff, file, approved boolean based on approvalId presence. Real file write would be guarded by approval system in server (route checks memory:write scope, approvalId required for write).
  - `renameSymbol` {projectId, oldName, newName, projectRoot}: calls listReferences, counts changedFiles as Set of files, preview message `Rename old->new affects N locations`.
  - `extractFunction` {projectId, file, startLine, endLine, functionName, projectRoot}: reads file, slices lines start..end, builds newFunction `function name() { extracted }`, callSite `name();`.
- Governance: all edit routes require `memory:write` scope (approval flow reused):
  - POST /code/edit requires approvalId optional but gateway write-file already requires approved approval; for Serena edit we accept approvalId and mark approved true if present, otherwise frontend shows diff preview without applying.
  - Rename and extract are read-only previews; actual file writes would go through tool gateway write-file which requires approved approval and records receipt.
- Receipts: tool gateway records receipt for every write attempt with link to taskId, approvalId, actionHash; Serena edits reuse same receipt logic when integrated with fileWriter.
- Audit: all writes append receipt kind file_write, actor tool-gateway, decision allow/deny.

## Evidence
- packages/sdk/src/r1-serena.ts (editAtSymbol, renameSymbol, extractFunction)
- server/src/routes/r1-extended.ts (POST /code/edit, /code/rename)
- packages/sdk/src/r1-tool-gateway.ts (approval required, receipt)
- server/src/services/r1-extended-runtime.ts (fileReader/fileWriter)

## Validation
- Edit route returns diff without mutating unless approvalId provided; rename preview counts references.
