/** Governed R1 routes. These handlers depend only on the R1 service boundary. */
import { Hono } from 'hono';
import {
  parseActionReceipt,
  parseProject,
  parseTask,
  toR1ApiError,
} from '@agentic-os/sdk';
import { requireScope, fail } from '../lib/auth-context.js';
import { ApiError } from '../lib/errors.js';
import type { NexusEnv } from '../lib/hono-env.js';
import type { R1Runtime } from '../services/r1-runtime.js';

/**
 * R1 task records contain operational metadata and therefore are never public.
 * The router enforces the existing read/write scopes before every operation;
 * task submissions additionally bind the immutable principalId to the caller.
 */
export function createR1Router(runtime: R1Runtime): Hono<NexusEnv> {
  const router = new Hono<NexusEnv>();
  router.onError((error, context) => fail(context, error));

  router.get('/projects/:projectId', async (c) => {
    await requireScope(c, 'memory:read');
    const result = await runtime.service.inspectProject(c.req.param('projectId'));
    if (!result) return c.json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } }, 404);
    return c.json(result, 200);
  });

  router.post('/projects', async (c) => {
    try {
      await requireScope(c, 'memory:write');
      const project = parseProject(await c.req.json());
      const created = await runtime.service.initializeProject(project);
      return c.json(created, 201);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const apiError = toR1ApiError(error);
      return c.json({ error: apiError }, 400);
    }
  });

  router.get('/projects/:projectId/tasks', async (c) => {
    try {
      await requireScope(c, 'memory:read');
      return c.json({ tasks: await runtime.service.listTasks(c.req.param('projectId')) }, 200);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const apiError = toR1ApiError(error);
      return c.json({ error: apiError }, apiError.code === 'PROJECT_NOT_FOUND' ? 404 : 400);
    }
  });

  router.get('/projects/:projectId/tasks/:taskId', async (c) => {
    await requireScope(c, 'memory:read');
    const task = await runtime.service.getTask(c.req.param('projectId'), c.req.param('taskId'));
    if (!task) return c.json({ error: { code: 'TASK_NOT_FOUND', message: 'Task not found.' } }, 404);
    return c.json(task, 200);
  });

  router.get('/projects/:projectId/tasks/:taskId/events', async (c) => {
    try {
      await requireScope(c, 'memory:read');
      const events = await runtime.service.listTaskEvents(c.req.param('projectId'), c.req.param('taskId'));
      return c.json({ events }, 200);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const apiError = toR1ApiError(error);
      return c.json({ error: apiError }, apiError.code === 'TASK_NOT_FOUND' ? 404 : 400);
    }
  });

  router.post('/projects/:projectId/tasks', async (c) => {
    try {
      const principal = await requireScope(c, 'memory:write');
      const task = parseTask(await c.req.json());
      if (task.projectId !== c.req.param('projectId') || task.principalId !== principal.id) {
        return c.json({ error: { code: 'PROJECT_SCOPE_VIOLATION', message: 'Resource is outside the project scope.' } }, 403);
      }
      const created = await runtime.service.createTask(task);
      return c.json(created, 201);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const apiError = toR1ApiError(error);
      return c.json({ error: apiError }, 400);
    }
  });

  router.post('/projects/:projectId/receipts', async (c) => {
    try {
      await requireScope(c, 'memory:write');
      const receipt = parseActionReceipt(await c.req.json());
      if (receipt.projectId !== c.req.param('projectId')) {
        return c.json({ error: { code: 'PROJECT_SCOPE_VIOLATION', message: 'Resource is outside the project scope.' } }, 403);
      }
      const created = await runtime.service.appendActionReceipt(receipt.projectId, receipt);
      return c.json(created, 201);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const apiError = toR1ApiError(error);
      return c.json({ error: apiError }, 400);
    }
  });

  router.get('/projects/:projectId/tasks/:taskId/receipts', async (c) => {
    await requireScope(c, 'memory:read');
    const receipts = await runtime.service.listTaskReceipts(c.req.param('projectId'), c.req.param('taskId'));
    return c.json({ receipts }, 200);
  });

  return router;
}

