# Disaster Recovery Runbook

**Last updated:** 2026-07-09 (Lorekeeper)
**Owner:** Bastion (Ops) · reviewed by Sentinel (Safety)
**Applies to:** NEXUS 2.0 server + Postgres + PGlite fallback.

## 1. Recovery objectives

| Objective            | Target                         |
| -------------------- | ------------------------------ |
| RPO (recovery point) | ≤ 5 min (WAL-based)            |
| RTO (recovery time)  | ≤ 15 min                       |
| Backup retention     | 30 days + 1 quarterly archival |

## 2. Backup

- **Primary:** Postgres logical + WAL shipping (Bastion's ops plan).
- **Validate** backups with `server/scripts/validate-backup.ts` (Phase 20 backup validator).
- **Never** hand-edit `agentic-os.db` / `server/data/app.sqlite` — use Drizzle migrations in
  `server/drizzle/`.

## 3. Incident response (tiered)

Follow `server/src/services/incident-response.ts` (Phase 14). Severity framework in Phase 20.21.

| Severity                        | Response                          | Comms                          |
| ------------------------------- | --------------------------------- | ------------------------------ |
| SEV1 (data loss / total outage) | Page on-call; invoke break-glass  | Incident channel + post-mortem |
| SEV2 (degraded)                 | Auto-heal + degraded-mode (Pulse) | Status page                    |
| SEV3 (partial)                  | Ticket + queue auto-scaler        | Internal                       |

## 4. Kill-switch procedure (Phase 1.7)

If a runaway agent or unsafe mutation is detected:

1. `POST /api/v1/safety/kill-switch` `{ enabled: true }`.
2. `setKillSwitch()` performs double-assert under lock
   (`assertKillSwitchConsistent`) — see `ERROR_CODES.md` `SAFETY_KILL_SWITCH_INCONSISTENT`.
3. All `enqueueTask` calls are rejected with `SAFETY_KILL_SWITCH_ACTIVE` until cleared.

## 5. Restore

```bash
# 1. Stop server (graceful drain)
pnpm --filter server stop

# 2. Restore latest validated backup
pg_restore --clean --if-exists -d "$DATABASE_URL" latest.dump

# 3. Run forward migrations
cd server && npm run migrate

# 4. Smoke test
npm run test:integration -- --grep "health"

# 5. Resume (clear kill-switch if set)
```

## 6. Chaos / game-day

- Phase 20 chaos runner exercises network partition, node loss, backup-restore.
- Schedule a game-day quarterly (game-day guide 20.31).

## 7. Escalation

Leader → Bastion (infra) → Sentinel (safety) → Atlas (architecture). Break-glass access is
time-boxed and audit-logged.
