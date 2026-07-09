/**
 * Phase 11 — Task 11.32: Deadlock Detection.
 *
 * Two public helpers:
 *  - `analyzeWaitForGraph(nodes)` — given a set of nodes each waiting on another,
 *    returns whether the wait-for graph contains a cycle and the cycles found.
 *  - `detectDeadlock(input)` — flexible entry point. Accepts either an array of
 *    directed edges `{from,to}` OR a `{nodes}` object (nodes have `id`,
 *    `priority`, `waitingFor`). Returns a unified result describing whether a
 *    deadlock exists, a representative cycle, and (for node graphs) the victim
 *    to abort (lowest-priority node in the cycle).
 *
 * Plus `suggestBreakpoints` — a SELF-HEALING cycle breaker (Phase 13):
 * given a detected deadlock it returns the minimal set of edges whose removal
 * breaks every cycle, biased toward cutting the lowest-priority victim's own
 * wait, so the orchestrator/condutor can autonomously unstick without a
 * human operator.
 */

import { publishKernelEvent } from './kernel.js';

export interface WaitEdge {
  from: string;
  to: string;
}

export interface WaitNode {
  id: string;
  priority?: number;
  waitingFor?: string | null;
}

export interface DeadlockResult {
  deadlock: boolean;
  hasCycle: boolean;
  victimId: string | null;
  cycle: string[];
  cycles: string[][];
}

export interface GraphAnalysis {
  hasCycle: boolean;
  cycles: string[][];
}

/** Detect a cycle in a directed graph via DFS (returns the first cycle found). */
function findCycle(adj: Map<string, string[]>, nodes: string[]): string[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(nodes.map((n) => [n, WHITE] as [string, number]));
  const stack: string[] = [];

  const visit = (u: string): string[] | null => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v);
      if (c === GRAY) {
        const idx = stack.indexOf(v);
        return stack.slice(idx);
      }
      if (c === WHITE) {
        const found = visit(v);
        if (found) return found;
      }
    }
    color.set(u, BLACK);
    stack.pop();
    return null;
  };

  for (const n of nodes) {
    if (color.get(n) === WHITE) {
      const cyc = visit(n);
      if (cyc) return cyc;
    }
  }
  return [];
}

/** Find all elementary cycles (bounded; enough for deadlock diagnosis). */
function findAllCycles(adj: Map<string, string[]>, nodes: string[]): string[][] {
  const cycles: string[][] = [];
  const visit = (start: string, u: string, path: string[]): void => {
    for (const v of adj.get(u) ?? []) {
      if (v === start && path.length >= 2) {
        cycles.push([...path, start]);
      } else if (!path.includes(v) && path.length < 8) {
        visit(start, v, [...path, v]);
      }
    }
  };
  for (const n of nodes) visit(n, n, [n]);
  return cycles;
}

export function analyzeWaitForGraph(nodes: WaitNode[]): GraphAnalysis {
  const ids = nodes.map((n) => n.id);
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(n.id, []);
    if (n.waitingFor) adj.get(n.id)!.push(n.waitingFor);
  }
  const cycles = findAllCycles(adj, ids);
  return { hasCycle: cycles.length > 0, cycles };
}

export function detectDeadlock(input: WaitEdge[] | { nodes: WaitNode[] }): DeadlockResult {
  let edges: WaitEdge[];
  let nodeList: WaitNode[] | null = null;

  if (Array.isArray(input)) {
    edges = input.map((e) => ({ from: e.from, to: e.to }));
  } else if (input && Array.isArray((input as { nodes: WaitNode[] }).nodes)) {
    nodeList = (input as { nodes: WaitNode[] }).nodes;
    edges = nodeList
      .filter((n) => n.waitingFor)
      .map((n) => ({ from: n.id, to: n.waitingFor as string }));
  } else {
    throw new Error('detectDeadlock: invalid input — expected edge array or {nodes}');
  }

  const ids = Array.from(new Set([...edges.map((e) => e.from), ...edges.map((e) => e.to)]));
  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);
  for (const e of edges) adj.get(e.from)!.push(e.to);

  const cycle = findCycle(adj, ids);
  const cycles = cycle.length ? [cycle] : [];
  if (!cycle.length) {
    return { deadlock: false, hasCycle: false, victimId: null, cycle: [], cycles: [] };
  }

  let victimId: string | null = null;
  if (nodeList) {
    let lowest = Infinity;
    for (const id of cycle) {
      const node = nodeList.find((n) => n.id === id);
      const p = node?.priority ?? 0;
      if (p < lowest) {
        lowest = p;
        victimId = id;
      }
    }
  }

  const result: DeadlockResult = { deadlock: true, hasCycle: true, victimId, cycle, cycles };
  try {
    publishKernelEvent('deadlock.detected', { resource: cycle[0] ?? '', agents: cycle });
  } catch {
    /* bus unavailable */
  }
  return result;
}

/**
 * Self-healing cycle breaker. Given a detected deadlock, returns the minimal set
 * of edges whose removal breaks every cycle, biased toward cutting the
 * lowest-priority agent's own wait (the abort victim) so the system unsticks
 * autonomously without human intervention.
 *
 * Accept any input shape detectDeadlock accepts (edge array OR {nodes}).
 */
export interface Breakpoint {
  from: string;
  to: string;
}

export function suggestBreakpoints(
  input: WaitEdge[] | { nodes: WaitNode[] },
  analysis?: GraphAnalysis & { nodes?: WaitNode[] }
): Breakpoint[] {
  const edges: WaitEdge[] = Array.isArray(input)
    ? input
    : input.nodes.flatMap((n) => {
        const wf = n.waitingFor;
        return wf ? [{ from: n.id, to: wf }] : [];
      });

  const cycles =
    analysis && analysis.cycles.length ? analysis.cycles : detectDeadlock(input).cycles;
  if (!cycles.length) return [];

  const priorityOf = (id: string): number => {
    const nodes = (analysis as { nodes?: WaitNode[] } | undefined)?.nodes;
    const n = nodes?.find((x) => x.id === id);
    return n?.priority ?? 0;
  };

  const cuts: Breakpoint[] = [];
  const seenVictim = new Set<string>();
  for (const cyc of cycles) {
    if (cyc.length < 2) continue;
    // victim = lowest priority in the cycle
    let victim = cyc[0]!;
    let low = priorityOf(victim);
    for (const id of cyc) {
      const p = priorityOf(id);
      if (p < low) {
        low = p;
        victim = id;
      }
    }
    // Only one cut per victim — multiple elementary rotations of the same
    // cycle share the same victim, so this collapses N rotations to 1 cut.
    if (seenVictim.has(victim)) continue;
    seenVictim.add(victim);

    // prefer cutting the edge whose `from` is the victim (its own wait)
    let chosen: WaitEdge | undefined = edges.find((e) => e.from === victim);
    if (!chosen) {
      // otherwise the lowest combined-priority edge in the cycle
      let best = Infinity;
      for (const e of edges) {
        if (cyc.includes(e.from) && cyc.includes(e.to)) {
          const score = priorityOf(e.from) + priorityOf(e.to);
          if (score < best) {
            best = score;
            chosen = e;
          }
        }
      }
    }
    if (chosen) cuts.push({ from: chosen.from, to: chosen.to });
  }
  return cuts;
}
