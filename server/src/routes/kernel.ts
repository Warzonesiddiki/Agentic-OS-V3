import { Hono } from 'hono';
import { z } from 'zod';
import type { NexusEnv } from '../lib/hono-env.js';
import { requireScope, safeJson, parse } from '../lib/auth-context.js';
import { ok, err } from '../lib/envelope.js';
import {
  exportKernelStateMachine,
  ringPolicyStore,
  ringBudgetStatus,
  barrierWait,
  barrierStatus,
  getHeldResources,
  parseCgroup,
  registerLifecycleHooks,
  preemptAgent,
  getGangMembers,
} from '../services/kernel.js';
import {
  getQueueLatencyPercentiles,
  getSchedulingPolicyName,
  setSchedulingPolicy,
  dryRunSchedule,
  HierarchicalScheduler,
  isDryRun,
  setDryRun,
} from '../services/scheduler.js';
import { getWorkerHealth } from '../services/task-worker.js';

export const kernelRouter = new Hono<NexusEnv>();

const hierarchical = new HierarchicalScheduler();

kernelRouter.get('/api/kernel/state-machine', async (c) => {
  await requireScope(c, 'memory:read');
  const sm = await exportKernelStateMachine();
  return c.json(ok(sm, c.get('requestId') ?? ''));
});

kernelRouter.get('/api/kernel/ring-policy', async (c) => {
  await requireScope(c, 'memory:read');
  return c.json(
    ok({ policies: [0, 1, 2, 3, 4].map((r) => ringPolicyStore.get(r)) }, c.get('requestId') ?? '')
  );
});

kernelRouter.patch('/api/kernel/ring-policy', async (c) => {
  await requireScope(c, 'brain:admin');
  const body = parse(
    z.object({
      ring: z.number().int().min(0).max(4),
      tools: z.array(z.string()).optional(),
      maxConcurrency: z.number().int().min(0).optional(),
      maxTokensPerMin: z.number().int().min(0).optional(),
      maxApiCallsPerMin: z.number().int().min(0).optional(),
    }),
    await safeJson(c)
  );
  const updated = await ringPolicyStore.set(body.ring, {
    tools: body.tools,
    maxConcurrency: body.maxConcurrency,
    maxTokensPerMin: body.maxTokensPerMin,
    maxApiCallsPerMin: body.maxApiCallsPerMin,
  });
  return c.json(ok(updated, c.get('requestId') ?? ''));
});

kernelRouter.get('/api/kernel/ring-budget', async (c) => {
  await requireScope(c, 'memory:read');
  return c.json(
    ok({ budgets: [0, 1, 2, 3, 4].map((r) => ringBudgetStatus(r)) }, c.get('requestId') ?? '')
  );
});

kernelRouter.get('/api/kernel/held-resources', async (c) => {
  await requireScope(c, 'brain:admin');
  return c.json(ok({ resources: getHeldResources() }, c.get('requestId') ?? ''));
});

kernelRouter.get('/api/kernel/barrier/:name', async (c) => {
  await requireScope(c, 'memory:read');
  const status = barrierStatus(c.req.param('name'));
  if (!status) {
    return c.json(err('NOT_FOUND', 'Barrier not found', c.get('requestId') ?? ''), 404);
  }
  return c.json(ok(status, c.get('requestId') ?? ''));
});

kernelRouter.post('/api/kernel/barrier/:name/wait', async (c) => {
  await requireScope(c, 'brain:admin');
  const name = c.req.param('name');
  const body = parse(
    z.object({
      memberId: z.string().min(1),
      timeoutMs: z.number().int().min(100).max(600000).default(30000),
      total: z.number().int().min(1).optional(),
    }),
    await safeJson(c)
  );
  await barrierWait(name, body.timeoutMs, body.memberId, body.total);
  return c.json(ok({ released: true, name }, c.get('requestId') ?? ''));
});

kernelRouter.get('/api/kernel/worker-health', async (c) => {
  await requireScope(c, 'memory:read');
  return c.json(ok(getWorkerHealth(), c.get('requestId') ?? ''));
});

kernelRouter.get('/api/kernel/cgroups', async (c) => {
  await requireScope(c, 'memory:read');
  const { db, agents } = await import('../db/client.js');
  const rows = await db.select().from(agents);
  const groups = rows.map((a) => ({
    id: a.id,
    name: a.name,
    ring: a.ring,
    cgroup: parseCgroup(a.cgroup),
  }));
  return c.json(ok({ groups }, c.get('requestId') ?? ''));
});

kernelRouter.post('/api/kernel/:id/lifecycle-hooks', async (c) => {
  await requireScope(c, 'brain:admin');
  const id = c.req.param('id');
  const body = parse(
    z.object({
      onPreempt: z.boolean().optional(),
      onResume: z.boolean().optional(),
    }),
    await safeJson(c)
  );
  registerLifecycleHooks(id, {
    onPreempt: body.onPreempt
      ? async () => {
          await preemptAgent(id);
        }
      : undefined,
    onResume: body.onResume
      ? async () => {
          /* mark agent resumed */
        }
      : undefined,
  });
  return c.json(ok({ registered: true, agentId: id }, c.get('requestId') ?? ''));
});

kernelRouter.get('/api/kernel/gang/:taskId', async (c) => {
  await requireScope(c, 'memory:read');
  const taskId = c.req.param('taskId');
  return c.json(
    ok({ primary: taskId, members: getGangMembers(taskId) }, c.get('requestId') ?? '')
  );
});

kernelRouter.get('/api/scheduler/latency', async (c) => {
  await requireScope(c, 'memory:read');
  return c.json(ok(getQueueLatencyPercentiles(), c.get('requestId') ?? ''));
});

kernelRouter.get('/api/scheduler/policy', async (c) => {
  await requireScope(c, 'memory:read');
  return c.json(
    ok({ policy: getSchedulingPolicyName(), dryRun: isDryRun() }, c.get('requestId') ?? '')
  );
});

kernelRouter.post('/api/scheduler/policy', async (c) => {
  await requireScope(c, 'brain:admin');
  const body = parse(
    z.object({
      name: z.enum(['mlfq', 'edf', 'fairshare']),
      dryRun: z.boolean().optional(),
    }),
    await safeJson(c)
  );
  setSchedulingPolicy(body.name);
  if (body.dryRun !== undefined) setDryRun(body.dryRun);
  return c.json(
    ok({ policy: getSchedulingPolicyName(), dryRun: isDryRun() }, c.get('requestId') ?? '')
  );
});

kernelRouter.get('/api/scheduler/dry-run', async (c) => {
  await requireScope(c, 'brain:admin');
  const result = await dryRunSchedule(Number(c.req.query('limit') ?? 100));
  return c.json(ok(result, c.get('requestId') ?? ''));
});

kernelRouter.post('/api/scheduler/hierarchical/team', async (c) => {
  await requireScope(c, 'brain:admin');
  const body = parse(
    z.object({
      teamId: z.string().min(1),
      timeBudgetMs: z.number().int().min(1000),
      weight: z.number().int().min(1).default(1),
    }),
    await safeJson(c)
  );
  hierarchical.enroll(body.teamId, body.timeBudgetMs, body.weight);
  return c.json(ok(hierarchical.list(), c.get('requestId') ?? ''));
});

kernelRouter.get('/api/scheduler/hierarchical', async (c) => {
  await requireScope(c, 'memory:read');
  return c.json(ok(hierarchical.list(), c.get('requestId') ?? ''));
});
