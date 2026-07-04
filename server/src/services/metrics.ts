/**
 * metrics.ts — Prometheus metrics for the NEXUS server.
 *
 * Performance-focused metrics. Keep label cardinality bounded:
 * - route paths must be normalized before being used as labels
 * - ids, hashes, queries, and user input must never be labels
 */
import promClient from 'prom-client';

let _registry: promClient.Registry | null = null;

export function getRegistry(): promClient.Registry {
  if (!_registry) {
    _registry = new promClient.Registry();
    promClient.collectDefaultMetrics({ register: _registry, prefix: 'nexus_process_' });
  }
  return _registry;
}

export const httpRequestDuration = new promClient.Histogram({
  name: 'nexus_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [getRegistry()],
});

export const httpRequestsTotal = new promClient.Counter({
  name: 'nexus_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [getRegistry()],
});

export const activeConnections = new promClient.Gauge({
  name: 'nexus_active_connections',
  help: 'Number of active SSE connections',
  registers: [getRegistry()],
});

export const dbQueryDuration = new promClient.Histogram({
  name: 'nexus_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['query'],
  buckets: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [getRegistry()],
});

export const taskProcessingDuration = new promClient.Histogram({
  name: 'nexus_task_processing_duration_seconds',
  help: 'Task processing duration in seconds',
  labelNames: ['kind', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [getRegistry()],
});

export const recallDuration = new promClient.Histogram({
  name: 'nexus_recall_duration_seconds',
  help: 'Recall request duration in seconds',
  labelNames: ['mode'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [getRegistry()],
});

export const recallCandidates = new promClient.Histogram({
  name: 'nexus_recall_candidates_total',
  help: 'Number of recall candidates scored before token packing',
  labelNames: ['mode'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [getRegistry()],
});

export const cacheHitsTotal = new promClient.Counter({
  name: 'nexus_cache_hits_total',
  help: 'Application cache hits',
  labelNames: ['cache'],
  registers: [getRegistry()],
});

export const cacheMissesTotal = new promClient.Counter({
  name: 'nexus_cache_misses_total',
  help: 'Application cache misses',
  labelNames: ['cache'],
  registers: [getRegistry()],
});

export const llmDuration = new promClient.Histogram({
  name: 'nexus_llm_duration_seconds',
  help: 'LLM call duration in seconds',
  labelNames: ['model', 'status'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [getRegistry()],
});

export const llmTokensTotal = new promClient.Counter({
  name: 'nexus_llm_tokens_total',
  help: 'LLM token usage',
  labelNames: ['model', 'kind'],
  registers: [getRegistry()],
});

export const blockchainAnchorsTotal = new promClient.Counter({
  name: 'nexus_blockchain_anchors_total',
  help: 'Total number of blockchain anchors attempted or completed',
  labelNames: ['status'],
  registers: [getRegistry()],
});

export const blockchainGasSpentTotal = new promClient.Counter({
  name: 'nexus_blockchain_gas_spent_total',
  help: 'Total gas spent on blockchain anchors',
  labelNames: ['chain_id'],
  registers: [getRegistry()],
});

export const blockchainRpcFailuresTotal = new promClient.Counter({
  name: 'nexus_blockchain_rpc_failures_total',
  help: 'Total number of RPC failures during blockchain anchoring',
  labelNames: ['chain_id'],
  registers: [getRegistry()],
});

export function normalizeMetricPath(path: string): string {
  return path
    .replace(/\/api\/v1\/memories\/[^/]+/g, '/api/v1/memories/:id')
    .replace(/\/api\/v1\/skills\/[^/]+/g, '/api/v1/skills/:id')
    .replace(/\/api\/v1\/agents\/[^/]+/g, '/api/v1/agents/:id')
    .replace(/\/api\/v1\/tasks\/[^/]+/g, '/api/v1/tasks/:id')
    .replace(/\/api\/v1\/cron\/[^/]+/g, '/api/v1/cron/:id')
    .replace(/\/api\/v1\/audit\/verify\/[^/]+/g, '/api/v1/audit/verify/:anchorId')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:uuid')
    .replace(/\/(mem|skl|prj|agt|tsk|apv|crn|traj|anc|mcp)_[A-Za-z0-9_-]+/g, '/:$1_id');
}

export function metricsContentType(): string {
  return getRegistry().contentType;
}

export async function metricsOutput(): Promise<string> {
  return getRegistry().metrics();
}
