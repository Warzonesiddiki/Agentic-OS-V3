import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = [
  readFileSync(new URL('../src/db/migrations/0049_r1_contracts.sqlite.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/db/migrations/0050_r1_durable_task_metadata.sqlite.sql', import.meta.url), 'utf8'),
].join('\n');

const project = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'restart-demo',
  mode: 'local',
  scope: '{}',
  idempotencyKey: 'restart-project',
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
};

describe('local R1 persistence restart', () => {
  it('persists project/task state after closing and reopening SQLite', () => {
    const directory = mkdtempSync(join(tmpdir(), 'agentic-r1-'));
    const databasePath = join(directory, 'r1.db');
    try {
      const first = new DatabaseSync(databasePath);
      first.exec('PRAGMA foreign_keys = ON');
      first.exec(migration);
      first.prepare('INSERT INTO projects (id,name,mode,scope,idempotency_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
        .run(project.id, project.name, project.mode, project.scope, project.idempotencyKey, project.createdAt, project.updatedAt);
      first.prepare('INSERT INTO r1_tasks (id,project_id,state,title,correlation_id,idempotency_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
        .run('55555555-5555-4555-8555-555555555555', project.id, 'queued', 'restart task', '66666666-6666-4666-8666-666666666666', 'task-1', project.createdAt, project.updatedAt);
      first.close();

      const reopened = new DatabaseSync(databasePath);
      const persistedProject = reopened.prepare('SELECT id, name FROM projects WHERE id = ?').get(project.id) as { id: string; name: string } | undefined;
      const persistedTask = reopened.prepare('SELECT project_id AS projectId, state FROM r1_tasks WHERE id = ?').get('55555555-5555-4555-8555-555555555555') as { projectId: string; state: string } | undefined;
      expect(persistedProject).toEqual({ id: project.id, name: project.name });
      expect(persistedTask).toEqual({ projectId: project.id, state: 'queued' });
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
