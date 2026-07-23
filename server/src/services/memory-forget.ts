/**
 * memory-forget.ts — right-to-be-forgotten + purge (Phase 12).
 *
 * `forgetMe` soft-deletes (sets deletedAt) any memory matching an id or
 * GDPR-style content/PII substring. `purgeForgottenMemories` hard-deletes
 * rows whose deletedAt is older than the retention window.
 */
import { db, withTransaction } from '../db/client.js';
import { memories } from '../db/client.js';
import { and, eq, isNull, like, lt, or } from 'drizzle-orm';

export interface ForgetReport {
  requestedAt: string;
  identifier: string;
  matched: number;
  softDeleted: number;
  hardDeletedAfter30d: number;
  ids: string[];
}

export interface PurgeReport {
  purged: number;
  ids: string[];
  retentionDays: number;
}

const MS_PER_DAY = 86_400_000;

function nowValue(): Date {
  return new Date();
}

function cutoffValue(days: number): Date {
  return new Date(Date.now() - days * MS_PER_DAY);
}

export async function forgetMe(identifier: string): Promise<ForgetReport> {
  const idMatches = (await db
    .select({ id: memories.id })
    .from(memories)
    .where(eq(memories.id, identifier))) as Array<{ id: string }>;

  const contentMatches = (await db
    .select({ id: memories.id })
    .from(memories)
    .where(
      or(
        like(memories.title, `%${identifier}%`),
        like(memories.content, `%${identifier}%`),
        like(memories.tags, `%${identifier}%`)
      )
    )) as Array<{ id: string }>;

  const idSet = new Set<string>();
  for (const r of idMatches) idSet.add(r.id);
  for (const r of contentMatches) idSet.add(r.id);
  const ids = Array.from(idSet);

  const updatedIds: string[] = [];
  await withTransaction(async (tx) => {
    for (const id of ids) {
      const [updated] = await tx
        .update(memories)
        .set({ deletedAt: nowValue() })
        .where(and(eq(memories.id, id), isNull(memories.deletedAt)))
        .returning({ id: memories.id });
      if (updated) updatedIds.push(updated.id);
    }
  });

  return {
    requestedAt: new Date().toISOString(),
    identifier,
    matched: ids.length,
    softDeleted: updatedIds.length,
    hardDeletedAfter30d: 0,
    ids: updatedIds,
  };
}

export async function purgeForgottenMemories(opts?: {
  retentionDays?: number;
}): Promise<PurgeReport> {
  const retentionDays = opts?.retentionDays ?? 30;
  const cutoff = cutoffValue(retentionDays);
  const deleted = (await db
    .delete(memories)
    .where(lt(memories.deletedAt, cutoff))
    .returning({ id: memories.id })) as Array<{ id: string }>;

  return {
    purged: deleted.length,
    ids: deleted.map((d) => d.id),
    retentionDays,
  };
}
