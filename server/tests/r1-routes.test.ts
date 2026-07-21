import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { InMemoryR1Repositories } from '@agentic-os/sdk';
import { createR1Router } from '../src/routes/r1.js';
import { createR1Runtime } from '../src/services/r1-runtime.js';

const project = {
  id: '44444444-4444-4444-8444-444444444444', name: 'demo', mode: 'local',
  scope: { root: '/tmp/demo' }, idempotencyKey: 'project-1',
  createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
};

const task = {
  id: '55555555-5555-4555-8555-555555555555', projectId: project.id,
  state: 'queued', title: 'Inspect', correlationId: '66666666-6666-4666-8666-666666666666',
  idempotencyKey: 'request-1', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
};

describe('governed R1 routes', () => {
  const createApp = () => {
    const app = new Hono();
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
