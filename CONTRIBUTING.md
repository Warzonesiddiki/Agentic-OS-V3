# Contributing to NEXUS Agentic OS

We welcome contributions! Here's how to help:

## Getting Started

1. Fork the repo
2. Run `pnpm install` (installs the entire pnpm workspace: root, `packages/*`, `server`, `nexus-tauri`)
3. Copy `.env.example` to `server/.env` and configure (see `.env.example` for all options)

## Development

- **Frontend (dashboard)**: `npx vite` (Vite dev server, root `src/`) — served at http://localhost:5173
- **Server**: `cd server && npm run dev` (tsx watch)
- **Tests**: `cd server && npm test` (Vitest unit) · `cd server && npm run test:integration` (needs Postgres `DATABASE_URL`)
- **Typecheck**: `npm run typecheck` (root = `pnpm -r typecheck`) + `cd server && npm run typecheck`
- **Lint/format**: `cd server && npm run lint` · `npx prettier --write 'packages/**/*.ts'`

## Pull Requests

- Keep changes focused — one feature/fix per PR
- Add tests for new functionality
- Ensure `pnpm -r typecheck` and `pnpm -r lint` pass across the workspace, and `cd server && npm test` passes
- Update docs (README, `AGENTS.md`, ADRs in `docs/adr/`) if changing public APIs or architecture

## Code Style

- TypeScript strict mode, no `any` where possible
- No commented-out code or `console.log`s in production files
- Async/await over raw promises; Rust uses `tokio` with bounded channels
- Follow existing naming conventions (camelCase TS, snake_case Rust)
- File names match the primary export

## Architecture Notes

- Rust crates (`crates/`) are **decoupled** from the TypeScript app (see `docs/adr/0007`). Editing them does not change the server/dashboard behavior.
- Shared TS libraries live in `packages/` and are consumed via tsconfig path aliases (`@agentic-os/sdk`, etc.).

## Reporting Issues

- Include steps to reproduce, expected vs actual behavior
- Attach relevant logs or error output

## License

By contributing, you agree your work will be licensed under Apache 2.0.
