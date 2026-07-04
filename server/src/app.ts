/**
 * app.ts — the assembled Hono application (perimeter + versioned API + API-404
 * guard + optional dashboard). Extracted from index.ts so the whole perimeter
 * — including the "/api/* must return JSON, never the SPA" guard — is testable.
 */
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from './lib/env.js';
import {
  requestId,
  securityHeaders,
  cors,
  payloadLimit,
  rateLimit,
  authBackstop,
} from './proxy.js';
import { api } from './routes.js';
import { err } from './lib/envelope.js';
import { log } from './lib/logging.js';
import type { NexusEnv } from './lib/hono-env.js';
import { httpRequestDuration, httpRequestsTotal, normalizeMetricPath } from './services/metrics.js';

import {
  runWithTraceContext,
  parseTraceparent,
  formatTraceparent,
  generateTraceId,
  generateSpanId,
  getTracer,
} from './services/tracing.js';

export function createApp(): Hono<NexusEnv> {
  const app = new Hono<NexusEnv>();

  // Perimeter guard — order matters.
  app.use('*', requestId);

  // W3C Trace Context & Low-overhead HTTP metrics.
  // Extracts/generates W3C traceparent context and records Prometheus duration/count.
  app.use('*', async (c, next) => {
    const started = performance.now();
    const incomingHeader = c.req.header('traceparent');
    const parsed = parseTraceparent(incomingHeader);

    const traceId = parsed?.traceId ?? generateTraceId();
    const parentSpanId = parsed?.spanId;
    const spanId = generateSpanId();
    const traceFlags = parsed?.traceFlags ?? '01';
    const ctx = { traceId, spanId, parentSpanId, traceFlags };
    const traceparentHeader = formatTraceparent(ctx);

    c.header('traceparent', traceparentHeader);

    await runWithTraceContext(ctx, async () => {
      const tracer = getTracer();
      const path = normalizeMetricPath(c.req.path);
      const span = tracer.startSpan(`http.${c.req.method.toLowerCase()} ${path}`, 'tool_span', {
        parentId: parentSpanId,
        attributes: {
          httpMethod: c.req.method,
          httpPath: c.req.path,
          traceparent: traceparentHeader,
        },
      });

      try {
        await next();
        span.setAttribute('httpStatus', c.res.status);
      } catch (err) {
        span.setStatus('error');
        span.setAttribute('error', err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        tracer.endSpan(span);
        const elapsedSeconds = (performance.now() - started) / 1000;
        const status = String(c.res.status);
        httpRequestsTotal.inc({ method: c.req.method, path, status });
        httpRequestDuration.observe({ method: c.req.method, path, status }, elapsedSeconds);
      }
    });
  });

  app.use('*', cors);
  app.use('*', securityHeaders);
  app.use('*', payloadLimit);
  app.use('*', rateLimit);
  app.use('*', authBackstop);

  app.route('/', api);

  // API 404 guard: unmatched /api/* returns a JSON envelope, NEVER the SPA.
  app.all('/api/*', (c) =>
    c.json(
      err('NOT_FOUND', `No route for ${c.req.method} ${c.req.path}`, c.get('requestId') ?? ''),
      404
    )
  );

  // Optional single-file dashboard at the same origin.
  let dashboardHtml: string | null = null;
  try {
    dashboardHtml = readFileSync(resolve(env.NEXUS_DASHBOARD_DIR, 'index.html'), 'utf8');
    log.info('dashboard_loaded', { dir: env.NEXUS_DASHBOARD_DIR });
  } catch (e) {
    // Only tolerate ENOENT (file doesn't exist). Re-throw permission errors,
    // encoding errors, etc. — those are real problems, not "dashboard absent."
    if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') {
      log.warn('dashboard_absent', { dir: env.NEXUS_DASHBOARD_DIR, note: 'API-only mode.' });
    } else {
      log.error('dashboard_load_failed', {
        dir: env.NEXUS_DASHBOARD_DIR,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  app.get('/*', (c) =>
    dashboardHtml
      ? c.html(dashboardHtml)
      : c.json(err('NOT_FOUND', 'No route.', c.get('requestId') ?? ''), 404)
  );

  return app;
}
