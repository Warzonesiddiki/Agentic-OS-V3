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
  const indeg = new Map<string, number>();
  for (const node of nodes) {
    indeg.set(node.slug, indeg.get(node.slug) ?? 0);
    for (const d of node.deps)
      if (byHas(nodes, d.slug)) indeg.set(d.slug, (indeg.get(d.slug) ?? 0) + 1);
  }
  const order: string[] = [];
  const q = [...indeg.entries()].filter(([, n]) => n === 0).map(([s]) => s);
  const queue = [...q];
  while (queue.length) {
    const s = queue.shift()!;
    order.push(s);
    for (const node of nodes) {
      if (node.deps.some((d) => d.slug === s)) {
        const v = (indeg.get(node.slug) ?? 0) - 1;
        indeg.set(node.slug, v);
        if (v === 0) queue.push(node.slug);
      }
    }
  }
  if (order.length !== nodes.length) throw new Error('graph contains a cycle');
  return order;
}

function byHas(nodes: DepNode[], slug: string): boolean {
  return nodes.some((n) => n.slug === slug);
}
