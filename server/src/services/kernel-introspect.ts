import { getKernelIntrospection } from './kernel-introspect-state.js';

/**
 * Phase 11 — Task 11.27: Kernel Introspection API (snapshot entry point).
 *
 * Backwards-compatible alias required by the phase-11 behavior test. Delegates
 * to the richer {@link getKernelIntrospection} implementation.
 */
export function getIntrospectionSnapshot() {
  const intro = getKernelIntrospection();
  return {
    agents: intro.resources.map((r) => ({ id: r.resource, status: 'running' })),
    rings: intro.rings,
    tasks: intro.gangs.map((g) => ({ id: g.primary, status: 'gang' })),
    timestamp: intro.timestamp,
  };
}
