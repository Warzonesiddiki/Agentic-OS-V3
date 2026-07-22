import { describe, expect, it } from 'vitest';
import { InMemoryR1Repositories } from './in-memory-repositories';
import {
  canonicalJson,
  ProjectExportBundleSchema,
  ProjectTransferService,
  PROJECT_EXPORT_SCHEMA_VERSION,
} from './project-transfer';
import type { ActionReceipt, Evidence, Project, Task } from './r1-types';
import type { MemoryRecord } from './repositories';

const timestamp = '2026-07-22T00:00:00.000Z';
const project: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'transfer-contract',
  mode: 'local',
  scope: { root: '/tmp/transfer-contract' },
  idempotencyKey: 'transfer-contract-key',
  createdAt: timestamp,
  updatedAt: timestamp,
};
const evidence: Evidence = {
  id: '99999999-9999-4999-8999-999999999999',
  projectId: project.id,
  kind: 'source',
  source: 'unit-test',
  contentHash: 'b'.repeat(64),
  metadata: { note: 'kept', password: 'hunter2' },
  createdAt: timestamp,
};
const memory: MemoryRecord = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  projectId: project.id,
  content: 'Provenance memory content.',
  metadata: {
    provenance: {
      type: 'fact' as const,
      source: 'unit-test',
      confidence: 0.9,
      lifecycle: 'active' as const,
      evidenceIds: [evidence.id],
    },
    apiKey: 'sk-live-secret',
    nested: { deep: { token: 'abc123' }, safe: true },
  },
  evidenceIds: [evidence.id],
  createdAt: timestamp,
  updatedAt: timestamp,
};
const task: Task = {
  id: '22222222-2222-4222-8222-222222222222',
  projectId: project.id,
  state: 'queued',
  title: 'transferable task',
  principalId: 'principal-test',
  agentId: 'agent-test',
  goal: 'transfer goal',
  capabilityIds: [],
  policyVersion: 'r1',
  inputReference: 'input:test',
  correlationId: '33333333-3333-4333-8333-333333333333',
  idempotencyKey: 'transfer-idem-1',
  createdAt: timestamp,
  updatedAt: timestamp,
};
const receipt: ActionReceipt = {
  id: '55555555-5555-4555-8555-555555555555',
  projectId: project.id,
  correlationId: task.correlationId,
  kind: 'tool_call',
  actor: 'unit-test',
  decision: 'allow',
  payload: { taskId: task.id, accessToken: 'bearer-secret', detail: 'kept' },
  createdAt: timestamp,
};

async function seedSourceStore() {
  const repositories = new InMemoryR1Repositories();
  await repositories.projects.create(project);
  await repositories.evidence.append(evidence);
  await repositories.memories.save(memory);
  await repositories.tasks.create(task);
  await repositories.receipts.append(receipt);
  return repositories;
}

async function exportSeeded(policy?: Parameters<ProjectTransferService['exportProject']>[1]) {
  const repositories = await seedSourceStore();
  const service = new ProjectTransferService(repositories, { now: () => timestamp });
  const bundle = await service.exportProject(project.id, policy);
  if (!bundle) throw new Error('export unexpectedly returned null');
  return { repositories, service, bundle };
}

describe('project export (E1-S3)', () => {
  it('produces a schema-versioned, scope-scoped, integrity-hashed bundle', async () => {
    const { bundle } = await exportSeeded();
    expect(bundle.schemaVersion).toBe(PROJECT_EXPORT_SCHEMA_VERSION);
    expect(bundle.exportedAt).toBe(timestamp);
    expect(bundle.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(bundle.project).toEqual(project);
    expect(bundle.tasks.map((record) => record.id)).toEqual([task.id]);
    expect(bundle.taskEvents).toEqual([{
      id: `${task.id}:created`, projectId: project.id, taskId: task.id,
      event: 'created', state: 'queued', sequence: 0, createdAt: timestamp,
    }]);
    // The bundle itself round-trips through the strict schema.
    expect(() => ProjectExportBundleSchema.parse(bundle)).not.toThrow();
  });

  it('redacts secret-shaped fields and reports every redaction', async () => {
    const { bundle } = await exportSeeded();
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('sk-live-secret');
    expect(serialized).not.toContain('abc123');
    expect(serialized).not.toContain('bearer-secret');
    expect(serialized).toContain('[REDACTED]');
    // Non-secret fields survive untouched.
    expect(serialized).toContain('unit-test');
    expect(serialized).toContain('safe');
    const fields = bundle.redactions.map((redaction) => `${redaction.collection}:${redaction.field}`);
    expect(fields).toContain('memories:metadata.apiKey');
    expect(fields).toContain('memories:metadata.nested.deep.token');
    expect(fields).toContain('evidence:metadata.password');
    expect(fields).toContain('receipts:payload.accessToken');
    expect(bundle.redactions.every((redaction) => redaction.action === 'redacted')).toBe(true);
  });

  it('omits receipt payloads entirely under the omit policy', async () => {
    const { bundle } = await exportSeeded({ omitReceiptPayloads: true });
    expect(bundle.receipts[0]?.payload).toEqual({});
    expect(bundle.redactions).toContainEqual({
      collection: 'receipts', recordId: receipt.id, field: 'payload', action: 'omitted',
    });
  });

  it('returns null for an unknown project instead of inventing data', async () => {
    const service = new ProjectTransferService(new InMemoryR1Repositories());
    await expect(service.exportProject(project.id)).resolves.toBeNull();
  });
});

describe('project import dry run + apply (E1-S3)', () => {
  it('plans additions on an empty store and applies them atomically', async () => {
    const { bundle } = await exportSeeded();
    const target = new InMemoryR1Repositories();
    const service = new ProjectTransferService(target, { now: () => timestamp });

    const plan = await service.dryRunImport(bundle);
    expect(plan.wouldApply).toBe(true);
    expect(plan.conflicts).toEqual([]);
    expect(plan.rejected).toEqual([]);
    expect(plan.additions.tasks).toEqual([task.id]);
    expect(plan.additions.memories).toEqual([memory.id]);
    expect(plan.counts.project.additions).toBe(1);
    expect(plan.additions.taskEvents).toEqual([`${task.id}:created`]);
    expect(plan.counts.taskEvents.additions).toBe(1);

    const result = await service.applyImport(bundle);
    expect(result.applied).toBe(true);
    await expect(target.projects.get(project.id)).resolves.toEqual(project);
    await expect(target.memories.list(project.id)).resolves.toEqual([bundle.memories[0]]);
    await expect(target.tasks.get(project.id, task.id)).resolves.toEqual(task);
    await expect(target.receipts.listForTask(project.id, task.id)).resolves.toEqual([bundle.receipts[0]]);
  });

  it('second import of an identical bundle is an unchanged no-op plan that still applies cleanly', async () => {
    const { bundle } = await exportSeeded();
    const target = new InMemoryR1Repositories();
    const service = new ProjectTransferService(target, { now: () => timestamp });
    await service.applyImport(bundle);

    const second = await service.dryRunImport(bundle);
    expect(second.wouldApply).toBe(true);
    expect(second.additions.tasks).toEqual([]);
    expect(second.unchanged.tasks).toEqual([task.id]);
    expect(second.unchanged.memories).toEqual([memory.id]);
    expect(second.counts.project.unchanged).toBe(1);
    const reapplied = await service.applyImport(bundle);
    expect(reapplied.applied).toBe(true);
  });

  it('rejects malformed input as invalid-schema with zero mutation', async () => {
    const target = new InMemoryR1Repositories();
    const service = new ProjectTransferService(target);
    const plan = await service.dryRunImport({ schemaVersion: 'nope', garbage: true });
    expect(plan.wouldApply).toBe(false);
    expect(plan.rejected).toEqual([{ collection: 'project', id: 'bundle', reason: 'invalid-schema' }]);
    expect(plan.issues?.length).toBeGreaterThan(0);
    const result = await service.applyImport({ schemaVersion: 'nope', garbage: true });
    expect(result.applied).toBe(false);
    await expect(target.projects.list()).resolves.toEqual([]);
  });

  it('fails closed when any record escapes the bundle project scope', async () => {
    const { bundle } = await exportSeeded();
    const escaped = {
      ...bundle,
      memories: [{ ...bundle.memories[0], projectId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }],
    };
    const target = new InMemoryR1Repositories();
    const service = new ProjectTransferService(target);
    const plan = await service.dryRunImport(escaped);
    expect(plan.wouldApply).toBe(false);
    expect(plan.rejected[0]?.reason).toBe('invalid-schema');
    await expect(target.projects.list()).resolves.toEqual([]);
  });

  it('rejects a tampered bundle as integrity-mismatch', async () => {
    const { bundle } = await exportSeeded();
    const tampered = {
      ...bundle,
      tasks: [{ ...bundle.tasks[0], title: 'attacker-modified title' }],
    };
    const target = new InMemoryR1Repositories();
    const service = new ProjectTransferService(target);
    const plan = await service.dryRunImport(tampered);
    expect(plan.wouldApply).toBe(false);
    expect(plan.rejected).toEqual([{ collection: 'project', id: project.id, reason: 'integrity-mismatch' }]);
    await expect(target.projects.list()).resolves.toEqual([]);
  });

  it('reports divergent stored records as conflicts and refuses to apply', async () => {
    const { bundle } = await exportSeeded();
    // Import the (redacted) bundle first so the store mirrors the export;
    // then diverge exactly one stored record.
    const target = new InMemoryR1Repositories();
    await new ProjectTransferService(target, { now: () => timestamp }).applyImport(bundle);
    await target.memories.save({ ...bundle.memories[0], content: 'locally modified since export' });
    const service = new ProjectTransferService(target, { now: () => timestamp });

    const plan = await service.dryRunImport(bundle);
    expect(plan.wouldApply).toBe(false);
    expect(plan.conflicts).toEqual([
      { collection: 'memories', id: memory.id, reason: 'stored record diverges from the bundle.' },
    ]);
    const result = await service.applyImport(bundle);
    expect(result.applied).toBe(false);
    // Nothing was overwritten: the divergent local record survives.
    await expect(target.memories.get(project.id, memory.id))
      .resolves.toMatchObject({ content: 'locally modified since export' });
  });

  it('reports idempotency-key collisions across different projects/tasks as conflicts', async () => {
    const { bundle } = await exportSeeded();
    const target = new InMemoryR1Repositories();
    const otherProject: Project = {
      ...project,
      id: '66666666-6666-4666-8666-666666666666',
      name: 'other',
    };
    await target.projects.create(otherProject);
    await target.tasks.create({ ...task, projectId: otherProject.id, id: '77777777-7777-4777-8777-777777777777' });
    const service = new ProjectTransferService(target, { now: () => timestamp });

    const plan = await service.dryRunImport(bundle);
    expect(plan.wouldApply).toBe(false);
    expect(plan.conflicts.map((conflict) => conflict.reason)).toEqual(
      expect.arrayContaining([expect.stringContaining('idempotencyKey already belongs to project')]),
    );
  });

  it('canonicalJson is key-order independent and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 }, u: undefined }))
      .toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(canonicalJson([2, { b: 1, a: 0 }])).toBe('[2,{"a":0,"b":1}]');
  });
});
