import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/logging.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../lib/env.js', () => ({ env: {}, llmConfigured: () => false }));
vi.mock('../src/services/message-bus.js', () => ({
  getMessageBus: () => ({ publish: vi.fn() }),
}));
vi.mock('../src/services/operations-ext.js', () => ({
  withCircuitBreaker: (_id: string, fn: () => unknown) => fn(),
}));
vi.mock('../src/services/scheduler.js', () => ({
  startMlfqBooster: vi.fn(),
  stopMlfqBooster: vi.fn(),
  initializeSchedulingPolicy: vi.fn(),
}));
vi.mock('../src/services/kernel-panic.js', () => ({ registerPanicHandler: vi.fn() }));
vi.mock('../src/services/task-notifier.js', () => ({ onTaskQueued: () => () => {} }));
vi.mock('../db/client.js', () => ({
  db: { update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }) },
}));
vi.mock('../db/schema.js', () => ({ agentTasks: {} }));
vi.mock('drizzle-orm', () => ({ eq: () => ({}), and: () => ({}), sql: () => ({}) }));
vi.mock('../src/services/kernel.js', () => ({
  pickNextTask: vi.fn(),
  completeTask: vi.fn(),
  failTask: vi.fn(),
  updateAgentState: vi.fn(),
  getAgent: vi.fn(),
  preemptAgent: vi.fn(),
  releaseRingBudget: vi.fn(),
}));

import {
  runWithSchedulingMode,
  CooperativeYield,
  cooperativeYield,
  reportWorkerHealth,
  getWorkerHealth,
} from '../src/services/task-worker.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('runWithSchedulingMode', () => {
  it('cooperative mode runs to completion (blocks) even with a short quantum', async () => {
    const work = vi.fn(async () => {
      await delay(40);
      return 'done';
    });
    const res = await runWithSchedulingMode({
      mode: 'cooperative',
      quantumMs: 5,
      work: () => work(),
    });
    expect(res.aborted).toBe(false);
    expect(res.yielded).toBe(false);
    expect(res.result).toBe('done');
  });

  it('preemptive mode is aborted when the quantum elapses', async () => {
    const work = vi.fn(async (signal: AbortSignal) => {
      await delay(100);
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      return 'done';
    });
    const res = await runWithSchedulingMode({ mode: 'preemptive', quantumMs: 10, work });
    expect(res.aborted).toBe(true);
    expect(res.yielded).toBe(false);
  });

  it('cooperative yield is reported as yielded', async () => {
    const work = vi.fn(async () => {
      await cooperativeYield();
    });
    const res = await runWithSchedulingMode({ mode: 'cooperative', quantumMs: 0, work });
    expect(res.yielded).toBe(true);
    expect(res.aborted).toBe(false);
  });

  it('propagates non-abort errors', async () => {
    await expect(
      runWithSchedulingMode({
        mode: 'preemptive',
        quantumMs: 50,
        work: async () => {
          throw new Error('boom');
        },
      })
    ).rejects.toThrow('boom');
  });
});

describe('worker health reporting', () => {
  beforeEach(() => {
    reportWorkerHealth(1);
  });

  it('reports and clamps the health score to [0,1]', () => {
    reportWorkerHealth(5);
    expect(getWorkerHealth().score).toBe(1);
    reportWorkerHealth(-1);
    expect(getWorkerHealth().score).toBe(0);
  });

  it('includes supplied metrics', () => {
    reportWorkerHealth(0.5, { completed: 3 });
    expect(getWorkerHealth().metrics).toMatchObject({ completed: 3 });
  });

  it('CooperativeYield is an Error subclass', () => {
    expect(new CooperativeYield()).toBeInstanceOf(Error);
  });
});
