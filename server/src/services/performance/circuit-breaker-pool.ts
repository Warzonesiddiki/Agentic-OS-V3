/**
 * circuit-breaker-pool.ts — Phase 15.16 self-healing circuit-breaker pool.
 *
 * Coordinates with Sentinel's reliability modules (do not re-implement breakers):
 *   - circuit-breaker-registry: per-resource breaker state (allow/recordSuccess/recordFailure/stateOf).
 *   - degraded-mode: drop to a degraded service tier when breakers open.
 *   - self-healing: attempt recovery (heal) when a breaker has been open for a cooldown.
 *
 * The pool owns a set of named downstream resources; execute() wraps the call in the breaker and
 * triggers self-heal + degraded-mode transition on sustained failure.
 */
import { log } from '../../lib/logging.js';
import {
  registerBreaker,
  recordSuccess,
  recordFailure,
  allowCall,
  stateOf,
  type BreakerState,
} from '../reliability/circuit-breaker-registry.js';
import { setTier } from '../reliability/degraded-mode.js';
import { heal } from '../reliability/self-healing.js';

export type { BreakerState };

export interface BreakerInfo {
  name: string;
  state: BreakerState;
  failures: number;
  consecutiveSuccesses: number;
  openedAt?: number;
}

interface ResourceCfg {
  cooldownMs: number;
  failures: number;
  consecutiveSuccesses: number;
  openedAt?: number;
}

export class CircuitBreakerPool {
  private resources = new Map<string, ResourceCfg>();

  /** Register a downstream resource with its breaker configuration. */
  registerResource(
    name: string,
    opts?: { failureThreshold?: number; cooldownMs?: number; halfOpenMax?: number }
  ): void {
    const cooldownMs = opts?.cooldownMs ?? 10_000;
    registerBreaker(name, {
      failureThreshold: opts?.failureThreshold ?? 5,
      resetMs: cooldownMs,
      halfOpenMax: opts?.halfOpenMax ?? 3,
    });
    this.resources.set(name, { cooldownMs, failures: 0, consecutiveSuccesses: 0 });
    log.info('circuit-breaker-pool: registered resource', { name, ...opts });
  }

  unregisterResource(name: string): void {
    this.resources.delete(name);
  }

  info(name: string): BreakerInfo {
    const cfg = this.resources.get(name);
    const state = stateOf(name);
    return {
      name,
      state,
      failures: cfg?.failures ?? 0,
      consecutiveSuccesses: cfg?.consecutiveSuccesses ?? 0,
      openedAt: cfg?.openedAt,
    };
  }

  list(): BreakerInfo[] {
    return [...this.resources.keys()].map((r) => this.info(r));
  }

  /**
   * Execute an action guarded by the resource's circuit breaker.
   * On repeated failure the breaker opens, we drop the global degraded tier, and schedule a heal.
   */
  async execute<T>(
    name: string,
    action: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    if (!this.resources.has(name)) {
      // Defensive: auto-register with defaults so execute() never hard-fails on a missing breaker.
      this.registerResource(name);
    }
    let allowed = true;
    try {
      allowed = allowCall(name);
    } catch {
      allowed = true; // breaker not present in registry -> allow (registry call above would have created it)
    }
    if (!allowed) {
      if (fallback) return fallback();
      throw new Error(`circuit-breaker-pool: ${name} is OPEN`);
    }
    const cfg = this.resources.get(name)!;
    try {
      const result = await action();
      recordSuccess(name);
      cfg.failures = 0;
      cfg.consecutiveSuccesses++;
      return result;
    } catch (err) {
      const before = stateOf(name);
      recordFailure(name);
      const after = stateOf(name);
      cfg.failures++;
      cfg.consecutiveSuccesses = 0;
      if (before !== 'open' && after === 'open') {
        cfg.openedAt = Date.now();
        log.warn('circuit-breaker-pool: breaker OPENED', { name });
        try {
          setTier('reduced', `circuit-breaker-pool:${name}`);
        } catch {
          /* degraded-mode guard absent — best effort */
        }
        this.scheduleHeal(name);
      }
      if (fallback) return fallback();
      throw err;
    }
  }

  private scheduleHeal(name: string): void {
    const cooldown = this.resources.get(name)?.cooldownMs ?? 10_000;
    setTimeout(() => {
      if (stateOf(name) === 'open') {
        log.info('circuit-breaker-pool: attempting self-heal', { name });
        Promise.resolve(heal(name))
          .then(() => {
            const cfg = this.resources.get(name);
            if (cfg) {
              cfg.openedAt = undefined;
              cfg.failures = 0;
              cfg.consecutiveSuccesses = 0;
            }
            log.info('circuit-breaker-pool: healed, breaker reset', { name });
          })
          .catch((e: unknown) => log.warn('circuit-breaker-pool: heal failed', { err: e, name }));
      }
    }, cooldown);
  }

  /** True when any breaker in the pool is open (used by health endpoints). */
  anyOpen(): boolean {
    return [...this.resources.keys()].some((r) => stateOf(r) === 'open');
  }
}

export const circuitBreakerPool = new CircuitBreakerPool();
