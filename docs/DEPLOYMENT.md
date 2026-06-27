# Deployment

> This build target produces a **static single-file app** (`dist/index.html`).
> True multi-tenant production deployment requires porting `src/lib/*` onto a
> server runtime (Next.js + Postgres) — the stores are already abstracted behind
  `getState/commit/subscribe`, making the port mechanical.

## Static deployment (current build)

```bash
npm run build
# serve dist/index.html from any static host (no server, no env secrets needed)
```

Data persists to the browser's `localStorage` per origin.

## Production deployment (target architecture)

1. **Provision Postgres** and apply the Drizzle schema (see `src/lib/types.ts` for
   the table/column model; add indexes on `memory.kind`, `memory.importance`,
   `memory.createdAt`, `skill.name`, `skill.category`, `note.path`,
   `project.name`, `audit.sequence`).
2. **Set environment** (`.env`) — see `.env.example`. Validate with the Zod
   `validateConfig()`; never allow localhost origins in production.
3. **Reverse proxy** with TLS (nginx/Caddy); restrict `ALLOWED_ORIGINS`.
4. **Keys**: generate hashed principals (DB-backed), distribute scoped keys.
5. **Observability**: wire `os.metrics` to OpenTelemetry/Prometheus; alert on
   `auditAppendFailures`, `sagaFailures`, `policyDenials`, dead-letter growth.
6. **Backups**: schedule `GET /brain/export`; verify `GET /audit` chain integrity.
7. **Maintenance**: schedule the dream/consolidation job with caps
   (`NEXUS_DREAM_MAX_MEMORIES`, `NEXUS_DREAM_MAX_SESSIONS`, `NEXUS_DREAM_TIMEOUT_MS`).

## Health checks

- `GET /api/v1/health` (public) — liveness.
- `GET /api/v1/system` — counts + config.
- In-app **Doctor** (Agent OS → Dream & Doctor) — store, audit chain, context
  budget, auth, rate limit, payload, vault, approvals, dead-letter, quarantine.

## Rate limit recommendation

Default `120/min` per principal. Raise for trusted automation, lower for
public-facing endpoints. Mutation-heavy agents should use scoped write keys only.

## Backup / restore

- Export: **Settings → Danger zone** or `GET /brain/export`.
- Import: `POST /brain/import` (schema-validated, idempotent via dedup).
- Restore the OS graph via the typed-card export (planned).
