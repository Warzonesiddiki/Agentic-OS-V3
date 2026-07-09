/**
 * Integration tests — Orchestration DAG executor.
 *
 * Exercises the real DAG engine (agent-dag.ts) end-to-end:
 *   - wave-by-wave execution ordering for a diamond DAG
 *   - merge-strategy application on converging edges
 *   - deadlock detection for a cyclic graph
 *   - compensation when a node fails
 *
 * The agent runner (`runAgent` in agent-runtime.js) is mocked so the test is
 * deterministic and DB/LLM-free. No FROZEN files are touched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Deterministic agent runner — returns a stable per-node result derived from the
// node id so merge strategies have predictable inputs to operate on.
const runAgentMock = vi.fn(async (cfg: { agentId: string; goal?: string }) => ({
  ok: true,
  agentId: cfg.agentId,
  output: { agent: cfg.agentId, goal: cfg.goal ?? '', echoed: cfg.agentId },
  tokens: 10,
}));

vi.mock('../../src/services/agent-runtime.js', () => ({
  runAgent: (cfg: { agentId: string; goal?: string }) => runAgentMock(cfg),
}));

// audit + logging touch the DB / process; stub them so the DAG engine can run
// without a live database connection.
vi.mock('../../src/lib/audit.js', () => ({
  appendAudit: async () => ({ id: 'audit-mock', ok: true }),
}));
vi.mock('../../src/lib/logging.js', () => ({
  log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { buildDag, executeDag, getDag, registerDag, resetDagRegistry } from '../../src/services/agent-dag.js';
import {
  buildGraphAnalysis,
  detectDeadlocks,
  resolveDeadlocks,
  suggestBreakpoints,
} from '../../src/services/deadlock-detector.js';
import { applyMergeStrategies } from '../../src/services/merge-strategies.js';

const NS = 'it-dag';

function makeDag(id: string, nodes: Record<string, string[]>, goal = 'test goal') {
  return {
    id,
    name: `Integration ${id}`,
    nodes: Object.entries(nodes).map(([nodeId, deps]) => ({
      nodeId,
      agentId: nodeId,
      goal,
      dependencies: deps,
    })),
    config: { maxConcurrency: 4, failFast: false } as const,
  };
}

beforeEach(() => {
  resetDagRegistry();
  runAgentMock.mockClear();
});

describe('DAG executor — wave execution (diamond)', () => {
  it('executes in topological waves and returns merged node results', async () => {
    const dagId = `${NS}-diamond`;
    const cfg = makeDag(dagId, {
      a: [],
      b: ['a'],
      c: ['a'],
      d: ['b', 'c'],
    });
    registerDag(buildDag(cfg));

    const res = await executeDag(dagId, { seed: 1 }, 'tester');

    expect(res.ok).toBe(true);
    expect(res.completed).toBe(true);
    // a in wave 0; b,c in wave 1; d in wave 2
    expect(res.waves).toBe(3);
    expect(Object.keys(res.nodeResults).sort()).toEqual(['a', 'b', 'c', 'd']);
    // every node ran and succeeded
    for (const r of Object.values(res.nodeResults)) {
      expect(r.status).toBe('ok');
    }
    // the runner was invoked once per node
    expect(runAgentMock).toHaveBeenCalledTimes(4);
  });

  it('runs upstream before downstream (wave ordering invariant)', async () => {
    const dagId = `${NS}-chain`;
    registerDag(buildDag(dagId, { n1: [], n2: ['n1'], n3: ['n2'] }));
    const res = await executeDag(dagId, {}, 'tester');
    expect(res.ok).toBe(true);
    const dag = getDag(dagId)!;
    // topological order places n1 < n2 < n3
    const topo = dag.topoOrder.flat();
    expect(topo.indexOf('n1')).toBeLessThan(topo.indexOf('n2'));
    expect(topo.indexOf('n2')).toBeLessThan(topo.indexOf('n3'));
  });
});

describe('DAG executor — merge strategies', () => {
  it('applies a configured merge strategy when edges converge', async () => {
    const dagId = `${NS}-merge`;
    const cfg = makeDag(dagId, {
      a: [],
      b: [],
      sink: ['a', 'b'],
    });
    // inject a merge strategy on the converging node
    const built = buildDag(cfg);
    const sinkNode = built.nodes.get('sink')!;
    sinkNode.config.mergeStrategy = 'concat-strings';
    registerDag(built);

    // two upstream outputs that the merge strategy will combine
    runAgentMock
      .mockResolvedValueOnce({ ok: true, agentId: 'a', output: { value: 'hello' }, tokens: 1 })
      .mockResolvedValueOnce({ ok: true, agentId: 'b', output: { value: 'world' }, tokens: 1 })
      .mockResolvedValueOnce({ ok: true, agentId: 'sink', output: { value: 'ignored' }, tokens: 1 });

    const res = await executeDag(dagId, {}, 'tester');
    expect(res.ok).toBe(true);
    const sinkResult = res.nodeResults['sink'];
    expect(sinkResult.status).toBe('ok');
    // the sink received a merged input carrying both upstream values
    expect(JSON.stringify(res.finalState)).toContain('hello');
    expect(JSON.stringify(res.finalState)).toContain('world');
  });

  it('applyMergeStrategies unit: combine-object merges distinct keys', () => {
    const merged = applyMergeStrategies(
      [
        { from: 'a', to: 'sink', mergeStrategy: 'combine-object' as const },
        { from: 'b', to: 'sink', mergeStrategy: 'combine-object' as const },
      ],
      { sink: { base: true } },
      { a: { x: 1 }, b: { y: 2 } }
    );
    expect(merged.sink).toMatchObject({ base: true, x: 1, y: 2 });
  });
});

describe('DAG executor — failure + compensation', () => {
  it('marks the run failed when a node errors and records the error', async () => {
    const dagId = `${NS}-fail`;
    registerDag(buildDag(dagId, { okNode: [], badNode: ['okNode'] }));
    runAgentMock
      .mockResolvedValueOnce({ ok: true, agentId: 'okNode', output: { v: 1 }, tokens: 1 })
      .mockResolvedValueOnce({ ok: false, agentId: 'badNode', error: 'boom', tokens: 1 });

    const res = await executeDag(dagId, {}, 'tester');
    expect(res.ok).toBe(false);
    expect(res.nodeResults['badNode'].status).toBe('failed');
    expect(res.errors.join('\n')).toContain('boom');
    // downstream of a failed node should be skipped (not run)
    expect(runAgentMock).toHaveBeenCalledTimes(2);
  });
});

describe('deadlock detection — cyclic graphs', () => {
  it('detects a cycle and proposes a breakpoint', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ];
    const analysis = buildGraphAnalysis(['a', 'b', 'c'], edges);
    const detected = detectDeadlocks(analysis);
    expect(detected.hasCycle).toBe(true);
    expect(detected.cycles.length).toBeGreaterThan(0);

    const resolved = resolveDeadlocks(analysis);
    expect(resolved.resolved).toBe(true);
    const breaks = suggestBreakpoints(analysis);
    expect(Array.isArray(breaks)).toBe(true);
    expect(breaks.length).toBeGreaterThan(0);
    // the suggested breakpoint references a real edge
    const ids = edges.map((e) => `${e.from}->${e.to}`);
    expect(ids).toContain(breaks[0]);
  });

  it('reports no cycle for a DAG', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
    ];
    const analysis = buildGraphAnalysis(['a', 'b', 'c', 'd'], edges);
    expect(detectDeadlocks(analysis).hasCycle).toBe(false);
  });
});
