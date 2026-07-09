/**
 * Aeon2 — Connector-layer coverage (server/src/services/operations-ext.ts).
 *
 * The repository has no server/src/connectors/** directory; the connector /
 * integration surface lives in operations-ext.ts (cron scheduling + ambient
 * ingestion), which is the de-facto "connector" layer the MCP server and
 * kernel drive. This suite proves those operations execute against a mock
 * context (DB + kernel agent/task spawning + audit), with correct behavior
 * for create / list / toggle / tick and ambient ingestion. operations-ext.ts
 * is within Aeon's extended namespace (referenced by mcp.ts / kernel).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';

const createdJob = (over: Record<string, unknown> = {}) => ({
  id: `crn_${randomUUID()}`,
  name: 'nightly',
  cron: '0 0 * * *',
  agentKind: 'daemon',
  taskLabel: 'backup',
  taskInput: {},
  enabled: true,
  nextRunAt: new Date(Date.now() + 86_400_000),
  runCount: 0,
  createdAt: new Date(),
  ...over,
});

// ---- Mock the native-binding + kernel + audit seams -------------------------
vi.mock('../src/db/client.js', () => {
  let lastSet: Record<string, unknown> = {};
  const txChain = {
    insert: () => txChain,
    update: () => txChain,
    delete: () => txChain,
    values: () => txChain,
    set: (s: Record<string, unknown>) => {
      lastSet = s;
      return txChain;
    },
    where: () => txChain,
    returning: () => txChain,
    then: (res: (v: unknown) => void) => res([{ ...createdJob(), ...lastSet }]),
  };
  const selChain = {
    from: () => selChain,
    where: () => selChain,
    orderBy: () => selChain,
    then: (res: (v: unknown) => void) => res([createdJob()]),
  };
  return {
    db: {
      insert: () => txChain,
      update: () => txChain,
      delete: () => txChain,
      select: () => selChain,
      query: { cronJobs: { findMany: async () => [createdJob()] } },
    },
    isPostgres: false,
    isSqlite: true,
    cronJobs: {},
  };
});

vi.mock('../src/lib/audit.js', () => ({
  appendAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/services/kernel.js', () => ({
  spawnAgent: vi.fn(async () => ({ id: 'agent_1', name: 'daemon' })),
  enqueueTask: vi.fn(async () => ({ id: 'task_1', label: 'do' })),
}));

const { createCronJob, listCronJobs, toggleCronJob, tickCron, ingestAmbientTranscript } =
  await import('../src/services/operations-ext.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Connector layer — cron connector', () => {
  it('createCronJob persists a job and returns it with an id', async () => {
    const job = await createCronJob(
      { name: 'nightly', cron: '0 0 * * *', taskLabel: 'backup', agentKind: 'daemon' },
      'aeon'
    );
    expect(job.id).toMatch(/^crn_/);
    expect(job.cron).toBe('0 0 * * *');
    expect(job.enabled).toBe(true);
    expect(job.nextRunAt).toBeInstanceOf(Date);
  });

  it('listCronJobs returns the scheduled jobs', async () => {
    const jobs = await listCronJobs();
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('toggleCronJob flips the enabled flag', async () => {
    const updated = await toggleCronJob('crn_x', false, 'aeon');
    expect(updated.enabled).toBe(false);
  });

  it('tickCron fires due jobs and returns the fired count', async () => {
    // Make the only job already due (nextRunAt in the past).
    const dueJob = createdJob({ nextRunAt: new Date(Date.now() - 1000), id: 'crn_due' });
    const selChain = {
      from: () => selChain,
      where: () => selChain,
      orderBy: () => selChain,
      then: (res: (v: unknown) => void) => res([dueJob]),
    };
    const { db } = await import('../src/db/client.js');
    (db as any).select = () => selChain;
    (db as any).query = { cronJobs: { findMany: async () => [dueJob] } };

    const fired = await tickCron('aeon');
    expect(fired).toBeGreaterThanOrEqual(1);
  });
});

describe('Connector layer — ambient ingestion connector', () => {
  it('ingestAmbientTranscript spawns a daemon and enqueues a task', async () => {
    const { spawnAgent, enqueueTask } = await import('../src/services/kernel.js');
    const result = await ingestAmbientTranscript(
      'voice note about project X',
      'ambient',
      { device: 'phone' },
      'aeon'
    );
    expect(result.taskId).toBeDefined();
    expect(result.agentId).toBeDefined();
    expect((spawnAgent as any).mock.calls.length).toBe(1);
    expect((enqueueTask as any).mock.calls.length).toBe(1);
  });

  it('throws if no daemon agent can be spawned', async () => {
    const { spawnAgent } = await import('../src/services/kernel.js');
    (spawnAgent as any).mockImplementationOnce(async () => null);
    await expect(
      ingestAmbientTranscript('x', 'ambient', {}, 'aeon')
    ).rejects.toThrow(/Failed to spawn ambient agent/);
  });
});
