import { Hono } from 'hono';
import type { NexusEnv } from '../lib/hono-env.js';
import { ok } from '../lib/envelope.js';
import { getKernelIntrospection } from '../services/kernel-introspect-state.js';

/**
 * Phase 11 — Task 11.27: Kernel Introspection HTTP API.
 *
 * Exposes a Hono router with read-only introspection endpoints: a full snapshot,
 * per-ring budget status, held resources, gangs, and scheduler latency.
 */
export const kernelIntrospectRouter = new Hono<NexusEnv>();

kernelIntrospectRouter.get('/', (c) => {
  return c.json(ok(getKernelIntrospection(), c.get('requestId') ?? ''));
});

kernelIntrospectRouter.get('/rings', (c) => {
  const snap = getKernelIntrospection();
  return c.json(ok(snap.rings, c.get('requestId') ?? ''));
});

kernelIntrospectRouter.get('/resources', (c) => {
  const snap = getKernelIntrospection();
  return c.json(ok(snap.resources, c.get('requestId') ?? ''));
});

kernelIntrospectRouter.get('/gangs', (c) => {
  const snap = getKernelIntrospection();
  return c.json(ok(snap.gangs, c.get('requestId') ?? ''));
});

kernelIntrospectRouter.get('/health', (c) => {
  const snap = getKernelIntrospection();
  return c.json(ok(snap.health, c.get('requestId') ?? ''));
});
