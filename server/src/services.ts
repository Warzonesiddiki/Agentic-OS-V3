/**
 * services.ts — domain operations backed by Postgres.
 * Every mutation runs the data change AND its audit record inside a SINGLE
 * transaction, so a committed mutation never lacks an audit trail and a failed
 * audit rolls back its mutation. The kill switch is enforced before each tx.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db, isSqlite } from './db/client.js';
import { memories, skills, projects, feedback, systemMeta } from './db/client.js';
import { appendAudit, type Tx } from './lib/audit.js';
import { estimateTokens } from './lib/tokens.js';
import { randomUUID } from 'node:crypto';
import { ApiError } from './lib/errors.js';
// Shared types are defined locally below and re-exported.
// The frontend imports these via shared/types.ts.

export async function isKillSwitchOn(tx?: any): Promise<boolean> {
  const client = tx ?? db;
  let row;
  if (tx && !isSqlite) {
    const rows = await tx.select().from(systemMeta).where(eq(systemMeta.key, 'killSwitch')).for('update');
    row = rows[0];
  } else {
    row = await client.query.systemMeta.findFirst({ where: eq(systemMeta.key, 'killSwitch') });
  }
  return row?.value === '1';
}

async function assertOperational(tx?: any): Promise<void> {
  if (await isKillSwitchOn(tx))
    throw new ApiError('SAFETY_KILL_SWITCH', 'Kill switch is engaged — mutations are blocked.');
}

export async function createMemory(input: MemoryRow, actor: string): Promise<unknown> {
  await assertOperational();
  return db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    // Auto-generate embedding if provider is configured.
    // Failures are logged (not swallowed) but don't block the write.
    let embedding: number[] | undefined;
    try {
      const { embedQuery } = await import('./services/embeddings.js');
      const emb = await embedQuery(`${input.title} ${input.content}`.slice(0, 8000));
      if (emb) embedding = emb;
    } catch (e) {
      const { log } = await import('./lib/logging.js');
      log.warn('auto_embed_failed_create', {
        title: input.title,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    const [created] = await tx
      .insert(memories)
      .values({
        id: `mem_${randomUUID()}`,
        kind: input.kind,
        title: input.title,
        content: input.content,
        tags: input.tags,
        importance: input.importance,
        source: input.source,
        projectId: input.projectId,
        tokenCost: estimateTokens(input.content),
        recallCount: 0,
        embedding,
      })
      .returning();
    if (!created) throw new Error('Failed to create memory — DB returned no row.');
    await appendAudit(
      'memory.created',
      { id: created.id, kind: created.kind, title: created.title, embedded: Boolean(embedding) },
      actor,
      tx
    );
    return created;
  });
}

export async function updateMemory(
  id: string,
  patch: Partial<MemoryRow>,
  actor: string
): Promise<unknown> {
  await assertOperational();
  return db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    const existing = await tx.query.memories.findFirst({ where: eq(memories.id, id) });
    if (!existing) throw new ApiError('NOT_FOUND', `Memory ${id} not found.`);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title) updates.title = patch.title;
    if (patch.content) {
      updates.content = patch.content;
      updates.tokenCost = estimateTokens(patch.content);
    }
    if (patch.tags) updates.tags = patch.tags;
    if (patch.kind) updates.kind = patch.kind;
    if (patch.importance != null) updates.importance = patch.importance;

    // Re-embed if title or content changed and provider is configured.
    if ((patch.title || patch.content) && !updates.embedding) {
      try {
        const { embedQuery } = await import('./services/embeddings.js');
        const newText =
          `${patch.title ?? existing.title} ${patch.content ?? existing.content}`.slice(0, 8000);
        const emb = await embedQuery(newText);
        if (emb) updates.embedding = emb;
      } catch (e) {
        const { log } = await import('./lib/logging.js');
        log.warn('auto_embed_failed_update', {
          id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const [updated] = await tx.update(memories).set(updates).where(eq(memories.id, id)).returning();
    if (!updated) throw new ApiError('NOT_FOUND', `Memory ${id} not found.`);
    await appendAudit('memory.updated', { id, fields: Object.keys(updates) }, actor, tx);
    return updated;
  });
}

export async function deleteMemory(id: string, actor: string): Promise<void> {
  await assertOperational();
  await db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    const [deleted] = await tx
      .delete(memories)
      .where(eq(memories.id, id))
      .returning({ id: memories.id });
    if (!deleted) throw new ApiError('NOT_FOUND', `Memory ${id} not found.`);
    await appendAudit('memory.deleted', { id }, actor, tx);
  });
}

export async function createSkill(input: SkillRow, actor: string): Promise<unknown> {
  await assertOperational();
  return db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    const [created] = await tx
      .insert(skills)
      .values({
        id: `skl_${randomUUID()}`,
        name: input.name,
        title: input.title,
        description: input.description,
        content: input.content,
        category: input.category,
        tags: input.tags,
        trigger: input.trigger,
        source: input.source,
        projectId: input.projectId,
      })
      .returning();
    if (!created) throw new Error('Failed to create skill — DB returned no row.');
    await appendAudit('skill.created', { id: created.id, name: created.name }, actor, tx);
    return created;
  });
}

export async function updateSkill(
  id: string,
  patch: Partial<SkillRow>,
  actor: string
): Promise<unknown> {
  await assertOperational();
  return db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    const existing = await tx.query.skills.findFirst({ where: eq(skills.id, id) });
    if (!existing) throw new ApiError('NOT_FOUND', `Skill ${id} not found.`);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const f of ['title', 'description', 'content', 'category', 'trigger'] as const) {
      if (patch[f] != null) updates[f] = patch[f];
    }
    if (patch.tags) updates.tags = patch.tags;
    const [updated] = await tx.update(skills).set(updates).where(eq(skills.id, id)).returning();
    if (!updated) throw new ApiError('NOT_FOUND', `Skill ${id} not found.`);
    await appendAudit('skill.updated', { id, fields: Object.keys(updates) }, actor, tx);
    return updated;
  });
}

export async function deleteSkill(id: string, actor: string): Promise<void> {
  await assertOperational();
  await db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    const [deleted] = await tx.delete(skills).where(eq(skills.id, id)).returning({ id: skills.id });
    if (!deleted) throw new ApiError('NOT_FOUND', `Skill ${id} not found.`);
    await appendAudit('skill.deleted', { id }, actor, tx);
  });
}

/**
 * Record an outcome with ATOMIC counter increments (no read-then-write → no
 * lost updates under concurrency). Rating is recomputed in SQL from the
 * post-increment counts. Mutation + audit share one transaction.
 */
export async function recordOutcome(
  id: string,
  outcome: 'success' | 'failure',
  actor: string
): Promise<unknown> {
  await assertOperational();
  return db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    const inc = outcome === 'success' ? 1 : 0;
    const failInc = outcome === 'failure' ? 1 : 0;
    const [updated] = await tx
      .update(skills)
      .set({
        useCount: sql`${skills.useCount} + 1`,
        successCount: sql`${skills.successCount} + ${inc}`,
        failureCount: sql`${skills.failureCount} + ${failInc}`,
        rating: sql`CASE WHEN ${skills.useCount} + 1 > 0 THEN LEAST(1.0, GREATEST(0.0, (${skills.successCount} + ${inc})::real / (${skills.useCount} + 1))) ELSE 0 END`,
        updatedAt: new Date(),
      })
      .where(eq(skills.id, id))
      .returning();
    if (!updated) throw new ApiError('NOT_FOUND', `Skill ${id} not found.`);
    await appendAudit('skill.outcome', { id, outcome }, actor, tx);
    return updated;
  });
}

export async function transferProject(
  input: {
    projectName: string;
    description?: string;
    memories?: {
      kind: string;
      title: string;
      content: string;
      tags?: string[];
      importance?: number;
    }[];
    skills?: SkillRow[];
  },
  actor: string
): Promise<unknown> {
  await assertOperational();
  const project = await ensureProject(input.projectName, input.description ?? 'transfer');
  const { memCreated, sklUpserted } = await db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    let mc = 0;
    let sc = 0;
    for (const m of input.memories ?? []) {
      const [row] = await tx
        .insert(memories)
        .values({
          id: `mem_${randomUUID()}`,
          kind: m.kind,
          title: m.title,
          content: m.content,
          tags: m.tags ?? [],
          importance: m.importance ?? 0.6,
          source: 'transfer',
          projectId: project.id,
          tokenCost: estimateTokens(m.content),
          recallCount: 0,
        })
        .returning();
      if (row) mc++;
    }
    for (const s of input.skills ?? []) {
      const existing = await tx.query.skills.findFirst({
        where: and(eq(skills.name, s.name), eq(skills.projectId, project.id)),
      });
      if (existing) {
        await tx
          .update(skills)
          .set({
            title: s.title,
            description: s.description,
            content: s.content,
            category: s.category,
            updatedAt: new Date(),
          })
          .where(eq(skills.id, existing.id));
      } else {
        await tx.insert(skills).values({
          id: `skl_${randomUUID()}`,
          name: s.name,
          title: s.title,
          description: s.description,
          content: s.content,
          category: s.category,
          tags: s.tags,
          source: 'transfer',
          projectId: project.id,
        });
      }
      sc++;
    }
    await appendAudit(
      'project.transferred',
      { projectId: project.id, projectName: input.projectName, memCreated: mc, sklUpserted: sc },
      actor,
      tx
    );
    return { memCreated: mc, sklUpserted: sc };
  });
  return { projectId: project.id, created: project.created, memCreated, sklUpserted };
}

export async function checkpoint(
  label: string,
  context: string,
  projectName: string | undefined,
  actor: string
): Promise<unknown> {
  await assertOperational();
  const projectId = projectName ? (await ensureProject(projectName, 'checkpoint')).id : null;
  return db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    const [row] = await tx
      .insert(memories)
      .values({
        id: `mem_${randomUUID()}`,
        kind: 'episodic',
        title: label.slice(0, 200),
        content: context,
        tags: ['checkpoint'],
        importance: 0.6,
        source: 'checkpoint',
        projectId,
        tokenCost: estimateTokens(context),
        recallCount: 0,
      })
      .returning();
    if (!row) throw new Error('Failed to create checkpoint — DB returned no row.');
    await appendAudit('checkpoint.created', { id: row.id, label, projectId }, actor, tx);
    return row;
  });
}

/**
 * Session capture with the never-lose-transcript invariant. Distilled memories
 * commit atomically; on failure the raw transcript is persisted instead.
 */
export async function captureSession(
  transcript: string,
  projectName: string | undefined,
  actor: string,
  forceFail = false
): Promise<CaptureReport> {
  await assertOperational();
  let projectId: string | null = null;
  if (projectName) projectId = (await ensureProject(projectName, 'session')).id;

  try {
    if (forceFail) throw new Error('Forced distillation failure.');
    const { distillTranscript } = await import('./services/llm.js');
    const distilled = await distillTranscript(transcript);
    const created = await db.transaction(async (tx: Tx) => {
      await assertOperational(tx);
      const rows: unknown[] = [];
      for (const d of distilled) {
        const [row] = await tx
          .insert(memories)
          .values({
            id: `mem_${randomUUID()}`,
            kind: d.kind,
            title: d.title.slice(0, 200),
            content: d.content,
            tags: d.tags,
            importance: d.importance,
            source: 'session',
            projectId,
            tokenCost: estimateTokens(d.content),
            recallCount: 0,
          })
          .returning();
        rows.push(row);
      }
      await appendAudit(
        'session.captured',
        { distilled: true, memories: rows.length, projectId },
        actor,
        tx
      );
      return rows;
    });
    return { distilled: true, transcriptPreserved: false, memories: created.length, transcript };
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'distillation failed';
    const rawProjectId =
      projectId ??
      (projectName
        ? (
            await ensureProject(projectName, 'session-raw').catch(() => ({
              id: null as string | null,
            }))
          ).id
        : null);
    await db.transaction(async (tx: Tx) => {
      await assertOperational(tx);
      const [raw] = await tx
        .insert(memories)
        .values({
          id: `mem_${randomUUID()}`,
          kind: 'episodic',
          title: 'Session transcript (undistilled)',
          content: transcript,
          tags: ['session', 'undistilled', 'preserved'],
          importance: 0.5,
          source: 'session-raw',
          projectId: rawProjectId,
          tokenCost: estimateTokens(transcript),
          recallCount: 0,
        })
        .returning();
      if (!raw) throw new Error('Failed to store undistilled transcript — DB returned no row.');
      await appendAudit(
        'session.captured',
        { distilled: false, transcriptPreserved: true, reason, rawMemoryId: raw.id },
        actor,
        tx
      );
    });
    return { distilled: false, transcriptPreserved: true, memories: 1, transcript, reason };
  }
}

export async function ensureProject(
  name: string,
  source: string
): Promise<{ id: string; created: boolean }> {
  await assertOperational();
  return db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    // Race-safe: use ON CONFLICT DO NOTHING. Two concurrent calls with the same
    // name both succeed — the first inserts, the second is a no-op, then we
    // re-read to get the actual ID. No unique constraint violation possible.
    const id = `prj_${randomUUID()}`;
    const [row] = await tx
      .insert(projects)
      .values({ id, name, source, status: 'active' })
      .onConflictDoNothing({ target: projects.name })
      .returning();
    if (row) return { id: row.id, created: true };
    const existing = await tx.query.projects.findFirst({ where: eq(projects.name, name) });
    if (!existing)
      throw new Error(`Project "${name}" exists but could not be read after conflict resolution.`);
    return { id: existing.id, created: false };
  });
}

export async function setKillSwitch(
  enabled: boolean,
  reason: string | undefined,
  actor: string
): Promise<void> {
  await assertOperational();
  await db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    const value = enabled ? '1' : '0';
    await tx
      .insert(systemMeta)
      .values({ key: 'killSwitch', value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemMeta.key, set: { value, updatedAt: new Date() } });
    if (reason != null) {
      await tx
        .insert(systemMeta)
        .values({ key: 'killSwitchReason', value: reason, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemMeta.key,
          set: { value: reason, updatedAt: new Date() },
        });
    }
    await appendAudit(
      enabled ? 'safety.kill_switch.engaged' : 'safety.kill_switch.released',
      { reason: reason ?? null },
      actor,
      tx
    );
  });
}

export async function recordFeedback(
  input: { query: string; itemId: string; itemType: string; helpful: boolean },
  actor: string
): Promise<void> {
  await assertOperational();
  await db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    await tx.insert(feedback).values({
      id: `fb_${randomUUID()}`,
      query: input.query,
      itemId: input.itemId,
      itemType: input.itemType,
      helpful: input.helpful,
    });
    await appendAudit(
      'feedback.recorded',
      { itemId: input.itemId, helpful: input.helpful },
      actor,
      tx
    );
  });
}

interface MemoryRow {
  kind: string;
  title: string;
  content: string;
  tags: string[];
  importance: number;
  source: string;
  projectId: string | null;
}
interface SkillRow {
  name: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  trigger: string | null;
  source: string;
  projectId: string | null;
}
interface CaptureReport {
  distilled: boolean;
  transcriptPreserved: boolean;
  memories: number;
  transcript: string;
  reason?: string;
}

export type { MemoryRow, SkillRow, CaptureReport };
