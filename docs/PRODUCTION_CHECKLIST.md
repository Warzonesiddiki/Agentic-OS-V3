# Production Checklist

Checklist for deploying NEXUS Agentic OS to production. Each item is a
verifiable gate — not advisory. Go through in order; earlier sections are
prerequisites for later ones.

---

## Secrets

- [ ] `.env` is git-ignored and has never been committed (check `git log --all --diff-filter=A -- .env`).
- [ ] All secrets stored in environment variables, not in config files or source.
- [ ] Operator API keys use scrypt hashing (server) or SHA-256 with domain separator (browser build).
- [ ] Brain export excludes API keys, principal hashes, and raw secrets.
- [ ] LLM/embedding provider API keys are scoped to minimal permissions.
- [ ] `npm audit` shows no high/critical advisories before deployment.
- [ ] No hardcoded credentials in Dockerfiles, Compose files, or entrypoint scripts.
- [ ] Database connection strings do not embed credentials in source; use `DATABASE_URL` env var.
- [ ] Session/rotation strategy defined for all long-lived keys.
- [ ] `.env` files in `server/`, `crates/`, `gemini-cli/` are all git-ignored (verify each).

---

## TLS

- [ ] TLS certificate provisioned (Let's Encrypt, or commercial CA).
- [ ] Certificate auto-renewal configured and tested (`certbot renew --dry-run` or equivalent).
- [ ] Termination at the reverse proxy — backend and Redis/Postgres ports not TLS-terminated behind the proxy boundary.
- [ ] TLS 1.2 minimum enforced; TLS 1.0/1.3 disabled.
- [ ] Strong cipher suite configured (e.g. `ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256`).
- [ ] HSTS header set (`Strict-Transport-Security: max-age=31536000; includeSubDomains`).
- [ ] OCSP stapling enabled.
- [ ] HTTP → HTTPS redirect enforced (return 301/308).
- [ ] Certificate chain completeness verified (`openssl s_client -connect <host>:443 -showcerts`).

---

## Proxy

- [ ] Reverse proxy terminates TLS and proxies to backend on `localhost:9900`.
- [ ] `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP` headers set correctly.
- [ ] Reverse proxy strips `X-Forwarded-*` from incoming requests (prevent spoofing).
- [ ] WebSocket upgrade paths for MCP/SSE proxied correctly (`proxy_set_header Upgrade $http_upgrade`).
- [ ] `ALLOWED_ORIGINS` env var set to the production origin (not `*` or `localhost`).
- [ ] CORS policy restricts methods and headers to minimum required.
- [ ] Payload size limit at proxy level (e.g. `client_max_body_size 1m` in Nginx).
- [ ] Rate limiting at proxy level (token bucket or `limit_req_zone`).
- [ ] Only `/api/*` and static assets are forwarded to backend; everything else returns 404.
- [ ] `GET /health` is the only unauthenticated endpoint exposed to the public.

---

## Backend

- [ ] `NODE_ENV=production` set.
- [ ] `ALLOWED_ORIGINS` set to the production domain.
- [ ] Non-root user runs the server process (`USER node` in Dockerfile).
- [ ] Graceful shutdown handles `SIGTERM` — drains HTTP connections, stops task worker, flushes audit log, closes DB pools (within 10s window).
- [ ] Rate limiting enabled (token bucket, keyed by principal/origin).
- [ ] Payload size limit enforced before body parsing (413 on oversized).
- [ ] All Zod validation schemas active on every route.
- [ ] Agent sandbox runs with `NODE_OPTIONS="--max-old-space-size=64"` or Docker sandbox enabled.
- [ ] Worker thread pool configured with `resourceLimits` (64 MB old-space, 16 MB young-space).
- [ ] Agent execution timeout set (default 30s, tunable per deployment).
- [ ] Audit logging operational — mutations, auth events, sandbox executions all logged.
- [ ] Tool registry risk levels active: `safe|read|write|destructive|network|privileged` with minimum ring enforcement.
- [ ] Approval gates enabled for destructive operations (rm, git reset, brain import, vault write-back, policy changes).
- [ ] Hard-blocked command list active (`rm -rf /`, `mkfs`, `dd`, `DROP TABLE`, etc.).
- [ ] Health endpoint returns 200 with DB connectivity check.
- [ ] Log level set to `info` or `warn` (not `debug`).

---

## Database

- [ ] PostgreSQL (production) or SQLite (lightweight) — chosen and configured.
- [ ] Drizzle migrations run before process boot (via entrypoint script).
- [ ] Connection pooling configured (PgBouncer for Postgres, or internal pool with max 20 connections).
- [ ] Connection string excludes credentials from source; uses `DATABASE_URL` env var.
- [ ] Migrations are reversible (down migrations exist, or schema is additive).
- [ ] Database backups automated and tested (see Backup section).
- [ ] Read replicas considered for audit-log and brain-export queries.
- [ ] PostgreSQL: `pgvector/pgvector:pg16` image used if vector embeddings needed.
- [ ] Bounded-growth collections have pruning or hard caps configured.
- [ ] Schema changes go through Drizzle migrations only; no raw SQL ALTER in production.

---

## Networking

- [ ] Backend listens on `0.0.0.0:9900` behind the proxy, not exposed directly.
- [ ] Firewall rules: only ports 80 (HTTP) and 443 (HTTPS) open to the internet.
- [ ] PostgreSQL port (5432) and Redis port (6379) not exposed beyond internal Docker network.
- [ ] Redis configured with `requirepass` and binds to internal network interface.
- [ ] SSRF blocked at the application level: private/loopback/link-local metadata IPs rejected.
- [ ] Path traversal blocked: `..`, null bytes, vault-root escape rejected.
- [ ] Docker Compose networks separated: `frontend` (proxy→backend), `internal` (backend→db/redis).
- [ ] No service depends on host networking mode.
- [ ] DNS resolution for upstream services (LLM APIs, MCP servers) functional from inside containers.
- [ ] `GET /health` returns 200 on the public domain.

---

## Docker

- [ ] Multi-stage builds used to minimize image size.
- [ ] Runtime image based on `node:20-alpine` (backend) or `nginx:alpine` (frontend).
- [ ] Non-root user (`USER node`) in runtime containers.
- [ ] Containers run with read-only root filesystem where possible.
- [ ] Resource limits set in Compose: CPU (`cpus: 0.5`), memory (`memory: 512m`).
- [ ] Health checks defined for every service (`HEALTHCHECK` instruction or Compose `healthcheck`).
- [ ] Ephemeral containers — no state stored inside container filesystems.
- [ ] Persistent data in named volumes (`nexus_pgdata`, `nexus_redisdata`, `nexus_sqlitedata`).
- [ ] `.dockerignore` excludes `node_modules`, `.env`, `dist/`, `coverage/`, `*.db*`.
- [ ] Images tagged with commit SHA or semantic version (not `:latest` in production).
- [ ] No `--privileged` flag or security opt-out in container runtime.
- [ ] `docker compose down` stops gracefully; `SIGTERM` propagates to init process.
- [ ] CVE scanning configured on images (e.g. `docker scout`, Trivy).

---

## Build & Validation Gate (Perfection Bar)

The single source-of-truth gate for every release is the root script
`pnpm run validate`, which runs, in order:

```
pnpm run rebuild:native   # rebuild better-sqlite3 against the runner Node ABI
pnpm -r lint              # ESLint across all workspace members (0 errors)
pnpm -r typecheck         # tsc --noEmit per member (fresh, --incremental false)
pnpm -r test              # vitest unit tests per member
pnpm -r build             # server tsc + dashboard vite build
```

This same gate is enforced in CI by **two** workflows:
- `.github/workflows/ci.yml` — the `validate` job runs the canonical `pnpm run validate`,
  plus `server-validate` (integration w/ Postgres+pgvector), `rust` (clippy `-D warnings`),
  and `codeowners` (collision-free merge guard).
- `.github/workflows/validate.yml` — full TS gate (`pnpm install` → `pnpm rebuild better-sqlite3`
  → `pnpm -r lint` → `pnpm -r typecheck` → `pnpm -r test` → `pnpm -r build`) plus a Rust
  job (`cargo clippy --workspace -- -D warnings` + `cargo test --workspace`), on every
  PR/push to `main`/`master`/`feat/**`.

- [ ] `pnpm run validate` passes end-to-end on a clean checkout (exit 0).
- [ ] Fresh TypeScript compile is clean: `rm -f *.tsbuildinfo && npx tsc --noEmit --incremental false` returns **0 errors** (no stale `.tsbuildinfo` masking).
- [ ] ESLint reports **0 problems** (`pnpm -r lint` red-free).
- [ ] Unit tests green (`pnpm -r test`); `server` enforces coverage thresholds (vitest config).
- [ ] Production build succeeds (`pnpm -r build`): server `dist/` and dashboard `dist/`.
- [ ] Rust `cargo clippy --workspace -- -D warnings` and `cargo test --workspace` pass.
- [ ] Multi-stage `Dockerfile` builds with pnpm (this is a pnpm workspace with `workspace:*`
      deps), builds shared `packages/*` before the server, and runs as non-root `USER node`
      with a `/api/v1/health` healthcheck.

> CRITICAL — false-green trap: `tsc --noEmit` (default incremental) can return 0 while real
> errors exist because stale `.tsbuildinfo` masks them. Always measure with `--incremental false`
> (what the `typecheck`/CI gate does) before claiming a clean compile.

### Evidence (2026-07-09, settle-FS measurement)
- ESLint: **0 errors** across the TS workspace (lint gate enforced; 372 warnings are
  non-blocking advisory lint findings, tracked by Lorekeeper/Quill for follow-up).
- TypeScript: **`tsc --noEmit --incremental false` = 0** errors repo-wide (fresh, after
  removing `.tsbuildinfo`).
- Phases **11–20** all marked **COMPLETE** in `docs/PLAN_TRACKER.md` (Perfection Bar met:
  real implementations, no stubs/TODOs, wired to kernel/scheduler seam, coverage ≥ 80% for
  new modules).
- CICD: `validate.yml` + `ci.yml` both green on the merge commit; CODEOWNERS coverage job
  guards against cross-namespace edits.
## Monitoring

- [ ] Health endpoint (`/api/v1/health`) monitored externally (uptime check every 60s).
- [ ] Logs shipped to a centralized destination (files, or stdout captured by container orchestrator).
- [ ] Error rate alerting configured (5xx > 1% over 5 min → alert).
- [ ] p50/p95/p99 response time tracking for API routes.
- [ ] Rate-limit hit rate tracked (429 responses).
- [ ] Sandbox execution latency and failure rate tracked.
- [ ] Task worker queue depth and processing time tracked.
- [ ] Audit log integrity monitored (sequence gaps or missing entries).
- [ ] Resource usage alerts: CPU > 80%, memory > 80%, disk > 85%.
- [ ] Docker container restart count tracked (excessive restarts → alert).
- [ ] Database connection pool utilization tracked.
- [ ] TLS certificate expiry monitored (alert 30 days before expiry).

---

## Backup

- [ ] Brain export automated and running on a schedule (daily minimum).
- [ ] Export verified: file is non-empty, parseable, and contains expected record counts.
- [ ] Database backup automated: `pg_dump` (PostgreSQL) or `sqlite3 .backup` (SQLite).
- [ ] Database backup tested: restore into a clean database and run health checks.
- [ ] Backups stored off-instance (separate volume, object storage, or remote host).
- [ ] Brain export excludes API keys, principal hashes, and raw secrets by design.
- [ ] Audit log export or retention configured (immutable if possible).
- [ ] `.env` files backed up separately (outside the repo).
- [ ] Recovery procedure documented and tested at least once.
- [ ] Backup monitoring alerting on failure (missed schedule, zero-byte output).

---

## Security

- [ ] Authentication enforced on all mutations (POST/PATCH/PUT/DELETE).
- [ ] Authentication enforced on sensitive reads (memories, brain export, vault, audit, MCP resources).
- [ ] API keys hashed with scrypt (server) or SHA-256 with domain separator (browser build).
- [ ] Constant-time comparison (`crypto.timingSafeEqual`) for all auth checks.
- [ ] Scope enforcement active: `memory:*`, `skill:*`, `brain:*`, `vault:*`, `safety:*`, `audit:*`.
- [ ] Execution rings configured (0–4) with minimum ring enforcement on tool calls.
- [ ] Approval gates active for destructive/privileged operations.
- [ ] Sandbox isolation active (worker thread pool with frozen prototypes + resource limits).
- [ ] CORS origin validated against `ALLOWED_ORIGINS` (not wildcard).
- [ ] SSRF guard active: private/169.254/loopback IPs rejected in sandbox and fetch calls.
- [ ] Payload limits enforced on all inputs (413 on oversized).
- [ ] Rate limiting active on auth and API endpoints.
- [ ] Agent input scanned for prompt-injection patterns.
- [ ] Docker sandbox (optional) runs with `--network none`, `--memory 256m`, `--cpus 0.5`.
- [ ] Quarantined agents (ring 4) cannot mutate state.
- [ ] All REST bodies and MCP tool args validated with Zod.
- [ ] Sessions expire and keys are rotatable.
- [ ] No `eval()` or `Function()` constructor in production code paths.

---

## DNS

- [ ] A/AAAA record points to production server IP.
- [ ] CNAME record for `www` resolves to the apex domain.
- [ ] TTL set appropriately (300–3600s for production; lower during cut-over).
- [ ] DNSSEC enabled if the registrar supports it.
- [ ] SPF record configured for any outbound email.
- [ ] Reverse DNS (PTR) record set if the IP is static.
- [ ] DNS resolves before TLS certificate provisioning (Let's Encrypt HTTP-01 challenge).
- [ ] `dig +short <domain>` returns the correct IP.
- [ ] Subdomains not in use are not publicly resolvable (no wildcard DNS unless needed).

---

## Verification

Run this smoke test after every deploy:

```bash
# proxied endpoint responds
curl -sI https://<domain>/api/v1/health | head -1

# TLS works and certificate is valid
openssl s_client -connect <domain>:443 -servername <domain> < /dev/null 2>/dev/null \
  | openssl x509 -noout -dates

# CORS headers correct
curl -sI -H "Origin: https://<domain>" https://<domain>/api/v1/health \
  | grep -i access-control

# unauthenticated mutation rejected
curl -s -o /dev/null -w '%{http_code}' -X POST https://<domain>/api/v1/sandbox/execute

# brain export requires auth
curl -s -o /dev/null -w '%{http_code}' https://<domain>/api/v1/brain/export

# rate limiting applies
for i in $(seq 1 20); do curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/api/v1/health; done

# static assets served
curl -sI https://<domain>/ | grep -i content-type
```
