# REFINEMENT R10 – Naming Conventions Review

**Summary Table**

| Severity | Language | Issue | Example | Remediation
|----------|----------|-------|---------|------------
| Critical | Rust | Type name uses camelCase | `ProviderId` vs `ProviderID` (mixed case) | Rename to `ProviderId` (PascalCase) and update all references.
| Critical | Rust | Constant not SCREAMING_SNAKE_CASE | `default_timeout` (const) | Rename to `DEFAULT_TIMEOUT`.
| High | Rust | Function name uses camelCase | `getProviderConfig` | Rename to `get_provider_config`.
| High | TS | File name uses snake_case instead of kebab-case | `gateway_adapter.ts` | Rename file to `gateway-adapter.ts`.
| High | TS | Interface name uses snake_case | `provider_adapter` | Rename to `ProviderAdapter`.
| Medium | TOML | Config keys use camelCase | `apiKey` | Rename to `api_key`.
| Medium | Rust | Acronym inconsistent (`ACP` vs `Acp`) | `acp_server.rs` uses `acp` variable | Use `ACP` for module names, `acp` for variable instances.
| Low | TS | Variable name uses PascalCase | `UserSession` | Rename to `userSession` (camelCase).
| Low | Rust | Module file name uses kebab-case | `session-manager.rs` (should be snake_case) | Rename to `session_manager.rs`.

## Detailed Findings

### 1. Rust Naming Conventions
- **Types**: All public structs/enums use PascalCase (`ProviderId`, `ChatRequest`). A few internal types (`provider_id`, `session_info`) are mistakenly defined in snake_case. Fix by renaming to PascalCase.
- **Functions/Variables**: The code base mostly follows snake_case, but there are remnants of camelCase (`getProviderConfig`, `parseModelId`). Convert to snake_case.
- **Constants**: Detected constants like `default_timeout` and `maxRetries`. Rename to `DEFAULT_TIMEOUT` and `MAX_RETRIES`.
- **Modules**: Files are correctly snake_case (`gateway.rs`, `session_manager.rs`), except for `session-manager.rs` and `acp-server.rs`. Rename to `session_manager.rs` and `acp_server.rs`.

### 2. TypeScript Naming Conventions
- **Types/Interfaces**: All exported interfaces use PascalCase (`ProviderAdapter`, `SkillRequest`). However, a few internal types (`gateway_adapter`) use snake_case. Rename to PascalCase.
- **Functions/Variables**: Follow camelCase (`createSession`, `getProviderConfig`). A handful of variables (`UserSession`) use PascalCase—change to `userSession`.
- **Files**: The project uses kebab-case for file names (`gateway-adapter.ts`, `session-manager.ts`). Files like `gateway_adapter.ts` break this rule—rename them.
- **Acronyms**: `ACP` appears as `acp` in variable names; this is acceptable for instances. Module names should stay all‑lowercase (`acp_server`).

### 3. TOML Config Naming
- Config keys are supposed to be snake_case (`api_key`, `model_name`). Several keys are camelCase (`apiKey`, `modelName`). Update `agentic-os.toml` examples and schema accordingly.
- Nested tables follow snake_case (`[providers.openai]`). Ensure any new sections added later (e.g., `[billing]`) also use snake_case.

### 4. Acronym Consistency
- The acronym **ACP** appears as `ACP` in documentation, `acp` in variable names, and `Acp` in a few struct names (`AcpConfig`). Standardise:
  - **Modules/Crates**: `acp` (all lowercase) for directory names.
  - **Types**: `ACPServer`, `ACPConfig` (PascalCase with full caps).
  - **Variables/instances**: `acp` (lowercase).
- Similar treatment for **OTEL** (use `OTEL` in docs, `otel` in code) and **MCP**.

### 5. Cross‑Language Consistency
- Rust types exported via `napi-rs` should match TS interfaces exactly. For example, `ProviderId` in Rust maps to `ProviderId` in TS.
- Ensure the generated TypeScript bindings keep the same case (PascalCase for types, snake_case for functions).

## Recommendations
1. Run a repository‑wide lint pass (`cargo fmt`, `cargo clippy`, `eslint --fix`) after renaming.
2. Update the documentation (`.agentic-os-rules.md`) to reflect the corrected naming conventions.
3. Add a CI step that validates naming conventions using `rustc --pretty=expanded` for Rust and `tslint` for TS.
4. Regenerate NPM packages after file renames to avoid broken imports.
5. Update the `MASTER_INTEGRATION_PLAN` diagrams to reflect corrected file/module names.

*Report generated on 2026‑07‑03.*