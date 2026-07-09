/**
 * services/agent-runtime.test.ts
 *
 * Real-database tests for ActionRegistry, AgentRuntime, agent-persistence,
 * and the orchestration layer (runAgent).
 *
 * Uses SQLite (default, via empty DATABASE_URL).
 * The LLM service is mocked to avoid HTTP calls.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

process.env.DATABASE_URL ??= '';
process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'silent';

// ── Mock LLM service (hoisted) ─────────────────────────────────
const mockCallLLM = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/llm.js', () => ({
  callLLM: mockCallLLM,
  callLLMStream: vi.fn(),
  llmConfigured: vi.fn().mockReturnValue(true),
  distillTranscript: vi.fn(),
  agentChat: vi.fn(),
}));

import { db, agents, agentTasks, auditLog, stateSnapshots, closeDb } from '../../src/db/client.js';
import { eq, sql } from 'drizzle-orm';

// Pure imports — no side effects
import { ActionRegistry, executeActionWithTimeout } from '../../src/services/action-registry.js';
import type { Action } from '../../src/services/action-registry.js';

import { AgentRuntime, runAgent } from '../../src/services/agent-loop.js';
import type { AgentConfig } from '../../src/services/agent-loop.js';

import {
  saveAgentProcessState,
  loadAgentProcessState,
} from '../../src/services/agent-persistence.js';
import type { AgentExecutionState } from '../../src/services/agent-persistence.js';

// ── Helpers ────────────────────────────────────────────────────

function agentId(): string {
  return `agt_${randomUUID().slice(0, 12)}`;
}

/** Insert a minimal agent row returning its id. metadata is stored as JSON string (SQLite). */
async function seedAgent(
  overrides: Partial<{
    id: string;
    name: string;
    kind: string;
    ring: number;
    status: string;
    tokenBudget: number;
    tokensUsed: number;
    metadata: string;
  }> = {}
): Promise<string> {
  const id = overrides.id ?? agentId();
  await db.insert(agents).values({
    id,
    name: overrides.name ?? 'test-agent',
    kind: overrides.kind ?? 'sub-agent',
    ring: overrides.ring ?? 2,
    status: overrides.status ?? 'idle',
    tokenBudget: overrides.tokenBudget ?? 10000,
    tokensUsed: overrides.tokensUsed ?? 0,
    metadata: overrides.metadata ?? {},
  });
  return id;
}

/** Remove all test data from tables we touch. */
async function cleanTables(): Promise<void> {
  await db.delete(stateSnapshots);
  await db.delete(auditLog);
  await db.delete(agentTasks);
  await db.delete(agents);
}

// ── Fixtures ───────────────────────────────────────────────────

const echoAction: Action = {
  name: 'echo',
  description: 'Returns the input back',
  schema: z.object({ message: z.string() }),
  handler: async (input) => ({ echo: (input as { message: string }).message }),
  similes: ['say', 'repeat'],
  examples: [{ input: { message: 'hi' }, output: { echo: 'hi' }, description: 'Echo test' }],
  metadata: { version: '1.0.0', category: 'test', provider: 'builtin', riskLevel: 'read' },
};

const dangerousAction: Action = {
  name: 'dangerousOp',
  description: 'A risky operation',
  schema: z.object({ confirm: z.boolean() }),
  handler: async (input) => ({ destroyed: (input as { confirm: boolean }).confirm }),
  similes: ['risky'],
  examples: [{ input: { confirm: true }, output: { destroyed: true }, description: 'Risky' }],
  metadata: { version: '1.0.0', category: 'test', provider: 'builtin', riskLevel: 'destructive' },
};

const failingAction: Action = {
  name: 'failer',
  description: 'Always throws',
  schema: z.object({}),
  handler: async () => {
    throw new Error('intentional failure');
  },
  similes: [],
  examples: [],
  metadata: { version: '1.0.0', category: 'test', provider: 'builtin', riskLevel: 'read' },
};

// ── Suite ──────────────────────────────────────────────────────

describe('ActionRegistry', () => {
  let registry: ActionRegistry;

  beforeEach(() => {
    registry = new ActionRegistry();
  });

  it('register adds an action', () => {
    registry.register(echoAction);
    expect(registry.get('echo')).toBeDefined();
    expect(registry.list()).toHaveLength(1);
  });

  it('register throws on duplicate name', () => {
    registry.register(echoAction);
    expect(() => registry.register(echoAction)).toThrow('already registered');
  });

  it('unregister removes an action', () => {
    registry.register(echoAction);
    expect(registry.unregister('echo')).toBe(true);
    expect(registry.get('echo')).toBeUndefined();
  });

  it('unregister returns false for missing action', () => {
    expect(registry.unregister('nope')).toBe(false);
  });

  it('get returns undefined for unknown action', () => {
    expect(registry.get('nope')).toBeUndefined();
  });

  it('list returns all registered actions', () => {
    registry.register(echoAction);
    registry.register(dangerousAction);
    expect(registry.list()).toHaveLength(2);
  });

  it('find matches on name', () => {
    registry.register(echoAction);
    const results = registry.find('echo');
    expect(results).toHaveLength(1);
  });

  it('find matches on description', () => {
    registry.register(echoAction);
    const results = registry.find('Returns');
    expect(results).toHaveLength(1);
  });

  it('find matches on simile', () => {
    registry.register(echoAction);
    const results = registry.find('repeat');
    expect(results).toHaveLength(1);
  });

  it('fuzzyFind returns exact name match first', () => {
    registry.register(echoAction);
    registry.register(dangerousAction);
    expect(registry.fuzzyFind('echo')?.name).toBe('echo');
  });

  it('fuzzyFind matches similes', () => {
    registry.register(echoAction);
    expect(registry.fuzzyFind('say')?.name).toBe('echo');
  });

  it('fuzzyFind returns undefined for no match', () => {
    registry.register(echoAction);
    expect(registry.fuzzyFind('zzzzz')).toBeUndefined();
  });

  it('fuzzyFind scores partial name matches', () => {
    registry.register(echoAction);
    registry.register(dangerousAction);
    // 'dan' matches 'dangerousOp' partially
    expect(registry.fuzzyFind('dan')?.name).toBe('dangerousOp');
  });

  it('execute returns ActionExecuteResult with ok=false for missing action', async () => {
    const result = await registry.execute('nope', {}, { agentId: 'a', actor: 'test' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('execute validates input through Zod schema', async () => {
    registry.register(echoAction);
    const result = await registry.execute(
      'echo',
      { message: 123 },
      { agentId: 'a', actor: 'test' }
    );
    // message should be a string — 123 fails validation
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Validation failed');
  });

  it('execute runs handler and succeeds', async () => {
    registry.register(echoAction);
    const result = await registry.execute(
      'echo',
      { message: 'hello' },
      { agentId: 'a', actor: 'test' },
      5000
    );
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ echo: 'hello' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('toToolSpecs generates specs for registered actions', () => {
    registry.register(echoAction);
    registry.register(dangerousAction);
    const specs = registry.toToolSpecs();
    expect(specs).toHaveLength(2);
    const dangerSpec = specs.find((s) => s.name === 'dangerousOp')!;
    expect(dangerSpec.approvalRequired).toBe(true); // destructive risk
    const echoSpec = specs.find((s) => s.name === 'echo')!;
    expect(echoSpec.approvalRequired).toBe(false);
  });
});

describe('AgentRuntime', () => {
  it('constructor registers default actions', () => {
    const rt = new AgentRuntime('agt_test', 'test');
    const actions = rt.getAvailableActions();
    // Default actions: recall, createMemory, createSkill, readMemory, readSkill, listAgents, finish
    expect(actions.length).toBeGreaterThanOrEqual(7);
    expect(actions.find((a) => a.name === 'finish')).toBeDefined();
    expect(actions.find((a) => a.name === 'recall')).toBeDefined();
  });

  it('constructor accepts custom actions', () => {
    const rt = new AgentRuntime('agt_test', 'test', [echoAction]);
    const actions = rt.getAvailableActions();
    expect(actions).toHaveLength(1);
    expect(actions[0]!.name).toBe('echo');
  });

  it('registerAction adds a custom action', () => {
    const rt = new AgentRuntime('agt_test', 'test', []);
    rt.registerAction(echoAction);
    expect(rt.getAvailableActions()).toHaveLength(1);
  });

  it('validateAction returns valid for correct input', () => {
    const rt = new AgentRuntime('agt_test', 'test', [echoAction]);
    expect(rt.validateAction('echo', { message: 'ok' })).toEqual({ valid: true });
  });

  it('validateAction returns errors for wrong input', () => {
    const rt = new AgentRuntime('agt_test', 'test', [echoAction]);
    const result = rt.validateAction('echo', {});
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThanOrEqual(1);
  });

  it('validateAction returns error for unknown action', () => {
    const rt = new AgentRuntime('agt_test', 'test', []);
    const result = rt.validateAction('nope', {});
    expect(result.valid).toBe(false);
    expect(result.errors![0]).toContain('not found');
  });

  it('buildSystemPrompt includes all registered tools', () => {
    const rt = new AgentRuntime('agt_test', 'test', [echoAction]);
    const prompt = rt.buildSystemPrompt();
    expect(prompt).toContain('echo');
    expect(prompt).toContain('Returns the input back');
    expect(prompt).toContain('message'); // Zod description in schema
    expect(prompt).toContain('finish'); // finish tool should appear
  });

  it('buildSystemPrompt returns instructions JSON format', () => {
    const rt = new AgentRuntime('agt_test', 'test', [echoAction]);
    const prompt = rt.buildSystemPrompt();
    expect(prompt).toContain('"thought"');
    expect(prompt).toContain('"tool"');
    expect(prompt).toContain('"input"');
  });

  it('getAvailableActions returns serializable schemas', () => {
    const rt = new AgentRuntime('agt_test', 'test', [echoAction]);
    const actions = rt.getAvailableActions();
    const json = JSON.parse(JSON.stringify(actions));
    // Only echoAction is registered; finish is NOT added when custom actions provided
    expect(json).toHaveLength(1);
    expect(json[0]!.name).toBe('echo');
  });
});

describe('executeActionWithTimeout — real DB auth flow', () => {
  let agentOkId: string;

  beforeAll(async () => {
    await cleanTables();
    agentOkId = await seedAgent({ status: 'idle', ring: 2 });
  });

  afterAll(async () => {
    await cleanTables();
  });

  it('validates using Zod schema — returns ok=false on type mismatch', async () => {
    const result = await executeActionWithTimeout(
      echoAction,
      { message: 123 },
      { agentId: agentOkId, actor: 'test' },
      5000
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Validation failed');
  });

  it('runs custom validate hook and returns errors', async () => {
    const actionWithCustomValidate: Action = {
      ...echoAction,
      validate: (_input) => ({
        valid: false,
        errors: ['custom error triggered'],
      }),
    };
    const result = await executeActionWithTimeout(
      actionWithCustomValidate,
      { message: 'hi' },
      { agentId: agentOkId, actor: 'test' },
      5000
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('custom error');
  });

  it('blocks execution when agent is quarantined', async () => {
    const quarId = await seedAgent({ status: 'quarantined', ring: 4 });
    const result = await executeActionWithTimeout(
      echoAction,
      { message: 'hello' },
      { agentId: quarId, actor: 'test' },
      5000
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('quarantined');
  });

  it('blocks execution when agent is terminated', async () => {
    const termId = await seedAgent({ status: 'terminated', ring: 4 });
    const result = await executeActionWithTimeout(
      echoAction,
      { message: 'hello' },
      { agentId: termId, actor: 'test' },
      5000
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('terminated');
  });

  it('executes handler and returns ok=true with data', async () => {
    const result = await executeActionWithTimeout(
      echoAction,
      { message: 'hello world' },
      { agentId: agentOkId, actor: 'test' },
      5000
    );
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ echo: 'hello world' });
  });

  it('catches handler exceptions and returns ok=false', async () => {
    const result = await executeActionWithTimeout(
      failingAction,
      {},
      { agentId: agentOkId, actor: 'test' },
      5000
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('intentional failure');
  });
});

describe('Agent Persistence — real DB', () => {
  beforeAll(async () => {
    await cleanTables();
  });

  afterAll(async () => {
    await cleanTables();
  });

  it('loadAgentProcessState returns null for unknown agent', async () => {
    const state = await loadAgentProcessState('non-existent');
    expect(state).toBeNull();
  });

  it('loadAgentProcessState returns null for agent with no execution state', async () => {
    const id = await seedAgent({ metadata: '{}' });
    const state = await loadAgentProcessState(id);
    expect(state).toBeNull();
  });

  it('saveAgentProcessState persists state readable by loadAgentProcessState', async () => {
    const id = await seedAgent({ metadata: '{}' });
    const execState: AgentExecutionState = {
      agentId: id,
      goal: 'test goal',
      currentIteration: 3,
      maxIterations: 10,
      steps: [
        {
          iteration: 0,
          thought: 'first step',
          tool: 'echo',
          toolInput: { message: 'hi' },
          toolOutput: { echo: 'hi' },
        },
      ],
      tokensUsed: 100,
      conversation: 'Step 1 result ...',
      status: 'running',
      updatedAt: new Date().toISOString(),
    };

    await saveAgentProcessState(execState);

    const loaded = await loadAgentProcessState(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.goal).toBe('test goal');
    expect(loaded!.currentIteration).toBe(3);
    expect(loaded!.status).toBe('running');
    expect(loaded!.steps).toHaveLength(1);
    expect(loaded!.tokensUsed).toBe(100);
  });

  it('saveAgentProcessState updates existing state on re-save', async () => {
    const id = await seedAgent({ metadata: '{}' });

    await saveAgentProcessState({
      agentId: id,
      goal: 'iterate',
      currentIteration: 1,
      maxIterations: 5,
      steps: [],
      tokensUsed: 50,
      conversation: '',
      status: 'running',
      updatedAt: new Date().toISOString(),
    });

    await saveAgentProcessState({
      agentId: id,
      goal: 'iterate',
      currentIteration: 2,
      maxIterations: 5,
      steps: [
        {
          iteration: 0,
          thought: 'step',
          tool: 'finish',
          toolInput: {},
          toolOutput: { done: true },
        },
      ],
      tokensUsed: 150,
      conversation: 'done',
      status: 'completed',
      updatedAt: new Date().toISOString(),
    });

    const loaded = await loadAgentProcessState(id);
    expect(loaded!.currentIteration).toBe(2);
    expect(loaded!.status).toBe('completed');
    expect(loaded!.steps).toHaveLength(1);
  });

  it('saveAgentProcessState writes a snapshot row', async () => {
    const id = await seedAgent({ metadata: '{}' });
    await saveAgentProcessState({
      agentId: id,
      goal: 'snapshot-test',
      currentIteration: 1,
      maxIterations: 10,
      steps: [],
      tokensUsed: 50,
      conversation: '',
      status: 'running',
      updatedAt: new Date().toISOString(),
    });

    const snapshots = await db
      .select()
      .from(stateSnapshots)
      .where(eq(stateSnapshots.agentId, id))
      .orderBy(sql`created_at DESC`)
      .limit(1);

    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    expect(snapshots[0]!.sagaId).toBe(id);
    expect(snapshots[0]!.stepIndex).toBe(1);
  });

  it('manually created state loads correctly', async () => {
    const id = await seedAgent({ metadata: '{}' });
    // Write state directly into metadata JSON
    const state: AgentExecutionState = {
      agentId: id,
      goal: 'direct-load',
      context: { source: 'test' },
      currentIteration: 7,
      maxIterations: 10,
      steps: [
        {
          iteration: 0,
          thought: 'direct',
          tool: 'echo',
          toolInput: { message: 'x' },
          toolOutput: {},
        },
      ],
      tokensUsed: 500,
      conversation: '...',
      status: 'paused',
      updatedAt: new Date().toISOString(),
    };
    await db
      .update(agents)
      .set({ metadata: { executionState: state } })
      .where(eq(agents.id, id));

    const loaded = await loadAgentProcessState(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.goal).toBe('direct-load');
    expect(loaded!.currentIteration).toBe(7);
    expect(loaded!.context).toEqual({ source: 'test' });
  });
});

describe('runAgent — real DB + mocked LLM', () => {
  let agentIdOk: string;

  beforeAll(async () => {
    await cleanTables();
    agentIdOk = await seedAgent({ status: 'idle', ring: 2, tokenBudget: 100000 });
  });

  afterAll(async () => {
    await cleanTables();
  });

  beforeEach(() => {
    mockCallLLM.mockReset();
  });

  it('completes a goal when LLM returns finish on first turn', async () => {
    mockCallLLM.mockResolvedValueOnce({
      content: JSON.stringify({
        thought: 'goal achieved',
        tool: 'finish',
        input: { answer: 'mission complete' },
      }),
      model: 'test-model',
      usage: { prompt: 50, completion: 10, total: 60 },
    });

    const config: AgentConfig = {
      agentId: agentIdOk,
      goal: 'test completion',
      actor: 'test',
      maxIterations: 5,
    };

    const result = await runAgent(config);

    expect(result.ok).toBe(true);
    expect(result.answer).toBe('mission complete');
    expect(result.iterations).toBe(1);
    expect(result.steps).toHaveLength(1);
    expect(result.tokensUsed).toBeGreaterThanOrEqual(60);
  });

  it('exhausts maxIterations when LLM never calls finish', async () => {
    mockCallLLM.mockResolvedValue({
      content: JSON.stringify({
        thought: 'doing work',
        tool: 'recall',
        input: { query: 'something', budget: 100 },
      }),
      model: 'test-model',
      usage: { prompt: 10, completion: 5, total: 15 },
    });

    const config: AgentConfig = {
      agentId: await seedAgent({ status: 'idle', ring: 2, tokenBudget: 100000 }),
      goal: 'run forever',
      actor: 'test',
      maxIterations: 3,
    };

    const result = await runAgent(config);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Max iterations exceeded');
    expect(result.iterations).toBe(3);
    expect(result.steps).toHaveLength(3);
  });

  it('recovers from LLM returning malformed JSON', async () => {
    mockCallLLM
      .mockResolvedValueOnce({
        content: 'not json at all',
        model: 'test-model',
        usage: { prompt: 5, completion: 5, total: 10 },
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          thought: 'recovered',
          tool: 'finish',
          input: { answer: 'recovery worked' },
        }),
        model: 'test-model',
        usage: { prompt: 10, completion: 5, total: 15 },
      });

    const config: AgentConfig = {
      agentId: await seedAgent({ status: 'idle', ring: 2, tokenBudget: 100000 }),
      goal: 'test recovery',
      actor: 'test',
      maxIterations: 5,
    };

    const result = await runAgent(config);

    expect(result.ok).toBe(true);
    expect(result.answer).toBe('recovery worked');
    expect(result.iterations).toBe(2); // 1 error + 1 success
  });

  it('handles agent running with zero tokenBudget (immediate pause)', async () => {
    const zeroBudgetId = await seedAgent({
      status: 'idle',
      ring: 2,
      tokenBudget: 0,
      tokensUsed: 0,
    });
    // LLM should not be called since budget is already exhausted
    const config: AgentConfig = {
      agentId: zeroBudgetId,
      goal: 'should pause immediately',
      actor: 'test',
      maxIterations: 5,
    };

    const result = await runAgent(config);
    expect(result.ok).toBe(false);
    expect(result.answer).toBe('Token budget exhausted');
    expect(result.iterations).toBe(0);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});

// ── Cleanup on exit ────────────────────────────────────────────

afterAll(async () => {
  try {
    await cleanTables();
    await closeDb();
  } catch {
    /* ignore */
  }
});
