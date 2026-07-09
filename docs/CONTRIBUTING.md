# Contributing to NEXUS Agentic OS

Thanks for contributing. This project is a pnpm workspace monorepo with a Hono backend, React frontend (Vite), and a separate Rust workspace (`crates/`).

## Quick Start

```bash
# Prerequisites: Node.js >=20, pnpm, Rust (optional)

# Install all workspace dependencies
pnpm install

# Install server dependencies
cd server && npm install && cd ..

# Copy environment config
cp .env.example .env   # then edit as needed

# Start frontend dev server (port 1422)
npx vite

# In another terminal — backend dev server (port 9900)
cd server && npm run dev
```

## Project Layout

```
├── src/              # React frontend (Vite, localStorage-based state)
├── server/           # Hono backend (TypeScript, Drizzle ORM, SQLite/Postgres)
│   ├── drizzle/      # DB migrations
│   └── tests/        # Vitest unit + integration tests
├── crates/           # Rust workspace (disconnected from TS server — AGENTS.md)
├── packages/         # Shared workspace packages
├── nexus-tauri/      # Tauri shell (optional)
├── _bmad/            # BMAD workflow engine config
├── _bmad-output/     # BMAD workflow outputs
└── .env.example
```

## Development Commands

### Frontend (root)

| Command             | Description                     |
| ------------------- | ------------------------------- |
| `npx vite`          | Dev server on port 1422         |
| `pnpm run build`    | Workspace-wide build            |
| `pnpm run validate` | Lint + typecheck + test + build |

### Backend (`server/`)

| Command                    | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `npm run dev`              | Dev mode (tsx watch, port 9900)                    |
| `npm run build`            | tsc compile to `dist/`                             |
| `npm start`                | Run compiled server                                |
| `npm test`                 | Unit tests (Vitest, no DB needed)                  |
| `npm run test:coverage`    | Unit tests with coverage report                    |
| `npm run test:integration` | Integration tests (needs Postgres `DATABASE_URL`)  |
| `npm run lint`             | ESLint                                             |
| `npm run typecheck`        | tsc --noEmit                                       |
| `npm run validate`         | Lint + typecheck + test + integration test + build |

### Rust (`crates/`)

| Command                                     | Description          |
| ------------------------------------------- | -------------------- |
| `cargo build --workspace`                   | Build all crates     |
| `cargo check --workspace`                   | Typecheck only       |
| `cargo clippy --all-targets -- -D warnings` | Lint (deny warnings) |
| `cargo test --workspace`                    | Run all Rust tests   |

## Coding Conventions

- **TypeScript**: Strict mode (`noUncheckedIndexedAccess: true`). No `: any`. Async/await. camelCase.
- **Rust**: snake_case. Use `thiserror` + `AgenticError`, not `Box<dyn Error>`.
- **Formatting**: 2-space indent, single quotes, trailing commas (enforced by Prettier). Run `pnpm run format` or let lint-staged handle it on commit.
- **Pre-commit hooks**: Husky + lint-staged runs ESLint fix + Prettier on staged `.ts`/`.tsx`/`.md`/`.json`/`.yaml`/`.css` files.
- **I/O**: All async. In Rust use `spawn_blocking` for blocking ops.
- **Database**: Schema changes go through Drizzle migrations (`server/drizzle/`). Never edit SQLite DB files directly.

## Pull Requests

1. Fork the repo and create a feature branch from `main`.
2. Keep changes focused — one feature/fix per PR.
3. Add tests for new functionality (unit + integration where applicable).
4. Ensure validation passes:
   ```bash
   pnpm run validate       # root workspace
   cd server && npm run validate
   ```
5. Update docs if changing public APIs or adding new capabilities.
6. Open a PR. A maintainer will review within a few business days.

## Things to Avoid Committing

- `dist/`, `coverage/`, `.env` files
- SQLite databases (`agentic-os.db`, `*.db-wal`, `*.db-shm`)
- `nexus-tauri/src-tauri/target/` (Rust build artifacts)
- `gemini-cli/` (vendor source, not in workspace)
- Commented-out code or `console.log` in production files

## Architecture Notes for Contributors

Read [`AGENTS.md`](../AGENTS.md) before making significant changes. It documents critical gaps:

- **Frontend-backend disconnect (FRONTEND ONLY)**: The React frontend pages (Kernel, Pipeline Builder, Agent Hub) use `localStorage` via `src/lib/engine.ts` and do not yet sync with the Hono server. This is the open Phase 5 wiring gap (owner: Prism). **The server-side** kernel (`server/src/services/kernel.ts`), pipeline executor, message-bus, SSE bridge (`sse-bus.ts`), and A2A runtime (`@agentic-os/a2a-server`) are real, implemented, and tested — only the UI layer trails. Don't assume the backend is a demo.
- **Rust codebase**: `crates/` (~15K LOC) is orphaned — no FFI/IPC bridge connects it to the TS server.
- **Stubs**: Several services (`wasm-plugin-runtime`, `federated-recall`, `shadow-daemon`, etc.) are mock/theater implementations despite dramatic names. Check before depending on them.

## Reporting Issues

- Search existing issues before filing.
- Include steps to reproduce, expected vs actual behavior.
- Attach relevant logs, error output, or screenshots.
- Tag with the appropriate label (bug, enhancement, documentation).

## License

By contributing, you agree your work will be licensed under [Apache 2.0](../LICENSE).
