/**
 * memory-batch.ts — Phase 12.31
 * Batch operations over memories.
 *
 * Bulk create / update / delete / tag with a single bounded
 * transaction per chunk. Drives the batch route and the
 * consolidation controller. Pure `applyBatch` planner is unit-tested.
 */
import { db } from '../db/client.js';
import { memories, memoryTags, tagTaxonomy } from '../db/client.js';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export type BatchOp =
  | { op: 'create'; id: string; kind: string; text: string; projectId: string; importance?: number }
  | { op: 'update'; id: string; patch: Record<string, unknown> }
  | { op: 'delete'; id: string }
  | { op: 'tag'; id: string; tag: string };

export interface BatchResult {
  applied: number;
  failed: number;
  errors: { index: number; message: string }[];
}

/**
 * Validate + plan a batch without touching the DB.
 * Returns the list of invalid operations.
 */
export function planBatch(ops: BatchOp[]): { index: number; message: string }[] {
  const errs: { index: number; message: string }[] = [];
  const seen = new Set<string>();
  ops.forEach((o, i) => {
    if (o.op === 'create') {
      if (!o.id || !o.kind || !o.text)
        errs.push({ index: i, message: 'create requires id/kind/text' });
      if (seen.has(o.id)) errs.push({ index: i, message: `duplicate id ${o.id}` });
      seen.add(o.id);
    } else if (o.op === 'update') {
      if (!o.id) errs.push({ index: i, message: 'update requires id' });
    } else if (o.op === 'delete') {
      if (!o.id) errs.push({ index: i, message: 'delete requires id' });
    } else if (o.op === 'tag') {
      if (!o.id || !o.tag) errs.push({ index: i, message: 'tag requires id/tag' });
    }
  });
  return errs;
}

/** Apply a batch with per-chunk transactions. */
export async function applyBatch(
  projectId: string,
  ops: BatchOp[],
  chunk = 100
): Promise<BatchResult> {
  const result: BatchResult = { applied: 0, failed: 0, errors: [] };
  const invalid = planBatch(ops);
  if (invalid.length) {
    result.failed = invalid.length;
    result.errors = invalid;
    ops = ops.filter((_, i) => !invalid.some((e) => e.index === i));
  }

  for (let i = 0; i < ops.length; i += chunk) {
    const slice = ops.slice(i, i + chunk);
    try {
      await db.transaction(async (tx) => {
        for (const o of slice) {
          if (o.op === 'create') {
            await tx.insert(memories).values({
              id: o.id,
              kind: o.kind,
              text: o.text,
              projectId,
              importance: o.importance ?? 0.5,
            });
          } else if (o.op === 'update') {
            await tx.update(memories).set(o.patch).where(eq(memories.id, o.id));
          } else if (o.op === 'delete') {
            await tx.update(memories).set({ deletedAt: new Date() }).where(eq(memories.id, o.id));
          } else if (o.op === 'tag') {
            const [tagRow] = await tx
              .select({ id: tagTaxonomy.id })
              .from(tagTaxonomy)
              .where(eq(tagTaxonomy.name, o.tag))
              .limit(1);
            const tagId = tagRow?.id ?? randomUUID();
            if (!tagRow) {
              await tx.insert(tagTaxonomy).values({ id: tagId, name: o.tag, kind: 'auto' });
            }
            await tx.insert(memoryTags).values({ memoryId: o.id, tagId }).onConflictDoNothing();
          }
        }
      });
      result.applied += slice.length;
    } catch (e) {
      result.failed += slice.length;
      result.errors.push({ index: i, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

/** Bulk soft-delete by ids (GDPR forget helper). */
export async function bulkDelete(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await db
    .update(memories)
    .set({ deletedAt: new Date() })
    .where(and(inArray(memories.id, ids), isNull(memories.deletedAt)));
  return res.rowsAffected ?? ids.length;
}
