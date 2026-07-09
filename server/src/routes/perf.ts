/**
 * Phase 15 — Performance & Scalability control-plane routes.
 *
 * Read-only observability for the stateless kernel node pool (replica router),
 * multi-tier response cache (L1 in-memory + optional Redis L2), slow-query
 * advisor, warmup scheduler and circuit-breaker pool. Writes (register/drain a
 * replica, clear cache) are guarded behind the `admin.write` scope so the
 * kernel pool can be driven by the orchestrator at runtime.
 *
 * Owner: Bastion (DevOps) — Phase 15. No changes to kernel/scheduler source;
 * wiring is via the public API consumed in services/performance/bridge.ts.
 */
import type { Context } from 'hono';
import { Hono } from 'hono';
import { ok, err } from '../lib/envelope.js';
import { requireScope, fail } from '../lib/auth-context.js';
import {
  kernelNodePool,
  responseCache,
  slowQueryAdvisor,
  warmupScheduler,
  circuitBreakerPool,
  nodeReplicaRegistry,
  bootPerfBridge,
  emitReplicaEvent,
  buildReplicaSnapshot,
} from '../services/performance/index.js';

// Idempotent bootstrap of the performance wiring (stateless pool + cache).
bootPerfBridge();

const perf = new Hono();
const rid = (c: Context) => c.get('requestId') ?? '';

// Observability: snapshot of replica router + kernel ring budgets.
perf.get('/replica-snapshot', async (c: Context) => {
  return c.json(ok(buildReplicaSnapshot(), rid(c)));
});

// Pool membership.
perf.get('/node-pool', async (c: Context) => {
  return c.json(
    ok(
      {
        nodes: kernelNodePool.list(),
        selectable: kernelNodePool.selectable(),
        registry: nodeReplicaRegistry.list(),
      },
      rid(c)
    )
  );
});

// Multi-tier cache stats (L1 hits/misses, L2 present, stampede guard).
perf.get('/cache-stats', async (c: Context) => {
  return c.json(ok(responseCache.getStats(), rid(c)));
});

perf.post('/cache-clear', async (c: Context) => {
  try {
    await requireScope(c, 'admin.write');
    const n = await responseCache.clear();
    return c.json(ok({ cleared: n }, rid(c)));
  } catch (e) {
    return fail(c, e);
  }
});

// Slow-query advisor top offenders.
perf.get('/slow-queries', async (c: Context) => {
  const limit = Number(c.req.query('limit') ?? 20);
  return c.json(ok({ slow: slowQueryAdvisor.advise(Number.isFinite(limit) ? limit : 20) }, rid(c)));
});

// Warmup + circuit-breaker health.
perf.get('/runtime', async (c: Context) => {
  return c.json(
    ok({ warmup: warmupScheduler.status, breakers: circuitBreakerPool.list() }, rid(c))
  );
});

// Replica lifecycle driven by the orchestrator (Phase 13).
perf.post('/replicas', async (c: Context) => {
  try {
    await requireScope(c, 'admin.write');
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.id !== 'string' || typeof body.url !== 'string') {
      return c.json(err('BAD_REPLICA', 'id and url required', rid(c)), 400);
    }
    const action = body.action === 'drain' ? 'replica_drain' : 'replica_register';
    emitReplicaEvent(action, { id: body.id, url: body.url });
    return c.json(ok({ id: body.id, action }, rid(c)));
  } catch (e) {
    return fail(c, e);
  }
});

export { perf as perfRoute };
