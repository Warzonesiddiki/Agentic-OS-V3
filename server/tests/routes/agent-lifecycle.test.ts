/**
 * routes/agent-lifecycle.test.ts — Unit tests for agent-lifecycle routes (v3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/client.js', () => ({
  db: { query: { apiKeys: { findMany: vi.fn().mockResolvedValue([]) } } },
  isSqlite: true,
}));

vi.mock('../../src/lib/security.js', () => ({
  authenticate: vi.fn(),
}));

vi.mock('../../src/services/kernel.js', () => ({
  spawnAgent: vi.fn(),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  pauseAgent: vi.fn(),
  resumeAgent: vi.fn(),
  terminateAgent: vi.fn(),
  getAgentState: vi.fn(),
  listAgentTasks: vi.fn(),
}));

vi.mock('../../src/services/signal-hooks.js', () => ({
  emitSignal: vi.fn(),
}));

vi.mock('../../src/lib/auth-context.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/lib/auth-context.js')>();
  return {
    ...orig,
    requireScope: vi
      .fn()
      .mockResolvedValue({ id: 'p1', name: 'admin', scopes: ['brain:admin', 'memory:read'] }),
    safeJson: vi.fn(),
    parse: vi.fn(),
  };
});

import { agentLifecycle } from '../../src/routes/agent-lifecycle.js';
import * as kernel from '../../src/services/kernel.js';
import * as signalHooks from '../../src/services/signal-hooks.js';
import * as authCtx from '../../src/lib/auth-context.js';

describe('agent-lifecycle routes (v3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/v3/agents/spawn should create agent and emit start signal', async () => {
    const agent = { id: 'a1', name: 'my-agent', status: 'idle', parentId: null };
    vi.mocked(kernel.spawnAgent).mockResolvedValue(agent as any);
    vi.mocked(authCtx.safeJson as any).mockResolvedValue({
      name: 'my-agent',
      kind: 'sub-agent',
      ring: 2,
      scopes: [],
      tokenBudget: 100000,
      timeoutMs: 120000,
    });
    vi.mocked(authCtx.parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await agentLifecycle.request('/api/v3/agents/spawn', { method: 'POST' });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { id: string } };
    expect(json.data.id).toBe('a1');
    expect(signalHooks.emitSignal).toHaveBeenCalledWith(
      'on_agent_start',
      expect.objectContaining({ agentId: 'a1' })
    );
  });

  it('POST /api/v3/agents/spawn should return 500 on failure', async () => {
    vi.mocked(kernel.spawnAgent).mockResolvedValue(null);
    vi.mocked(authCtx.safeJson as any).mockResolvedValue({
      name: 'fail-agent',
      kind: 'sub-agent',
      ring: 2,
      scopes: [],
      tokenBudget: 100000,
      timeoutMs: 120000,
    });
    vi.mocked(authCtx.parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await agentLifecycle.request('/api/v3/agents/spawn', { method: 'POST' });
    expect(res.status).toBe(500);
  });

  it('POST /api/v3/agents/:id/pause should pause a running agent', async () => {
    vi.mocked(kernel.getAgent).mockResolvedValue({ id: 'a1', status: 'running' } as any);
    vi.mocked(kernel.pauseAgent).mockResolvedValue({ id: 'a1', status: 'paused' } as any);

    const res = await agentLifecycle.request('/api/v3/agents/a1/pause', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { status: string } };
    expect(json.data.status).toBe('paused');
  });

  it('POST /api/v3/agents/:id/pause should return 404 for unknown agent', async () => {
    vi.mocked(kernel.getAgent).mockResolvedValue(null);

    const res = await agentLifecycle.request('/api/v3/agents/missing/pause', { method: 'POST' });
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('POST /api/v3/agents/:id/pause should return 409 for already paused agent', async () => {
    vi.mocked(kernel.getAgent).mockResolvedValue({ id: 'a1', status: 'paused' } as any);

    const res = await agentLifecycle.request('/api/v3/agents/a1/pause', { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('POST /api/v3/agents/:id/resume should resume a paused agent', async () => {
    vi.mocked(kernel.getAgent).mockResolvedValue({ id: 'a1', status: 'paused' } as any);
    vi.mocked(kernel.resumeAgent).mockResolvedValue({ id: 'a1', status: 'running' } as any);

    const res = await agentLifecycle.request('/api/v3/agents/a1/resume', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { status: string } };
    expect(json.data.status).toBe('running');
  });

  it('POST /api/v3/agents/:id/resume should return 409 if agent not paused', async () => {
    vi.mocked(kernel.getAgent).mockResolvedValue({ id: 'a1', status: 'running' } as any);

    const res = await agentLifecycle.request('/api/v3/agents/a1/resume', { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('POST /api/v3/agents/:id/kill should terminate agent and emit end signal', async () => {
    vi.mocked(kernel.getAgent).mockResolvedValue({
      id: 'a1',
      status: 'running',
      tokensUsed: 500,
    } as any);
    vi.mocked(kernel.terminateAgent).mockResolvedValue({ id: 'a1', status: 'terminated' } as any);
    vi.mocked(authCtx.safeJson as any).mockResolvedValue({ reason: 'Completed task' });
    vi.mocked(authCtx.parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await agentLifecycle.request('/api/v3/agents/a1/kill', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { status: string } };
    expect(json.data.status).toBe('terminated');
    expect(signalHooks.emitSignal).toHaveBeenCalledWith(
      'on_agent_end',
      expect.objectContaining({ agentId: 'a1' })
    );
  });

  it('GET /api/v3/agents/:id/state should return agent state', async () => {
    vi.mocked(kernel.getAgentState).mockResolvedValue({
      id: 'a1',
      status: 'running',
      currentTool: 'search',
    } as any);

    const res = await agentLifecycle.request('/api/v3/agents/a1/state', { method: 'GET' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { status: string } };
    expect(json.data.status).toBe('running');
  });

  it('GET /api/v3/agents/:id/state should return 404 for unknown agent', async () => {
    vi.mocked(kernel.getAgentState).mockResolvedValue(null);

    const res = await agentLifecycle.request('/api/v3/agents/missing/state', { method: 'GET' });
    expect(res.status).toBe(404);
  });
});
