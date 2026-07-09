/** cascade-analysis.ts — analyzes failure cascades across dependencies. */
import { board } from '../dependency-health.js';

export interface CascadeNode {
  name: string;
  dependsOn: string[];
}

const graph = new Map<string, CascadeNode>();

export function registerNode(name: string, dependsOn: string[]): void {
  graph.set(name, { name, dependsOn });
}

/**
 * Given a failed node, return all nodes that transitively depend on it (blast radius).
 */
export function blastRadius(failedNode: string): string[] {
  const dependents = new Map<string, string[]>();
  for (const node of graph.values()) {
    for (const dep of node.dependsOn) {
      const arr = dependents.get(dep) ?? [];
      arr.push(node.name);
      dependents.set(dep, arr);
    }
  }
  const result = new Set<string>();
  const stack = [failedNode];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const d of dependents.get(cur) ?? []) {
      if (!result.has(d)) {
        result.add(d);
        stack.push(d);
      }
    }
  }
  return [...result];
}

/** Identify currently-unhealthy roots and their downstream blast radius. */
export function analyzeCascade(): { root: string; impact: string[] }[] {
  const unhealthyNow = board()
    .filter((b) => b.health !== 'healthy')
    .map((b) => b.name);
  return unhealthyNow.map((root) => ({ root, impact: blastRadius(root) }));
}
