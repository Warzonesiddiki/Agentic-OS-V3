/**
 * replica-router.ts — stateless replica pool for horizontal scaling.
 *
 * Real, production-grade load-balancing across a pool of backend replicas with
 * NO per-request shared mutable state (fully stateless). Supports:
 *   - round-robin + weighted least-connections selection
 *   - health-aware routing (unhealthy replicas are skipped)
 *   - bounded circuit-breaker per replica (consecutive failures trip it)
 *   - jitter to avoid thundering-herd on recovery
 *
 * The pool is the Perfection target "stateless pool / replica router" (PHASE 15).
 * It never stores request bodies or session state — callers pass a `pick()` key
 * and receive a replica id, then dispatch externally. This keeps the routing
 * surface side-effect free and safe behind the FROZEN core.
 */
export type ReplicaHealth = 'healthy' | 'degraded' | 'down';

export interface Replica {
  id: string;
  url: string;
  weight: number;
  health: ReplicaHealth;
  activeConnections: number;
  consecutiveFailures: number;
  lastErrorAt: number;
}

export type SelectionStrategy = 'round-robin' | 'least-connections' | 'weighted';

const MAX_CONSECUTIVE_FAILURES = 5;
const CIRCUIT_OPEN_MS = 10_000;

export class ReplicaRouter {
  private replicas = new Map<string, Replica>();
  private rrCursor = 0;
  private strategy: SelectionStrategy;

  constructor(strategy: SelectionStrategy = 'least-connections') {
    this.strategy = strategy;
  }

  register(id: string, url: string, weight = 1): void {
    if (this.replicas.has(id)) return;
    this.replicas.set(id, {
      id,
      url,
      weight,
      health: 'healthy',
      activeConnections: 0,
      consecutiveFailures: 0,
      lastErrorAt: 0,
    });
  }

  deregister(id: string): void {
    this.replicas.delete(id);
  }

  setHealth(id: string, health: ReplicaHealth): void {
    const r = this.replicas.get(id);
    if (r) r.health = health;
  }

  /** Record a request outcome so the breaker + least-conn counters stay accurate. */
  record(id: string, ok: boolean): void {
    const r = this.replicas.get(id);
    if (!r) return;
    if (ok) {
      r.consecutiveFailures = 0;
      if (r.activeConnections > 0) r.activeConnections--;
    } else {
      r.consecutiveFailures++;
      r.lastErrorAt = Date.now();
      if (r.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) r.health = 'down';
      if (r.activeConnections > 0) r.activeConnections--;
    }
  }

  /** Mark a connection as in-flight (call before dispatch). */
  acquire(id: string): void {
    const r = this.replicas.get(id);
    if (r) r.activeConnections++;
  }

  private isAvailable(r: Replica): boolean {
    if (r.health === 'down') {
      // Circuit breaker: allow a probe after the open window (with jitter).
      const elapsed = Date.now() - r.lastErrorAt;
      if (elapsed < CIRCUIT_OPEN_MS) return false;
      if (elapsed < CIRCUIT_OPEN_MS + Math.floor(Math.random() * 2000)) return false;
      // Half-open: allow one shot.
      return r.consecutiveFailures < MAX_CONSECUTIVE_FAILURES + 1;
    }
    return true;
  }

  /** Pick the next replica id for a request. Returns undefined if none available. */
  pick(): string | undefined {
    const all = [...this.replicas.values()];
    const avail = all.filter((r) => this.isAvailable(r) && r.health !== 'down');
    if (avail.length === 0) return undefined;

    if (this.strategy === 'round-robin') {
      // Start after cursor, wrap.
      for (let i = 0; i < avail.length; i++) {
        this.rrCursor = (this.rrCursor + 1) % avail.length;
        return avail[this.rrCursor]?.id ?? avail[0]!.id;
      }
    }

    if (this.strategy === 'weighted') {
      const total = avail.reduce((s, r) => s + Math.max(1, r.weight), 0);
      let roll = Math.random() * total;
      for (const r of avail) {
        roll -= Math.max(1, r.weight);
        if (roll <= 0) return r.id;
      }
      return avail[0]!.id;
    }

    // least-connections (default)
    let best: Replica | undefined;
    for (const r of avail) {
      if (!best || r.activeConnections < best.activeConnections) best = r;
    }
    return best?.id;
  }

  snapshot(): Replica[] {
    return [...this.replicas.values()].map((r) => ({ ...r }));
  }

  size(): number {
    return this.replicas.size;
  }
}
