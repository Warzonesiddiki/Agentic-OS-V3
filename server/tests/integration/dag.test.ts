/**
 * Integration tests — Orchestration DAG executor + merge strategies + deadlock.
 *
 * Exercises the real orchestration engine end-to-end:
 *   - build a DAG with createDAG/addNode/addEdge, compile into waves
 *   - invoke() runs it wave-by-wave (diamond) through a mocked agent runner
 *   - merge-strategies module (concat / schema-union / majority / first-wins)
 *   - deadlock-detector on a cyclic wait-for graph + self-healing breakpoints
 *
 * The agent runner (runAgent in agent-runtime) is mocked for determinism; the
 * kernel/client are stubbed so the engine runs DB-free. No FROZEN files touched.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Deterministic agent runner — returns a stable per-node result derived from the
// node id so merge strategies have predictable inputs to operate on.
const runAgentMock = vi.fn(async (cfg: { agentId: string; goal?: string }) => ({
  ok: true,
  answer: `answer-from-${cfg.agentId}`,
  output: { agent: cfg.agentId, echoed: cfg.agentId },
  tokens: 10,
}));

vi.mock('../../src/services/agent-runtime', () => ({
  runAgent: (cfg: { agentId: string; goal?: string }) => runAgentMock(cfg),
}));

// The DAG engine pulls in the kernel, which opens a real SQLite connection via
// the db client at import time. Stub the client so the engine runs DB-free.
vi.mock('../../src/db/client', () => ({
  db: { query: {}, insert: () => ({ values: () => ({ returning: () => [] }) }), select: () => ({ from: () => [] }) },
  isPg: () => false,
  isSqlite: () => true,
}));

// audit + logging touch the DB / process; stub them so the DAG engine can run
// without a live database connection.
vi.mock('../../src/lib/audit', () => ({
  appendAudit: async () => ({ id: 'audit-mock', ok: true }),
}));
vi.mock('../../src/lib/logging', () => ({
  log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { addEdge, addNode, compile, createDAG, invoke, resetDAGRegistry } from '../../src/services/agent-dag';
import { mergeBy, mergeConcat, mergeSchemaUnion, MergeStrategySchema } from '../../src/services/merge-strategies';
import { analyzeWaitForGraph, detectDeadlock, suggestBreakpoints } from '../../src/services/deadlock-detector';

const NS = 'it-dag';

beforeEach(() => {
  resetDAGRegistry();
  runAgentMock.mockClear();
});

describe('DAG executor — wave execution (diamond)', () => {
  it('compiles into topological waves and invokes them in order', async () => {
    const dagId = createDAG(`${NS}-diamond`, { maxConcurrency: 4, failFast: false });
    addNode(dagId, { agentId: 'a', goal: 'g-a', actor: 'tester' });
    addNode(dagId, { agentId: 'b', goal: 'g-b', actor: 'tester' });
    addNode(dagId, { agentId: 'c', goal: 'g-c', actor: 'tester' });
    addNode(dagId, { agentId: 'd', goal: 'g-d', actor: 'tester' });
    addEdge(dagId, 'a', 'b');
    addEdge(dagId, 'a', 'c');
    addEdge(dagId, 'b', 'd');
    addEdge(dagId, 'c', 'd');

    const waves = compile(dagId);
    // a in wave 0; b,c in wave 1; d in wave 2
    expect(waves.length).toBe(3);
    expect(waves[0]).toEqual(['a']);
    expect(waves[2]).toEqual(['d']);

    const res = await invoke(dagId, { seed: 1 }, 'tester');
    expect(res.ok).toBe(true);
    expect(Object.keys(res.nodeResults).sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const r of Object.values(res.nodeResults)) {
      expect(r.status).toBe('ok');
    }
    expect(runAgentMock).toHaveBeenCalledTimes(4);
    // downstream node received the upstream output via edge key
    expect(JSON.stringify(res.finalState)).toContain('answer-from-a');
  });

  it('runs upstream before downstream (topological invariant)', async () => {
    const dagId = createDAG(`${NS}-chain`, {});
    addNode(dagId, { agentId: 'n1', goal: 'g', actor: 'tester' });
    addNode(dagId, { agentId: 'n2', goal: 'g', actor: 'tester' });
    addNode(dagId, { agentId: 'n3', goal: 'g', actor: 'tester' });
    addEdge(dagId, 'n1', 'n2');
    addEdge(dagId, 'n2', 'n3');
    const waves = compile(dagId);
    const flat = waves.flat();
    expect(flat.indexOf('n1')).toBeLessThan(flat.indexOf('n2'));
    expect(flat.indexOf('n2')).toBeLessThan(flat.indexOf('n3'));
  });
});

describe('DAG executor — failure + compensation', () => {
  it('marks the run failed when a node errors, skips downstream, runs compensation', async () => {
    const dagId = createDAG(`${NS}-fail`, {});
    addNode(dagId, { agentId: 'okNode', goal: 'g', actor: 'tester' });
    addNode(dagId, {
      agentId: 'badNode',
      goal: 'g',
      actor: 'tester',
      compensation: { goal: 'undo badNode', context: { reason: 'rollback' } },
    });
    addEdge(dagId, 'okNode', 'badNode');

    runAgentMock
      .mockResolvedValueOnce({ ok: true, answer: 'ok', output: {}, tokens: 1 })
      .mockResolvedValueOnce({ ok: false, error: 'boom', tokens: 1 });

    const res = await invoke(dagId, {}, 'tester');
    expect(res.ok).toBe(false);
    expect(res.nodeResults['badNode'].status).toBe('failed');
    expect(res.errors.join('\n')).toContain('boom');
    // badNode failed so a compensation agent was invoked for it
    expect(runAgentMock).toHaveBeenCalledTimes(3);
  });
});

describe('merge-strategies', () => {
  it('concat joins string branches with newlines', () => {
    const out = mergeBy('concat', [
      { stepId: 'a', value: 'hello' },
      { stepId: 'b', value: 'world' },
    ]);
    expect(out).toBe('hello\nworld');
  });

  it('schema-union merges object branches key-by-key', () => {
    const out = mergeSchemaUnion([
      { stepId: 'a', value: { x: 1 } },
      { stepId: 'b', value: { y: 2 } },
    ]) as Record<string, unknown>;
    expect(out).toMatchObject({ x: 1, y: 2 });
  });

  it('majority picks the most frequent value', () => {
    expect(
      mergeBy('majority', [
        { stepId: 'a', value: 'yes' },
        { stepId: 'b', value: 'yes' },
        { stepId: 'c', value: 'no' },
      ])
    ).toBe('yes');
  });

  it('first-wins returns the first non-null branch', () => {
    expect(
      mergeBy('first-wins', [
        { stepId: 'a', value: null },
        { stepId: 'b', value: 'got-it' },
      ])
    ).toBe('got-it');
  });

  it('MergeStrategySchema rejects unknown strategies', () => {
    expect(MergeStrategySchema.safeParse('concat').success).toBe(true);
    expect(MergeStrategySchema.safeParse('bogus').success).toBe(false);
  });
});

describe('deadlock-detection — cyclic wait-for graphs', () => {
  it('detects a cycle and proposes a self-healing breakpoint', () => {
    const nodes = [
      { id: 'a', priority: 5, waitingFor: 'b' },
      { id: 'b', priority: 3, waitingFor: 'c' },
      { id: 'c', priority: 1, waitingFor: 'a' },
    ];
    const analysis = analyzeWaitForGraph(nodes);
    expect(analysis.hasCycle).toBe(true);

    const detected = detectDeadlock({ nodes });
    expect(detected.deadlock).toBe(true);
    expect(detected.cycles.length).toBeGreaterThan(0);
    // victim = lowest priority node in the cycle
    expect(detected.victimId).toBe('c');

    const breaks = suggestBreakpoints({ nodes }, analysis);
    expect(Array.isArray(breaks)).toBe(true);
    expect(breaks.length).toBeGreaterThan(0);
    const ids = nodes.map((n) => `${n.id}->${n.waitingFor}`);
    expect(ids).toContain(`${breaks[0].from}->${breaks[0].to}`);
  });

  it('reports no deadlock for an acyclic graph', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
    ];
    expect(detectDeadlock(edges).hasCycle).toBe(false);
    expect(suggestBreakpoints(edges).length).toBe(0);
  });
});
