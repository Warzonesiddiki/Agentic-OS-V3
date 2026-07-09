/**
 * brain.ts — brain export/import/compress. Import is Zod-schema-validated
 * (cannot inject invalid records) and idempotent via dedup; export NEVER
 * includes API keys or hashes.
 */
import { z } from 'zod';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { memories, skills } from '../db/client.js';
import { appendAudit, type Tx } from '../lib/audit.js';
import { estimateTokens } from '../lib/tokens.js';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';

const memoryImport = z.object({
  kind: z.enum(['episodic', 'semantic', 'preference', 'reflexion', 'fact']),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  importance: z.number().min(0).max(1).default(0.5),
  source: z.string().max(120).default('import'),
});

const skillImport = z.object({
  name: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(400),
  content: z.string().min(1),
  category: z.string().default('general'),
  tags: z.array(z.string()).default([]),
});

const brainSchema = z.object({
  format: z.literal('nexus-brain'),
  version: z.number(),
  memories: z.array(memoryImport).default([]),
  skills: z.array(skillImport).default([]),
});

function dedupeKey(title: string, content: string): string {
  return createHash('sha256')
    .update(`${title.trim().toLowerCase()}|${content.trim().toLowerCase().slice(0, 160)}`)
    .digest('hex');
}

export async function exportBrain(): Promise<unknown> {
  const [mem, skl] = await Promise.all([db.query.memories.findMany(), db.query.skills.findMany()]);
  return { format: 'nexus-brain', version: 2, exportedAt: Date.now(), memories: mem, skills: skl };
}

export async function importBrain(
  raw: unknown,
  actor: string
): Promise<{ memories: number; skills: number; duplicates: number }> {
  const parsed = brainSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Invalid brain payload: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`
    );
  }
  const data = parsed.data;
  const existingMems = await db.query.memories.findMany();
  const existingSkills = await db.query.skills.findMany();
  // All inserts commit atomically; a failure mid-import rolls back fully.
  const { memCreated, sklCreated, duplicates } = await db.transaction(async (tx: Tx) => {
    const seen = new Set(
      existingMems.map((m: (typeof existingMems)[number]) => dedupeKey(m.title, m.content))
    );
    let mc = 0;
    let dup = 0;
    for (const m of data.memories) {
      const k = dedupeKey(m.title, m.content);
      if (seen.has(k)) {
        dup++;
        continue;
      }
      seen.add(k);
      await tx.insert(memories).values({
        id: `mem_${randomUUID()}`,
        kind: m.kind,
        title: m.title,
        content: m.content,
        tags: m.tags,
        importance: m.importance,
        source: m.source,
        tokenCost: estimateTokens(m.content),
        recallCount: 0,
      });
      mc++;
    }
    const skillSeen = new Set(existingSkills.map((s: (typeof existingSkills)[number]) => s.name));
    let sc = 0;
    for (const s of data.skills) {
      if (skillSeen.has(s.name)) {
        dup++;
        continue;
      }
      skillSeen.add(s.name);
      await tx.insert(skills).values({
        id: `skl_${randomUUID()}`,
        name: s.name,
        title: s.title,
        description: s.description,
        content: s.content,
        category: s.category,
        tags: s.tags,
        source: 'import',
      });
      sc++;
    }
    return { memCreated: mc, sklCreated: sc, duplicates: dup };
  });

  await appendAudit(
    'brain.imported',
    { memories: memCreated, skills: sklCreated, duplicates },
    actor
  );
  return { memories: memCreated, skills: sklCreated, duplicates };
}

export async function compressBrain(actor: string): Promise<{ pruned: number; kept: number }> {
  // Prune low-importance, never-recalled, episodic memories older than 7 days.
  // Uses a single bulk DELETE + count in a transaction (not N+1 loop).
  const countCol = sql<number>`count(*)::int`;
  const [beforeRow] = await db.select({ total: countCol }).from(memories);

  return db.transaction(async (tx: Tx) => {
    const deleted = await tx
      .delete(memories)
      .where(
        and(
          eq(memories.kind, 'episodic'),
          lt(memories.importance, 0.2),
          eq(memories.recallCount, 0),
          lt(memories.updatedAt, new Date(Date.now() - 7 * 86_400_000))
        )
      )
      .returning({ id: memories.id });

    const [afterRow] = await tx.select({ total: countCol }).from(memories);
    await appendAudit(
      'brain.compressed',
      {
        pruned: deleted.length,
        before: beforeRow?.total ?? 0,
        after: afterRow?.total ?? 0,
      },
      actor,
      tx
    );

    return { pruned: deleted.length, kept: afterRow?.total ?? 0 };
  });
}

import { getTableColumns, type InferModel, type Table } from 'drizzle-orm';
import {
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
} from '../db/client.js';

/* PHASE 12 — Brain v3 schema export/import (Advanced Memory Systems) */

export const BRAIN_SCHEMA_VERSION = 3 as const;

export type MemoryV3 = {
  id: string;
  kind: 'episodic' | 'semantic' | 'preference' | 'reflexion' | 'fact';
  title: string;
  content: string;
  tags: string[];
  importance: number;
  source: string;
  projectId: string | null;
  clusterId: string | null;
  language: string;
  privacyZone: 'public' | 'private' | 'restricted';
  confidence: number | null;
  version: number | null;
  recallCount: number;
  tokenCost: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  lastRecalledAt: string | Date | null;
};

export type SkillV3 = {
  id: string;
  name: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  source: string;
  [key: string]: unknown;
};

export type BrainExportV3 = {
  format: 'nexus-brain';
  version: 3;
  exportedAt: number;
  memories: MemoryV3[];
  skills: SkillV3[];
  clusters: InferModel<typeof memoryClusters, 'select'>[];
  sessionLinks: InferModel<typeof sessionLinks, 'select'>[];
  causalEdges: InferModel<typeof memoryCausalEdges, 'select'>[];
  attachments: InferModel<typeof memoryAttachments, 'select'>[];
  contradictions: InferModel<typeof memoryContradictions, 'select'>[];
  emotions: InferModel<typeof memoryEmotions, 'select'>[];
  tagTaxonomy: InferModel<typeof tagTaxonomy, 'select'>[];
  memoryTags: InferModel<typeof memoryTags, 'select'>[];
  templates: InferModel<typeof memoryTemplates, 'select'>[];
  quotas: InferModel<typeof agentMemoryQuotas, 'select'>[];
  archive: InferModel<typeof memoryArchive, 'select'>[];
  diffMarkers: InferModel<typeof memoryDiffMarkers, 'select'>[];
  rehearsalLog: InferModel<typeof memoryRehearsalLog, 'select'>[];
};

export type BrainImportV3Report = {
  memories: number;
  skills: number;
  clusters: number;
  sessionLinks: number;
  causalEdges: number;
  attachments: number;
  contradictions: number;
  emotions: number;
  tagTaxonomy: number;
  memoryTags: number;
  templates: number;
  quotas: number;
  archive: number;
  diffMarkers: number;
  rehearsalLog: number;
  duplicates: number;
};

const skillImportV3 = skillImport.extend({
  id: z.string().optional(),
  source: z.string().optional(),
});

const memoryImportV3 = z.object({
  id: z.string().optional(),
  kind: z.enum(['episodic', 'semantic', 'preference', 'reflexion', 'fact']),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  importance: z.number().min(0).max(1).default(0.5),
  source: z.string().max(120).default('import'),
  projectId: z.string().nullable().optional(),
  clusterId: z.string().nullable().optional(),
  language: z.string().max(20).default('en'),
  privacyZone: z.enum(['public', 'private', 'restricted']).default('public'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  version: z.number().int().nullable().optional(),
  recallCount: z.number().int().default(0),
  tokenCost: z.number().int().default(0),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  lastRecalledAt: z.union([z.string(), z.date()]).nullable().optional(),
});

const rowIdSchema = z.object({ id: z.string() }).catchall(z.unknown());

const brainV3Schema = z.object({
  format: z.literal('nexus-brain'),
  version: z.literal(3),
  exportedAt: z.number().optional(),
  memories: z.array(memoryImportV3).default([]),
  skills: z.array(skillImportV3).default([]),
  clusters: z.array(rowIdSchema).default([]),
  sessionLinks: z.array(rowIdSchema).default([]),
  causalEdges: z.array(rowIdSchema).default([]),
  attachments: z.array(rowIdSchema).default([]),
  contradictions: z.array(rowIdSchema).default([]),
  emotions: z.array(rowIdSchema).default([]),
  tagTaxonomy: z.array(rowIdSchema).default([]),
  memoryTags: z.array(rowIdSchema).default([]),
  templates: z.array(rowIdSchema).default([]),
  quotas: z.array(rowIdSchema).default([]),
  archive: z.array(rowIdSchema).default([]),
  diffMarkers: z.array(rowIdSchema).default([]),
  rehearsalLog: z.array(rowIdSchema).default([]),
});

async function importPhase12Table(
  tx: Tx,
  table: Table,
  rows: Array<Record<string, unknown> & { id: string }>
): Promise<number> {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const columns = getTableColumns(table);
  const idColumn = columns.id;
  if (!idColumn) return 0;
  const existing = await tx.select({ id: idColumn as never }).from(table as never);
  const seen = new Set((existing as Array<{ id: string }>).map((r) => r.id));
  const fresh = rows.filter((r) => !seen.has(r.id));
  if (fresh.length === 0) return 0;
  await tx.insert(table as never).values(fresh as never);
  return fresh.length;
}

function isV3Payload(raw: unknown): raw is { version: number } {
  return (
    !!raw &&
    typeof raw === 'object' &&
    typeof (raw as { version?: unknown }).version === 'number' &&
    (raw as { version: number }).version === BRAIN_SCHEMA_VERSION
  );
}

export function migrateBrainV2ToV3(old: unknown): BrainExportV3 {
  const parsed = brainSchema.safeParse(old);
  const v2 = parsed.success ? parsed.data : { memories: [], skills: [] };
  return {
    format: 'nexus-brain',
    version: BRAIN_SCHEMA_VERSION,
    exportedAt: Date.now(),
    memories: v2.memories.map((m) => ({
      id: `mem_${randomUUID()}`,
      kind: m.kind,
      title: m.title,
      content: m.content,
      tags: m.tags,
      importance: m.importance,
      source: m.source,
      projectId: null,
      clusterId: null,
      language: 'en',
      privacyZone: 'public',
      confidence: null,
      version: null,
      recallCount: 0,
      tokenCost: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastRecalledAt: null,
    })),
    skills: v2.skills.map((s) => ({
      id: `skl_${randomUUID()}`,
      name: s.name,
      title: s.title,
      description: s.description,
      content: s.content,
      category: s.category,
      tags: s.tags,
      source: 'import',
    })),
    clusters: [],
    sessionLinks: [],
    causalEdges: [],
    attachments: [],
    contradictions: [],
    emotions: [],
    tagTaxonomy: [],
    memoryTags: [],
    templates: [],
    quotas: [],
    archive: [],
    diffMarkers: [],
    rehearsalLog: [],
  };
}

function normalizeBrainInput(raw: unknown): unknown {
  return isV3Payload(raw) ? raw : migrateBrainV2ToV3(raw);
}

export async function exportBrainV3(): Promise<BrainExportV3> {
  const [
    memRows,
    sklRows,
    clusters,
    links,
    edges,
    attachments,
    contradictions,
    emotions,
    taxonomy,
    memoryTagsRows,
    templates,
    quotas,
    archive,
    diffMarkers,
    rehearsal,
  ] = await Promise.all([
    db
      .select({
        id: memories.id,
        kind: memories.kind,
        title: memories.title,
        content: memories.content,
        tags: memories.tags,
        importance: memories.importance,
        source: memories.source,
        projectId: memories.projectId,
        clusterId: memories.clusterId,
        language: memories.language,
        privacyZone: memories.privacyZone,
        confidence: memories.confidence,
        version: memories.version,
        recallCount: memories.recallCount,
        tokenCost: memories.tokenCost,
        createdAt: memories.createdAt,
        updatedAt: memories.updatedAt,
        lastRecalledAt: memories.lastRecalledAt,
      })
      .from(memories),
    db.select().from(skills),
    db.select().from(memoryClusters),
    db.select().from(sessionLinks),
    db.select().from(memoryCausalEdges),
    db.select().from(memoryAttachments),
    db.select().from(memoryContradictions),
    db.select().from(memoryEmotions),
    db.select().from(tagTaxonomy),
    db.select().from(memoryTags),
    db.select().from(memoryTemplates),
    db.select().from(agentMemoryQuotas),
    db.select().from(memoryArchive),
    db.select().from(memoryDiffMarkers),
    db.select().from(memoryRehearsalLog),
  ]);

  return {
    format: 'nexus-brain',
    version: BRAIN_SCHEMA_VERSION,
    exportedAt: Date.now(),
    memories: memRows.map((m: MemoryV3) => ({
      id: m.id,
      kind: m.kind as MemoryV3['kind'],
      title: m.title,
      content: m.content,
      tags: m.tags,
      importance: m.importance,
      source: m.source,
      projectId: m.projectId ?? null,
      clusterId: m.clusterId ?? null,
      language: m.language ?? 'en',
      privacyZone: (m.privacyZone ?? 'public') as MemoryV3['privacyZone'],
      confidence: m.confidence ?? null,
      version: m.version ?? null,
      recallCount: m.recallCount,
      tokenCost: m.tokenCost,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      lastRecalledAt: m.lastRecalledAt ?? null,
    })),
    skills: sklRows as SkillV3[],
    clusters,
    sessionLinks: links,
    causalEdges: edges,
    attachments,
    contradictions,
    emotions,
    tagTaxonomy: taxonomy,
    memoryTags: memoryTagsRows,
    templates,
    quotas,
    archive,
    diffMarkers,
    rehearsalLog: rehearsal,
  };
}

export async function importBrainV3(raw: unknown, actor: string): Promise<BrainImportV3Report> {
  const normalized = normalizeBrainInput(raw);
  const parsed = brainV3Schema.safeParse(normalized);
  if (!parsed.success) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Invalid v3 brain payload: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`
    );
  }
  const data = parsed.data;

  const report = await db.transaction(async (tx: Tx) => {
    let memCount = 0;
    let sklCount = 0;
    let duplicates = 0;

    const existingMems = await tx
      .select({ id: memories.id, title: memories.title, content: memories.content })
      .from(memories);
    const memSeen = new Set(
      existingMems.map((m: { id: string; title: string; content: string }) =>
        dedupeKey(m.title, m.content)
      )
    );
    const memSeenIds = new Set(existingMems.map((m: { id: string }) => m.id));
    for (const m of data.memories) {
      if (memSeenIds.has(m.id) || memSeen.has(dedupeKey(m.title, m.content))) {
        duplicates++;
        continue;
      }
      memSeen.add(dedupeKey(m.title, m.content));
      await tx.insert(memories).values({
        id: m.id ?? `mem_${randomUUID()}`,
        kind: m.kind,
        title: m.title,
        content: m.content,
        tags: m.tags,
        importance: m.importance,
        source: m.source,
        projectId: m.projectId ?? null,
        clusterId: m.clusterId ?? null,
        language: m.language,
        privacyZone: m.privacyZone,
        confidence: m.confidence ?? null,
        version: m.version ?? null,
        recallCount: m.recallCount,
        tokenCost: m.tokenCost || estimateTokens(m.content),
        createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
        updatedAt: m.updatedAt ? new Date(m.updatedAt) : new Date(),
        lastRecalledAt: m.lastRecalledAt ? new Date(m.lastRecalledAt) : null,
      });
      memCount++;
    }

    const existingSkills = await tx.select({ id: skills.id, name: skills.name }).from(skills);
    const skillSeen = new Set(existingSkills.map((s: { id: string; name: string }) => s.name));
    const skillSeenIds = new Set(existingSkills.map((s: { id: string }) => s.id));
    for (const s of data.skills) {
      if (skillSeenIds.has(s.id) || skillSeen.has(s.name)) {
        duplicates++;
        continue;
      }
      skillSeen.add(s.name);
      await tx.insert(skills).values({
        id: s.id ?? `skl_${randomUUID()}`,
        name: s.name,
        title: s.title,
        description: s.description,
        content: s.content,
        category: s.category,
        tags: s.tags,
        source: s.source ?? 'import',
      });
      sklCount++;
    }

    const cl = await importPhase12Table(tx, memoryClusters, data.clusters);
    const tp = await importPhase12Table(tx, memoryTemplates, data.templates);
    const qo = await importPhase12Table(tx, agentMemoryQuotas, data.quotas);
    const ar = await importPhase12Table(tx, memoryArchive, data.archive);
    const tx2 = await importPhase12Table(tx, tagTaxonomy, data.tagTaxonomy);
    const mt = await importPhase12Table(tx, memoryTags, data.memoryTags);
    const sl = await importPhase12Table(tx, sessionLinks, data.sessionLinks);
    const ce = await importPhase12Table(tx, memoryCausalEdges, data.causalEdges);
    const at = await importPhase12Table(tx, memoryAttachments, data.attachments);
    const mc = await importPhase12Table(tx, memoryContradictions, data.contradictions);
    const em = await importPhase12Table(tx, memoryEmotions, data.emotions);
    const dm = await importPhase12Table(tx, memoryDiffMarkers, data.diffMarkers);
    const rl = await importPhase12Table(tx, memoryRehearsalLog, data.rehearsalLog);

    return {
      memories: memCount,
      skills: sklCount,
      clusters: cl,
      sessionLinks: sl,
      causalEdges: ce,
      attachments: at,
      contradictions: mc,
      emotions: em,
      tagTaxonomy: tx2,
      memoryTags: mt,
      templates: tp,
      quotas: qo,
      archive: ar,
      diffMarkers: dm,
      rehearsalLog: rl,
      duplicates,
    };
  });

  await appendAudit(
    'brain.imported_v3',
    {
      memories: report.memories,
      skills: report.skills,
      clusters: report.clusters,
      duplicates: report.duplicates,
    },
    actor
  );

  return report;
}
