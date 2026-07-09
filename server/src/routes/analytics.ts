/**
 * analytics.ts — performance & observability analytics endpoints (Bastion namespace).
 *
 * Exposes real, measurable data: prom metrics scrape, overhead-accounting report
 * (real cost self-opt can read), health-monitor summary (ML-002 self-healing
 * state), and a live system snapshot. This is the end-to-end p95-latency and
 * cost observability surface (Perfection target #1).
 *
 * NOTE: this module is NOT imported by the FROZEN routes.ts. Mount it on the
 * server app via `app.route('/api/v1/analytics', analyticsApp)` when wiring is
 * opened; it is self-contained and compiles independently.
 */
import { Hono } from 'hono';
import { metricsOutput, metricsContentType, listExportedMetrics } from '../services/metrics.js';
import { getOverheadReport } from '../services/overhead-accounting.js';
import { runHealthChecks, getHealthSummary } from '../services/health-monitor.js';
import { getSystemSnapshot } from '../lib/monitoring.js';

export const analyticsApp = new Hono();

analyticsApp.get('/metrics', async (c) => {
  const out = await metricsOutput();
  c.header('Content-Type', metricsContentType());
  return c.body(out);
});

analyticsApp.get('/overhead', (c) => {
  return c.json({ ok: true, data: getOverheadReport() });
});

analyticsApp.get('/exported-metrics', (c) => {
  return c.json({ ok: true, data: listExportedMetrics() });
});

analyticsApp.get('/health/summary', (c) => {
  return c.json({ ok: true, data: getHealthSummary() });
});

analyticsApp.post('/health/run', async (c) => {
  const result = await runHealthChecks();
  return c.json({ ok: true, data: result });
});

analyticsApp.get('/snapshot', async (c) => {
  const snap = await getSystemSnapshot();
  return c.json({ ok: true, data: snap });
});

export const analyticsRouter = analyticsApp;
export default analyticsApp;
