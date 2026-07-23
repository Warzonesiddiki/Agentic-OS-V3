import { describe, expect, it } from 'vitest';
import { InMemoryR1Repositories } from './in-memory-repositories.js';
import { TaskWorker, createInMemoryTaskWorkerDeps } from './r1-task-worker.js';
import type { Project, Task } from './r1-types.js';

const project: Project = {
  id: '11111111-1111-4111-8111-111111111111', name: 'worker', mode: 'local', scope: {},
  createdAt: '2026-07-24T00:00:00.000Z', updatedAt: '2026-07-24T00:00:00.000Z',
};
const task: Task = {
  id: '22222222-2222-4222-8222-222222222222', projectId: project.id, state: 'queued', title: 'task',
  principalId: 'principal', agentId: 'agent', goal: 'goal', capabilityIds: [], policyVersion: 'v1', inputReference: 'input',
  correlationId: '33333333-3333-4333-8333-333333333333', idempotencyKey: 'task-1',
  createdAt: project.createdAt, updatedAt: project.updatedAt,
};

describe('TaskWorker durable boundaries', () => {
  it('detects an already-executed step only within its project and task scope', async () => {
    const repositories = new InMemoryR1Repositories();
    await repositories.projects.create(project);
    await repositories.tasks.create(task);
    const deps = createInMemoryTaskWorkerDeps();
    const worker = new TaskWorker(repositories, deps.checkpoints, deps.leases, deps.compensations);
    const correlationId = '44444444-4444-4444-8444-444444444444';
    await repositories.receipts.append({
      id: '55555555-5555-4555-8555-555555555555', projectId: project.id, correlationId,
      kind: 'tool_call', actor: 'agent', decision: 'allow',
      payload: { taskId: task.id, stepId: 'write-token' }, createdAt: project.createdAt,
    });

    await expect(worker.isStepAlreadyExecuted(project.id, task.id, 'write-token', correlationId)).resolves.toBe(true);
    await expect(worker.isStepAlreadyExecuted(project.id, task.id, 'other-step', correlationId)).resolves.toBe(false);
    await expect(worker.isStepAlreadyExecuted(project.id, task.id, 'write-token', task.correlationId)).resolves.toBe(false);
  });

  it('runs a compensation stored through the typed repository contract', async () => {
    const repositories = new InMemoryR1Repositories();
    await repositories.projects.create(project);
    await repositories.tasks.create(task);
    const deps = createInMemoryTaskWorkerDeps();
    const worker = new TaskWorker(repositories, deps.checkpoints, deps.leases, deps.compensations);
    const compensation = await worker.createCompensation(project.id, task.id, 'step-1', 'revert write');
    let executed = false;

    await expect(worker.runCompensation(project.id, compensation.id, async () => { executed = true; }))
      .resolves.toMatchObject({ id: compensation.id, state: 'completed' });
    expect(executed).toBe(true);
  });
});
