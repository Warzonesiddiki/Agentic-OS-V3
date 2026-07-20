# Development Guide

## Prerequisites

- Node.js >= 20
- PostgreSQL 16+ (optional for development)
- Docker & Docker Compose (optional)

## Quick Start

### Option 1: Development with Docker

```bash
# Start the database and services
docker compose -f docker-compose.dev.yml up -d

# Run the server in development mode
cd server
npm run dev

# Run the frontend
cd ..
npm run dev:frontend
```

### Option 2: Standalone Development

```bash
# Install server dependencies
cd server
npm install

# Start the server (uses SQLite by default)
npm run dev

# Run tests
npm test
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
