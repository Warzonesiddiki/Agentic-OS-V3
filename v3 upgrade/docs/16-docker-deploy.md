# 16 — Docker, CI/CD, and Deployment
## NEXUS V3 — Complete DevOps Configuration

> **All files needed for deployment: Dockerfile, docker-compose, CI workflow, .env.example**

---

## Dockerfile (Multi-Stage Build)

```dockerfile
# server/Dockerfile

# ── Build Stage ──
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
# Install Playwright browsers
RUN npx playwright install chromium --with-deps || echo "Playwright install skipped"
# Generate Drizzle migrations
RUN npm run db:generate || echo "Migration generation skipped"
# Compile TypeScript
RUN npm run build

# ── Runtime Stage ──
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle

EXPOSE 9900

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:9900/api/v1/health || exit 1

CMD ["node", "dist/index.js"]
```

---

## docker-compose.yml

```yaml
# server/docker-compose.yml

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: nexus
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d nexus"]
      interval: 5s
      timeout: 3s
      retries: 10
    volumes:
      - nexus_pgdata:/var/lib/postgresql/data

  nexus:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/nexus
      NEXUS_ALLOWED_ORIGINS: ${NEXUS_ALLOWED_ORIGINS:-http://localhost:9900}
      NEXUS_RATE_LIMIT_PER_MINUTE: ${NEXUS_RATE_LIMIT_PER_MINUTE:-120}
      NEXUS_MAX_BODY_BYTES: ${NEXUS_MAX_BODY_BYTES:-5242880}
      NEXUS_API_KEY: ${NEXUS_API_KEY:-}
      NEXUS_LLM_BASE_URL: ${NEXUS_LLM_BASE_URL:-}
      NEXUS_LLM_API_KEY: ${NEXUS_LLM_API_KEY:-}
      NEXUS_LLM_MODEL: ${NEXUS_LLM_MODEL:-}
      NEXUS_EMBEDDING_MODEL: ${NEXUS_EMBEDDING_MODEL:-}
      NEXUS_OBSIDIAN_VAULT: ${NEXUS_OBSIDIAN_VAULT:-}
      REDIS_URL: ${REDIS_URL:-}
    ports:
      - "9900:9900"
    restart: unless-stopped

  # Ephemeral sandbox manager (Docker-in-Docker)
  nexus-sandbox:
    image: docker:24-dind
    privileged: true
    environment:
      DOCKER_TLS_CERTDIR: ""
    volumes:
      - nexus_dind:/var/lib/docker
    restart: unless-stopped

  # Redis for distributed message bus + rate limiting (optional)
  nexus-redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped
    profiles: ["distributed"]

volumes:
  nexus_pgdata:
  nexus_dind:
```

---

## .env.example (Complete)

```env
# server/.env.example

# ── Server ──
PORT=9900
NODE_ENV=development

# ── Database ──
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nexus

# ── Security ──
NEXUS_API_KEY=
NEXUS_ALLOWED_ORIGINS=http://localhost:9900
NEXUS_RATE_LIMIT_PER_MINUTE=120
NEXUS_MAX_BODY_BYTES=5242880
NEXUS_LOG_LEVEL=info
NEXUS_TRUST_PROXY=false

# ── LLM / Embeddings ──
NEXUS_LLM_BASE_URL=
NEXUS_LLM_API_KEY=
NEXUS_LLM_MODEL=
NEXUS_EMBEDDING_MODEL=

# ── Obsidian Vault ──
NEXUS_OBSIDIAN_VAULT=

# ── Pool / Query ──
NEXUS_DB_POOL_MAX=20
NEXUS_QUERY_TIMEOUT_MS=15000

# ── MCP ──
NEXUS_MCP_ORIGIN=http://localhost:9900

# ── Dashboard ──
NEXUS_DASHBOARD_DIR=../dist

# ── Scheduler ──
NEXUS_SCHEDULER_TICK_MS=60000

# ── Recall Tuning (V3: configurable) ──
NEXUS_RRF_K=60
NEXUS_EMBEDDING_DIM=1536
NEXUS_SEMANTIC_THRESHOLD=0.8
NEXUS_RECENCY_HALFLIFE_DAYS=30
NEXUS_MAX_RETRIES=3
NEXUS_AUTH_CACHE_CAP=1024

# ── Sandbox ──
NEXUS_SANDBOX_ENABLED=false
NEXUS_SANDBOX_IMAGE=node:20-alpine
NEXUS_SANDBOX_TIMEOUT_MS=30000

# ── Redis (optional, for distributed mode) ──
REDIS_URL=
```

---

## CI Workflow (GitHub Actions)

```yaml
# .github/workflows/ci.yml

name: CI

on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: nexus_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres -d nexus_test"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/nexus_test
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: server/package-lock.json
      - name: Install pgvector
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client
          psql "postgresql://postgres:postgres@localhost:5432/nexus_test" -c "CREATE EXTENSION IF NOT EXISTS vector;"
      - name: Install dependencies
        working-directory: server
        run: npm ci
      - name: Lint
        working-directory: server
        run: npm run lint
      - name: Typecheck
        working-directory: server
        run: npm run typecheck
      - name: Generate migrations
        working-directory: server
        run: npm run db:generate
      - name: Push schema
        working-directory: server
        run: npm run db:push
      - name: Unit tests
        working-directory: server
        run: npm test
      - name: Integration tests
        working-directory: server
        run: npm run test:integration
      - name: Build
        working-directory: server
        run: npm run build
```

---

## Quick Start Commands

```bash
# ── Option A: Docker Compose (recommended) ──
cd server
cp .env.example .env
# Edit .env — set NEXUS_API_KEY and LLM config
docker compose up -d
# Wait for healthy
docker compose ps
# Server is now running at http://localhost:9900

# ── Option B: Local development ──
cd server
cp .env.example .env
# Start Postgres only
docker compose up -d postgres
# Install pgvector
docker compose exec postgres psql -U postgres -d nexus -c "CREATE EXTENSION IF NOT EXISTS vector;"
# Install deps
npm install
# Create schema
npm run db:push
# Start dev server
npm run dev
# Server at http://localhost:9900
```

---

## Deployment Checklist

```
[ ] Docker Compose starts all services without errors
[ ] pgvector extension is installed
[ ] db:push creates all 16 tables
[ ] Server boots and logs "listening on port 9900"
[ ] Health endpoint returns 200
[ ] API key is generated on first boot (check logs)
[ ] MCP client can connect and call tools
[ ] CI workflow passes on GitHub Actions
[ ] Docker image builds successfully
[ ] Healthcheck passes inside container
```
