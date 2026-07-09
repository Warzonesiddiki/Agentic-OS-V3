# 0007 – Rust–TypeScript Boundary: Current Decoupled State

**Status:** Final
**Author:** Atlas
**Date:** 2026-07-01

## Context

The NEXUS repository contains two substantial codebases written in
different languages:

1. **TypeScript** — active application code: Hono server (port 9900),
   React frontend (port 1422), shared packages (SDK, devtools).
2. **Rust** (`crates/`) — ~15,000 lines of provider implementations
   (OpenAI, Anthropic, Ollama), CLI stubs, config management, tool
   registry, and safety filters.

The Rust codebase was ported from the Goose project's provider layer to
serve as a high-performance LLM provider backend. It compiles and passes
`cargo clippy`. However, it has **no runtime connection** to the
TypeScript application — no FFI, no napi-rs bindings, no IPC, no
HTTP bridge.

The result is two complete, separate systems sharing a git repository
but not a runtime.

## Decision

### Acknowledge the current decoupled state

The Rust crates are **not wired into the active application**. The Hono
server makes LLM calls from TypeScript via its **provider-adapter gateway**
(`server/src/services/providers/*` implementing `ProviderAdapter` from
`llm-gateway-v2.ts`, wrapped by the unified gateway `unified-gateway/portkey`
— see `llm-router.ts`, `llm-client.ts`, `omniroute*.ts`). The npm `openai` /
`@anthropic-ai/sdk` packages cited in the original ADR are **NOT present in
`server/package.json`** (corrected 2026-07-09 per AGENTS.md "Current Reality");
the TS provider-adapter layer is the single source of truth for LLM/provider
logic. The Rust providers exist as a parallel implementation with no callers.

This ADR formalizes that gap and records the reasoning, rather than
pretending a bridge exists or attempting to force one.

### Why the decoupling happened

1. **Architecture mismatch:** The Rust workspace was designed as a
   self-contained CLI with its own configuration, error types, and
   lifecycle. The Hono server is an async event-loop HTTP service.
   Bridging them would require either:
   - A `napi-rs` native module loaded into the Node process (complex
     build pipeline, cross-platform binaries, version coupling).
   - A sidecar process communicating over HTTP/gRPC (operational
     complexity, serialization overhead, two deployment artifacts).
2. **Velocity:** The TypeScript provider integrations were faster to
   ship because they reuse the existing `fetch`-based HTTP client,
   error handling, and config schemas. The Rust code would need its
   own HTTP client, serialization, and config pipeline wired through
   the bridge.
3. **No clear performance win:** For the LLM provider use case (HTTP
   calls to external APIs), the bottleneck is network latency, not
   CPU. The Rust implementation does not offer a meaningful latency
   or throughput advantage over TypeScript for this workload.

### What the Rust codebase contains

| Crate                   | LOC  | Purpose                                            |
| ----------------------- | ---- | -------------------------------------------------- |
| `crates/providers`      | ~6K  | OpenAI, Anthropic, Ollama provider impls           |
| `crates/provider-types` | ~4K  | Canonical model types, conversation types, formats |
| `crates/core`           | ~1K  | Core types, errors (`AgenticError`)                |
| `crates/config`         | ~1K  | Configuration loading, provider config             |
| `crates/tools`          | ~1K  | Tool registry, lifecycle, builtin tools            |
| `crates/cli`            | ~1K  | CLI entrypoint (placeholder)                       |
| `crates/installer`      | ~500 | Self-updater stubs                                 |

### What this means for development

- **Rust changes do not affect the running application.** Modifying
  `crates/` will not change the behavior of the Hono server, the
  frontend, or any user-facing feature.
- **TypeScript changes do not need Rust counterparts.** The npm SDK
  packages are the single source of truth for LLM provider logic.
- The Rust code is **not dead** — it is a dormant alternative
  implementation that could be activated if a future requirement
  (e.g., local inference via llama.cpp, zero-dependency binary for
  embedded devices) justifies the bridge investment.

### Future activation triggers

A bridge should be built only if one or more of these conditions hold:

1. **Local inference:** A Rust-based ONNX/llama.cpp inference runtime
   that cannot be called from TypeScript.
2. **Binary distribution:** Shipping a single static binary where
   bundling a Node.js runtime is unacceptable.
3. **Proven CPU bottleneck:** Profiling shows LLM response processing
   (tokenization, JSON parsing) is a significant CPU drain that Rust
   can eliminate.

### If reactivated: preferred bridge strategy

```
Rust crate → napi-rs → Node.js native addon → Hono server
```

Or, for sidecar isolation:

```
Rust binary (sidecar) → HTTP/unix socket → Hono server
```

The `napi-rs` path is preferred because it keeps deployment to a single
artifact and avoids serialization overhead.

## Consequences

Positive:

- Avoids the complexity and fragility of a language bridge when there is
  no proven performance need.
- The Rust codebase is preserved for future use without blocking current
  TypeScript development.
- CI still validates Rust (`cargo build`, `cargo clippy`, `cargo test`),
  so the code does not rot.
- Developers working on LLM providers have one code path to maintain
  (TypeScript) rather than two.

Negative:

- ~15,000 lines of Rust are effectively dead weight in the repository —
  build time, binary dependencies, cognitive overhead for newcomers.
- Any future bridge will face a significant integration effort:
  TypeScript and Rust have diverged in their error types, config schemas,
  and data models.
- The `AGENTS.md` file explicitly warns agents to not modify Rust code
  expecting it to affect the application — a sign that the gap is
  already causing confusion.
- Double maintenance risk: if someone adds a new LLM provider feature
  (e.g., streaming, tool use), they must do it in TypeScript; the Rust
  codebase drifts further from the active implementation.
