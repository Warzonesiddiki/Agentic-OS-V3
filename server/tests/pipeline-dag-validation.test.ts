/**
 * pipeline-dag-validation.test.ts — Tests for DAG validation (acyclic, single trigger).
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the db module to avoid SQLite initialization
vi.mock('../src/db/client.js', () => ({
  db: {},
  pipelines: {},
  pipelineRuns: {},
}));

// Mock audit
vi.mock('../src/lib/audit.js', () => ({
  appendAudit: vi.fn(),
}));

// Mock logging
vi.mock('../src/lib/logging.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  fatal: vi.fn(),
}));

// Mock agent-dag for getToolRegistry
vi.mock('../src/services/agent-dag.js', () => ({
  getToolRegistry: () => new Map(),
}));

import { validateDAG } from '../src/services/pipeline-executor.js';

interface TestNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

interface TestEdge {
  id: string;
  from: string;
  to: string;
}

interface TestDAG {
  nodes: TestNode[];
  edges: TestEdge[];
}

function makeNode(id: string, type: string = 'tool.invoke'): TestNode {
  return { id, type, config: {} };
}

describe('validateDAG', () => {
  it('accepts a simple linear DAG', () => {
    const dag: TestDAG = {
      nodes: [
        makeNode('trigger', 'trigger.manual'),
        makeNode('step1'),
        makeNode('step2'),
        makeNode('output', 'output.sink'),
      ],
      edges: [
        { id: 'e1', from: 'trigger', to: 'step1' },
        { id: 'e2', from: 'step1', to: 'step2' },
        { id: 'e3', from: 'step2', to: 'output' },
      ],
    };
    expect(validateDAG(dag as any)).toEqual({ ok: true });
  });

  it('accepts a diamond-shaped DAG', () => {
    const dag: TestDAG = {
      nodes: [
        makeNode('trigger', 'trigger.manual'),
        makeNode('left'),
        makeNode('right'),
        makeNode('merge'),
      ],
      edges: [
        { id: 'e1', from: 'trigger', to: 'left' },
        { id: 'e2', from: 'trigger', to: 'right' },
        { id: 'e3', from: 'left', to: 'merge' },
        { id: 'e4', from: 'right', to: 'merge' },
      ],
    };
    expect(validateDAG(dag as any)).toEqual({ ok: true });
  });

  it('accepts a single-node DAG', () => {
    const dag: TestDAG = {
      nodes: [makeNode('trigger', 'trigger.manual')],
      edges: [],
    };
    expect(validateDAG(dag as any)).toEqual({ ok: true });
  });

  it('rejects empty DAG', () => {
    const dag: TestDAG = { nodes: [], edges: [] };
    const result = validateDAG(dag as any);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty_dag');
  });

  it('rejects DAG with dangling edge (source missing)', () => {
    const dag: TestDAG = {
      nodes: [makeNode('trigger', 'trigger.manual'), makeNode('step1')],
      edges: [{ id: 'e1', from: 'nonexistent', to: 'step1' }],
    };
    const result = validateDAG(dag as any);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('dangling_edge');
  });

  it('rejects DAG with dangling edge (target missing)', () => {
    const dag: TestDAG = {
      nodes: [makeNode('trigger', 'trigger.manual')],
      edges: [{ id: 'e1', from: 'trigger', to: 'nonexistent' }],
    };
    const result = validateDAG(dag as any);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('dangling_edge');
  });

  it('rejects DAG with multiple triggers', () => {
    const dag: TestDAG = {
      nodes: [
        makeNode('t1', 'trigger.manual'),
        makeNode('t2', 'trigger.manual'),
        makeNode('step1'),
      ],
      edges: [
        { id: 'e1', from: 't1', to: 'step1' },
        { id: 'e2', from: 't2', to: 'step1' },
      ],
    };
    const result = validateDAG(dag as any);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('multiple_triggers');
  });

  it('rejects DAG with a cycle', () => {
    const dag: TestDAG = {
      nodes: [
        makeNode('trigger', 'trigger.manual'),
        makeNode('a'),
        makeNode('b'),
      ],
      edges: [
        { id: 'e1', from: 'trigger', to: 'a' },
        { id: 'e2', from: 'a', to: 'b' },
        { id: 'e3', from: 'b', to: 'a' }, // cycle: a → b → a
      ],
    };
    const result = validateDAG(dag as any);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('cycle_detected');
  });

  it('rejects self-loop cycle', () => {
    const dag: TestDAG = {
      nodes: [
        makeNode('trigger', 'trigger.manual'),
        makeNode('a'),
      ],
      edges: [
        { id: 'e1', from: 'trigger', to: 'a' },
        { id: 'e2', from: 'a', to: 'a' }, // self-loop
      ],
    };
    const result = validateDAG(dag as any);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('cycle_detected');
  });

  it('accepts complex DAG with guardrails', () => {
    const dag: TestDAG = {
      nodes: [
        makeNode('trigger', 'trigger.manual'),
        makeNode('guard', 'guardrail.check'),
        makeNode('agent', 'agent.run'),
        makeNode('sink', 'output.sink'),
      ],
      edges: [
        { id: 'e1', from: 'trigger', to: 'guard' },
        { id: 'e2', from: 'guard', to: 'agent' },
        { id: 'e3', from: 'agent', to: 'sink' },
      ],
    };
    expect(validateDAG(dag as any)).toEqual({ ok: true });
  });
});
