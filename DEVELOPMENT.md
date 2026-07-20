# Development Guide

## Prerequisites

- Node.js >= 20
- PostgreSQL 16+ (optional for development)
- Docker & Docker Compose (optional)

## Quick Start

### Install dependencies (workspace)

The repository is a pnpm workspace and the committed `pnpm-lock.yaml` is the canonical lockfile. Install from the repository root before running any workspace command:

```bash
corepack enable
pnpm install --frozen-lockfile
```

If Corepack is unavailable, install a pnpm release compatible with lockfile version 9, then run the same command. Do not mix a generated server-only `package-lock.json` into the workspace.

### Option 1: Development with Docker

```bash
# Start the database and services
docker compose -f docker-compose.dev.yml up -d

# Run the server in development mode
pnpm --dir server dev

# Run the frontend from another terminal
pnpm dev:frontend
```

### Option 2: Standalone Development

```bash
# Start the server (uses SQLite by default)
pnpm --dir server dev

# Run tests
pnpm test
```

## Project Structure

```
├── server/           # Backend server (Hono + Node.js)
│   ├── src/
│   │   ├── services/ # Business logic (150+ services)
│   │   ├── routes/   # API routes
│   │   ├── db/       # Database schema and client
│   │   └── lib/      # Utilities
│   └── tests/        # Test suite
├── src/              # Frontend (React + Vite)
├── packages/         # Shared packages (SDK, A2A, Devtools)
└── crates/           # Rust workspace
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run integration tests (requires PostgreSQL)
npm run test:integration
```

## Code Quality

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Full validation
npm run validate
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example server/.env
```

## API Documentation

See [docs/API.md](docs/API.md) for API documentation.
