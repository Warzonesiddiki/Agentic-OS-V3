import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { db, memories, sessionLinks } from '../db/client.js';
import { cosineSimilarity, tagsOf, toVector } from './memory-hierarchy.js';
import type { Memory } from './memory-hierarchy.js';
import { randomUUID } from 'node:crypto';

export const STITCH_SIMILARITY_THRESHOLD = 0.85;
export const STITCH_MIN_SHARED_ENTITIES = 2;

export interface StitchResult {
  links: number;
  boosted: number;
}

export async function stitchSessionMemories(
  sessionId: string,
  memoryIds: string[]
): Promise<StitchResult> {
  if (memoryIds.length < 2) return { links: 0, boosted: 0 };
  const rows: Memory[] = await db.query.memories.findMany({
    where: and(inArray(memories.id, memoryIds), isNull(memories.deletedAt)),
  });

  const boosted = new Set<string>();
  let links = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (!a || !b) continue;
      const sim = cosineSimilarity(toVector(a.embedding), toVector(b.embedding));
      const aTags = tagsOf(a);
      const bTags = tagsOf(b);
      const shared = aTags.filter((e) => bTags.includes(e));
      if (sim > STITCH_SIMILARITY_THRESHOLD && shared.length >= STITCH_MIN_SHARED_ENTITIES) {
        await db.insert(sessionLinks).values({
          id: `lnk_${randomUUID()}`,
          sessionId,
          memoryA: a.id,
          memoryB: b.id,
          similarity: sim,
          sharedEntities: shared,
          createdAt: new Date(),
        } as unknown as InferInsertModel<typeof sessionLinks>);
        for (const m of [a, b]) {
          if (!boosted.has(m.id)) {
            await db
              .update(memories)
              .set({ importance: Math.min(1, m.importance + 0.05) })
              .where(eq(memories.id, m.id));
            boosted.add(m.id);
          }
        }
        links++;
      }
    }
  }
  return { links, boosted: boosted.size };
}
