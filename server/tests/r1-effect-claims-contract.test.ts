import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { SqlEffectClaimStore, type SqlExecutor } from '@agentic-os/sdk';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as new (filename: string) => SQLiteDatabase;
type PGliteInstance = InstanceType<typeof PGlite>;

const sqliteMigrations = [
  readFileSync(new URL('../src/db/migrations/0049_r1_contracts.sqlite.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/db/migrations/0054_r1_effect_claims.sqlite.sql', import.meta.url), 'utf8'),
].join('\n');

const postgresBaseSchema = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'active',
  memory_count INTEGER NOT NULL DEFAULT 0,
  skill_count INTEGER NOT NULL DEFAULT 0,
  token_footprint INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
const postgresMigrations = [
  readFileSync(new URL('../src/db/migrations/0049_r1_contracts.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/db/migrations/0054_r1_effect_claims.sql', import.meta.url), 'utf8'),
];
const createdAt = '2026-07-24T00:00:00.000Z';

interface ClaimHarness {
  readonly engine: 'sqlite' | 'pglite';
  readonly executor: SqlExecutor;
  execute(statement: string): Promise<void>;
  close(): Promise<void>;
}

function translateSqliteStatement(
  statement: string,
  parameters: readonly unknown[],
): { statement: string; parameters: unknown[] } {
  const translatedParameters: unknown[] = [];
  const translatedStatement = statement.replace(/\$(\d+)/gu, (_placeholder, rawPosition: string) => {
    const position = Number(rawPosition) - 1;
    if (!Number.isSafeInteger(position) || position < 0 || position >= parameters.length) {
      throw new Error(`SQL placeholder $${rawPosition} has no matching parameter`);
    }
    translatedParameters.push(parameters[position]);
    return '?';
  });
  return { statement: translatedStatement, parameters: translatedParameters };
}

function sqliteHarness(): ClaimHarness {
  const db: SQLiteDatabase = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(sqliteMigrations);
  return {
    engine: 'sqlite',
    executor: {
      async query<T extends object>(statement: string, parameters: readonly unknown[] = []) {
        const translated = translateSqliteStatement(statement, parameters);
        const prepared = db.prepare(translated.statement);
        if (prepared.reader) return prepared.all(...translated.parameters) as T[];
        prepared.run(...translated.parameters as never[]);
        return [];
      },
    },
    execute: async (statement) => { db.exec(statement); },
    close: async () => { db.close(); },
  };
}

async function pgliteHarness(): Promise<ClaimHarness> {
  const db: PGliteInstance = new PGlite();
  await db.exec(postgresBaseSchema);
  for (const migration of postgresMigrations) await db.exec(migration);
  return {
    engine: 'pglite',
    executor: {
      async query<T extends object>(statement: string, parameters: readonly unknown[] = []) {
        return (await db.query<T>(statement, [...parameters])).rows;
      },
    },
    execute: async (statement) => { await db.exec(statement); },
    close: async () => { await db.close(); },
  };
}

async function seedScope(harness: ClaimHarness) {
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const taskId = randomUUID();
  const otherTaskId = randomUUID();
  const secondTaskId = randomUUID();
  for (const [id, name] of [[projectId, 'claim-primary'], [otherProjectId, 'claim-other']] as const) {
    await harness.executor.query(
      'INSERT INTO projects (id, name, created_at, updated_at) VALUES ($1,$2,$3,$4)',
      [id, `${name}-${randomUUID()}`, createdAt, createdAt],
    );
  }
  for (const [id, owner, key] of [
    [taskId, projectId, `claim-${randomUUID()}`],
    [secondTaskId, projectId, `claim-${randomUUID()}`],
    [otherTaskId, otherProjectId, `claim-${randomUUID()}`],
  ] as const) {
    await harness.executor.query(
      `INSERT INTO r1_tasks
       (id, project_id, state, title, correlation_id, idempotency_key, created_at, updated_at)
       VALUES ($1,$2,'running','effect claim contract',$3,$4,$5,$5)`,
      [id, owner, randomUUID(), key, createdAt],
    );
  }
  return { projectId, otherProjectId, taskId, otherTaskId, secondTaskId };
}

async function assertAtomicClaimContract(harness: ClaimHarness): Promise<void> {
  const scope = await seedScope(harness);
  const correlationId = randomUUID();
  const input = {
    projectId: scope.projectId,
    taskId: scope.taskId,
    correlationId,
    operation: 'controlled-effect',
    createdAt,
  };
  const contenders = await Promise.all(
    Array.from({ length: 24 }, () => new SqlEffectClaimStore(harness.executor).claim(input)),
  );
  expect(contenders.filter((result) => result.acquired)).toHaveLength(1);
  expect(contenders.every((result) => result.claim.state === 'claimed')).toBe(true);

  const restartedStore = new SqlEffectClaimStore(harness.executor);
  await expect(restartedStore.claim(input)).resolves.toMatchObject({ acquired: false, claim: input });
  await expect(restartedStore.claim({ ...input, operation: 'other-effect' }))
    .resolves.toMatchObject({ acquired: true });
  await expect(restartedStore.claim({ ...input, taskId: scope.secondTaskId }))
    .resolves.toMatchObject({ acquired: true });
  await expect(restartedStore.claim({
    ...input,
    projectId: scope.otherProjectId,
    taskId: scope.otherTaskId,
  })).resolves.toMatchObject({ acquired: true });

  const completedAt = '2026-07-24T00:01:00.000Z';
  await expect(restartedStore.complete({ ...input, completedAt })).resolves.toMatchObject({
    ...input,
    state: 'completed',
    completedAt,
  });
  await expect(restartedStore.complete({ ...input, completedAt }))
    .rejects.toThrow('not found or already completed');
  await expect(restartedStore.complete({
    ...input,
    projectId: scope.otherProjectId,
    completedAt,
  })).rejects.toThrow('not found or already completed');

  const primaryStale = await restartedStore.listStale(scope.projectId, completedAt);
  expect(primaryStale).toHaveLength(2);
  expect(primaryStale.every((claim) => claim.projectId === scope.projectId)).toBe(true);
  const otherStale = await restartedStore.listStale(scope.otherProjectId, completedAt);
  expect(otherStale).toHaveLength(1);
  expect(otherStale[0]?.projectId).toBe(scope.otherProjectId);

  await expect(harness.execute(
    `INSERT INTO r1_effect_claims
     (project_id, task_id, correlation_id, operation, state, created_at)
     VALUES ('${scope.projectId}','${scope.taskId}','${randomUUID()}','invalid-state','replayed','${createdAt}')`,
  )).rejects.toThrow();
}

describe('E10-S9 SQL effect-claim contract', () => {
  const harnesses: ClaimHarness[] = [];

  afterEach(async () => {
    for (const harness of harnesses.splice(0)) await harness.close();
  });

  it('atomically scopes claims on a real SQLite engine', async () => {
    const harness = sqliteHarness();
    harnesses.push(harness);
    await assertAtomicClaimContract(harness);
  });

  it('atomically scopes claims on PGlite PostgreSQL semantics', async () => {
    const harness = await pgliteHarness();
    harnesses.push(harness);
    await assertAtomicClaimContract(harness);
  });

});
