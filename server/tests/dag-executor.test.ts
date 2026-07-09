import { describe, it, expect, vi, beforeEach } from 'vitest';

// Force persistence/resilience DB paths to no-op under test (guarded by env.NODE_ENV).
vi.mock('../lib/env.js', () => ({
  env: { NODE_ENV: 'test' },
  getEnv: () => ({ NODE_ENV: 'test' }),
  resetEnv: () => {},
}));

vi.mock('../src/services/kernel.js', () => ({ publishKernelEvent: vi.fn() }));
vi.mock('../src/services/agent-runtime.js', () => ({ runAgent: vi.fn() }));
vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn() }));
vi.mock('../lib/logging.js', () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('../src/db/client.js', () => {
  const chain = new Proxy(
    {},
    {
      get: (_t, p) => (p === 'execute' || p === 'run' ? () => Promise.resolve([]) : () => chain),
    }
  );
  const table = {};
  return {
    db: new Proxy({}, { get: () => () => chain }),
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

import { executePlan, MapCheckpointStore } from '../src/services/dag-executor.js';
import { runAgent } from '../src/services/agent-runtime.js';

function makePlan() {
  return {
    id: 'plan-1',
    name: 'p',
    steps: [
      { id: 's1', agentId: 'a', goal: 'g1', dependsOn: [], context: {} },
      { id: 's2', agentId: 'b', goal: 'g2', dependsOn: ['s1'], context: {} },
      { id: 's3', agentId: 'c', goal: 'g3', dependsOn: ['s1'], context: {} },
      { id: 's4', agentId: 'd', goal: 'g4', dependsOn: ['s2', 's3'], context: {} },
    ],
  } as any;
}

describe('dag-executor — checkpoint/resume', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (runAgent as any).mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (runAgent as any).mockResolvedValue({
      ok: true,
      answer: 'ok',
      steps: [],
      iterations: 1,
      tokensUsed: 0,
    });
  });

  it('checkpoints every step so a resumed run skips completed steps', async () => {
    const store = new MapCheckpointStore();
    const plan = makePlan();

    const first = await executePlan(plan, { checkpoint: store });
    expect(first.ok).toBe(true);
    expect(store.load('plan-1', first.runId)!.length).toBe(4);

    // Resume using the same runId: all steps already ok -> no runAgent call.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (runAgent as any).mockClear();
    const resumed = await executePlan(plan, { checkpoint: store, resumeRunId: first.runId });
    expect(resumed.runId).toBe(first.runId);
    expect(resumed.ok).toBe(true);
    expect((runAgent as any).mock.calls.length).toBe(0); // nothing re-executed
  });

  it('resume re-executes only the steps that were not yet checkpointed', async () => {
    const store = new MapCheckpointStore();
    const plan = makePlan();
    const seededRunId = 'seeded-run';

    // Seed a checkpoint with only s1 completed; s2..s4 missing.
    store.save('plan-1', seededRunId, [
      {
        stepId: 's1',
        ok: true,
        output: { ok: true },
        error: undefined,
        retries: 0,
        durationMs: 1,
        startedAt: 0,
        finishedAt: 1,
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (runAgent as any).mockClear();
    const resumed = await executePlan(plan, { checkpoint: store, resumeRunId: seededRunId });
    expect(resumed.ok).toBe(true);
    // Only s2, s3, s4 are re-executed (s1 was restored as ok).
    expect((runAgent as any).mock.calls.length).toBe(3);
    expect(store.load('plan-1', seededRunId)!.length).toBe(4);
  });
});
