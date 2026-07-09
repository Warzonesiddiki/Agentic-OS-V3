/**
 * Node replica registry — authoritative metadata store for stateless kernel
 * replicas / worker nodes used by the replica router. The KernelNodePool owns
 * liveness; this registry owns richer metadata (region, weight, last health
 * check) for routing decisions. Pure in-memory; survives restarts via the
 * snapshot persisted by the warmup scheduler.
 */
import { log } from '../../lib/logger.js';

export interface ReplicaMeta {
  id: string;
  url: string;
  region?: string;
  weight?: number;
  draining: boolean;
  healthy: boolean;
  lastHealthCheck: number;
}

export class NodeReplicaRegistry {
  private map = new Map<string, ReplicaMeta>();

  upsert(id: string, partial: Partial<Omit<ReplicaMeta, 'id'>> & { url: string }): ReplicaMeta {
    const prev = this.map.get(id);
    const next: ReplicaMeta = {
      id,
      url: partial.url,
      region: partial.region ?? prev?.region,
      weight: partial.weight ?? prev?.weight ?? 1,
      draining: partial.draining ?? prev?.draining ?? false,
      healthy: partial.healthy ?? prev?.healthy ?? true,
      // A freshly registered node is routeable until a health check proves
      // otherwise — seed the timestamp so routeable() doesn't exclude it.
      lastHealthCheck: prev?.lastHealthCheck ?? Date.now(),
    };
    this.map.set(id, next);
    return next;
  }

  markHealth(id: string, healthy: boolean): void {
    const n = this.map.get(id);
    if (!n) return;
    n.healthy = healthy;
    n.lastHealthCheck = Date.now();
    if (!healthy) log.warn('replica-registry: unhealthy', { id });
  }

  setDraining(id: string, draining: boolean): void {
    const n = this.map.get(id);
    if (n) n.draining = draining;
  }

  /** Weighted, healthy, non-draining candidates for new work. */
  routeable(): ReplicaMeta[] {
    return [...this.map.values()].filter(
      (n) => n.healthy && !n.draining && Date.now() - n.lastHealthCheck < 30_000
    );
  }

  pick(): ReplicaMeta | undefined {
    const cands = this.routeable();
    if (cands.length === 0) return undefined;
    const total = cands.reduce((s, n) => s + (n.weight ?? 1), 0);
    let r = Math.random() * total;
    for (const n of cands) {
      r -= n.weight ?? 1;
      if (r <= 0) return n;
    }
    return cands[cands.length - 1];
  }

  list(): ReplicaMeta[] {
    return [...this.map.values()];
  }
}

export const nodeReplicaRegistry = new NodeReplicaRegistry();
