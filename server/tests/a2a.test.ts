/**
 * a2a.test.ts — Integration & Unit Tests for Google Gemini CLI A2A Inter-Agent Protocol Server
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/client.js', () => ({
  db: {
    transaction: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../src/lib/audit.js', () => ({
  appendAudit: vi.fn().mockResolvedValue({
    id: 'mock-audit-id',
    sequence: 1,
    actor: 'test-actor',
    action: 'a2a.test',
    payload: null,
    prevHash: '0'.repeat(64),
    entryHash: 'a'.repeat(64),
    createdAt: new Date(),
  }),
}));

vi.mock('../src/services/agent-runtime.js', () => ({
  runAgent: vi.fn().mockResolvedValue({
    ok: true,
    answer: 'Completed remote task successfully',
    steps: [
      {
        iteration: 0,
        thought: 'Analyzed goal',
        tool: 'finish',
        toolInput: { answer: 'Completed remote task successfully' },
        toolOutput: { done: true },
      },
    ],
    iterations: 1,
    tokensUsed: 150,
  }),
}));

import { createApp } from '../src/app.js';
import {
  getAgentCard,
  verifyBearerToken,
  computeSignature,
  verifyRequestSignature,
  A2ATaskManager,
  type A2ATaskEvent,
} from '@agentic-os/a2a-server';

describe('Google Gemini A2A Protocol Server Integration', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  it('GET /.well-known/agent.json returns standard Google A2A AgentCard', async () => {
    const res = await app.request('/.well-known/agent.json');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReturnType<typeof getAgentCard>;
    expect(body.name).toBeDefined();
    expect(body.protocolVersion).toBe('0.3.0');
    expect(body.capabilities.streaming).toBe(true);
    expect(Array.isArray(body.skills)).toBe(true);
    expect(body.skills.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/a2a/agents lists local agent capabilities', async () => {
    const res = await app.request('/api/v1/a2a/agents');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { agents: Array<{ id: string }> } };
    expect(body.ok).toBe(true);
    expect(body.data.agents[0]?.id).toBe('nexus-primary-agent');
  });

  it('POST /api/v1/a2a/tasks creates an A2A task and triggers execution', async () => {
    const res = await app.request('/api/v1/a2a/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: 'Perform security scan of codebase',
        input: { depth: 'full' },
        actor: 'remote-test-agent',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; data: { taskId: string; status: string } };
    expect(body.ok).toBe(true);
    expect(body.data.taskId).toBeDefined();
    expect(['pending', 'running', 'completed']).toContain(body.data.status);
  });

  it('GET /api/v1/a2a/tasks/:id returns status of created task', async () => {
    const createRes = await app.request('/api/v1/a2a/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: 'Query memory indices',
        actor: 'peer-agent',
      }),
    });

    const createBody = (await createRes.json()) as { ok: boolean; data: { taskId: string } };
    const taskId = createBody.data.taskId;

    const res = await app.request(`/api/v1/a2a/tasks/${taskId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { id: string; goal: string } };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(taskId);
    expect(body.data.goal).toBe('Query memory indices');
  });

  it('GET /api/v1/a2a/tasks/:id/stream initializes SSE event stream', async () => {
    const createRes = await app.request('/api/v1/a2a/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: 'Stream progress test task',
        actor: 'stream-agent',
      }),
    });

    const createBody = (await createRes.json()) as { ok: boolean; data: { taskId: string } };
    const taskId = createBody.data.taskId;

    const res = await app.request(`/api/v1/a2a/tasks/${taskId}/stream`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('verifies Bearer token auth logic correctly', () => {
    expect(verifyBearerToken(undefined, undefined).valid).toBe(true);
    expect(verifyBearerToken('Bearer secret123', 'secret123').valid).toBe(true);
    expect(verifyBearerToken('Bearer invalid', 'secret123').valid).toBe(false);
  });

  it('verifies SHA-256 HMAC request signature verification correctly', () => {
    const payload = { goal: 'test' };
    const secret = 'super-secret';
    const sig = computeSignature(payload, secret);

    expect(verifyRequestSignature(payload, sig, secret).valid).toBe(true);
    expect(verifyRequestSignature(payload, 'wrong-sig', secret).valid).toBe(false);
  });

  it('TaskManager creates, updates, and notifies task events', async () => {
    const manager = new A2ATaskManager();
    const task = manager.createTask({ goal: 'Subtask delegation' });
    expect(task.status).toBe('pending');

    const events: string[] = [];
    manager.subscribe(task.id, (evt: A2ATaskEvent) => {
      events.push(evt.type);
    });

    manager.updateTaskStatus(task.id, 'running');
    manager.addLog(task.id, 'Executing subtask step 1');
    manager.updateTaskStatus(task.id, 'completed', undefined, { success: true });

    expect(events).toContain('task.log');
    expect(events).toContain('task.completed');
  });
});
