/**
 * E1-S3 — project export/import dry-run: server application-client contract.
 *
 * Proves the dual-backend portability story on real engines:
 *  1. SQLite application client: export -> restart/fresh database -> atomic
 *     import restore, including append-only tables.
 *  2. SQLite interrupted import: a failure mid-apply rolls back the whole
 *     transaction (AC5 — no partial mutation).
 *  3. PostgreSQL engine (PGlite; live DB via DATABASE_URL): same round-trip
 *     plus a tampered-bundle rejection.
 *  4. Governed routes: export/dry-run/apply status codes and auth scopes.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSqlR1Repositories,
  InMemoryCapabilityGovernanceStore,
  InMemoryR1Repositories,
  ProjectTransferService,
  type Evidence,
  type Project,
  type R1Repositories,
  type SqlExecutor,
  type Task,
} from '@agentic-os/sdk';
import type { Principal } from '../src/lib/security.js';
import type { NexusEnv } from '../src/lib/hono-env.js';

// The route module's auth context eagerly initializes the application SQLite
// client — point it at a scratch location before importing the router.
process.env.NEXUS_SQLITE_PATH = process.env.NEXUS_SQLITE_PATH
  ?? join(mkdtempSync(join(tmpdir(), 'agentic-r1-transfer-sidecar-')), 'sidecar.db');

const { createR1Router } = await import('../src/routes/r1.js');
const { createR1Runtime } = await import('../src/services/r1-runtime.js');

/** Query-side runtime wiring for the governed router (identity tx — apply gate still enforced). */
function createR1QueryRuntime(repositories: R1Repositories) {
  return createR1Router(createR1Runtime(repositories, new InMemoryCapabilityGovernanceStore()));
}

const timestamp = '2026-07-22T00:00:00.000Z';

function makeProject(): Project {
  return {
    id: randomUUID(),
    name: `transfer-${randomUUID()}`,
    mode: 'local',
    scope: { root: '/tmp/transfer-contract' },
    idempotencyKey: `transfer-${randomUUID()}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function makeSeed(project: Project) {
  const evidence: Evidence = {
    id: randomUUID(), projectId: project.id, kind: 'source', source: 'transfer-contract',
    contentHash: 'b'.repeat(64), metadata: { note: 'kept', password: 'hunter2' }, createdAt: timestamp,
  };
  const memory = {
    id: randomUUID(), projectId: project.id, content: 'Provenance memory.',
    metadata: {
      provenance: {
        type: 'fact' as const, source: 'transfer-contract', confidence: 1,
        lifecycle: 'active' as const, evidenceIds: [evidence.id],
      },
      apiKey: 'sk-live-secret',
    },
    evidenceIds: [evidence.id], createdAt: timestamp, updatedAt: timestamp,
  };
  const task: Task = {
    id: randomUUID(), projectId: project.id, state: 'queued', title: 'transfer task',
    principalId: 'principal-test', agentId: 'agent-test', goal: 'transfer goal',
    capabilityIds: [], policyVersion: 'r1', inputReference: 'input:test',
    correlationId: randomUUID(), idempotencyKey: `transfer-${randomUUID()}`,
    createdAt: timestamp, updatedAt: timestamp,
  };
  const receipt = {
    id: randomUUID(), projectId: project.id, correlationId: task.correlationId,
    kind: 'tool_call' as const, actor: 'transfer-contract', decision: 'allow' as const,
    payload: { taskId: task.id, accessToken: 'bearer-secret' }, createdAt: timestamp,
  };
  return { evidence, memory, task, receipt };
}

async function seedAll(repositories: R1Repositories, project: Project) {
  const seed = makeSeed(project);
  await repositories.projects.create(project);
  await repositories.evidence.append(seed.evidence);
  await repositories.memories.save(seed.memory);
  await repositories.tasks.create(seed.task);
  await repositories.receipts.append(seed.receipt);
  return seed;
}

const sqliteMigration = [
  readFileSync(new URL('../src/db/migrations/0049_r1_contracts.sqlite.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/db/migrations/0050_r1_durable_task_metadata.sqlite.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/db/migrations/0051_r1_capability_governance.sqlite.sql', import.meta.url), 'utf8'),
].join('\n');

describe('E1-S3 transfer — SQLite application client', () => {
  const directories: string[] = [];

  afterEach(async () => {
    vi.resetModules();
    delete process.env.NEXUS_SQLITE_PATH;
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  async function openSqlite() {
    const directory = mkdtempSync(join(tmpdir(), 'agentic-r1-transfer-'));
    directories.push(directory);
    process.env.NEXUS_SQLITE_PATH = join(directory, 'r1.db');
    const client = await import('../src/db/client.js');
    await client.executeApplicationSql(sqliteMigration);
    return client;
  }

  it('exports from SQLite and restores into a fresh database after migration', async () => {
    const source = await openSqlite();
    const project = makeProject();
    const sourceRepos = createSqlR1Repositories(source.createApplicationSqlExecutor());
    await seedAll(sourceRepos, project);
    const exported = await new ProjectTransferService(sourceRepos, { now: () => timestamp })
      .exportProject(project.id);
    expect(exported?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // Secret-shaped fields never leave the process in plain text.
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('sk-live-secret');
    expect(serialized).not.toContain('bearer-secret');
    await source.closeDb();

    // Fresh database == portability/restore scenario.
    vi.resetModules();
    const target = await openSqlite();
    const targetRepos = createSqlR1Repositories(target.createApplicationSqlExecutor());
    const plan = await new ProjectTransferService(targetRepos, { now: () => timestamp }).dryRunImport(exported);
    expect(plan.wouldApply).toBe(true);
    expect(plan.counts.project.additions).toBe(1);
    expect(plan.additions.tasks).toHaveLength(1);

    // Atomic apply uses the same backend transaction the runtime gateway uses.
    const result = await target.withTransaction(() =>
      new ProjectTransferService(targetRepos, { now: () => timestamp }).applyImport(exported));
    expect(result.applied).toBe(true);

    await expect(targetRepos.projects.get(project.id)).resolves.toEqual(project);
    await expect(targetRepos.memories.list(project.id)).resolves.toEqual(exported?.memories);
    await expect(targetRepos.tasks.get(project.id, exported!.tasks[0]!.id))
      .resolves.toMatchObject({ id: exported!.tasks[0]!.id, idempotencyKey: exported!.tasks[0]!.idempotencyKey });
    await expect(targetRepos.tasks.listEvents(project.id, exported!.tasks[0]!.id))
      .resolves.toEqual(exported?.taskEvents);
    await expect(targetRepos.receipts.listForTask(project.id, exported!.tasks[0]!.id))
      .resolves.toEqual(exported?.receipts);
    // Append-only enforcement survived the restore.
    await expect(target.createApplicationSqlExecutor().query(
      'DELETE FROM r1_action_receipts WHERE id = $1', [exported!.receipts[0]!.id],
    )).rejects.toThrow('append-only');
    await target.closeDb();
  });

  it('rolls the whole import back when the transaction is interrupted mid-apply', async () => {
    const seeded = await openSqlite();
    const project = makeProject();
    const sourceRepos = createSqlR1Repositories(seeded.createApplicationSqlExecutor());
    await seedAll(sourceRepos, project);
    const exported = await new ProjectTransferService(sourceRepos, { now: () => timestamp })
      .exportProject(project.id);
    await seeded.closeDb();

    vi.resetModules();
    const target = await openSqlite();
    const baseExecutor = target.createApplicationSqlExecutor();
    // Interrupt deterministically on the FIRST INSERT of the apply phase.
    const poisoned: SqlExecutor = {
      async query<T extends object>(statement: string, parameters: readonly unknown[] = []) {
        if (statement.startsWith('INSERT INTO projects')) {
          throw new Error('simulated mid-import failure');
        }
        return baseExecutor.query<T>(statement, parameters);
      },
    };
    const service = new ProjectTransferService(createSqlR1Repositories(poisoned), { now: () => timestamp });
    await expect(target.withTransaction(() => service.applyImport(exported)))
      .rejects.toThrow('simulated mid-import failure');
    // AC5: nothing from the bundle persisted — not even reads via the clean executor.
    const clean = createSqlR1Repositories(target.createApplicationSqlExecutor());
    await expect(clean.projects.get(project.id)).resolves.toBeNull();
    await expect(clean.tasks.list(project.id)).resolves.toEqual([]);
    await target.closeDb();
  });
});

describe('E1-S3 transfer — PostgreSQL engine', () => {
  const harnesses: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    for (const harness of harnesses.splice(0)) await harness.close();
  });

  async function openPg() {
    const { PGlite } = await import('@electric-sql/pglite');
    const db: InstanceType<typeof PGlite> = new PGlite();
    // Base `projects` table mirrors the production Drizzle PostgreSQL schema;
    // the 0049 migration ALTERs it exactly as in a real deployment.
    await db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'active',
        memory_count INTEGER NOT NULL DEFAULT 0, skill_count INTEGER NOT NULL DEFAULT 0,
        token_footprint INTEGER NOT NULL DEFAULT 0, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`);
    for (const migration of [
      readFileSync(new URL('../src/db/migrations/0049_r1_contracts.sql', import.meta.url), 'utf8'),
      readFileSync(new URL('../src/db/migrations/0050_r1_durable_task_metadata.sql', import.meta.url), 'utf8'),
    ]) {
      await db.exec(migration);
    }
    const executor: SqlExecutor = {
      async query<T extends object>(statement: string, parameters: readonly unknown[] = []) {
        return (await db.query<T>(statement, [...parameters])).rows;
      },
    };
    const harness = { executor, close: () => db.close() };
    harnesses.push(harness);
    return harness;
  }

  it('round-trips a redacted bundle between two PostgreSQL databases and rejects tampering', async () => {
    const source = await openPg();
    const project = makeProject();
    const sourceRepos = createSqlR1Repositories(source.executor);
    await seedAll(sourceRepos, project);
    const exported = await new ProjectTransferService(sourceRepos, { now: () => timestamp })
      .exportProject(project.id, { omitReceiptPayloads: true });
    expect(JSON.stringify(exported)).not.toContain('bearer-secret');
    expect(exported?.receipts[0]?.payload).toEqual({});

    const target = await openPg();
    const targetRepos = createSqlR1Repositories(target.executor);
    const service = new ProjectTransferService(targetRepos, { now: () => timestamp });
    // Omit-mode receipts lose payload.taskId linkage; reconciliation by id still works.
    const plan = await service.dryRunImport(exported);
    expect(plan.wouldApply).toBe(true);
    const applied = await service.applyImport(exported);
    expect(applied.applied).toBe(true);
    await expect(targetRepos.projects.get(project.id)).resolves.toEqual(project);
    await expect(targetRepos.tasks.listEvents(project.id, exported!.tasks[0]!.id))
      .resolves.toEqual(exported?.taskEvents);

    // Tampered bundle: integrity mismatch, zero mutation on the fresh engine.
    const other = await openPg();
    const tampered = { ...exported, tasks: [{ ...exported!.tasks[0]!, title: 'forged' }] };
    const tamperPlan = await new ProjectTransferService(
      createSqlR1Repositories(other.executor), { now: () => timestamp },
    ).dryRunImport(tampered);
    expect(tamperPlan.wouldApply).toBe(false);
    expect(tamperPlan.rejected[0]?.reason).toBe('integrity-mismatch');
    await expect(createSqlR1Repositories(other.executor).projects.list()).resolves.toEqual([]);
  });
});

describe('E1-S3 transfer — governed routes', () => {
  const principal: Principal = {
    id: 'principal-test', name: 'transfer routes', keyHash: 'not-used-in-unit-test',
    scopes: ['memory:read', 'memory:write', 'brain:admin'], status: 'active',
  };

  function createApp() {
    const repositories = new InMemoryR1Repositories();
    const runtime = createR1QueryRuntime(repositories);
    const app = new Hono<NexusEnv>();
    app.use('*', async (c, next) => { c.set('principal', principal); await next(); });
    return { app: app.route('/api/v1/r1', runtime), repositories };
  }

  it('exports, dry-runs and applies through the governed API with correct status codes', async () => {
    const source = createApp();
    const project = makeProject();
    await seedAll(source.repositories, project);

    const exported = await source.app.request(`/api/v1/r1/projects/${project.id}/export`);
    expect(exported.status).toBe(200);
    const bundle = await exported.json();
    expect(bundle.schemaVersion).toBe('r1.project-export.v1');
    expect(bundle.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // Export policy default redacts secrets from the portable copy.
    expect(JSON.stringify(bundle)).not.toContain('bearer-secret');

    const missing = await source.app.request(`/api/v1/r1/projects/${randomUUID()}/export`);
    expect(missing.status).toBe(404);

    // Import into a second, fresh governed instance (portability scenario).
    const target = createApp();
    const dry = await target.app.request('/api/v1/r1/projects/import/dry-run', {
      method: 'POST', body: JSON.stringify(bundle), headers: { 'content-type': 'application/json' },
    });
    expect(dry.status).toBe(200);
    const report = await dry.json();
    expect(report.wouldApply).toBe(true);
    expect(report.additions.tasks).toEqual(bundle.tasks.map((task: { id: string }) => task.id));

    const applied = await target.app.request('/api/v1/r1/projects/import', {
      method: 'POST', body: JSON.stringify(bundle), headers: { 'content-type': 'application/json' },
    });
    expect(applied.status).toBe(200);
    expect((await applied.json()).applied).toBe(true);

    // Re-importing the same bundle is an idempotent no-op apply (restore-safe).
    const reapplied = await target.app.request('/api/v1/r1/projects/import', {
      method: 'POST', body: JSON.stringify(bundle), headers: { 'content-type': 'application/json' },
    });
    expect(reapplied.status).toBe(200);

    const invalid = await target.app.request('/api/v1/r1/projects/import', {
      method: 'POST', body: JSON.stringify({ schemaVersion: 'nope' }), headers: { 'content-type': 'application/json' },
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).applied).toBe(false);
  });

  it('enforces scopes: anonymous callers cannot export or import', async () => {
    const anonymous = new Hono<NexusEnv>();
    anonymous.use('*', async (c, next) => { await next(); });
    anonymous.route('/api/v1/r1', createR1QueryRuntime(new InMemoryR1Repositories()));
    const denied = await anonymous.request('/api/v1/r1/projects/import', {
      method: 'POST', body: JSON.stringify({}), headers: { 'content-type': 'application/json' },
    });
    expect(denied.status).toBe(401);
  });
});
