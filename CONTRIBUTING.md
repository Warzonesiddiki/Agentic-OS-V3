# Contributing to NEXUS Agentic OS

We welcome contributions! Here's how to help:

## Getting Started
1. Fork the repo
2. Run `npm install` and `cd server && npm install`
3. Copy `.env.example` to `.env` and configure

## Development
- **Frontend**: `npm run dev` (Vite dev server)
- **Server**: `cd server && npm run dev` (tsx watch)
- **Tests**: `cd server && npm test`
- **Typecheck**: `npm run typecheck` (root) + `cd server && npm run typecheck`

## Pull Requests
- Keep changes focused — one feature/fix per PR
- Add tests for new functionality
- Ensure `npm test` and `npm run typecheck` pass in both root and server/
- Update docs if changing public APIs

## Code Style
- TypeScript strict mode, no `any` where possible
- No commented-out code or console.logs in production files
- Async/await over raw promises
- Follow existing naming conventions

## Reporting Issues
- Include steps to reproduce, expected vs actual behavior
- Attach relevant logs or error output

## License
By contributing, you agree your work will be licensed under Apache 2.0.
