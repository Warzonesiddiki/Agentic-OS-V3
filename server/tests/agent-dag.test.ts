import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/services/kernel.js', () => ({
  publishKernelEvent: vi.fn(),
}));

vi.mock('../src/services/agent-runtime.js', () => ({
  runAgent: vi.fn(),
}));

vi.mock('../lib/audit.js', () => ({
  appendAudit: vi.fn(),
}));

vi.mock('../src/db/client.js', () => ({
  db: {},
  memories: {},
  skills: {},
  agents: {},
  isSqlite: true,
}));

vi.mock('better-sqlite3', () => ({
  default: class {
    prepare() {
      return { all: () => [], get: () => undefined, run: () => ({ changes: 0 }) };
    }
    exec() {}
    close() {}
    pragma() {}
  },
}));

import {
  createDAG,
  addNode,
  addEdge,
  compile,
  agentToTool,
  getDAG,
  getToolRegistry,
  registerTool,
  getToolMetrics,
  resetDAGRegistry,
  selectBestAgent,
} from '../src/services/agent-dag.js';
import { runAgent } from '../src/services/agent-runtime.js';

describe('agent-dag — graph compilation', () => {
  it('orders nodes into dependency waves via Kahn topological sort', () => {
    const id = createDAG('wf');
    const a = addNode(id, { agentId: 'a', goal: 'g_a', actor: 'boss', context: {} });
    const b = addNode(id, { agentId: 'b', goal: 'g_b', actor: 'boss', context: {} });
    const c = addNode(id, { agentId: 'c', goal: 'g_c', actor: 'boss', context: {} });
    const d = addNode(id, { agentId: 'd', goal: 'g_d', actor: 'boss', context: {} });
    addEdge(id, a, b);
    addEdge(id, a, c);
    addEdge(id, b, d);
    addEdge(id, c, d);

    const waves = compile(id);
    expect(waves.length).toBe(3);
    expect(waves[0]).toEqual([a]);
    expect([...waves[1]!].sort()).toEqual([b, c].sort());
    expect(waves[2]).toEqual([d]);
  });

  it('throws on a cycle so a bad DAG fails fast at compile, not runtime', () => {
    const id = createDAG('cyclic');
    const a = addNode(id, { agentId: 'a', goal: 'g_a', actor: 'boss', context: {} });
    const b = addNode(id, { agentId: 'b', goal: 'g_b', actor: 'boss', context: {} });
    addEdge(id, a, b);
    addEdge(id, b, a);
    expect(() => compile(id)).toThrow(/dag_cycle_detected/);
  });

  it('reports an actionable error when a referenced node is missing', () => {
    const id = createDAG('bad');
    const a = addNode(id, { agentId: 'a', goal: 'g_a', actor: 'boss', context: {} });
    expect(() => addEdge(id, a, 'ghost')).toThrow(/node_not_found:ghost/);
  });
});

describe('agent-dag — agent-as-tool', () => {
  it('wraps an agent as a registered, callable tool (happy path in registry)', () => {
    const tool = agentToTool('researcher', 'Research', 'Do research');
    expect(tool.id).toBe('researcher');
    expect(tool.name).toBe('Research');
    // Re-wrapping the same id returns the cached tool (no duplicate registration).
    const again = agentToTool('researcher');
    expect(again).toBe(tool);
  });
});

describe('agent-dag — data mapping & conditional edges (compile-time graph integrity)', () => {
  it('stores edge data-mapping and condition metadata on the DAG definition', () => {
    const id = createDAG('routed');
    const a = addNode(id, { agentId: 'a', goal: 'g_a', actor: 'boss', context: {} });
    const b = addNode(id, { agentId: 'b', goal: 'g_b', actor: 'boss', context: {} });
    addEdge(id, a, b, { map: { ctx: 'payload.value' } }, { test: 'payload.ok', expected: true });
    const dag = getDAG(id)!;
    const firstEdge = dag.edges[0]!;
    expect(firstEdge!.dataMapping?.map).toEqual({ ctx: 'payload.value' });
    expect(firstEdge!.condition).toEqual({ test: 'payload.ok', expected: true });
  });
});

describe('agent-dag — tool registry self-healing (ML-002)', () => {
  it('registerTool adds a callable tool with metrics seed', () => {
    const before = getToolRegistry().size;
    registerTool({
      id: 'custom-tool',
      name: 'Custom',
      description: 'x',
      inputSchema: { type: 'object', properties: {}, required: [] },
      execute: async () => ({ ok: true, output: { ok: true } }),
    });
    expect(getToolRegistry().size).toBe(before + 1);
    expect(getToolMetrics()['custom-tool']).toBeDefined();
  });

  it('agentToTool records success metrics (ML-001 dispatch-bias source)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (runAgent as any).mockResolvedValueOnce({
      ok: true,
      answer: 'a',
      steps: [],
      iterations: 1,
      tokensUsed: 0,
    });
    resetDAGRegistry();
    const tool = agentToTool('metrics-agent');
    const res = await tool.execute({ goal: 'g' }, { actor: 'boss', parentAgentId: 'boss' });
    expect(res.ok).toBe(true);
    const m = getToolMetrics()['metrics-agent']!;
    expect(m.calls).toBe(1);
    expect(m.failures).toBe(0);
    expect(m.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('agentToTool retries transient failures then succeeds (self-healing)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ra = runAgent as any;
    ra.mockReset();
    ra.mockRejectedValueOnce(new Error('ETIMEDOUT transient')).mockResolvedValueOnce({
      ok: true,
      answer: 'ok',
      steps: [],
      iterations: 1,
      tokensUsed: 0,
    });
    resetDAGRegistry();
    const tool = agentToTool('retry-agent');
    const res = await tool.execute({ goal: 'g' }, { actor: 'boss', parentAgentId: 'boss' });
    expect(res.ok).toBe(true);
    expect(ra).toHaveBeenCalledTimes(2); // retried once
  });

  it('agentToTool records failure metrics on permanent error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ra = runAgent as any;
    ra.mockReset();
    ra.mockRejectedValue(new Error('fatal: invalid goal'));
    resetDAGRegistry();
    const tool = agentToTool('fail-agent');
    const res = await tool.execute({ goal: 'g' }, { actor: 'boss', parentAgentId: 'boss' });
    expect(res.ok).toBe(false);
    const m = getToolMetrics()['fail-agent']!;
    expect(m.failures).toBe(1);
    expect(m.lastError).toContain('fatal');
  });

  it('selectBestAgent biases toward the most reliable (ML-001)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ra = runAgent as any;
    ra.mockReset();

    const fast = agentToTool('sel-fast');
    const slow = agentToTool('sel-slow');
    // sel-fast always succeeds; sel-slow always fails -> fast must win by score.
    ra.mockImplementation(async (req: { agentId: string }) => {
      if (req.agentId === 'sel-slow') return { ok: false, answer: '', error: 'boom' };
      return { ok: true, answer: 'ok', steps: [], iterations: 1, tokensUsed: 0 };
    });
    resetDAGRegistry();
    for (let i = 0; i < 10; i++) {
      await fast.execute({ goal: 'g' }, { actor: 'b', parentAgentId: 'b' });
    }
    await slow.execute({ goal: 'g' }, { actor: 'b', parentAgentId: 'b' });

    const fastM = getToolMetrics()['sel-fast']!;
    const slowM = getToolMetrics()['sel-slow']!;
    expect(fastM.failures).toBe(0);
    expect(slowM.failures).toBeGreaterThan(0);
    expect(selectBestAgent(['sel-fast', 'sel-slow'])).toBe('sel-fast');
  });
});
