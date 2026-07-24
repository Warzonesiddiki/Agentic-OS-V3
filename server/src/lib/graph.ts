/**
 * Pure graph algorithms for marketplace dependency resolution (Phase 19).
 * Tarjan SCC is used to detect dependency cycles without a database.
 */
export interface DepNode {
  slug: string;
  deps: { slug: string; range: string }[];
}

/**
 * Tarjan strongly-connected-components over a dependency graph.
 * Any SCC with >1 node, or a self-loop, is a dependency cycle.
 */
export function tarjanSCC(nodes: DepNode[]): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  const bySlug = new Map(nodes.map((n) => [n.slug, n]));

  const strongconnect = (v: string): void => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);

    const node = bySlug.get(v);
    for (const edge of node?.deps ?? []) {
      const w = edge.slug;
      if (!bySlug.has(w)) continue;
      if (!index.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }

    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      sccs.push(comp);
    }
  };

  for (const n of nodes) if (!index.has(n.slug)) strongconnect(n.slug);
  return sccs;
}

/** A topological ordering (Kahn) for a DAG of DepNodes. Throws on cycle. */
export function topoSort(nodes: DepNode[]): string[] {
  const knownSlugs = new Set(nodes.map((node) => node.slug));
  const remainingDependencies = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const node of nodes) {
    const knownDependencies = node.deps.filter((dependency) => knownSlugs.has(dependency.slug));
    remainingDependencies.set(node.slug, knownDependencies.length);
    for (const dependency of knownDependencies) {
      const entries = dependents.get(dependency.slug) ?? [];
      entries.push(node.slug);
      dependents.set(dependency.slug, entries);
    }
  }

  const queue = nodes
    .filter((node) => remainingDependencies.get(node.slug) === 0)
    .map((node) => node.slug);
  const order: string[] = [];

  while (queue.length > 0) {
    const slug = queue.shift()!;
    order.push(slug);
    for (const dependent of dependents.get(slug) ?? []) {
      const remaining = (remainingDependencies.get(dependent) ?? 0) - 1;
      remainingDependencies.set(dependent, remaining);
      if (remaining === 0) queue.push(dependent);
    }
  }

  if (order.length !== nodes.length) throw new Error('graph contains a cycle');
  return order;
}
