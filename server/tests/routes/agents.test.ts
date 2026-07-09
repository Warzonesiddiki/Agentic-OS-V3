/**
 * routes/agents.test.ts — Unit tests for agents routes (Hono app).
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
  updateAgentState: vi.fn(),
  quarantineAgent: vi.fn(),
  enqueueTask: vi.fn(),
  pickNextTask: vi.fn(),
  completeTask: vi.fn(),
  failTask: vi.fn(),
  schedulerStatus: vi.fn(),
}));

vi.mock('../../src/services/operations-ext.js', () => ({
  createCronJob: vi.fn(),
  listCronJobs: vi.fn(),
  toggleCronJob: vi.fn(),
  tickCron: vi.fn(),
  ingestAmbientTranscript: vi.fn(),
}));

vi.mock('../../src/services/sse-bus.js', () => ({
  broadcastSSE: vi.fn(),
}));

vi.mock('../../src/services/task-worker.js', () => ({
  workerStatus: vi.fn().mockReturnValue({ running: false }),
  startWorker: vi.fn(),
  stopWorker: vi.fn(),
  configureWorker: vi.fn(),
}));

vi.mock('../../src/lib/auth-context.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/lib/auth-context.js')>();
  return {
    ...orig,
    requireScope: vi
      .fn()
      .mockResolvedValue({
        id: 'test-user',
        name: 'tester',
        scopes: ['brain:admin', 'memory:read', 'memory:write'],
      }),
    safeJson: vi.fn(),
    parse: vi.fn(),
  };
});

import { agents } from '../../src/routes/agents.js';
import * as kernel from '../../src/services/kernel.js';
import * as opsExt from '../../src/services/operations-ext.js';
import * as taskWorker from '../../src/services/task-worker.js';
import * as authCtx from '../../src/lib/auth-context.js';

function mockJson(data: unknown) {
  return vi.fn().mockResolvedValue(data);
}

describe('agents routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/v1/agents should list agents', async () => {
    vi.mocked(kernel.listAgents).mockResolvedValue([{ id: 'a1', name: 'test-agent' }] as any);
    (authCtx.requireScope as any).mockResolvedValue({ id: 'p1', scopes: ['memory:read'] });

    const res = await agents.request('/api/v1/agents', { method: 'GET' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.data.items).toEqual([{ id: 'a1', name: 'test-agent' }]);
  });

  it('POST /api/v1/agents should spawn an agent and return 201', async () => {
    const agent = { id: 'a2', name: 'new-agent', status: 'idle' };
    vi.mocked(kernel.spawnAgent).mockResolvedValue(agent as any);
    const jsonSpy = mockJson({
      name: 'new-agent',
      kind: 'sub-agent',
      ring: 2,
      scopes: [],
      tokenBudget: 100000,
      timeoutMs: 120000,
    });
    (authCtx.safeJson as any).mockImplementation(jsonSpy);
    (authCtx.parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await agents.request('/api/v1/agents', { method: 'POST' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe('a2');
  });

  it('GET /api/v1/agents/:id should return the agent when found', async () => {
    vi.mocked(kernel.getAgent).mockResolvedValue({ id: 'a1', name: 'found-agent' } as any);
    (authCtx.requireScope as any).mockResolvedValue({ id: 'p1', scopes: ['memory:read'] });

    const res = await agents.request('/api/v1/agents/a1', { method: 'GET' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.data.name).toBe('found-agent');
  });

  it('GET /api/v1/agents/:id should return 404 when not found', async () => {
    vi.mocked(kernel.getAgent).mockResolvedValue(null);
    (authCtx.requireScope as any).mockResolvedValue({ id: 'p1', scopes: ['memory:read'] });

    const res = await agents.request('/api/v1/agents/missing', { method: 'GET' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, any>;
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('PATCH /api/v1/agents/:id/state should update agent state', async () => {
    const updated = { id: 'a1', status: 'running', currentTool: 'search' };
    vi.mocked(kernel.updateAgentState).mockResolvedValue(updated as any);
    (authCtx.requireScope as any).mockResolvedValue({ id: 'p1', scopes: ['brain:admin'] });
    (authCtx.safeJson as any).mockResolvedValue({ status: 'running', currentTool: 'search' });
    (authCtx.parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await agents.request('/api/v1/agents/a1/state', { method: 'PATCH' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.data.status).toBe('running');
  });

  it('POST /api/v1/agents/:id/quarantine should quarantine agent', async () => {
    vi.mocked(kernel.quarantineAgent).mockResolvedValue(undefined);
    (authCtx.requireScope as any).mockResolvedValue({ id: 'p1', scopes: ['brain:admin'] });
    (authCtx.safeJson as any).mockResolvedValue({ reason: 'Security violation' });
    (authCtx.parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await agents.request('/api/v1/agents/a1/quarantine', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.data.quarantined).toBe(true);
  });

  it('POST /api/v1/tasks should enqueue a task', async () => {
    const task = { id: 't1', label: 'summarize', status: 'queued' };
    vi.mocked(kernel.enqueueTask).mockResolvedValue(task as any);
    (authCtx.requireScope as any).mockResolvedValue({ id: 'p1', scopes: ['memory:write'] });
    (authCtx.safeJson as any).mockResolvedValue({
      agentId: 'a1',
      label: 'summarize',
      kind: 'interactive',
    });
    (authCtx.parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await agents.request('/api/v1/tasks', { method: 'POST' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, any>;
    expect(body.data.label).toBe('summarize');
  });

  it('GET /api/v1/worker/status should return worker status', async () => {
    (authCtx.requireScope as any).mockResolvedValue({ id: 'p1', scopes: ['memory:read'] });

    const res = await agents.request('/api/v1/worker/status', { method: 'GET' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.data.running).toBe(false);
  });

  it('POST /api/v1/worker/start should start the worker', async () => {
    (authCtx.requireScope as any).mockResolvedValue({ id: 'p1', scopes: ['brain:admin'] });

    const res = await agents.request('/api/v1/worker/start', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.data.running).toBe(true);
    expect(taskWorker.startWorker).toHaveBeenCalled();
  });

  it('POST /api/v1/cron should create a cron job', async () => {
    const cronJob = { id: 'c1', name: 'daily-summary', cron: '0 9 * * *' };
    vi.mocked(opsExt.createCronJob).mockResolvedValue(cronJob as any);
    (authCtx.requireScope as any).mockResolvedValue({ id: 'p1', scopes: ['brain:admin'] });
    (authCtx.safeJson as any).mockResolvedValue({
      name: 'daily-summary',
      cron: '0 9 * * *',
      agentKind: 'daemon',
      taskLabel: 'summary',
      taskInput: { output: 'file' },
    });
    (authCtx.parse as any).mockImplementation((_schema: any, data: any) => data);

    const res = await agents.request('/api/v1/cron', { method: 'POST' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, any>;
    expect(body.data.name).toBe('daily-summary');
  });
});
