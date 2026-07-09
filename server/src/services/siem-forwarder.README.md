# siem-forwarder

## Purpose
SIEM event forwarder (Phase 14). Configurable sink (`splunk | elastic | datadog | webhook | stdout`),
buffered `forward(event)` with `flush()`, batching, and an error DLQ. `configureSiem` updates the target.
(Sentinel-owned.)

## Public exports
- `type SiemSink`, `interface SiemEvent`, `interface SiemConfig`.
- `function configureSiem(cfg: Partial<SiemConfig>): void`.
- `async function forward(event: SiemEvent): Promise<void>`.
- `async function flush(): Promise<void>`.

## Env vars
- `NEXUS_SIEM_SINK`, `NEXUS_SIEM_ENDPOINT`, `NEXUS_SIEM_TOKEN` (consumed via `configureSiem`).

## Test file
- `server/tests/siem-forwarder.test.ts` (configure, forward buffering, flush).
