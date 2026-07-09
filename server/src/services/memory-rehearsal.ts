import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db, memories } from '../db/client.js';
import type { Memory } from './memory-hierarchy.js';

export const REHEARSAL_INTERVALS_DAYS: number[] = [1, 3, 7, 30];

export function nextRehearsalInterval(rehearsalCount: number): number {
  const i = Math.max(0, Math.floor(rehearsalCount));
  return REHEARSAL_INTERVALS_DAYS[Math.min(i, REHEARSAL_INTERVALS_DAYS.length - 1)] ?? 30;
}

export function boostForRehearsal(rehearsalCount: number): number {
  return Math.min(0.15, 0.05 + Math.max(0, rehearsalCount) * 0.02);
}

export interface MemoryRehearsalResult {
  rehearsed: number;
}

function applyRehearsal(
  m: Memory,
  now: Date
): { nextCount: number; nextReviewAt: Date; importance: number } {
  const count = m.rehearsalCount ?? 0;
  const nextCount = count + 1;
  const interval = nextRehearsalInterval(count);
  const nextReviewAt = new Date(now.getTime() + interval * 24 * 3600 * 1000);
  const importance = Math.min(1, m.importance + boostForRehearsal(count));
  return { nextCount, nextReviewAt, importance };
}

export async function rehearseDueMemories(
  opts: { now?: Date; limit?: number } = {}
): Promise<MemoryRehearsalResult> {
  const now = opts.now ?? new Date();
  const rows: Memory[] = await db.query.memories.findMany({
    where: and(
      isNull(memories.deletedAt),
      or(isNull(memories.nextReviewAt), lte(memories.nextReviewAt, now))
    ),
    limit: opts.limit ?? 1000,
  });

  let rehearsed = 0;
  for (const m of rows) {
    const { nextCount, nextReviewAt, importance } = applyRehearsal(m, now);
    await db
      .update(memories)
      .set({ rehearsalCount: nextCount, nextReviewAt, importance })
      .where(eq(memories.id, m.id));
    rehearsed++;
  }
  return { rehearsed };
}

export async function rehearseMemory(id: string, now: Date = new Date()): Promise<boolean> {
  const m = await db.query.memories.findFirst({ where: eq(memories.id, id) });
  if (!m) return false;
  const { nextCount, nextReviewAt, importance } = applyRehearsal(m, now);
  await db
    .update(memories)
    .set({ rehearsalCount: nextCount, nextReviewAt, importance })
    .where(eq(memories.id, m.id));
  return true;
}
