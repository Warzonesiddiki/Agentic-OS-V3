import { describe, expect, it } from 'vitest';
import { createSqlR1Repositories, type SqlExecutor } from './sql-repositories';

const project = {
  id: '44444444-4444-4444-8444-444444444444', name: 'demo', mode: 'local' as const,
  scope: { root: '/tmp/demo' }, idempotencyKey: 'project-1',
  createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
};

describe('SQL R1 repository adapter', () => {
  it('uses parameterized queries and exposes every R1 repository', async () => {
    const calls: Array<{ statement: string; parameters: readonly unknown[] }> = [];
    const executor: SqlExecutor = {
      async query<T extends object>(statement: string, parameters: readonly unknown[] = []): Promise<readonly T[]> {
        calls.push({ statement, parameters });
        if (statement.startsWith('SELECT id, name, mode')) return [project as T];
        return [];
      },
    };
    const repositories = createSqlR1Repositories(executor);
    expect(Object.keys(repositories).sort()).toEqual([
      'approvals', 'capabilities', 'evidence', 'memories', 'projects', 'receipts', 'tasks',
    ]);
    await expect(repositories.projects.get(project.id)).resolves.toEqual(project);
    expect(calls[0]?.statement).toContain('WHERE id = $1');
    expect(calls[0]?.parameters).toEqual([project.id]);
  });

  it('uses an atomic idempotent task insert instead of a read-then-insert race', async () => {
    const calls: string[] = [];
    const existingTask = {
      id: '55555555-5555-4555-8555-555555555555', projectId: project.id,
      state: 'running' as const, title: 'original', principalId: 'principal-test', agentId: 'agent-test', goal: 'durable test goal', capabilityIds: [], policyVersion: 'r1', inputReference: 'input:test', correlationId: 'corr-1',
      idempotencyKey: 'task-1', createdAt: project.createdAt, updatedAt: project.updatedAt,
    };
    const executor: SqlExecutor = {
      async query<T extends object>(statement: string): Promise<readonly T[]> {
        calls.push(statement);
        if (statement.startsWith('INSERT INTO r1_tasks')) return [existingTask as T];
        return [];
      },
    };
    const repositories = createSqlR1Repositories(executor);
    await expect(repositories.tasks.create({
      ...existingTask, id: 'different-id', title: 'duplicate submission',
    })).resolves.toEqual(existingTask);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('ON CONFLICT (project_id, idempotency_key)');
  });

  it('does not expose a fallback adapter for a missing SQL row', async () => {
    const executor: SqlExecutor = { async query<T extends object>(): Promise<readonly T[]> { return []; } };
    const repositories = createSqlR1Repositories(executor);
    await expect(repositories.projects.get(project.id)).resolves.toBeNull();
    await expect(repositories.tasks.get(project.id, '55555555-5555-4555-8555-555555555555'))
      .resolves.toBeNull();
  });
});
