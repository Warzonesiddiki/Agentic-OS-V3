/**
 * metrics.ts — Prometheus metrics for the NEXUS server.
 * Provides counter, histogram, and gauge helpers for tracking
 * request volume, latency, and system state.
 */

import promClient from "prom-client";

let _registry: promClient.Registry | null = null;

export function getRegistry(): promClient.Registry {
  if (!_registry) {
    _registry = new promClient.Registry();
    promClient.collectDefaultMetrics({ register: _registry });
  }
  return _registry;
}

export const httpRequestDuration = new promClient.Histogram({
  name: "nexus_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [getRegistry()],
});

export const httpRequestsTotal = new promClient.Counter({
  name: "nexus_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status"],
  registers: [getRegistry()],
});

export const activeConnections = new promClient.Gauge({
  name: "nexus_active_connections",
  help: "Number of active SSE connections",
  registers: [getRegistry()],
});

export const dbQueryDuration = new promClient.Histogram({
  name: "nexus_db_query_duration_seconds",
  help: "Database query duration in seconds",
  labelNames: ["query"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [getRegistry()],
});

export const taskProcessingDuration = new promClient.Histogram({
  name: "nexus_task_processing_duration_seconds",
  help: "Task processing duration in seconds",
  labelNames: ["kind", "status"],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [getRegistry()],
});

export function metricsContentType(): string {
  return getRegistry().contentType;
}

export async function metricsOutput(): Promise<string> {
  return getRegistry().metrics();
}
