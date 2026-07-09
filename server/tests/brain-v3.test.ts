import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  db,
  memories,
  skills,
  memoryClusters,
  sessionLinks,
  memoryCausalEdges,
  memoryAttachments,
  memoryContradictions,
  memoryEmotions,
  tagTaxonomy,
  memoryTags,
  memoryTemplates,
  agentMemoryQuotas,
  memoryArchive,
  memoryDiffMarkers,
  memoryRehearsalLog,
} from '../src/db/client.js';
import {
  exportBrainV3,
  importBrainV3,
  migrateBrainV2ToV3,
  BRAIN_SCHEMA_VERSION,
} from '../src/services/brain.js';
import { ApiError } from '../src/lib/errors.js';

const TS = 'b3-test';

async function wipeAll(): Promise<void> {
  await db.delete(memoryRehearsalLog);
  await db.delete(memoryDiffMarkers);
  await db.delete(memoryEmotions);
  await db.delete(memoryContradictions);
  await db.delete(memoryAttachments);
  await db.delete(memoryCausalEdges);
  await db.delete(sessionLinks);
  await db.delete(memoryTags);
  await db.delete(memoryArchive);
  await db.delete(agentMemoryQuotas);
  await db.delete(memoryTemplates);
  await db.delete(memoryClusters);
  await db.delete(tagTaxonomy);
  await db.delete(skills);
  await db.delete(memories);
}

beforeEach(async () => {
  await wipeAll();
});

describe('brain v3 export/import', () => {
  it('round-trips all Phase 12 structures', async () => {
    await db.insert(memories).values({
      id: 'mem_v3',
      kind: 'semantic',
      title: 'V3',
      content: 'v3 content',
      tags: ['a'],
      importance: 0.9,
      source: TS,
      tokenCost: 1,
      recallCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.insert(memoryClusters).values({
      id: 'cl_v3',
      name: 'Cluster',
      description: 'd',
      parentId: null,
      kind: 'topic',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db
      .insert(tagTaxonomy)
      .values({
        id: 'tag_v3',
        label: 'Label',
        parentId: null,
        createdAt: new Date().toISOString(),
      });
    await db
      .insert(memoryTags)
      .values({
        id: 'mt_v3',
        memoryId: 'mem_v3',
        tagId: 'tag_v3',
        createdAt: new Date().toISOString(),
      });
    await db
      .insert(sessionLinks)
      .values({
        id: 'sl_v3',
        sessionId: 's1',
        memoryId: 'mem_v3',
        linkType: 'created_in',
        createdAt: new Date().toISOString(),
      });
    await db
      .insert(memoryCausalEdges)
      .values({
        id: 'ce_v3',
        fromMemoryId: 'mem_v3',
        toMemoryId: 'mem_v3',
        edgeType: 'causes',
        weight: 0.5,
        createdAt: new Date().toISOString(),
      });
    await db
      .insert(memoryAttachments)
      .values({
        id: 'at_v3',
        memoryId: 'mem_v3',
        filename: 'f',
        mimeType: 'text/plain',
        sizeBytes: 1,
        storageRef: 'r',
        createdAt: new Date().toISOString(),
      });
    await db
      .insert(memoryContradictions)
      .values({
        id: 'mc_v3',
        memoryAId: 'mem_v3',
        memoryBId: 'mem_v3',
        severity: 0.2,
        note: 'n',
        resolved: false,
        createdAt: new Date().toISOString(),
      });
    await db
      .insert(memoryEmotions)
      .values({
        id: 'me_v3',
        memoryId: 'mem_v3',
        emotion: 'joy',
        intensity: 0.7,
        createdAt: new Date().toISOString(),
      });
    await db
      .insert(memoryTemplates)
      .values({
        id: 'tp_v3',
        name: 'T',
        description: 'd',
        schema: {},
        content: 'c',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    await db
      .insert(agentMemoryQuotas)
      .values({
        id: 'q_v3',
        agentId: 'a1',
        maxMemories: 10,
        maxTokens: 100,
        usedMemories: 1,
        usedTokens: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    await db
      .insert(memoryArchive)
      .values({
        id: 'ar_v3',
        memoryId: 'mem_v3',
        title: 'T',
        content: 'C',
        tags: ['x'],
        importance: 0.5,
        reason: 'old',
        archivedAt: new Date().toISOString(),
      });
    await db
      .insert(memoryDiffMarkers)
      .values({
        id: 'dm_v3',
        memoryId: 'mem_v3',
        baseVersion: 1,
        currentVersion: 2,
        diff: {},
        markedAt: new Date().toISOString(),
      });
    await db
      .insert(memoryRehearsalLog)
      .values({
        id: 'rl_v3',
        memoryId: 'mem_v3',
        lastReviewedAt: new Date().toISOString(),
        nextReviewAt: new Date().toISOString(),
        repetitions: 1,
        easeFactor: 2.5,
        createdAt: new Date().toISOString(),
      });
    await db
      .insert(skills)
      .values({
        id: 'skl_v3',
        name: 'v3',
        title: 'V3',
        description: 'd',
        content: 'c',
        category: 'general',
        tags: ['t'],
        source: TS,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    const exported = await exportBrainV3();
    expect(exported.version).toBe(BRAIN_SCHEMA_VERSION);
    expect(exported.memories).toHaveLength(1);
    expect(exported.clusters).toHaveLength(1);
    expect(exported.memoryTags).toHaveLength(1);
    expect(exported.rehearsalLog).toHaveLength(1);

    await wipeAll();

    const report = await importBrainV3(exported, TS);
    expect(report.memories).toBe(1);
    expect(report.skills).toBe(1);
    expect(report.clusters).toBe(1);
    expect(report.memoryTags).toBe(1);
    expect(report.rehearsalLog).toBe(1);
    expect(report.duplicates).toBe(0);

    const memCount = await db.select({ c: sql<number>`count(*)::int` }).from(memories);
    expect(memCount[0]?.c).toBe(1);
  });

  it('is idempotent (importing twice counts duplicates)', async () => {
    await db.insert(memories).values({
      id: 'mem_idem',
      kind: 'fact',
      title: 'Idem',
      content: 'c',
      tags: [],
      importance: 0.5,
      source: TS,
      tokenCost: 1,
      recallCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const exported = await exportBrainV3();
    const first = await importBrainV3(exported, TS);
    const second = await importBrainV3(exported, TS);
    expect(first.memories).toBe(1);
    expect(second.memories).toBe(0);
    expect(second.duplicates).toBeGreaterThanOrEqual(1);
  });

  it('migrates a v2 payload into v3', async () => {
    const v2 = {
      format: 'nexus-brain',
      version: 2,
      exportedAt: Date.now(),
      memories: [
        {
          id: 'mem_v2',
          kind: 'episodic',
          title: 'V2',
          content: 'c',
          tags: [],
          importance: 0.5,
          source: TS,
          tokenCost: 1,
          recallCount: 0,
        },
      ],
      skills: [
        {
          id: 'skl_v2',
          name: 'v2',
          title: 'V2',
          description: 'd',
          content: 'c',
          category: 'general',
          tags: [],
          source: TS,
        },
      ],
    };
    const report = await importBrainV3(v2, TS);
    expect(report.memories).toBe(1);
    expect(report.skills).toBe(1);
    expect(report.clusters).toBe(0);
    expect(report.rehearsalLog).toBe(0);

    const migrated = migrateBrainV2ToV3(v2);
    expect(migrated.version).toBe(3);
    expect(migrated.clusters).toEqual([]);
    expect(migrated.memories[0]!.privacyZone).toBe('public');
    expect(migrated.memories[0]!.language).toBe('en');
  });

  it('rejects an invalid payload', async () => {
    await expect(importBrainV3({ format: 'bad' }, TS)).rejects.toThrow(ApiError);
  });
});
