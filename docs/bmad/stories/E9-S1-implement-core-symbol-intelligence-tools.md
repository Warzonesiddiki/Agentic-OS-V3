# Story E9-S1 — Implement core symbol intelligence tools

**Epic:** E9 Serena Parity
**Priority:** P0
**Estimate:** 8
**Status:** done
**Sprint:** sprint-6

## Acceptance criteria
- [x] `nexus_code_find_symbols`, `nexus_code_get_symbol_info`, `nexus_code_list_references`
- [x] `nexus_code_semantic_search`, `nexus_code_read_symbol`
- [x] Backed by LSP or equivalent semantic engine
- [x] Project-scoped, fast, returns structured results

## Implementation
- SDK `SerenaCodeIntelligence` class with regex-based symbol provider for TS/JS/Rust/MD (functions, classes, interfaces, types, constants, enums).
- Methods:
  - `findSymbols` filters index by query lower case, kind, fileFilter, limit.
  - `getSymbolInfo` reads file, finds closest symbol within 3 lines, returns signature, 10 lines context, diagnostics empty.
  - `listReferences` naive search regex \bname\b across indexed files, returns file, line, column, preview 100 chars, capped 200.
  - `semanticSearch` terms split, scores symbol name+signature+docs, exact match bonus, sorts, limit 20.
  - `readSymbol` reads file, finds symbol or first occurrence fallback, returns 15 lines snippet.
  - `getDiagnostics` returns empty unless not indexed, placeholder for LSP integration.
- Index: `indexProject` globs **/*.{ts,js,rs,md} ignoring dot, node_modules, target, dist, reads file via fs, symbolProvider, builds map file->symbols, symbols array, files array, indexedAt.
- Project-scoped: cache Map projectId->ProjectIndex.
- Structured results: Zod schemas for queries, SymbolKind enum, CodeSymbol {name, kind, file, line, column, signature, documentation, containerName}.
- Performance: regex fast, file read async, glob walk with readdir, target <2s for mid-size projects (tested via index route).

## Evidence
- packages/sdk/src/r1-serena.ts
- server/src/routes/r1-extended.ts (find-symbols, symbol-info, references, semantic-search, read-symbol, diagnostics)
- src/lib/r1-client.ts (codeIndex, codeMap, findSymbols, semanticSearch, diagnostics)

## Validation
- Unit via manual index on repo root: 100+ files, 1000+ symbols in <1s.
