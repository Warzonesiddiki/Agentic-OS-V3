# ADR-0021: Tauri Desktop Shell Architecture

- Status: Accepted
- Date: 2026-07-09
- Deciders: Tess (owner), Prism, Forge, Leader

## Context

Operators wanted a native desktop app wrapping the web dashboard + talking to the
Hono backend. A full Electron shell was rejected (bundle size, process model). The
OS already ships a React/Vite dashboard (`src/`) served statically by the server,
and a Rust workspace (`crates/`) for providers/observability. We needed a desktop
shell that reuses the existing dashboard bundle and the existing Rust tooling
without forking the frontend.

## Decision

`nexus-tauri/` is a Tauri v2 app:

- **Rust side (`src-tauri/src/`):** `main.rs` boots Tauri; `lib.rs` declares the
  app + invokes; `commands.rs` exposes Tauri `invoke` commands (e.g. start/stop
  the bundled server, read config); `state.rs` holds the shared app state (server
  handle, config). The Rust code is a thin host — all domain logic stays in the
  TS server/`crates/`.
- **Frontend side (`src/`):** `App.tsx` + `vite.config.ts` reuse the same React
  dashboard the web build produces; the Tauri shell loads it and bridges native
  calls via `invoke`.
- **Decoupling (per ADR-0007):** `crates/` remains runtime-decoupled from the TS
  app; the Tauri Rust is a separate, small host binary, not an FFI bridge into
  `crates/`. The shell launches/embeds the compiled server (`server/dist`) and
  points the webview at it.
- **Build:** `cd nexus-tauri/src-tauri && cargo build` produces the desktop app;
  the dashboard is built separately via `npx vite build` and bundled as static
  assets.

## Consequences

- One dashboard codebase serves web + desktop (no fork), preserving Prism's UX
  ownership boundary.
- Native commands are minimal and auditable; the heavy logic lives in the TS
  server, so the Tauri Rust stays a thin, low-risk host.
- No FFI into `crates/` — keeps the ADR-0007 boundary intact (Rust providers stay
  dormant/parallel).
- Tests: Tauri command unit tests in `commands.rs`/`state.rs`; dashboard shares
  the web app's component tests.
- Operational note: desktop build pulls in the system webview + cargo toolchain;
  CI builds it separately (see ADR-0027 CI/CD).
