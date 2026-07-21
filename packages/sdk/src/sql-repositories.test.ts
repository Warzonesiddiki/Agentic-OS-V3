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

  it('does not expose a fallback adapter for a missing SQL row', async () => {
    const executor: SqlExecutor = { async query<T extends object>(): Promise<readonly T[]> { return []; } };
    const repositories = createSqlR1Repositories(executor);
    await expect(repositories.projects.get(project.id)).resolves.toBeNull();
    await expect(repositories.tasks.get(project.id, '55555555-5555-4555-8555-555555555555'))
      .resolves.toBeNull();
  });
});
