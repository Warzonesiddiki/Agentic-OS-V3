# Tyche — Persona Card (Specialist)

| Field | Value |
| --- | --- |
| id | `tyche` |
| name | Tyche |
| role | Reliability & Chaos Engineering |
| domain | safety |
| tier | staff |
| reportsTo | `aegis` |
| status | active |

## Responsibility
Reliability/chaos specialist: the `services/reliability/*` suite (SLO, burn-rate, chaos, failover-drill,
circuit-breaker registry, self-healing). Supports Aegis Phase 20.

## Coordination Seams
- Consumes `reliability/*` modules from Aegis.
- Uses `health-monitor` (Metron) for shadow daemon.
