# Serena Parity Specification for NEXUS
## Making CLI Agentic AIs as Powerful as IDE Agents

**Date:** 2026-07-21  
**Status:** Mandatory R1 Requirement  
**Reference:** https://github.com/oraios/serena — "The IDE for your agent"  
**Goal:** After any agentic AI connects to a NEXUS project via CLI (MCP), it must have **the same semantic, symbol-level code intelligence** as Serena.

---

## Why This Matters

Most agents today still work with primitive tools:
- Read entire files
- Grep / regex
- Line-number based edits

**Serena** changed the game by giving agents real IDE-grade understanding (via LSP) through MCP.

NEXUS (as an **Agentic OS**) must deliver this natively, plus integrate it with:
- Governed memory
- Approvals + audit
- Durable tasks
- Project scoping

This is now a **core pillar** of the product.

---

## Required MCP Tools (CLI Agent Experience)

All tools below **must** be available when a CLI agent connects to NEXUS via MCP.

### Core Symbol Intelligence (MUST)

| MCP Tool                        | Serena Equivalent              | Description                                      | Notes |
|--------------------------------|--------------------------------|--------------------------------------------------|-------|
| `nexus_code_find_symbols`      | `find_symbol`                  | Search symbols by name                           | Return locations + context |
| `nexus_code_get_symbol_info`   | hover / symbol details         | Full info about a symbol                         | Type, docs, location |
| `nexus_code_list_references`   | `find_references`              | All references to a symbol                       | With context |
| `nexus_code_navigate_relationships` | call hierarchy / inheritance | Callers, callees, implements, etc.            | |
| `nexus_code_semantic_search`   | semantic search                | Intelligent search across codebase               | Better than grep |
| `nexus_code_read_symbol`       | context reading                | Read only relevant code for a symbol             | Critical for token efficiency |
| `nexus_code_get_diagnostics`   | diagnostics                    | LSP/compiler errors & warnings                   | File or project |
| `nexus_code_get_project_map`   | project structure              | High-level view of the codebase                  | |
| `nexus_code_index_project`     | onboarding / indexing          | Build semantic index + project memories          | |

### Editing & Refactoring (MUST with Governance)

| MCP Tool                        | Serena Equivalent       | Description                              | Governance |
|--------------------------------|-------------------------|------------------------------------------|------------|
| `nexus_code_edit_at_symbol`    | precise edit            | Targeted edit at symbol location         | Requires approval |
| `nexus_code_rename_symbol`     | rename refactoring      | Safe rename across project               | Requires approval + receipt |
| `nexus_code_extract_function`  | extract method          | Extract selected code into function      | Requires approval |
| `nexus_code_apply_edit`        | apply edit              | Apply a previously approved edit         | Must have receipt |

### Additional High-Value Tools (SHOULD)

- `nexus_code_get_document_symbols`
- `nexus_code_get_workspace_symbols`
- `nexus_code_get_type_hierarchy`
- `nexus_code_get_implementations`

---

## Onboarding & Memory Integration

Serena creates `.serena/memories` and a cache during onboarding.

**NEXUS equivalent (MUST):**

1. `nexus_code_index_project` creates:
   - Symbol index/cache
   - Project structure memories
   - Key architectural insights as NEXUS memories (tagged `serena-index`)

2. Agents can later use normal `nexus_recall` + the new code tools together.

---

## Implementation Strategy

1. **Core Engine**
   - Language Server Protocol (LSP) client layer (reuse/expand `packages/nexus-lsp` plan)
   - Or use tree-sitter + custom analyzers for faster start
   - Must support: TypeScript, JavaScript, Rust (minimum)

2. **MCP Exposure**
   - All tools registered in `server/src/mcp.ts`
   - Full scope + project isolation
   - Edits must go through existing approval system

3. **CLI Experience**
   - A developer should be able to do this:
     ```bash
     claude mcp add nexus -- npx nexus-mcp-client --project .
     ```
     Then tell Claude Code:
     > "Use nexus_code_find_symbols to find all authentication related functions, then propose a refactor using nexus_code_edit_at_symbol"

4. **Governance**
   - Read operations: normal memory:read scope
   - Edit/refactor operations: must use the durable approval flow + receipts

---

## Success Criteria

- A fresh Claude Code session connected to a NEXUS project can:
  - Index the project
  - Find symbols semantically
  - Read only relevant code (not whole files)
  - Perform a safe rename with approval
  - Get diagnostics
- Token usage for understanding large codebases is dramatically lower than raw file reading
- All operations are audited and scoped

---

**This specification is now part of the official BMAD PRD and must be treated as a P0 R1 deliverable.**
