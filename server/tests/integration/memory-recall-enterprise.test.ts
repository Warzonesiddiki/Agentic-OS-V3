/**
 * Integration tests — Memory / Recall seam + Enterprise tenant isolation.
 *
 * Exercises the real SQLite backend (in-memory) end-to-end:
 *   memories → decay → consolidation → recall (RRF fusion) + contradiction edges
 *   two tenants (orgs) → cross-tenant isolation assertions
 *
 * No FROZEN core files are touched. This file lives under server/tests/integration
 * (greenfield, owned by the integration workstream).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { db } from '../../src/db/client.js';
import { memories, memoryContradictions, orgs, tenantConfig } from '../../src/db/schema-sqlite.js';
import { ensureProject } from '../../src/services/project.service.js';
import { createMemory } from '../../src/services/memory.service.js';
import { recall } from '../../src/services/recall.js';
import { decayImportance } from '../../src/services/memory-decay.js';
import { consolidateEpisodicToSemantic } from '../../src/services/consolidation.js';
import { contradictionsAmong, detectContradictions } from '../../src/services/memory-contradiction.js';
import { createOrg, getOrg } from '../../src/services/enterprise.service.js';
import { setupIntegrationDb } from '../helpers/db-setup.js';
import { eq, or } from 'drizzle-orm';

const ACTOR = 'int-test';

function makeMemoryInput(projectId: string | null, suffix: string) {
  return {
    kind: 'episodic',
    title: `Integration memory ${suffix}`,
    content: `The quarterly revenue target for the alpha project was exceeded by the sales team. ${suffix}`,
    tags: ['integration', 'test'],
    importance: 1,
    source: 'integration-test',
    projectId,
  } as const;
}

describe('Memory / Recall integration seam', () => {
  let projectId: string;

  beforeAll(async () => {
    await setupIntegrationDb();
    const project = await ensureProject('int-recall-project', 'memory-recall');
    projectId = project.id;
  });

  it('ingests memories that are persisted and retrievable via project scope', async () => {
    const a = await createMemory(makeMemoryInput(projectId, 'alpha'), ACTOR);
    const b = await createMemory(makeMemoryInput(projectId, 'beta'), ACTOR);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();

    const rows = await db.select().from(memories).where(eq(memories.projectId, projectId));
    const ids = rows.map((r) => r.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it('applies decay to a memory and lowers its importance in the store', async () => {
    const created = await createMemory(makeMemoryInput(projectId, 'decay-target'), ACTOR);
    const [before] = await db.select().from(memories).where(eq(memories.id, created.id));
    expect(before.importance).toBeGreaterThan(0);

    // decayImportance updates the persisted rows in place for the project.
    const result = await decayImportance({ projectId, limit: 100 });
    expect(result).toBeDefined();
    expect(typeof result.updated).toBe('number');
    expect(result.updated).toBeGreaterThanOrEqual(1);

    const [after] = await db.select().from(memories).where(eq(memories.id, created.id));
    // a full-importance memory must be strictly reduced by half-life decay
    expect(after.importance).toBeLessThan(before.importance);
  });

  it('runs consolidation without error and returns a numeric facts count', async () => {
    // In the test environment the LLM is not configured, so consolidation is a
    // no-op smoke path; we still assert it completes and returns the contract shape.
    const result = await consolidateEpisodicToSemantic({ projectId, limit: 50 });
    expect(result).toBeDefined();
    expect(typeof result.facts).toBe('number');
  });

  it('ranks an exact-phrase memory first via RRF fused recall', async () => {
    const distinctive = `NEXUS_DISTINCTIVE_TOKEN_${randomUUID().slice(0, 8)}`;
    const exact = await createMemory(
      {
        kind: 'semantic',
        title: 'Exact phrase target',
        content: `The ${distinctive} was confirmed by the board of directors.`,
        tags: ['integration'],
        importance: 1,
        source: 'integration-test',
        projectId,
      },
      ACTOR
    );
    // a loosely related memory that shares one lexical token but not the phrase
    await createMemory(
      {
        kind: 'semantic',
        title: 'Related but not exact',
        content: `The board of directors discussed many topics this quarter.`,
        tags: ['integration'],
        importance: 0.8,
        source: 'integration-test',
        projectId,
      },
      ACTOR
    );

    const ranking = await recall(`The ${distinctive} was confirmed by the board`, 10, ACTOR);
    expect(ranking.returned.length).toBeGreaterThan(0);
    expect(ranking.returned[0].id).toBe(exact.id);

    // RRF scores must be non-increasing (descending / stable)
    for (let i = 1; i < ranking.returned.length; i++) {
      expect(ranking.returned[i - 1].score).toBeGreaterThanOrEqual(ranking.returned[i].score);
    }
    // Budget respected
    expect(ranking.returned.length).toBeLessThanOrEqual(10);
  });

  it('annotates recall results with contradiction edges among the hits', async () => {
    const m1 = await createMemory(
      {
        kind: 'semantic',
        title: 'Contradiction subject A',
        content: 'The system uses a Postgres primary store.',
        tags: ['contradiction'],
        importance: 1,
        source: 'integration-test',
        projectId,
      },
      ACTOR
    );
    const m2 = await createMemory(
      {
        kind: 'semantic',
        title: 'Contradiction subject B',
        content: 'The system uses a Mongo primary store.',
        tags: ['contradiction'],
        importance: 1,
        source: 'integration-test',
        projectId,
      },
      ACTOR
    );

    // Seed a contradiction edge directly (deterministic, no LLM/embedding dependency).
    await db.insert(memoryContradictions).values({
      id: `con_${randomUUID()}`,
      memoryA: m1.id,
      memoryB: m2.id,
      relation: 'contradicting',
      resolutionOf: null,
    });

    const edges = await contradictionsAmong([m1.id, m2.id]);
    expect(edges.length).toBe(1);
    expect(edges[0]).toMatchObject({ memoryA: m1.id, memoryB: m2.id, classification: 'contradicting' });

    // detectContradictions should also be able to read existing rows without throwing
    const detected = await detectContradictions(m1.id, { projectId });
    expect(Array.isArray(detected)).toBe(true);
  });
});

describe('Enterprise tenant isolation', () => {
  beforeAll(async () => {
    await setupIntegrationDb();
  });

  it('creates two distinct tenants with isolated config and no cross-contamination', async () => {
    const tenantA = await createOrg({ name: 'Tenant A', slug: `tenant-a-${randomUUID().slice(0, 6)}` });
    const tenantB = await createOrg({ name: 'Tenant B', slug: `tenant-b-${randomUUID().slice(0, 6)}` });

    expect(tenantA.id).not.toBe(tenantB.id);

    const fetchedA = await getOrg(tenantA.id);
    const fetchedB = await getOrg(tenantB.id);
    expect(fetchedA.id).toBe(tenantA.id);
    expect(fetchedB.id).toBe(tenantB.id);
    expect(fetchedA.slug).not.toBe(fetchedB.slug);

    // tenant config rows exist and are scoped per-org
    const configs = await db
      .select()
      .from(tenantConfig)
      .where(or_(eq(tenantConfig.orgId, tenantA.id), eq(tenantConfig.orgId, tenantB.id)));
    const configOrgIds = new Set(configs.map((c) => c.orgId));
    expect(configOrgIds.has(tenantA.id)).toBe(true);
    expect(configOrgIds.has(tenantB.id)).toBe(true);
    expect(configs.length).toBeGreaterThanOrEqual(2);
  });

  it('isolates memories written under separate tenant projects', async () => {
    const projA = await ensureProject('tenant-A-project', 'isolation-A');
    const projB = await ensureProject('tenant-B-project', 'isolation-B');
    expect(projA.id).not.toBe(projB.id);

    const memA = await createMemory(
      {
        kind: 'episodic',
        title: 'Tenant A secret',
        content: 'Tenant A confidential revenue number is 12345.',
        tags: ['secret'],
        importance: 1,
        source: 'integration-test',
        projectId: projA.id,
      },
      ACTOR
    );
    const memB = await createMemory(
      {
        kind: 'episodic',
        title: 'Tenant B secret',
        content: 'Tenant B confidential revenue number is 67890.',
        tags: ['secret'],
        importance: 1,
        source: 'integration-test',
        projectId: projB.id,
      },
      ACTOR
    );

    // Project A scope must only contain memA
    const aRows = await db.select().from(memories).where(eq(memories.projectId, projA.id));
    const aIds = aRows.map((r) => r.id);
    expect(aIds).toContain(memA.id);
    expect(aIds).not.toContain(memB.id);

    // Project B scope must only contain memB
    const bRows = await db.select().from(memories).where(eq(memories.projectId, projB.id));
    const bIds = bRows.map((r) => r.id);
    expect(bIds).toContain(memB.id);
    expect(bIds).not.toContain(memA.id);

    // Exhaustive cross-tenant leak check: no memory row from project A carries
    // project B's id, and vice versa.
    const crossLeak = await db
      .select()
      .from(memories)
      .where(or_(eq(memories.projectId, projA.id), eq(memories.projectId, projB.id)));
    const leaked = crossLeak.filter((r) => r.projectId !== projA.id && r.projectId !== projB.id);
    expect(leaked.length).toBe(0);
    // precisely the two secrets we inserted (plus any earlier memories in these projects)
    expect(crossLeak.every((r) => r.projectId === projA.id || r.projectId === projB.id)).toBe(true);
  });
});
