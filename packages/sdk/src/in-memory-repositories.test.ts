import { describe, expect, it } from 'vitest';
import { InMemoryR1Repositories, RepositoryError } from './in-memory-repositories';
import type { Project, Task } from './r1-types';

const project = (id: string): Project => ({
  id,
  name: `project-${id.slice(0, 4)}`,
  mode: 'local',
  scope: { root: `/tmp/${id}` },
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

const task = (id: string, projectId: string, idempotencyKey: string): Task => ({
  id,
  projectId,
  state: 'queued',
  title: 'Inspect repository',
  correlationId: '66666666-6666-4666-8666-666666666666',
  idempotencyKey,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

describe('InMemoryR1Repositories', () => {
  it('returns the original task for duplicate idempotency keys within a project', async () => {
    const repositories = new InMemoryR1Repositories();
    const projectId = '44444444-4444-4444-8444-444444444444';
    await repositories.projects.create(project(projectId));

    const first = await repositories.tasks.create(task(
      '55555555-5555-4555-8555-555555555555', projectId, 'request-1',
    ));
    const duplicate = await repositories.tasks.create(task(
      '77777777-7777-4777-8777-777777777777', projectId, 'request-1',
    ));

    expect(duplicate).toEqual(first);
    expect(await repositories.tasks.list(projectId)).toHaveLength(1);
  });

  it('keeps task reads isolated between projects', async () => {
    const repositories = new InMemoryR1Repositories();
    const projectA = '44444444-4444-4444-8444-444444444444';
    const projectB = '88888888-8888-4888-8888-888888888888';
    await repositories.projects.create(project(projectA));
    await repositories.projects.create(project(projectB));
    await repositories.tasks.create(task(
      '55555555-5555-4555-8555-555555555555', projectA, 'request-1',
    ));

    await expect(repositories.tasks.get(projectB, '55555555-5555-4555-8555-555555555555'))
      .rejects.toMatchObject({ code: 'PROJECT_SCOPE_VIOLATION' });
    await expect(repositories.tasks.list(projectB)).resolves.toHaveLength(0);
  });

  it('uses stable safe errors for missing resources', async () => {
    const repositories = new InMemoryR1Repositories();
    await expect(repositories.tasks.update(task(
      '55555555-5555-4555-8555-555555555555',
      '44444444-4444-4444-8444-444444444444',
      'request-1',
    ))).rejects.toBeInstanceOf(RepositoryError);
  });
});
