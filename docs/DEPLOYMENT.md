# Deployment & Docker Orchestration Guide

This document covers multi-stage Docker containerization, Docker Compose orchestration, single-container standalone deployment, and production hardening for NEXUS Agentic OS.

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
