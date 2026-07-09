/**
 * memory-graph-browser.ts — Phase 12.7
 * Interactive memory graph for the React/D3 browser (Prism).
 *
 * Produces a serialisable { nodes, edges } graph from the live
 * recall pipeline: cluster membership, temporal causal chains and
 * cross-session links. Designed to be cheap so the UI can poll it.
 */
import { db } from '../db/client.js';
import {
  memoryClusters,
  memoryClusterMembers,
  memoryCausalEdges,
  sessionLinks,
  memories,
} from '../db/client.js';
import { and, eq, isNull } from 'drizzle-orm';

export interface GraphNode {
  id: string;
  label: string;
  kind: 'memory' | 'cluster' | 'session';
  clusterId?: string | null;
  kindOf?: string;
  importance?: number;
  decay?: number;
  mood?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence?: number;
}

export interface MemoryGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Pure graph-hygiene pass (self-healing graph quality): drops self-loops
 * (source === target) and de-duplicates parallel edges with identical
 * relation, and removes dangling edges (endpoint missing from the node set).
 * Operates on plain data only — fully unit-testable, no DB access.
 */
export function sanitizeGraph(graph: MemoryGraph): MemoryGraph {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const e of graph.edges) {
    if (e.source === e.target) continue; // self-loop
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue; // dangling
    const key = e.source + '|' + e.target + '|' + e.relation;
    if (seen.has(key)) continue; // duplicate parallel edge
    seen.add(key);
    edges.push(e);
  }
  return { nodes: graph.nodes, edges };
}
export async function buildMemoryGraph(
  projectId: string,
  clusterIds?: string[]
): Promise<MemoryGraph> {
  const where = and(eq(memories.projectId, projectId), isNull(memories.deletedAt));
  const memRows = await db.select().from(memories).where(where);

  const nodes: GraphNode[] = memRows.map(
    (m: {
      id: string;
      text: string | null;
      clusterId: string | null;
      kind: string | null;
      importance: number | null;
      decay: number | null;
      mood: string | null;
    }) => ({
      id: m.id,
      label: (m.text ?? '').slice(0, 80),
      kind: 'memory' as const,
      clusterId: m.clusterId ?? null,
      kindOf: m.kind ?? undefined,
      importance: m.importance ?? 0,
      decay: m.decay,
      mood: m.mood ?? undefined,
    })
  );

  // cluster nodes
  const clusters = await db.select().from(memoryClusters);
  const clusterNodes: GraphNode[] = clusters
    .filter((c: { id: string }) => !clusterIds || clusterIds.includes(c.id))
    .map((c: { id: string; label: string; size: number }) => ({
      id: c.id,
      label: c.label,
      kind: 'cluster' as const,
      importance: c.size,
    }));
  nodes.push(...clusterNodes);

  // cluster membership edges
  const memberRows = await db.select().from(memoryClusterMembers);
  const edges: GraphEdge[] = memberRows
    .filter((mm: { clusterId: string }) => !clusterIds || clusterIds.includes(mm.clusterId))
    .map((mm: { memoryId: string; clusterId: string }) => ({
      source: mm.memoryId,
      target: mm.clusterId,
      relation: 'member-of',
    }));

  // causal edges
  const causalRows = await db.select().from(memoryCausalEdges);
  for (const e of causalRows) {
    edges.push({
      source: e.fromMemoryId,
      target: e.toMemoryId,
      relation: e.relation,
      confidence: e.confidence,
    });
  }

  // session links (as ephemeral session nodes)
  const linkRows = await db.select().from(sessionLinks);
  for (const l of linkRows) {
    const sid = `session:${l.fromSession}`;
    const tid = `session:${l.toSession}`;
    for (const [id, label] of [
      [sid, l.fromSession],
      [tid, l.toSession],
    ] as [string, string][]) {
      if (!nodes.some((n) => n.id === id)) {
        nodes.push({
          id,
          label: `session ${label.slice(0, 8)}`,
          kind: 'session' as const,
        });
      }
    }
    edges.push({ source: sid, target: tid, relation: 'links' });
  }

  return sanitizeGraph({ nodes, edges });
}

/** Neighborhood around a single memory (used by the drill-down view). */
export async function neighborhood(
  projectId: string,
  memoryId: string,
  depth = 1
): Promise<MemoryGraph> {
  const graph = await buildMemoryGraph(projectId);
  const keep = new Set<string>([memoryId]);
  let frontier = [memoryId];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const e of graph.edges) {
      if (frontier.includes(e.source) && !keep.has(e.target)) {
        keep.add(e.target);
        next.push(e.target);
      }
      if (frontier.includes(e.target) && !keep.has(e.source)) {
        keep.add(e.source);
        next.push(e.source);
      }
    }
    frontier = next;
  }
  return {
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}
