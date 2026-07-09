import { log } from '../lib/logging.js';

/**
 * Phase 11 — Task 11.22: Bootstrap Ordering.
 *
 * A typed dependency graph for kernel subsystems. Services declare the names of
 * the services they depend on; `BootstrapGraph.order()` topologically sorts them
 * so every dependency is initialised before its dependents. Cycles are rejected
 * with a descriptive {@link BootstrapCycleError}.
 */

export interface KernelService {
  name: string;
  dependsOn?: string[];
  init?: () => void | Promise<void>;
}

export class BootstrapCycleError extends Error {
  constructor(
    message: string,
    public readonly cycle: string[]
  ) {
    super(message);
    this.name = 'BootstrapCycleError';
  }
}

/** Compute the strongly-connected set forming a cycle (DFS back-edge detection). */
function findCycle(adj: Map<string, string[]>, nodes: string[]): string[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(nodes.map((n) => [n, WHITE]));
  const stack: string[] = [];
  let cycle: string[] = [];

  const visit = (u: string): boolean => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v);
      if (c === GRAY) {
        const idx = stack.indexOf(v);
        cycle = stack.slice(idx);
        return true;
      }
      if (c === WHITE && visit(v)) return true;
    }
    color.set(u, BLACK);
    stack.pop();
    return false;
  };

  for (const n of nodes) {
    if (color.get(n) === WHITE && visit(n)) break;
  }
  return cycle;
}

export class BootstrapGraph {
  private readonly nodes = new Map<string, KernelService>();

  add(service: KernelService): this {
    if (!service || !service.name) {
      throw new Error('BootstrapGraph.add: service requires a name');
    }
    this.nodes.set(service.name, service);
    return this;
  }

  addAll(services: KernelService[]): this {
    for (const s of services) this.add(s);
    return this;
  }

  /** Topologically sorted services. Throws {@link BootstrapCycleError} on a cycle. */
  order(): KernelService[] {
    const names = [...this.nodes.keys()];
    const adj = new Map<string, string[]>();
    for (const [name, svc] of this.nodes) {
      adj.set(name, []);
      for (const dep of svc.dependsOn ?? []) {
        if (!this.nodes.has(dep)) {
          throw new Error(`BootstrapGraph: unknown dependency "${dep}" required by "${name}"`);
        }
        adj.get(name)!.push(dep);
      }
    }

    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>(names.map((n) => [n, WHITE]));
    const out: KernelService[] = [];
    const visiting: string[] = [];

    const visit = (u: string): void => {
      color.set(u, GRAY);
      visiting.push(u);
      for (const v of adj.get(u) ?? []) {
        const c = color.get(v);
        if (c === GRAY) {
          const idx = visiting.indexOf(v);
          const cyc = visiting.slice(idx);
          throw new BootstrapCycleError(
            `Bootstrap cycle detected: ${cyc.join(' -> ')} -> ${v}`,
            cyc
          );
        }
        if (c === WHITE) visit(v);
      }
      color.set(u, BLACK);
      visiting.pop();
      out.push(this.nodes.get(u)!);
    };

    for (const n of names) {
      if (color.get(n) === WHITE) visit(n);
    }
    return out;
  }
}

/**
 * Resolve and run a bootstrap order for the supplied services, initialising each
 * in dependency order. Resolves to the ordered service names. Throws on cycles.
 */
export async function bootstrapServices(services: KernelService[]): Promise<string[]> {
  const graph = new BootstrapGraph().addAll(services);
  const ordered = graph.order();
  for (const svc of ordered) {
    if (svc.init) {
      try {
        await svc.init();
      } catch (e) {
        log.error('bootstrap_service_init_failed', {
          service: svc.name,
          error: e instanceof Error ? e.message : String(e),
        });
        throw new Error(
          `Bootstrap init failed for "${svc.name}": ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }
  return ordered.map((s) => s.name);
}

/**
 * Validate a dependency graph (array of `{id, deps}`) for cycles.
 * Returns `{ ok: true }` or `{ ok: false, cycle }`.
 */
export function validateDependencyGraph(deps: Array<{ id: string; deps?: string[] }>): {
  ok: boolean;
  cycle?: string[];
} {
  try {
    new BootstrapGraph().addAll(deps.map((d) => ({ name: d.id, dependsOn: d.deps ?? [] }))).order();
    return { ok: true };
  } catch (e) {
    if (e instanceof BootstrapCycleError) return { ok: false, cycle: e.cycle };
    throw e;
  }
}

/**
 * Resolve a bootstrap order for the supplied modules (array of `{id, deps}`),
 * returning `{ order }` (ordered ids), or rejecting with a
 * {@link BootstrapCycleError} on a cycle.
 */
export async function bootstrapKernel(
  mods: Array<{ id: string; deps?: string[] }>
): Promise<{ order: string[] }> {
  const services: KernelService[] = mods.map((m) => ({
    name: m.id,
    dependsOn: m.deps ?? [],
  }));
  const order = await bootstrapServices(services);
  return { order };
}
