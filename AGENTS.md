# NEXUS 2.0 — Agentic OS & Second Brain

Persistent memory, recall, skills, governance, and coordination layer for AI agents.

## Build / test / lint

```bash
# ── Frontend (Vite + React / packages) ──
npm run build            # vite build (root)
pnpm -r build            # build all workspace packages

# ── Server (TypeScript / Hono) ──
cd server
npm run build            # tsc compile to dist/
npm run dev              # tsx watch src/index.ts
npm start                # node dist/index.js

# ── Rust crates (core, config, provider-types, etc.) ──
cargo build --workspace  # all Rust crates
cargo check --workspace  # fast check (no codegen)
cargo clippy --all-targets -- -D warnings  # lint

# ── Rust desktop (Tauri) ──
cd nexus-tauri/src-tauri
cargo build              # full Tauri app build

# ── Type-check ──
npx tsc --noEmit                         # root packages
cd server && npx tsc --noEmit            # server
npm run typecheck                        # both (pnpm -r typecheck)

# ── Lint / format ──
cd server && npm run lint                # ESLint (server)
prettier --write 'packages/**/*.ts'     # format TS
npx eslint src/ --max-warnings 0         # strict lint (root packages)
git commit triggers lint-staged (prettier + eslint) via husky

# ── Tests ──
cargo test --workspace                   # Rust unit tests
cd server && npm test                    # Vitest unit tests (no DB)
cd server && npm run test:integration    # Vitest integration (needs Postgres)
pnpm -r test                             # all workspace package tests

# ── Full validation (CI-equivalent) ──
cd server && npm run validate            # lint + typecheck + test + build
```

## Project conventions

- **TypeScript strict mode** — `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`. No `any` where possible.
- **Async/await** over raw promises. In Rust, always use `tokio` runtime; use bounded `mpsc` channels (not unbounded).
- **Error handling** — Rust: `thiserror` + `AgenticError` enum, never `Box<dyn Error>` or `String`. TS: use the project's error types in `server/src/lib/errors.ts`.
- **Structured logging** — Rust: `tracing` with context fields (provider, model, latency). TS: use the project's `logging.ts`.
- **Core types in Rust** — define in `crates/core/src/types/`, auto-generate TS bindings via `ts-rs`. No duplicate type definitions.
- **Config is TOML-first** — all config authored in TOML, validated via JSON Schema from Rust types. Use `.env.example` as template for local `.env`.
- **ACP (Agent Client Protocol)** — internal service-to-service communication. External APIs may use REST/gRPC but wrapped in ACP facade.
- **2-space indent, LF endings, single quotes, trailing commas (ES5)** — enforced by `.editorconfig`, `.prettierrc`, and lint-staged.
- **Naming** — camelCase in TS/JS, snake_case in Rust. File names match the primary export.

## Things to avoid

- **Vendored source reference**: `gemini-cli/` is NOT the active workspace — it's a preserved source project. Don't modify it or treat it as part of the pnpm workspace.
- **SQLite artifacts**: `agentic-os.db`, `*.db-wal`, `*.db-shm` are local runtime data — never commit them.
- **`.env` files**: never commit secrets. Only `.env.example` should be tracked.
- **Build artifacts**: `dist/`, `coverage/`, `*.tsbuildinfo`, `node_modules/`, `server/node_modules/`, `server/dist/` are all gitignored.
- **Rust build cache**: `nexus-tauri/src-tauri/target/` is heavy (multi-GB) — don't commit or back up.
- **No blocking in async**: All I/O must be async; CPU-heavy work uses `spawn_blocking` in Rust.
- **No dead code**: Deprecate over 2 releases before removal. Feature flags must have removal deadlines.
- **Integration tests need Postgres**: `DATABASE_URL` must be set. They fail loudly if the DB is unreachable.
- **Manual DB edits**: Don't edit `agentic-os.db` or `server/data/app.sqlite` by hand — use the Drizzle migrations in `server/drizzle/` or the app's API.
