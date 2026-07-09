import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { skills } from '../db/client.js';
import { appendAudit, type Tx } from '../lib/audit.js';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { assertOperational } from './safety.service.js';

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

export type { SkillRow };
