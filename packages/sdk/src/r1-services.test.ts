import { describe, expect, it } from 'vitest';
import { InMemoryR1Repositories } from './in-memory-repositories';
import { R1Service, R1ServiceError, toR1ApiError } from './r1-services';
import type { Project, Task } from './r1-types';

const project: Project = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'demo',
  mode: 'local',
  scope: { root: '/tmp/demo' },
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const task: Task = {
  id: '55555555-5555-4555-8555-555555555555',
  projectId: project.id,
  state: 'queued',
  title: 'Inspect',
  correlationId: '66666666-6666-4666-8666-666666666666',
  idempotencyKey: 'request-1',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

describe('R1Service', () => {
  it('initializes idempotently and reports project status', async () => {
    const repositories = new InMemoryR1Repositories();
    const service = new R1Service(repositories);
    const first = await service.initializeProject({ ...project, idempotencyKey: 'project-1' });
    const second = await service.initializeProject({
      ...project,
      id: '88888888-8888-4888-8888-888888888888',
      idempotencyKey: 'project-1',
    });
    expect(second.id).toBe(first.id);
    await expect(service.inspectProject(project.id)).resolves.toMatchObject({
      status: { mode: 'local', storageHealthy: true, syncState: 'disabled' },
    });
  });

  it('owns task creation and state transitions', async () => {
    const repositories = new InMemoryR1Repositories();
    const service = new R1Service(repositories, { now: () => '2026-07-21T00:00:00.000Z' });
    await service.initializeProject(project);
    await service.createTask(task);

    const transitioned = await service.transitionTask(project.id, task.id, 'admit');
    expect(transitioned.state).toBe('running');
    expect(transitioned.updatedAt).toBe('2026-07-21T00:00:00.000Z');
  });

  it('returns stable service errors for missing project/task', async () => {
    const service = new R1Service(new InMemoryR1Repositories());
    await expect(service.createTask(task)).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
    await expect(service.transitionTask(project.id, task.id, 'admit'))
      .rejects.toBeInstanceOf(R1ServiceError);
  });

  it('maps known and unknown failures to safe stable API errors', () => {
    expect(toR1ApiError(new R1ServiceError('TASK_NOT_FOUND', 'internal details'))).toEqual({
      code: 'TASK_NOT_FOUND', message: 'internal details',
    });
    expect(toR1ApiError(new Error('database password leaked'))).toEqual({
      code: 'R1_INTERNAL_ERROR', message: 'The R1 operation could not be completed.',
    });
  });

  it('appends receipts only within the requested project scope', async () => {
    const repositories = new InMemoryR1Repositories();
    const service = new R1Service(repositories);
    const receipt = {
      id: '77777777-7777-4777-8777-777777777777',
      projectId: project.id,
      kind: 'tool_call' as const,
      correlationId: task.correlationId,
      actor: 'agent',
      decision: 'allow' as const,
      payload: { taskId: task.id },
      createdAt: new Date(0).toISOString(),
    };
    await expect(service.appendActionReceipt(project.id, receipt)).resolves.toEqual(receipt);
    await expect(service.appendActionReceipt('88888888-8888-4888-8888-888888888888', receipt))
      .rejects.toMatchObject({ code: 'PROJECT_SCOPE_VIOLATION' });
  });

  it('rejects evidence from another project', async () => {
    const service = new R1Service(new InMemoryR1Repositories());
    await expect(service.appendEvidence(project.id, {
      id: '77777777-7777-4777-8777-777777777777',
      projectId: '88888888-8888-4888-8888-888888888888',
      kind: 'trace',
      source: 'worker',
      contentHash: 'a'.repeat(64),
      metadata: {},
      createdAt: new Date(0).toISOString(),
    })).rejects.toMatchObject({ code: 'PROJECT_SCOPE_VIOLATION' });
  });
});
