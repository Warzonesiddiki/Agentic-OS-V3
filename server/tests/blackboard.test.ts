import { describe, it, expect, vi, beforeEach } from 'vitest';

// Force persistence/resilience DB paths to no-op under test (guarded by env.NODE_ENV).
vi.mock('../lib/env.js', () => ({
  env: { NODE_ENV: 'test' },
  getEnv: () => ({ NODE_ENV: 'test' }),
  resetEnv: () => {},
}));

vi.mock('../src/services/kernel.js', () => ({ publishKernelEvent: vi.fn() }));
vi.mock('../src/services/agent-runtime.js', () => ({ runAgent: vi.fn() }));
vi.mock('../lib/audit.js', () => ({ appendAudit: vi.fn() }));
vi.mock('../src/db/client.js', () => {
  // Self-returning chainable stub: any method returns itself, except execute/catch resolve.
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'execute' || prop === 'run') return () => Promise.resolve([]);
        if (prop === 'catch') return () => undefined;
        return (..._args: unknown[]) => chain;
      },
    }
  );
  const db = new Proxy(
    {},
    {
      get:
        () =>
        (..._args: unknown[]) =>
          chain,
    }
  );
  const table = {};
  return {
    db,
    schema: { systemMeta: table, auditLog: table },
    systemMeta: table,
    auditLog: table,
    isSqlite: true,
  };
});
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

import { blackboard, applyAuditRows } from '../src/services/blackboard.js';

describe('blackboard — in-memory ops', () => {
  beforeEach(() => blackboard.clear('run1'));

  it('publishes and reads a fact by key', () => {
    blackboard.publish({ runId: 'run1', key: 'goal', value: { text: 'win' }, owner: 'a' });
    expect(blackboard.get('run1', 'goal')).toMatchObject({ value: { text: 'win' }, seq: 1 });
  });

  it('exposes only facts for the requested run', () => {
    blackboard.publish({ runId: 'run1', key: 'k1', value: 1, owner: 'a' });
    blackboard.publish({ runId: 'run2', key: 'k2', value: 2, owner: 'b' });
    expect(Object.keys(blackboard.snapshot('run1'))).toEqual(['k1']);
  });

  it('clears a run', () => {
    blackboard.publish({ runId: 'run1', key: 'k', value: 1, owner: 'a' });
    blackboard.clear('run1');
    expect(blackboard.snapshot('run1')).toEqual({});
  });
});

describe('blackboard — applyAuditRows (reconstruct from audit)', () => {
  it('rebuilds latest-per-key wins from an audit trail', () => {
    const rows = [
      { action: 'blackboard.publish', actor: 'a', payload: { key: 'goal', seq: 1, value: 'v1' } },
      { action: 'blackboard.publish', actor: 'a', payload: { key: 'goal', seq: 3, value: 'v3' } },
      {
        action: 'blackboard.publish',
        actor: 'a',
        payload: { key: 'meta', seq: 2, value: { ok: true } },
      },
      { action: 'other.action', actor: 'a', payload: { key: 'ignore', value: 1 } },
    ];
    const board = applyAuditRows(rows, 'run1');
    expect(board.goal?.value).toBe('v3'); // highest seq wins
    expect(board.meta?.value).toEqual({ ok: true });
    expect(board.ignore).toBeUndefined();
  });

  it('returns empty board when no publish rows exist', () => {
    expect(applyAuditRows([{ action: 'x', payload: {} }], 'run1')).toEqual({});
  });
});
