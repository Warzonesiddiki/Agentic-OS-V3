import { Hono } from 'hono';
import type { NexusEnv } from '../lib/hono-env.js';
import { requireScope } from '../lib/auth-context.js';
import { db, memories } from '../db/client.js';
import { ok, err } from '../lib/envelope.js';

export interface MemoryGraphNode {
  id: string;
  kind: string;
  title: string;
  importance: number;
  tags: string[];
  projectId: string | null;
}

export type MemoryGraphEdgeKind = 'cluster' | 'chain' | 'contradiction';

export interface MemoryGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: MemoryGraphEdgeKind;
  label?: string;
}

export interface MemoryGraphData {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
}

interface MemoryGraphRow {
  id: string;
  kind: string;
  title: string;
  importance: number;
  tags: string[];
  projectId: string | null;
  createdAt: Date | null;
}

export const memoryGraph = new Hono<NexusEnv>();

const ACCEPTED_CLUSTER_BY = ['tag', 'kind', 'project'] as const;
const MAX_EDGES = 2000;

memoryGraph.get('/api/memory-graph', async (c) => {
  await requireScope(c, 'memory:read');

  const clusterByRaw = c.req.query('clusterBy');
  if (
    clusterByRaw !== undefined &&
    !ACCEPTED_CLUSTER_BY.includes(clusterByRaw as (typeof ACCEPTED_CLUSTER_BY)[number])
  ) {
    return c.json(err('VALIDATION_ERROR', 'Invalid clusterBy.', c.get('requestId') ?? ''), 400);
  }
  const minImportanceRaw = c.req.query('minImportance');
  const minImportance = minImportanceRaw !== undefined ? Number(minImportanceRaw) : NaN;
  const hasMin = !Number.isNaN(minImportance);

  const rows: MemoryGraphRow[] = await db
    .select({
      id: memories.id,
      kind: memories.kind,
      title: memories.title,
      importance: memories.importance,
      tags: memories.tags,
      projectId: memories.projectId,
      createdAt: memories.createdAt,
    })
    .from(memories);

  const nodes: MemoryGraphNode[] = rows
    .filter((m) => !hasMin || m.importance >= minImportance)
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      title: m.title,
      importance: m.importance,
      tags: m.tags,
      projectId: m.projectId,
    }));

  const edges: MemoryGraphEdge[] = [];
  const tagToIds = new Map<string, string[]>();
  for (const m of rows) {
    for (const t of m.tags) {
      const list = tagToIds.get(t) ?? [];
      list.push(m.id);
      tagToIds.set(t, list);
    }
  }
  for (const [tag, ids] of tagToIds) {
    if (ids.length < 2) continue;
    const [hub, ...rest] = ids;
    if (hub === undefined) continue;
    for (const other of rest) {
      if (edges.length >= MAX_EDGES) break;
      edges.push({
        id: `cluster:${tag}:${other}`,
        source: hub,
        target: other,
        kind: 'cluster',
        label: tag,
      });
    }
  }

  const projectToRows = new Map<string, typeof rows>();
  for (const m of rows) {
    const key = m.projectId ?? '__none__';
    const list = projectToRows.get(key) ?? [];
    list.push(m);
    projectToRows.set(key, list);
  }
  for (const group of projectToRows.values()) {
    const sorted = [...group].sort(
      (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (!prev || !cur) continue;
      if (edges.length >= MAX_EDGES) break;
      edges.push({
        id: `chain:${prev.id}:${cur.id}`,
        source: prev.id,
        target: cur.id,
        kind: 'chain',
      });
    }
  }

  const data: MemoryGraphData = { nodes, edges };
  return c.json(ok(data, c.get('requestId') ?? ''));
});
