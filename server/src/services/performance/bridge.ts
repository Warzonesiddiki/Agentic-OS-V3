/**
 * Phase 15 wiring bridge — connects the performance subsystems
 * (stateless kernel node pool / replica router, multi-tier response cache,
 * session store, slow-query advisor, warmup scheduler, circuit-breaker pool)
 * to the kernel and scheduler public APIs.
 *
 * This module ONLY consumes the kernel/scheduler public surface
 * (publishKernelEvent, ringBudgetStatus) — it never mutates kernel/scheduler
 * internals. That keeps it in Bastion's Phase 15 territory while Forge owns
 * the kernel implementation.
 */
import { log } from '../../lib/logger.js';
import { kernelNodePool, type KernelNode } from './redis-session.js';
import { responseCache } from './response-cache.js';
import { slowQueryAdvisor } from './slow-query-advisor.js';
import { warmupScheduler } from './warmup-scheduler.js';
import { circuitBreakerPool } from './circuit-breaker-pool.js';
import { nodeReplicaRegistry } from './registry.js';
import { publishKernelEvent, ringBudgetStatus } from '../kernel.js';

export interface PerfBridgeConfig {
  /** Seed kernel nodes from configuration (id -> url). */
  seedNodes?: Array<{ id: string; url: string }>;
  /** Whether to attach the bridge to kernel event emission. */
  wireKernelEvents?: boolean;
}

/**
 * Materialise a replica-router snapshot enriched with live kernel ring-budget
 * data. This is the read-only seam that ties the stateless pool to Forge's
 * kernel without touching kernel source.
 */
export function buildReplicaSnapshot(): {
  nodes: KernelNode[];
  selectable: KernelNode[];
  ringBudgets: ReturnType<typeof ringBudgetStatus> | undefined;
} {
  const nodes = kernelNodePool.list();
  const selectable = kernelNodePool.selectable();
  let ringBudgets: ReturnType<typeof ringBudgetStatus> | undefined;
  try {
    ringBudgets = ringBudgetStatus(0);
  } catch (err) {
    log.warn('perf-bridge: ringBudgetStatus unavailable', { err: String(err) });
  }
  return { nodes, selectable, ringBudgets };
}

/**
 * Record a kernel event through the shared emitter (no-op safe if the kernel
 * has not been initialised yet) and reflect replica state into the pool +
 * registry.
 */
export function emitReplicaEvent(
  type: 'replica_register' | 'replica_drain' | 'replica_healthy',
  node: { id: string; url: string }
): void {
  if (node.id && node.url) {
    kernelNodePool.register(node.id, node.url);
    if (type === 'replica_drain') kernelNodePool.setDraining(node.id, true);
    else kernelNodePool.setDraining(node.id, false);
    nodeReplicaRegistry.upsert(node.id, { url: node.url, draining: type === 'replica_drain' });
  }
  try {
    publishKernelEvent(`perf.${type}` as never, {
      nodeId: node.id,
      url: node.url,
      ts: Date.now(),
    });
  } catch (err) {
    log.warn('perf-bridge: publishKernelEvent unavailable', { err: String(err) });
  }
}

let booted = false;

/**
 * Idempotent bootstrap of Phase 15 performance wiring. Registers any seed
 * nodes into the stateless pool, primes the response cache statistics, and
 * records a warmup span. Safe to call once during server init.
 */
export function bootPerfBridge(config: PerfBridgeConfig = {}): void {
  if (booted) return;
  booted = true;

  for (const n of config.seedNodes ?? []) {
    kernelNodePool.register(n.id, n.url);
    nodeReplicaRegistry.upsert(n.id, { url: n.url, draining: false });
  }

  // Warm the multi-tier cache + advisor so first requests are not cold.
  warmupScheduler.registerWarmup({
    name: 'perf-cache',
    weight: 50,
    run: async () => {
      await responseCache.getOrLoad('__warmup__', async () => ({
        ok: true as const,
        now: Date.now(),
      }));
      slowQueryAdvisor.record({ sql: 'SELECT 1', ms: 0 });
    },
  });

  log.info('perf-bridge: booted', {
    seedNodes: (config.seedNodes ?? []).length,
    circuitBreakers: circuitBreakerPool.list().length,
  });
}

export async function drainPerfBridge(): Promise<void> {
  for (const n of kernelNodePool.list()) {
    kernelNodePool.setDraining(n.id, true);
  }
  await warmupScheduler.stop();
  log.info('perf-bridge: drained');
}
