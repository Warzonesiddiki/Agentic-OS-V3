# metrics

## Purpose
Prometheus metric registry + exporter. Defines the canonical `promClient` registry and all standard metrics
(HTTP duration/total, active connections, DB query duration, task-processing duration, recall duration and
candidate count, cache hits/misses, LLM duration/tokens, blockchain anchors/gas/RPC failures, agent
spawns/terminations, memory writes, skill compilations). `metricsOutput()` renders the `/metrics` text;
`recordExport` tracks app-level custom metrics.

## Public exports (selected)
- `function getRegistry(): promClient.Registry`.
- Metric objects: `httpRequestDuration`, `httpRequestsTotal`, `activeConnections`, `dbQueryDuration`,
  `taskProcessingDuration`, `recallDuration`, `recallCandidates`, `cacheHitsTotal`, `cacheMissesTotal`,
  `llmDuration`, `llmTokensTotal`, `blockchainAnchorsTotal`, `blockchainGasSpentTotal`,
  `blockchainRpcFailuresTotal`, `agentSpawnsTotal`, `agentTerminationsTotal`, `memoryWritesTotal`,
  `skillCompilationsTotal`.
- `function normalizeMetricPath(path)`, `metricsContentType()`, `metricsOutput(): Promise<string>`.
- `function recordExport(name, value, labels?)`, `listExportedMetrics()`, `resetExportMetrics()`.

## Env vars
None directly (scrape endpoint served by `routes/analytics.ts`).

## Test file
- `server/tests/metrics.test.ts` (registry, output format, recordExport).
