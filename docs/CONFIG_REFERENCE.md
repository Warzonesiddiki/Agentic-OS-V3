# Configuration Reference

**Last updated:** 2026-07-09 (Lorekeeper)
**Authoritative source:** `server/src/lib/env.ts` + `server/src/config/kernel-schema.ts`.

All config is TOML-first where possible; runtime overrides via environment variables.
`.env.example` is the template — never commit a real `.env`.

## Kernel / Scheduler (env)

| Variable                      | Default  | Meaning                                                                   |
| ----------------------------- | -------- | ------------------------------------------------------------------------- |
| `NEXUS_MLFQ_BOOST_MS`         | `5000`   | Interval for `boostMlfqQueues()` (starvation avoidance)                   |
| `NEXUS_SCHEDULER_POLICY`      | `mlfq`   | Active policy: `mlfq` \| `edf` \| `fairshare` (see `setSchedulingPolicy`) |
| `NEXUS_RING_BUDGET_WINDOW_MS` | (schema) | Rolling-window size for per-ring budgets                                  |
| `NEXUS_DEFAULT_RING`          | `2`      | Ring assigned to agents without explicit `ring`                           |

## Kernel schema (`kernel-schema.ts`, Zod-validated)

- `mlfqLevels: string[]` — queue tiers (default `['Q0'..'Q4']`).
- `quantumMs: number` — base timeslice; Q0 smallest, Q4 largest.
- `ringPolicies: RingPolicy[]` — per-ring concurrency/token/api-call budgets.
- `cgroupInheritance: boolean` — whether child tasks inherit parent cgroup budget.

## Security / Safety

| Variable                  | Default              | Meaning                                |
| ------------------------- | -------------------- | -------------------------------------- |
| `KILL_SWITCH_DEFAULT`     | `false`              | Initial kill-switch state              |
| `ALL_SCOPES`              | (from `security.ts`) | Master scope set for capability checks |
| `STREAMING_PAYLOAD_LIMIT` | (bytes)              | Max SSE/stream payload size            |

## Database / Services

| Variable               | Default | Meaning                                       |
| ---------------------- | ------- | --------------------------------------------- |
| `DATABASE_URL`         | —       | Postgres; **required** for `test:integration` |
| `VAULT_ENCRYPTION_KEY` | —       | KMS/at-rest key reference                     |

## Validation

- Config is parsed and Zod-validated at boot; a failure raises `CONFIG_VALIDATION_FAILED`
  (see `ERROR_CODES.md`) and the server refuses to start.
- Never edit `agentic-os.db` / `server/data/app.sqlite` by hand — use Drizzle migrations in
  `server/drizzle/`.

## Adding a config key

1. Add the env read in `server/src/lib/env.ts` with a safe default + schema.
2. If kernel-scoped, extend `kernel-schema.ts`.
3. Document it in this table.
