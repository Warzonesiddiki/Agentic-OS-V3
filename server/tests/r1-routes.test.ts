import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { InMemoryR1Repositories } from '@agentic-os/sdk';
import type { Principal } from '../src/lib/security.js';
import type { NexusEnv } from '../src/lib/hono-env.js';
import { createR1Router } from '../src/routes/r1.js';
import { createR1Runtime } from '../src/services/r1-runtime.js';

const project = {
  id: '44444444-4444-4444-8444-444444444444', name: 'demo', mode: 'local',
  scope: { root: '/tmp/demo' }, idempotencyKey: 'project-1',
  createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
};

const task = {
  id: '55555555-5555-4555-8555-555555555555', projectId: project.id,
  state: 'queued', title: 'Inspect', principalId: 'principal-test', agentId: 'agent-test', goal: 'durable test goal', capabilityIds: [], policyVersion: 'r1', inputReference: 'input:test', correlationId: '66666666-6666-4666-8666-666666666666',
  idempotencyKey: 'request-1', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
};

const principal: Principal = {
  id: 'principal-test',
  name: 'R1 route test',
  keyHash: 'not-used-in-unit-test',
  scopes: ['memory:read', 'memory:write'],
  status: 'active',
};

describe('governed R1 routes', () => {
  const createApp = (authenticated = true) => {
    const app = new Hono<NexusEnv>();
    if (authenticated) {
      app.use('*', async (c, next) => {
        c.set('principal', principal);
        await next();
      });
    }
    app.route('/api/v1/r1', createR1Router(createR1Runtime(new InMemoryR1Repositories())));
    return app;
  };

  it('creates and inspects a project through the service boundary', async () => {
    const app = createApp();
    const create = await app.request('/api/v1/r1/projects', {
      method: 'POST', body: JSON.stringify(project), headers: { 'content-type': 'application/json' },
    });
    expect(create.status).toBe(201);
    const inspect = await app.request(`/api/v1/r1/projects/${project.id}`);
    expect(inspect.status).toBe(200);
    await expect(inspect.json()).resolves.toMatchObject({ status: { mode: 'local' } });
  });

  it('creates a queued task and exposes scoped list/detail event views', async () => {
    const app = createApp();
    await app.request('/api/v1/r1/projects', {
      method: 'POST', body: JSON.stringify(project), headers: { 'content-type': 'application/json' },
    });
    const create = await app.request(`/api/v1/r1/projects/${project.id}/tasks`, {
      method: 'POST', body: JSON.stringify(task), headers: { 'content-type': 'application/json' },
    });
    expect(create.status).toBe(201);
    await expect(create.json()).resolves.toMatchObject({
      id: task.id, state: 'queued', correlationId: task.correlationId, goal: task.goal,
    });
    const listed = await app.request(`/api/v1/r1/projects/${project.id}/tasks`);
    await expect(listed.json()).resolves.toMatchObject({ tasks: [expect.objectContaining({ id: task.id })] });
    const events = await app.request(`/api/v1/r1/projects/${project.id}/tasks/${task.id}/events`);
    await expect(events.json()).resolves.toMatchObject({
      events: [expect.objectContaining({ event: 'created', sequence: 0 })],
    });
  });

  it('appends a validated receipt through the governed route', async () => {
    const app = createApp();
    const receipt = {
      id: '77777777-7777-4777-8777-777777777777', projectId: project.id,
      kind: 'tool_call', correlationId: task.correlationId, actor: 'agent',
      decision: 'allow', payload: { taskId: task.id }, createdAt: new Date(0).toISOString(),
    };
    const response = await app.request(`/api/v1/r1/projects/${project.id}/receipts`, {
      method: 'POST', body: JSON.stringify(receipt), headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ id: receipt.id, projectId: project.id });
  });

  it('rejects unauthenticated reads and principal impersonation', async () => {
    const unauthenticated = createApp(false);
    expect((await unauthenticated.request(`/api/v1/r1/projects/${project.id}`)).status).toBe(401);

    const app = createApp();
    const response = await app.request(`/api/v1/r1/projects/${project.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ ...task, principalId: 'another-principal' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(403);
  });

  it('rejects cross-project task payloads before service mutation', async () => {
    const app = createApp();
    const response = await app.request('/api/v1/r1/projects/88888888-8888-4888-8888-888888888888/tasks', {
      method: 'POST', body: JSON.stringify(task), headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PROJECT_SCOPE_VIOLATION' },
    });
  });
});
