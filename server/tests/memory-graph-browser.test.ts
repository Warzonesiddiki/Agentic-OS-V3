import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeGraph,
  buildMemoryGraph,
  neighborhood,
  type MemoryGraph,
} from '../src/services/memory-graph-browser.js';
import * as dbClient from '../src/db/client.js';

vi.mock('../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
  },
  memories: { projectId: 'projectId', deletedAt: 'deletedAt' },
  memoryClusters: {},
  memoryClusterMembers: {},
  memoryCausalEdges: {},
  sessionLinks: {},
}));

const graph = (nodes: string[], edges: [string, string, string][]): MemoryGraph => ({
  nodes: nodes.map((id) => ({ id, label: id, kind: 'memory' as const })),
  edges: edges.map(([source, target, relation]) => ({ source, target, relation })),
});

describe('memory-graph-browser / sanitizeGraph', () => {
  it('drops self-loops', () => {
    const g = graph(['a', 'b'], [['a', 'a', 'r'], ['a', 'b', 'r']]);
    const out = sanitizeGraph(g);
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]!.target).toBe('b');
  });

  it('drops dangling edges (missing endpoint node)', () => {
    const g = graph(['a'], [['a', 'ghost', 'r'], ['a', 'a', 'r']]);
    const out = sanitizeGraph(g);
    expect(out.edges).toHaveLength(0);
  });

  it('drops duplicate parallel edges (same source+target+relation)', () => {
    const g = graph(['a', 'b'], [['a', 'b', 'r'], ['a', 'b', 'r']]);
    const out = sanitizeGraph(g);
    expect(out.edges).toHaveLength(1);
  });

  it('keeps distinct relations between the same nodes', () => {
    const g = graph(['a', 'b'], [['a', 'b', 'causes'], ['a', 'b', 'correlates']]);
    expect(sanitizeGraph(g).edges).toHaveLength(2);
  });

  it('preserves all nodes and valid edges', () => {
    const g = graph(['a', 'b', 'c'], [['a', 'b', 'r'], ['b', 'c', 'r']]);
    const out = sanitizeGraph(g);
    expect(out.nodes).toHaveLength(3);
    expect(out.edges).toHaveLength(2);
  });

  it('returns empty edges for a graph with no edges', () => {
    const out = sanitizeGraph(graph(['a', 'b'], []));
    expect(out.edges).toHaveLength(0);
    expect(out.nodes).toHaveLength(2);
  });
});

/* ─── DB-backed helpers ──────────────────────────────────────────────── */

function selectChain(rowsByTable: Record<string, any[]>) {
  const order = ['memories', 'memoryClusters', 'memoryClusterMembers', 'memoryCausalEdges', 'sessionLinks'];
  let i = 0;
  const makeChain = (idx: number): any => {
    const key = order[idx] ?? order[order.length - 1]!;
    const resolve = () => rowsByTable[key] ?? [];
    const self: any = {
      from: () => makeChain(idx),
      where: () => makeChain(idx),
      orderBy: () => makeChain(idx),
      limit: () => Promise.resolve(resolve()),
      then: (_resolve?: any, _reject?: any) => Promise.resolve(resolve()).then(_resolve, _reject),
    };
    return self;
  };
  (dbClient.db.select as any).mockImplementation(() => {
    const idx = i;
    i += 1;
    return makeChain(idx);
  });
}

/* ─── buildMemoryGraph (mocked DB) ─────────────────────────────────────── */

describe('memory-graph-browser / buildMemoryGraph', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('produces memory + cluster nodes and member-of / causal / session edges', async () => {
    const rows = {
      memories: [
        { id: 'm1', text: 'alpha memory', clusterId: 'c1', kind: 'fact', importance: 0.8, decay: 0.1, mood: 'calm' },
        { id: 'm2', text: 'beta memory', clusterId: 'c1', kind: 'note', importance: 0.4, decay: 0.2, mood: null },
      ],
      memoryClusters: [{ id: 'c1', label: 'Cluster One', size: 2 }],
      memoryClusterMembers: [
        { memoryId: 'm1', clusterId: 'c1' },
        { memoryId: 'm2', clusterId: 'c1' },
      ],
      memoryCausalEdges: [{ fromMemoryId: 'm1', toMemoryId: 'm2', relation: 'causes', confidence: 0.9 }],
      sessionLinks: [{ fromSession: 's1', toSession: 's2' }],
    };
    selectChain(rows);

    const g = await buildMemoryGraph('p1', undefined, ['s1', 's2']);
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain('m1');
    expect(ids).toContain('m2');
    expect(ids).toContain('c1');
    expect(ids).toContain('session:s1');

    const relations = g.edges.map((e) => e.relation);
    expect(relations).toContain('member-of');
    expect(relations).toContain('causes');
    expect(relations).toContain('links');
    // deterministic member-of edges
    expect(g.edges.filter((e) => e.relation === 'member-of')).toHaveLength(2);
  });

  it('filters by clusterIds when provided', async () => {
    const rows = {
      memories: [{ id: 'm1', text: 't', clusterId: 'c1', kind: 'fact', importance: 0.5, decay: null, mood: null }],
      memoryClusters: [
        { id: 'c1', label: 'C1', size: 1 },
        { id: 'c2', label: 'C2', size: 1 },
      ],
      memoryClusterMembers: [{ memoryId: 'm1', clusterId: 'c1' }],
      memoryCausalEdges: [],
      sessionLinks: [],
    };
    selectChain(rows);
    const g = await buildMemoryGraph('p1', ['c1']);
    const clusterIds = g.nodes.filter((n) => n.kind === 'cluster').map((n) => n.id);
    expect(clusterIds).toEqual(['c1']);
  });

  it('sanitizes self-loops that arise from data (self causal edge dropped)', async () => {
    const rows = {
      memories: [{ id: 'm1', text: 't', clusterId: null, kind: 'fact', importance: 0.5, decay: null, mood: null }],
      memoryClusters: [],
      memoryClusterMembers: [],
      memoryCausalEdges: [{ fromMemoryId: 'm1', toMemoryId: 'm1', relation: 'causes', confidence: 1 }],
      sessionLinks: [],
    };
    selectChain(rows);
    const g = await buildMemoryGraph('p1');
    expect(g.edges).toHaveLength(0);
  });
});

/* ─── neighborhood traversal (real buildMemoryGraph via mocked DB) ──────── */

describe('memory-graph-browser / neighborhood traversal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Build a MemoryGraph from DB-shaped rows without importing private helpers.
  function graphRows(memories: any[], causalEdges: any[]) {
    return {
      memories,
      memoryClusters: [],
      memoryClusterMembers: [],
      memoryCausalEdges: causalEdges,
      sessionLinks: [],
    };
  }

  const mem = (id: string): any => ({
    id,
    text: id,
    clusterId: null,
    kind: 'fact',
    importance: 0.5,
    decay: null,
    mood: null,
  });

  it('depth 1 returns the node and its direct neighbours + connecting edges', async () => {
    const rows = graphRows(
      [mem('a'), mem('b'), mem('c')],
      [
        { fromMemoryId: 'a', toMemoryId: 'b', relation: 'causes', confidence: 0.9 },
        { fromMemoryId: 'b', toMemoryId: 'c', relation: 'causes', confidence: 0.9 },
        { fromMemoryId: 'a', toMemoryId: 'c', relation: 'causes', confidence: 0.9 },
      ]
    );
    selectChain(rows);
    const nb = await neighborhood('p1', 'a', 1);
    expect(nb.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'].sort());
    expect(nb.edges).toHaveLength(3);
  });

  it('depth 3 extends two hops further (reaches d via a→b→c→d)', async () => {
    const rows = graphRows(
      [mem('a'), mem('b'), mem('c'), mem('d')],
      [
        { fromMemoryId: 'a', toMemoryId: 'b', relation: 'causes', confidence: 0.9 },
        { fromMemoryId: 'b', toMemoryId: 'c', relation: 'causes', confidence: 0.9 },
        { fromMemoryId: 'c', toMemoryId: 'd', relation: 'causes', confidence: 0.9 },
      ]
    );
    selectChain(rows);
    const nb = await neighborhood('p1', 'a', 3);
    expect(nb.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'd'].sort());
    // a-b, b-c, c-d
    expect(nb.edges).toHaveLength(3);
  });

  it('isolated node returns only itself', async () => {
    const rows = graphRows([mem('a'), mem('b')], []);
    selectChain(rows);
    const nb = await neighborhood('p1', 'a', 3);
    expect(nb.nodes.map((n) => n.id)).toEqual(['a']);
    expect(nb.edges).toHaveLength(0);
  });

  it('neighborhood drops edges that leave the kept set (no dangling)', async () => {
    const rows = graphRows(
      [mem('a'), mem('b'), mem('c')],
      [
        { fromMemoryId: 'a', toMemoryId: 'b', relation: 'causes', confidence: 0.9 },
        { fromMemoryId: 'b', toMemoryId: 'c', relation: 'causes', confidence: 0.9 },
      ]
    );
    selectChain(rows);
    const nb = await neighborhood('p1', 'a', 1);
    // depth 1 keeps a,b only; the b->c edge must be excluded (c not kept)
    expect(nb.nodes.map((n) => n.id).sort()).toEqual(['a', 'b'].sort());
    expect(nb.edges).toHaveLength(1);
    expect(
      nb.edges.every(
        (e) =>
          nb.nodes.some((n) => n.id === e.source) && nb.nodes.some((n) => n.id === e.target)
      )
    ).toBe(true);
  });
});

