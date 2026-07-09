/**
 * services/dag-executor.test.ts
 *
 * Unit tests for the hardened DAG executor:
 *  - runAgent business failures (res.ok=false) are recorded as step failures
 *  - per-step SOFT timeout prevents a hung step from blocking the whole run
 *  - REAL compensation: onCompensate is invoked (and ordered) for every
 *    compensatable step that did not complete; the DEFAULT rollback clears the
 *    blackboard key the step wrote (verified via mocked publish).
 *  - jittered exponential backoff isolates transient failures per-step
 *
 * runAgent, the blackboard, and the deadlock detector are mocked so no
 * DB/LLM/sqlite is touched (better-sqlite3 is ABI-incompatible in this shell).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';

process.env.LOG_LEVEL ??= 'silent';

const mockRunAgent = vi.hoisted(() => vi.fn());
const mockPublish = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockPersist = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../src/services/agent-runtime.js', () => ({
  runAgent: mockRunAgent,
}));

vi.mock('../../src/services/blackboard.js', () => ({
  blackboard: {
    publish: mockPublish,
    persist: mockPersist,
    snapshot: vi.fn().mockReturnValue({}),
    clear: vi.fn(),
    get: vi.fn().mockResolvedValue({ key: 'x', value: undefined, owner: 'x', ts: 0 }),
  },
}));

// deadlock-detector pulls in db/client (better-sqlite3, ABI-incompatible in
// this shell). The executor's self-healing logic is independent of the real
// detector, which has its own unit tests; stub it to "no cycle".
vi.mock('../../src/services/deadlock-detector.js', () => ({
  detectDeadlock: vi.fn().mockReturnValue({ hasCycle: false, cycle: [] }),
}));

// lib/audit and specialization-registry both reach db/client. Their audit-chain
// and registry integration are covered by their own tests; here we stub them so
// the executor's orchestration + self-healing logic can be tested DB-free.
vi.mock('../../src/lib/audit.js', () => ({
  appendAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/specialization-registry.js', () => ({
  SpecializationRegistry: { get: vi.fn(), list: vi.fn().mockReturnValue([]) },
}));

import { executePlan } from '../../src/services/dag-executor.js';
import type { RunPlan, PlanStep } from '../../src/services/planner.js';

function plan(steps: PlanStep[], id = `plan_${randomUUID().slice(0, 8)}`): RunPlan {
  return { id, goal: 'test', steps, createdAt: Date.now(), source: 'template' as const };
}

const okResult = { ok: true as const, answer: 'done', iterations: 1, steps: [], tokensUsed: 0 };
const failResult = {
  ok: false as const,
  answer: 'boom',
  iterations: 1,
  steps: [],
  tokensUsed: 0,
  error: 'boom',
};

const stepOf = (s: Partial<PlanStep> & Pick<PlanStep, 'id'>): PlanStep => ({
  label: 'x',
  instruction: s.id,
  dependsOn: [],
  reads: [],
  capability: 'x',
  ...s,
});

beforeEach(() => {
  mockRunAgent.mockReset();
  mockPublish.mockClear();
  mockPersist.mockClear();
});

describe('dag-executor — correctness', () => {
  it('records a step as FAILED when runAgent returns ok=false (does not poison the board)', async () => {
    mockRunAgent.mockResolvedValue(failResult);
    const steps = [stepOf({ id: 'a', writes: 'out_a', maxRetries: 0, compensatable: true })];
    const res = await executePlan(plan(steps), { onCompensate: () => true });
    expect(res.ok).toBe(false);
    expect(res.steps.find((s) => s.stepId === 'a')!.ok).toBe(false);
    expect(res.steps.find((s) => s.stepId === 'a')!.output).toBeUndefined();
  });

  it('propagates a failed dependency to dependents by NEVER executing them (blocked, not run)', async () => {
    mockRunAgent.mockResolvedValueOnce(failResult); // step a fails
    const steps = [
      stepOf({ id: 'a', writes: 'out_a', maxRetries: 0, compensatable: true }),
      stepOf({
        id: 'b',
        dependsOn: ['a'],
        reads: ['out_a'],
        writes: 'out_b',
        maxRetries: 0,
        compensatable: true,
      }),
    ];
    const res = await executePlan(plan(steps), { onCompensate: () => true });
    expect(res.ok).toBe(false);
    expect(res.steps.find((s) => s.stepId === 'a')!.ok).toBe(false);
    // b is blocked (dependency failed) and must not be in the executed set:
    expect(res.steps.find((s) => s.stepId === 'b')).toBeUndefined();
    expect(mockRunAgent).toHaveBeenCalledTimes(1); // b never ran → failure cannot propagate
  });

  it('succeeds when every step returns ok=true and collects outputs', async () => {
    mockRunAgent.mockResolvedValue(okResult);
    const steps = [
      stepOf({ id: 'a', writes: 'out_a' }),
      stepOf({ id: 'b', dependsOn: ['a'], reads: ['out_a'], writes: 'out_b' }),
    ];
    const res = await executePlan(plan(steps));
    expect(res.ok).toBe(true);
    expect(res.steps.find((s) => s.stepId === 'a')!.ok).toBe(true);
    expect(res.steps.find((s) => s.stepId === 'b')!.ok).toBe(true);
    expect(mockRunAgent).toHaveBeenCalledTimes(2);
  });

  it('retries a transient failure with jittered backoff then succeeds', async () => {
    mockRunAgent.mockResolvedValueOnce(failResult).mockResolvedValue(okResult);
    const steps = [stepOf({ id: 'a', writes: 'out_a', maxRetries: 2 })];
    const res = await executePlan(plan(steps), { retryBaseMs: 5 });
    expect(res.ok).toBe(true);
    expect(res.steps.find((s) => s.stepId === 'a')!.attempts).toBe(2);
    expect(mockRunAgent).toHaveBeenCalledTimes(2);
  });

  it('respects the per-step soft timeout (hung step fails fast, run does not block)', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const hung = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockRunAgent.mockReturnValueOnce(hung).mockResolvedValue(okResult);
    const steps = [stepOf({ id: 'a', writes: 'out_a', maxRetries: 1 })];
    const start = Date.now();
    const res = await executePlan(plan(steps), { stepTimeoutMs: 30, retryBaseMs: 5 });
    const elapsed = Date.now() - start;
    expect(res.ok).toBe(true);
    expect(res.steps.find((s) => s.stepId === 'a')!.attempts).toBeGreaterThanOrEqual(2);
    expect(elapsed).toBeLessThan(2000); // never blocked for the hung promise
    resolveFirst(okResult); // release the hung promise so it does not leak
  });
});

describe('dag-executor — real compensation (self-healing)', () => {
  it('invokes onCompensate for every compensatable step that did NOT complete', async () => {
    mockRunAgent.mockResolvedValue(failResult); // everything fails
    const steps = [
      stepOf({ id: 'a', writes: 'out_a', maxRetries: 0, compensatable: true }),
      stepOf({
        id: 'b',
        dependsOn: ['a'],
        reads: ['out_a'],
        writes: 'out_b',
        maxRetries: 0,
        compensatable: true,
      }),
      stepOf({
        id: 'c',
        dependsOn: ['b'],
        reads: ['out_b'],
        writes: 'out_c',
        maxRetries: 0,
        compensatable: true,
      }),
    ];
    const compensated: string[] = [];
    const res = await executePlan(plan(steps), {
      onCompensate: (s) => {
        compensated.push(s.id);
        return true;
      },
    });
    expect(res.ok).toBe(false);
    expect(compensated).toContain('a');
    expect(compensated).toContain('b');
    expect(compensated).toContain('c');
    expect(compensated).toHaveLength(3);
  });

  it('does NOT invoke onCompensate for steps that completed successfully', async () => {
    mockRunAgent.mockResolvedValue(okResult);
    const steps = [
      stepOf({ id: 'a', writes: 'out_a', maxRetries: 0, compensatable: true }),
      stepOf({
        id: 'b',
        dependsOn: ['a'],
        reads: ['out_a'],
        writes: 'out_b',
        maxRetries: 0,
        compensatable: true,
      }),
    ];
    const compensated: string[] = [];
    await executePlan(plan(steps), {
      onCompensate: (s) => {
        compensated.push(s.id);
        return true;
      },
    });
    expect(compensated).toHaveLength(0);
  });

  it('DEFAULT rollback clears the blackboard key the step wrote (real, not audit-only)', async () => {
    mockRunAgent.mockResolvedValue(failResult);
    const steps = [stepOf({ id: 'a', writes: 'out_a', maxRetries: 0, compensatable: true })];
    const res = await executePlan(plan(steps));
    expect(res.ok).toBe(false);
    const publishCall = mockPublish.mock.calls.find((c) => c[0]?.key === 'out_a');
    expect(publishCall).toBeDefined();
    expect(publishCall![0].value).toBeUndefined();
    expect(mockPersist).toHaveBeenCalledWith(res.runId);
  });

  it('records compensation FAILURE when onCompensate throws', async () => {
    mockRunAgent.mockResolvedValue(failResult);
    const steps = [stepOf({ id: 'a', writes: 'out_a', maxRetries: 0, compensatable: true })];
    const res = await executePlan(plan(steps), {
      onCompensate: () => {
        throw new Error('undo failed');
      },
    });
    expect(res.ok).toBe(false);
    expect(res.compensation).toBeDefined();
    expect(res.compensation!['a']).toBe(false);
  });
});
