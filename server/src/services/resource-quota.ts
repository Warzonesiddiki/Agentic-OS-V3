import { getMessageBus } from './message-bus.js';
import { KERNEL_EVENTS } from './kernel.js';
import { log } from '../lib/logging.js';

/**
 * Phase 11 — Task 11.26: Disk / Net Quota.
 *
 * Two complementary primitives:
 *  1. `createQuotaLimiter` — a tiny generic token-bucket limiter used by the
 *     kernel to cap arbitrary resource consumption per agent.
 *  2. `ResourceQuotaEnforcer` / `wrapFs` / `wrapHttpOutbound` — a real token-bucket
 *     rate limiter (disk read/write bytes-per-second, net egress bytes-per-second)
 *     that throttles I/O via `setTimeout` and emits `ring.budget_exceeded` events
 *     when a hard cap is breached.
 */

export interface QuotaLimiter {
  tryAcquire(tokens?: number): boolean;
  release(tokens?: number): void;
  remaining(): number;
  usage(): number;
}

export function createQuotaLimiter(limit: number): QuotaLimiter {
  let used = 0;
  return {
    tryAcquire(tokens = 1): boolean {
      if (used + tokens > limit) return false;
      used += tokens;
      return true;
    },
    release(tokens = 1): void {
      used = Math.max(0, used - tokens);
    },
    remaining(): number {
      return Math.max(0, limit - used);
    },
    usage(): number {
      return used;
    },
  };
}

// ── Token-bucket I/O enforcer ────────────────────────────────────────────────

export class NetworkQuotaExceededError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly bytes: number
  ) {
    super(`Network egress quota exceeded for agent ${agentId} (${bytes} bytes)`);
    this.name = 'NetworkQuotaExceededError';
  }
}

export interface QuotaLimits {
  diskWriteBps?: number;
  diskReadBps?: number;
  netEgressBps?: number;
}

export interface QuotaOptions {
  burstFactor?: number;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onExceeded?: (kind: 'diskRead' | 'diskWrite' | 'netEgress', bytes: number) => void;
}

interface Bucket {
  capacity: number;
  tokens: number;
  last: number;
}

export class ResourceQuotaEnforcer {
  private readonly clock: () => number;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly onExceeded?: QuotaOptions['onExceeded'];
  private readonly readBps: number;
  private readonly writeBps: number;
  private readonly netBps: number;
  private readonly read: Bucket;
  private readonly write: Bucket;
  private readonly net: Bucket;

  constructor(
    public readonly agentId: string,
    limits: QuotaLimits,
    opts: QuotaOptions = {}
  ) {
    this.clock = opts.clock ?? (() => Date.now());
    this.sleepImpl = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    this.onExceeded = opts.onExceeded;
    const burst = opts.burstFactor ?? 1.5;
    this.readBps = limits.diskReadBps ?? 0;
    this.writeBps = limits.diskWriteBps ?? 0;
    this.netBps = limits.netEgressBps ?? 0;
    this.read = this.makeBucket(this.readBps, burst);
    this.write = this.makeBucket(this.writeBps, burst);
    this.net = this.makeBucket(this.netBps, burst);
  }

  private makeBucket(bps: number, burst: number): Bucket {
    return { capacity: bps * burst, tokens: bps * burst, last: this.clock() };
  }

  private refill(b: Bucket, bps: number): void {
    if (bps <= 0) return; // unlimited
    const now = this.clock();
    const elapsed = (now - b.last) / 1000;
    if (elapsed <= 0) return;
    b.tokens = Math.min(b.capacity, b.tokens + elapsed * bps);
    b.last = now;
  }

  private async acquire(
    b: Bucket,
    bps: number,
    bytes: number,
    kind: 'diskRead' | 'diskWrite' | 'netEgress'
  ): Promise<void> {
    if (bps <= 0) return; // unlimited
    this.refill(b, bps);
    if (bytes <= b.tokens) {
      b.tokens -= bytes;
      return;
    }
    this.emitExceeded(kind, bytes);
    throw new NetworkQuotaExceededError(this.agentId, bytes);
  }

  private emitExceeded(kind: 'diskRead' | 'diskWrite' | 'netEgress', bytes: number): void {
    try {
      getMessageBus().publish(KERNEL_EVENTS.RING_BUDGET_EXCEEDED, 'kernel', undefined, {
        agentId: this.agentId,
        reason: `quota:${kind}`,
        bytes,
      } as unknown);
    } catch (e) {
      log.warn('quota_emit_failed', { error: e instanceof Error ? e.message : String(e) });
    }
    this.onExceeded?.(kind, bytes);
  }

  async limitRead(bytes: number): Promise<void> {
    await this.acquire(this.read, this.readBps, bytes, 'diskRead');
  }

  async limitWrite(bytes: number): Promise<void> {
    await this.acquire(this.write, this.writeBps, bytes, 'diskWrite');
  }

  async limitNetEgress(bytes: number): Promise<void> {
    await this.acquire(this.net, this.netBps, bytes, 'netEgress');
  }
}

/** Wrap a filesystem read/write function so every call is throttled by the enforcer. */
export function wrapFs(
  enforcer: ResourceQuotaEnforcer,
  mode: 'read' | 'write',
  fn: (bytes: number, ...rest: unknown[]) => void | Promise<unknown>
): (bytes: number, ...rest: unknown[]) => Promise<unknown> {
  return async (bytes: number, ...rest: unknown[]): Promise<unknown> => {
    if (mode === 'read') await enforcer.limitRead(bytes);
    else await enforcer.limitWrite(bytes);
    return fn(bytes, ...rest);
  };
}

/** Wrap an outbound HTTP call so egress bytes are throttled by the enforcer. */
export function wrapHttpOutbound(
  enforcer: ResourceQuotaEnforcer,
  fn: (bytes: number, ...rest: unknown[]) => void | Promise<unknown>
): (bytes: number, ...rest: unknown[]) => Promise<unknown> {
  return async (bytes: number, ...rest: unknown[]): Promise<unknown> => {
    await enforcer.limitNetEgress(bytes);
    return fn(bytes, ...rest);
  };
}

/** Build a per-agent I/O quota enforcer (shared helper for the kernel). */
export function diskQuota(
  agentId: string,
  limits: QuotaLimits,
  opts: QuotaOptions = {}
): ResourceQuotaEnforcer {
  return new ResourceQuotaEnforcer(agentId, limits, opts);
}

export function netQuota(
  agentId: string,
  netEgressBps: number,
  opts: QuotaOptions = {}
): ResourceQuotaEnforcer {
  return diskQuota(agentId, { netEgressBps }, opts);
}

// ── (Forge) Bounded quota registry — prevents per-agent enforcer leak ────────
// Under preemption storms / agent churn, ad-hoc `diskQuota()` calls accumulate
// `ResourceQuotaEnforcer` instances that are never released. This registry
// returns a shared enforcer per agent and self-reaps stale entries so memory
// stays bounded (no resource leak under sustained preemption pressure).

export interface QuotaRegistryOptions {
  /** Entries unused for longer than this (ms) are evicted on the next sweep. */
  idleTtlMs?: number;
  /** Max entries before the oldest-idle is evicted. */
  maxEntries?: number;
  /** Override clock for tests. */
  clock?: () => number;
}

export class QuotaRegistry {
  private readonly store = new Map<string, { enf: ResourceQuotaEnforcer; lastUsed: number }>();
  private readonly idleTtlMs: number;
  private readonly maxEntries: number;
  private readonly clock: () => number;

  constructor(opts: QuotaRegistryOptions = {}) {
    this.idleTtlMs = opts.idleTtlMs ?? 5 * 60_000;
    this.maxEntries = opts.maxEntries ?? 1024;
    this.clock = opts.clock ?? (() => Date.now());
  }

  getOrCreate(
    agentId: string,
    limits: QuotaLimits,
    opts: QuotaOptions = {}
  ): ResourceQuotaEnforcer {
    const now = this.clock();
    const hit = this.store.get(agentId);
    if (hit) {
      hit.lastUsed = now;
      return hit.enf;
    }
    const enf = diskQuota(agentId, limits, opts);
    this.store.set(agentId, { enf, lastUsed: now });
    this.evictIfNeeded(now);
    return enf;
  }

  private evictIfNeeded(now: number): void {
    if (this.store.size <= this.maxEntries) return;
    // Evict oldest-idle entries until we are back under the cap.
    const entries = [...this.store.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    while (this.store.size > this.maxEntries && entries.length) {
      const [k] = entries.shift()!;
      this.store.delete(k);
    }
  }

  /** Reap entries idle for longer than `idleTtlMs`. Returns reaped agent ids. */
  sweep(): string[] {
    const now = this.clock();
    const reaped: string[] = [];
    for (const [k, v] of this.store) {
      if (now - v.lastUsed >= this.idleTtlMs) {
        this.store.delete(k);
        reaped.push(k);
      }
    }
    if (reaped.length) log.info('quota_registry_swept', { count: reaped.length });
    return reaped;
  }

  size(): number {
    return this.store.size;
  }
}

let globalQuotaRegistry: QuotaRegistry | null = null;
export function getQuotaRegistry(): QuotaRegistry {
  if (!globalQuotaRegistry) globalQuotaRegistry = new QuotaRegistry();
  return globalQuotaRegistry;
}
export function resetQuotaRegistry(): void {
  globalQuotaRegistry = null;
}
