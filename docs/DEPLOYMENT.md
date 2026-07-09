# Deployment & Docker Orchestration Guide

This document covers multi-stage Docker containerization, Docker Compose orchestration, single-container standalone deployment, and production hardening for NEXUS Agentic OS.

---

## 0. Build / CI Validation Gate (IMPORTANT — better-sqlite3 Node-ABI)

`pnpm run validate` (root) and `npm run validate` (server) run `lint → typecheck →
test → build`. On a fresh runner the native module **better-sqlite3** is often built
against a different Node ABI than the active runtime, which makes `vitest run`
(= the `test` step) crash with `NODE_MODULE_VERSION` mismatch. This is an
**environment** issue, not a code defect.

**Fix before running the test/validate step on the aionr runner:**

```bash
# Rebuild every native module against the runner's Node ABI
npm rebuild better-sqlite3          # or: pnpm rebuild better-sqlite3
# then run the gate
cd server && npm run validate       # lint + fresh tsc + unit + integration gate + build
```

The CI workflow (`.github/workflows/ci.yml`) already runs `pnpm rebuild better-sqlite3`
before `pnpm -r typecheck/test/build`, so the canonical gate is green there. The TRUE
typecheck gate is **always** run fresh (no incremental cache):

```bash
cd server && rm -f *.tsbuildinfo && npx tsc --noEmit --incremental false
```

Never trust incremental `.tsbuildinfo` — it masks real errors. The SINGLE SOURCE OF
TRUTH for a green compile is the above command returning 0 errors.

---

## 1. Multi-Container Orchestration (Production Stack)

The production stack orchestrates 4 services via `docker-compose.yml`:

1. **PostgreSQL (`postgres`)**: `pgvector/pgvector:pg16` vector-enabled database with persistent named volume `nexus_pgdata`.
2. **Redis (`redis`)**: `redis:7-alpine` message bus and rate-limit cache with volume `nexus_redisdata`.
3. **Backend Server (`server`)**: Multi-stage Node 20 Alpine runtime running as non-root `USER node` on port `9900`.
4. **Frontend Nginx Proxy (`frontend`)**: Multi-stage Vite SPA build served via Nginx Alpine on port `80`, reverse proxying `/api/*` requests to the backend server.

### Quick Start (Production Compose)

```bash
# Build and launch all services in detached mode
docker compose up --build -d

# View service status and health
docker compose ps

# Check logs
docker compose logs -f server

# Stop stack gracefully
docker compose down
```

---

## 2. Standalone Single-Container Deployment

For lightweight deployments or edge devices running SQLite only (without external Postgres/Redis dependencies), use `Dockerfile.standalone`:

```bash
# Build standalone image
docker build -f Dockerfile.standalone -t nexus-standalone:latest .

# Run standalone container
docker run -d \
  -p 9900:9900 \
  -v nexus_sqlitedata:/app/data \
  --name nexus-app \
  nexus-standalone:latest
```

---

## 3. Development Container Setup

For local hot-reloading with live source mounting, use `docker-compose.dev.yml`:

```bash
docker compose -f docker-compose.dev.yml up --build
```

---

## 4. Container Health Checks & Verification

Each service includes built-in container healthchecks:

- **Backend Health Endpoint**: `http://localhost:9900/api/v1/health`
- **Frontend Health Endpoint**: `http://localhost:80/`
- **Postgres Health**: `pg_isready -U postgres -d nexus`
- **Redis Health**: `redis-cli ping`

To test health status manually:

```bash
curl -f http://localhost:9900/api/v1/health
```

---

## 5. Security & Hardening Features

- **Non-Root Execution**: Backend runtime container enforces non-root execution (`USER node`).
- **Graceful SIGTERM Handling**: The Node.js server intercepts `SIGTERM` signals, closes active HTTP keep-alive connections, stops the task worker, flushes audit logs, and closes DB connection pools cleanly within a 10-second drain window.
- **Resource Constraints**: Container services enforce CPU (`cpus`) and memory limits (`memory`) in Docker Compose to prevent resource starvation.
- **Auto-Migrations**: Container startup entrypoint script (`entrypoint.sh`) runs schema migrations automatically before process boot.
