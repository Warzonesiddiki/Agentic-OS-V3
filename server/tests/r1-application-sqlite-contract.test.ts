import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSqlR1Repositories, R1Service, SqlCapabilityGovernanceStore } from '@agentic-os/sdk';

const migration = [
  readFileSync(new URL('../src/db/migrations/0049_r1_contracts.sqlite.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/db/migrations/0050_r1_durable_task_metadata.sqlite.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/db/migrations/0051_r1_capability_governance.sqlite.sql', import.meta.url), 'utf8'),
].join('\n');
const timestamp = '2026-07-21T00:00:00.000Z';
const project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'application-client-contract',
  mode: 'local' as const,
  scope: { root: '/tmp/application-client-contract' },
  idempotencyKey: 'application-client-contract',
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('R1 SQLite application-client contract', () => {
  const directories: string[] = [];

  afterEach(async () => {
    // The client is a singleton in production. Resetting the module is only
    // needed here so every test receives a unique file-backed local database.
    vi.resetModules();
    delete process.env.NEXUS_SQLITE_PATH;
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('runs repository contracts through the application SQLite client', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'agentic-r1-application-'));
    directories.push(directory);
    process.env.NEXUS_SQLITE_PATH = join(directory, 'r1.db');

    const client = await import('../src/db/client.js');
    await client.executeApplicationSql(migration);
    const repositories = createSqlR1Repositories(client.createApplicationSqlExecutor());
    const service = new R1Service(repositories);

    await expect(repositories.projects.create(project)).resolves.toEqual(project);
    const memoryEvidenceId = '99999999-9999-4999-8999-999999999999';
    await repositories.evidence.append({
      id: memoryEvidenceId, projectId: project.id, kind: 'source', source: 'contract-test',
      contentHash: 'b'.repeat(64), metadata: {}, createdAt: timestamp,
    });
    const provenanceMemory = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', projectId: project.id, content: 'Persisted provenance memory.',
      metadata: { provenance: { type: 'fact' as const, source: 'contract-test', confidence: 1, lifecycle: 'active' as const, evidenceIds: [memoryEvidenceId] } },
      evidenceIds: [memoryEvidenceId], createdAt: timestamp, updatedAt: timestamp,
    };
    await expect(service.saveProvenanceMemory(provenanceMemory)).resolves.toEqual(provenanceMemory);

    const governance = new SqlCapabilityGovernanceStore(client.createApplicationSqlExecutor());
    const governedCapability = {
      id: 'file.write', name: 'Write a project file', source: 'native' as const,
      version: '1.0.0', owner: 'contract-test', inputSchema: { type: 'object' },
      risk: 'high' as const, scope: { projectIds: [project.id], agentIds: ['agent-contract'] },
      health: 'healthy' as const, enabled: true,
    };
    await expect(governance.saveCapability(governedCapability)).resolves.toEqual(governedCapability);
    await expect(governance.saveActivePolicy({
      version: 'policy-contract',
      rules: [{ id: 'write-approval', capabilityId: 'file.write', decision: 'require_approval' as const }],
    })).resolves.toEqual({
      version: 'policy-contract',
      rules: [{ id: 'write-approval', capabilityId: 'file.write', decision: 'require_approval' }],
    });

    const originalTask = {
      id: '22222222-2222-4222-8222-222222222222',
      projectId: project.id,
      state: 'queued' as const,
      title: 'original task',
      principalId: 'principal-test', agentId: 'agent-test', goal: 'durable test goal', capabilityIds: [], policyVersion: 'r1', inputReference: 'input:test', correlationId: '33333333-3333-4333-8333-333333333333',
      idempotencyKey: 'same-submission',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await expect(repositories.tasks.create(originalTask)).resolves.toEqual(originalTask);
    await expect(repositories.tasks.listEvents(project.id, originalTask.id)).resolves.toEqual([{
      id: `${originalTask.id}:created`,
      projectId: project.id,
      taskId: originalTask.id,
      event: 'created',
      state: 'queued',
      sequence: 0,
      createdAt: timestamp,
    }]);
    await expect(repositories.tasks.create({
      ...originalTask,
      id: '44444444-4444-4444-8444-444444444444',
      title: 'must not replace original',
    })).resolves.toEqual(originalTask);

    const receipt = {
      id: '55555555-5555-4555-8555-555555555555',
      projectId: project.id,
      correlationId: originalTask.correlationId,
      kind: 'tool_call' as const,
      actor: 'contract-test',
      decision: 'allow' as const,
      payload: { taskId: originalTask.id, secret: 'opaque-data' },
      createdAt: timestamp,
    };
    await expect(repositories.receipts.append(receipt)).resolves.toEqual(receipt);
    await expect(repositories.receipts.listForTask(project.id, originalTask.id)).resolves.toEqual([receipt]);

    await expect(client.createApplicationSqlExecutor().query(
      'UPDATE r1_action_receipts SET actor = $1 WHERE id = $2',
      ['mutated', receipt.id],
    )).rejects.toThrow('append-only');

    const evidence = {
      id: '66666666-6666-4666-8666-666666666666',
      projectId: project.id,
      taskId: originalTask.id,
      kind: 'provenance' as const,
      source: 'contract-test',
      contentHash: 'a'.repeat(64),
      metadata: { sourceId: 'source-1' },
      createdAt: timestamp,
    };
    await expect(repositories.evidence.append(evidence)).resolves.toEqual(evidence);
    await expect(client.createApplicationSqlExecutor().query(
      'DELETE FROM r1_evidence WHERE id = $1',
      [evidence.id],
    )).rejects.toThrow('append-only');

    await expect(repositories.tasks.get('99999999-9999-4999-8999-999999999999', originalTask.id))
      .rejects.toMatchObject({ code: 'PROJECT_SCOPE_VIOLATION' });

    await client.closeDb();
  });

  it('persists committed project and task state after the application client restarts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'agentic-r1-application-restart-'));
    directories.push(directory);
    process.env.NEXUS_SQLITE_PATH = join(directory, 'r1.db');

    const firstClient = await import('../src/db/client.js');
    await firstClient.executeApplicationSql(migration);
    const firstRepositories = createSqlR1Repositories(firstClient.createApplicationSqlExecutor());
    await firstRepositories.projects.create(project);
    const task = {
      id: '77777777-7777-4777-8777-777777777777',
      projectId: project.id,
      state: 'queued' as const,
      title: 'durable application task',
      principalId: 'principal-test', agentId: 'agent-test', goal: 'durable test goal', capabilityIds: [], policyVersion: 'r1', inputReference: 'input:test', correlationId: '88888888-8888-4888-8888-888888888888',
      idempotencyKey: 'durable-submission',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await firstRepositories.tasks.create(task);
    await firstClient.closeDb();

    vi.resetModules();
    const restartedClient = await import('../src/db/client.js');
    const restartedRepositories = createSqlR1Repositories(restartedClient.createApplicationSqlExecutor());
    await expect(restartedRepositories.projects.get(project.id)).resolves.toEqual(project);
    await expect(restartedRepositories.tasks.get(project.id, task.id)).resolves.toEqual(task);
    await restartedClient.closeDb();
  });
});
