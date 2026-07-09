/** dependency-health.ts — dependency health board (up/down/degraded + breaker link). */
import { stateOf } from './circuit-breaker-registry.js';

export type Health = 'healthy' | 'degraded' | 'down';

export interface Dependency {
  name: string;
  kind: 'db' | 'cache' | 'llm' | 'mcp' | 'external';
  breaker?: string; // links to circuit-breaker-registry
  lastLatencyMs: number;
}

const deps = new Map<string, Dependency>();

export function registerDependency(d: Dependency): void {
  deps.set(d.name, d);
}

export function healthOf(name: string): Health {
  const d = deps.get(name);
  if (!d) return 'healthy';
  if (d.breaker) {
    const st = stateOf(d.breaker);
    if (st === 'open') return 'down';
    if (st === 'half-open') return 'degraded';
  }
  if (d.lastLatencyMs > 2000) return 'degraded';
  return 'healthy';
}

export function board(): { name: string; health: Health }[] {
  return [...deps.keys()].map((n) => ({ name: n, health: healthOf(n) }));
}

export function unhealthy(): string[] {
  return board()
    .filter((b) => b.health !== 'healthy')
    .map((b) => b.name);
}
