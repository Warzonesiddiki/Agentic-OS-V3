import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { memories, skills, projects } from '../db/client.js';
import { appendAudit, type Tx } from '../lib/audit.js';
import { estimateTokens } from '../lib/tokens.js';
import { randomUUID } from 'node:crypto';
import { assertOperational } from './safety.service.js';
import type { SkillRow } from './skill.service.js';

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

export async function ensureProject(
  name: string,
  source: string
): Promise<{ id: string; created: boolean }> {
  await assertOperational();
  return db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
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
