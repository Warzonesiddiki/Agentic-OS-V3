# Observability Guide

> Observability for the NEXUS server: tracing (OpenTelemetry), metrics (Prometheus), visualization (Grafana), and structured logging.

---

## 1. OpenTelemetry (Tracing)

Distributed tracing via OTel, disabled by default. Tracks request flows across service boundaries.

### Enabling

```env
NEXUS_OTEL_ENDPOINT=http://localhost:4318/v1/traces
NEXUS_OTEL_API_KEY=optional-bearer-token
```

Set `NEXUS_OTEL_ENDPOINT` to any OTLP HTTP collector (Grafana Tempo, Jaeger, SigNoz, etc.). The SDK auto-detects the env var; without it the OTel layer is a no-op.

### What's instrumented

| Instrumentation       | Source                                | Scope                                   |
| --------------------- | ------------------------------------- | --------------------------------------- |
| HTTP inbound/outbound | `@opentelemetry/instrumentation-http` | All requests through Hono               |
| Service resource      | `@opentelemetry/resources`            | `service.name=nexus-server`             |
| Trace export          | `OTLPTraceExporter`                   | Batch-shipped to the collector endpoint |

**Implementation** — `server/src/lib/otel.ts`:

- Lazy-imports OTel SDK to keep startup fast when tracing is off.
- Registers one `SimpleSpanProcessor` with the OTLP exporter.
- No custom span processors or sampling config yet — the collector layer should handle sampling.

### Graceful shutdown

`shutdownOtel()` is called during server shutdown to flush pending spans. Safe to call even when OTel was never initialized.

### Adding custom spans

```ts
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('nexus-server');
await tracer.startActiveSpan('my_operation', async (span) => {
  span.setAttribute('key', 'value');
  try {
    // … work …
  } finally {
    span.end();
  }
});
```

---

## 2. Prometheus Metrics

`prom-client` powers a `GET /metrics` endpoint with process defaults plus application-specific metrics.

### Available metrics

All metrics carry the `nexus_` prefix.

#### HTTP & Server

| Metric                                | Type      | Labels                     | Description                                               |
| ------------------------------------- | --------- | -------------------------- | --------------------------------------------------------- |
| `nexus_http_request_duration_seconds` | Histogram | `method`, `path`, `status` | Request latency (buckets: 5ms–10s)                        |
| `nexus_http_requests_total`           | Counter   | `method`, `path`, `status` | Request count                                             |
| `nexus_active_connections`            | Gauge     | —                          | Active SSE connections                                    |
| `nexus_process_*`                     | Various   | —                          | Default Node.js process metrics (CPU, memory, event loop) |

#### Database

| Metric                            | Type      | Labels  | Description                     |
| --------------------------------- | --------- | ------- | ------------------------------- |
| `nexus_db_query_duration_seconds` | Histogram | `query` | Query latency (buckets: 1ms–5s) |

#### LLM

| Metric                       | Type      | Labels            | Description                            |
| ---------------------------- | --------- | ----------------- | -------------------------------------- |
| `nexus_llm_duration_seconds` | Histogram | `model`, `status` | LLM call latency (buckets: 100ms–120s) |
| `nexus_llm_tokens_total`     | Counter   | `model`, `kind`   | Token usage                            |

#### Recall (Memory)

| Metric                          | Type      | Labels           | Description                      |
| ------------------------------- | --------- | ---------------- | -------------------------------- |
| `nexus_recall_duration_seconds` | Histogram | `mode`, `status` | Recall latency                   |
| `nexus_recall_candidates_total` | Histogram | `mode`           | Candidates scored before packing |
| `nexus_recall_result_count`     | Histogram | `mode`           | Results returned                 |
| `nexus_recall_latency_seconds`  | Histogram | `mode`, `status` | Recall latency (finer buckets)   |

#### Cache

| Metric                     | Type    | Labels  | Description      |
| -------------------------- | ------- | ------- | ---------------- |
| `nexus_cache_hits_total`   | Counter | `cache` | Cache hit count  |
| `nexus_cache_misses_total` | Counter | `cache` | Cache miss count |

#### Task / Agent Pipeline

| Metric                                   | Type      | Labels           | Description             |
| ---------------------------------------- | --------- | ---------------- | ----------------------- |
| `nexus_task_processing_duration_seconds` | Histogram | `kind`, `status` | Task processing time    |
| `nexus_agent_spawns_total`               | Counter   | —                | Agent spawn count       |
| `nexus_agent_terminations_total`         | Counter   | —                | Agent termination count |

#### Blockchain Anchoring

| Metric                                | Type    | Labels     | Description          |
| ------------------------------------- | ------- | ---------- | -------------------- |
| `nexus_blockchain_anchors_total`      | Counter | `status`   | Anchoring operations |
| `nexus_blockchain_gas_spent_total`    | Counter | `chain_id` | Gas spent            |
| `nexus_blockchain_rpc_failures_total` | Counter | `chain_id` | RPC failures         |

#### Audit & Skills

| Metric                                  | Type    | Labels           | Description                    |
| --------------------------------------- | ------- | ---------------- | ------------------------------ |
| `nexus_audit_chain_verifications_total` | Counter | `result`         | Audit chain verification count |
| `nexus_memory_writes_total`             | Counter | `kind`, `source` | Memory write operations        |
| `nexus_skill_compilations_total`        | Counter | `result`         | Skill compilation count        |

### Label cardinality guard

Route paths are normalized in `normalizeMetricPath()` (`server/src/services/metrics.ts:172`) before being used as labels. IDs, UUIDs, and entity handles are replaced with `:id` placeholders. This prevents cardinality explosion — never add raw user input or IDs as label values.

### Metrics endpoint

The registry is exposed through a Hono route. Default port **9900**. The output is consumed by Prometheus scrape jobs.

```env
# prometheus.yml target
scrape_configs:
  - job_name: "nexus-server"
    static_configs:
      - targets: ["localhost:9900"]
```

**Files**: `server/src/services/metrics.ts` (definitions), `server/src/lib/metrics.ts` (re-export).

---

## 3. Grafana

Grafana visualizes Prometheus metrics and OTel traces. No embedded Grafana code in this repo — it scrapes the Prometheus endpoint externally.

### Recommended dashboards

#### 1. Server Overview

- **Panel**: Request rate (`rate(nexus_http_requests_total[5m])`)
- **Panel**: p50/p95/p99 latency (`histogram_quantile(0.99, rate(nexus_http_request_duration_seconds_bucket[5m]))`)
- **Panel**: Active connections (`nexus_active_connections`)
- **Panel**: Process memory / CPU (`nexus_process_resident_memory_bytes`, `nexus_process_cpu_seconds_total`)

#### 2. LLM Provider Performance

- **Panel**: Per-model latency heatmap
- **Panel**: Token throughput (`rate(nexus_llm_tokens_total[5m])`)
- **Panel**: Error rate by model (`nexus_llm_duration_seconds_count{status="error"}`)

#### 3. Memory / Recall

- **Panel**: Recall duration by mode
- **Panel**: Candidate distribution
- **Panel**: Cache hit ratio (`rate(nexus_cache_hits_total[5m]) / (rate(nexus_cache_hits_total[5m]) + rate(nexus_cache_misses_total[5m]))`)

#### 4. Blockchain Anchoring

- **Panel**: Anchor success/fail rate
- **Panel**: Gas spend by chain

### Trace → metrics correlation

Use the `service.name="nexus-server"` resource attribute to link traces in Grafana Tempo to Prometheus metrics. Configure exemplars in Prometheus to jump from a latency spike to the associated trace.

---

## 4. Logging

A minimal structured JSON logger with built-in secret redaction. No external logging library — single file, no dependencies.

### Configuration

```env
NEXUS_LOG_LEVEL=info   # debug | info | warn | error
```

### Output format

Every line is a JSON object written to stdout (info/debug) or stderr (warn/error):

```json
{ "level": "info", "msg": "server_started", "ts": "2026-07-07T12:00:00.000Z", "port": 9900 }
```

### Secret redaction

The logger auto-scrubs known credential patterns from all fields:

- `sk-*` keys
- `nx_live_*` tokens
- `AKIA*` AWS access keys
- `password`, `secret`, `api_key`, `token` field names (value → `***REDACTED***`)
- Regex-based redaction in string values

**Implementation** — `server/src/lib/logging.ts`:

- `redact()` traverses objects recursively before serialization.
- Errors are logged with `error.message` and `error.stack` — never the full error object (preventing stack leak via structured logs).

### Usage

```ts
import { log } from './lib/logging.js';

log.info('server_started', { port: 9900 });
log.warn('rate_limit_exceeded', { client: 'ip_1.2.3.4' });
log.error('db_connection_failed', { error: err.message });
```

### Adding fields

Always pass structured context as the second argument — never interpolate into the message string. This keeps logs machine-parseable and queryable.

### Log level threshold

Messages below `NEXUS_LOG_LEVEL` are dropped before serialization. `debug` logs are discarded in production by default.

---

## Quick Reference

| Concern       | Tool                     | Env Config            | Endpoint / File                                     |
| ------------- | ------------------------ | --------------------- | --------------------------------------------------- |
| Tracing       | OpenTelemetry            | `NEXUS_OTEL_ENDPOINT` | `server/src/lib/otel.ts`                            |
| Metrics       | Prometheus (prom-client) | — (always on)         | `GET /metrics` via `server/src/services/metrics.ts` |
| Visualization | Grafana                  | External              | Point at Prometheus data source                     |
| Logging       | Built-in JSON logger     | `NEXUS_LOG_LEVEL`     | `server/src/lib/logging.ts`                         |
