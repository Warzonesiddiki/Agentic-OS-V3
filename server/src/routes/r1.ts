/** Governed R1 routes. These handlers depend only on the R1 service boundary. */
import { Hono } from 'hono';
import {
  CapabilityPolicySchema,
  CapabilityRequestSchema,
  GovernedCapabilitySchema,
  parseActionReceipt,
  parseEvidence,
  parseProvenanceMemory,
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

  router.get('/projects/:projectId/memories', async (c) => {
    await requireScope(c, 'memory:read');
    return c.json({ memories: await runtime.service.listProvenanceMemories(c.req.param('projectId')) }, 200);
  });

  router.post('/projects/:projectId/memories', async (c) => {
    try {
      const principal = await requireScope(c, 'memory:write');
      const memory = parseProvenanceMemory(await c.req.json());
      if (memory.projectId !== c.req.param('projectId')) {
        return c.json({ error: { code: 'PROJECT_SCOPE_VIOLATION', message: 'Resource is outside the project scope.' } }, 403);
      }
      const provenanceAgent = memory.metadata.provenance.agentId;
      if (provenanceAgent !== undefined && provenanceAgent !== principal.id) {
        return c.json({ error: { code: 'PROJECT_SCOPE_VIOLATION', message: 'Resource is outside the project scope.' } }, 403);
      }
      return c.json(await runtime.service.saveProvenanceMemory(memory), 201);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const apiError = toR1ApiError(error);
      const status = apiError.code === 'PROJECT_NOT_FOUND' ? 404
        : apiError.code === 'PROJECT_SCOPE_VIOLATION' ? 403 : 400;
      return c.json({ error: apiError }, status);
    }
  });

  // Governed evidence append/list: the provenance chain (E2-S1) requires
  // verifyable in-scope evidence before any memory may reference it (E5-S1).
  router.post('/projects/:projectId/evidence', async (c) => {
    try {
      await requireScope(c, 'memory:write');
      const evidence = parseEvidence(await c.req.json());
      if (evidence.projectId !== c.req.param('projectId')) {
        return c.json({ error: { code: 'PROJECT_SCOPE_VIOLATION', message: 'Resource is outside the project scope.' } }, 403);
      }
      return c.json(await runtime.service.appendEvidence(evidence.projectId, evidence), 201);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const apiError = toR1ApiError(error);
      return c.json({ error: apiError }, apiError.code === 'PROJECT_NOT_FOUND' ? 404 : 400);
    }
  });

  router.get('/projects/:projectId/evidence', async (c) => {
    await requireScope(c, 'memory:read');
    return c.json({ evidence: await runtime.repositories.evidence.listForProject(c.req.param('projectId')) }, 200);
  });

  router.delete('/projects/:projectId/memories/:memoryId', async (c) => {
    const principal = await requireScope(c, 'memory:write');
    // The deleting principal becomes the accountable actor on the lifecycle receipt.
    await runtime.service.archiveMemory(c.req.param('projectId'), c.req.param('memoryId'), principal.id);
    return c.body(null, 204);
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

  router.post('/capabilities', async (c) => {
    await requireScope(c, 'brain:admin');
    return c.json(await runtime.governance.register(GovernedCapabilitySchema.parse(await c.req.json())), 201);
  });

  router.put('/capability-policy', async (c) => {
    await requireScope(c, 'brain:admin');
    return c.json(await runtime.governance.setActivePolicy(CapabilityPolicySchema.parse(await c.req.json())), 200);
  });

  router.post('/capability-policy/evaluate', async (c) => {
    await requireScope(c, 'memory:read');
    return c.json(await runtime.governance.evaluate(CapabilityRequestSchema.parse(await c.req.json())), 200);
  });

  // E1-S3 — schema-versioned project export / import dry-run / atomic apply.
  router.get('/projects/:projectId/export', async (c) => {
    await requireScope(c, 'memory:read');
    const bundle = await runtime.transfer.exportProject(c.req.param('projectId'), {
      omitReceiptPayloads: c.req.query('omitReceiptPayloads') === 'true',
    });
    if (!bundle) return c.json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } }, 404);
    return c.json(bundle, 200);
  });

  router.post('/projects/import/dry-run', async (c) => {
    await requireScope(c, 'memory:write');
    // A dry run is an inspection: the report is the answer even when the
    // candidate is rejected, so the endpoint always responds 200.
    return c.json(await runtime.transfer.dryRunImport(await c.req.json()), 200);
  });

  router.post('/projects/import', async (c) => {
    await requireScope(c, 'brain:admin');
    const result = await runtime.applyProjectImport(await c.req.json());
    if (result.applied) return c.json(result, 200);
    const status = result.plan.rejected.length > 0 ? 400 : 409;
    return c.json(result, status);
  });

  return router;
}

