# Rust Crates — Agentic OS V3

> **Status (2026-07-22):** Decoupled per ADR-0007. The TypeScript Hono server is the single source of truth for LLM/provider logic. Rust crates are preserved for future native acceleration and do not affect runtime behavior.

## Preserved Crates (7)

| Crate | Purpose | Owner |
|-------|---------|-------|
| `core` | Shared types, errors (`AgenticError`) | Ferric |
| `config` | TOML-first config, validation | Ferric |
| `provider-types` | Canonical types, conversation, retry, thinking, images, formats – Block adaptation from Goose | Ferric |
| `providers` | Provider clients (OpenAI, Anthropic, Ollama, OpenAI-compatible) – uses `ProviderError` not `anyhow::Result`, `LazyLock` not `once_cell` | Ferric |
| `tools` | Tool registry, lifecycle, DashMap | Rusty |
| `nexus-search` | Minimal stub; full napi-rs bindings land with performance rollout | Rusty |
| `nexus-cli` | TUI CLI (ratatui/crossterm) – marketplace browse, agents, webhook verify, shell completions | Rusty |

## Decommissioned Crates (4) – removed 2026-07-22 per Phase 7.1

- `installer` – stub (download/extract/self-update) – 5 files
- `safety` – stub checker (PII/jailbreak) – 4 files, no real regex
- `cli` – stub binary `agentic-os.rs`
- `observability` – stub tracing wrapper

Their workspace dependencies were orphaned and removed from root `Cargo.toml`: `axum`, `tower`, `tower-http`, `hyper`, `hyper-util`, `rusqlite`, `sqlx`, `deadpool-redis`, `flate2`, `dirs`, `which`, `console`, `dialoguer`, `indicatif`, `assert_cmd`, `predicates`, `mockall`, `toml_edit`, `unicode-segmentation`, `once_cell`.

Remaining workspace deps: `tokio`, `serde`, `reqwest`, `rmcp`, `ratatui`, `crossterm`, `sha2`, `clap`, etc – used by preserved crates.

## Future Integration Path

- No FFI, napi-rs, IPC, or HTTP bridge per ADR-0007 (FINAL). Rust ↔ TS boundary is documentation only.
- If native acceleration is desired, implement via `crates/nexus-search` napi-rs bindings and consume via Node `require`.
- Provider logic stays in `server/src/services/providers/*` + `unified-gateway/portkey` – single traced seam.
- TS types are **not** generated from Rust via `ts-rs`; `crates/core/src/types.rs` is a file, not a directory.

## Build

```bash
cargo check --workspace
cargo clippy --all-targets -- -D warnings
cargo test --workspace
```

CI validates Rust but does not block TS delivery – Rust changes are isolated (owners: Ferric/Rusty).

## Notes

- `once_cell::sync::Lazy` replaced with `std::sync::LazyLock` (Rust 1.80+).
- `anyhow::Result` removed from public APIs – use `Result<T, ProviderError>` with local alias `pub type Result<T> = std::result::Result<T, ProviderError>`.
- `nexus-cli` retains `anyhow` for internal error handling but public API is typed.
