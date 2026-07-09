import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, memories } from '../db/client.js';
import type { Memory } from './memory-hierarchy.js';

export const HALFLIFE_HOURS: Record<string, number> = {
  episodic: 12,
  semantic: 168,
  preference: 168,
  reflexion: 168,
  fact: 720,
};

export function halflifeForKind(kind: string): number {
  return HALFLIFE_HOURS[kind] ?? 168;
}

export function computeDecayedImportance(
  importance: number,
  deltaHours: number,
  halflifeHours: number
): number {
  const decayed = importance * Math.exp(-deltaHours / Math.max(halflifeHours, 1e-4));
  return Math.min(1, Math.max(0, decayed));
}

export interface MemoryDecayResult {
  updated: number;
}

export async function decayImportance(
  opts: { projectId?: string; limit?: number } = {}
): Promise<MemoryDecayResult> {
  const rows: Memory[] = await db.query.memories.findMany({
    where: and(
      isNull(memories.deletedAt),
      gt(memories.importance, 0),
      opts.projectId ? eq(memories.projectId, opts.projectId) : undefined
    ),
    limit: opts.limit ?? 1000,
  });

  let updated = 0;
  for (const m of rows) {
    const deltaHours = (Date.now() - new Date(m.createdAt).getTime()) / 3600000;
    const halflife = m.decayHalflifeHours ?? halflifeForKind(m.kind);
    const next = computeDecayedImportance(m.importance, deltaHours, halflife);
    if (next !== m.importance) {
      await db.update(memories).set({ importance: next }).where(eq(memories.id, m.id));
      updated++;
    }
  }
  return { updated };
}
