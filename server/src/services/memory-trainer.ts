/**
 * memory-trainer.ts — Phase 12.10
 * Feedback-weighted ranking trainer.
 *
 * Aggregates human/implicit feedback (the `feedback` table, Also
 * consumed by memory-rehearsal for SM-2) into a per-tag /
 * per-kind weight vector that re-ranks recall results. Pure +
 * deterministic so it can be unit-tested without a DB.
 */
import { db } from '../db/client.js';
import { feedback, memories } from '../db/client.js';
import { desc, eq, sql } from 'drizzle-orm';

export interface RankWeights {
  /** weight per memory kind (episodic/semantic/procedural/...) */
  byKind: Record<string, number>;
  /** weight per tag id */
  byTag: Record<string, number>;
  /** global learned bias toward positive feedback */
  global: number;
}

export interface TrainingSample {
  itemId: string;
  itemType: string;
  helpful: boolean;
}

/**
 * Train weights from collected feedback. Returns a weight vector that
 * the recall re-ranker multiplies into base relevance.
 */
export function trainRanker(samples: TrainingSample[]): RankWeights {
  const byKind: Record<string, number> = {};
  const byTag: Record<string, number> = {};
  let pos = 0;
  let total = 0;

  for (const s of samples) {
    total++;
    if (s.helpful) pos++;
    const cur = byKind[s.itemType] ?? 0;
    byKind[s.itemType] = cur + (s.helpful ? 1 : -1);
    // tag association (best-effort: derive a tag from itemType)
    const tag = `t:${s.itemType}`;
    const tc = byTag[tag] ?? 0;
    byTag[tag] = tc + (s.helpful ? 1 : -1);
  }

  // normalise to [-1, 1] per bucket
  for (const k of Object.keys(byKind)) byKind[k] = clamp((byKind[k] ?? 0) / Math.max(1, total));
  for (const k of Object.keys(byTag)) byTag[k] = clamp((byTag[k] ?? 0) / Math.max(1, total));
  const global = total === 0 ? 0 : clamp((pos - (total - pos)) / total);

  return { byKind, byTag, global };
}

/** Apply trained weights to a base score (0..1). */
export function applyWeights(base: number, itemType: string, weights: RankWeights): number {
  const wk = weights.byKind[itemType] ?? 0;
  return clamp(base * (1 + 0.5 * wk + 0.5 * weights.global));
}

/** Persist a training sample (used by the feedback endpoint). */
export async function recordFeedback(
  projectId: string,
  itemId: string,
  itemType: string,
  helpful: boolean
): Promise<void> {
  await db.insert(feedback).values({
    id: crypto.randomUUID(),
    projectId,
    itemId,
    itemType,
    helpful,
    createdAt: new Date(),
  });
}

/** Train from the live `feedback` table for a project. */
export async function trainFromStore(projectId: string): Promise<RankWeights> {
  const rows = await db
    .select()
    .from(feedback)
    .where(eq(feedback.projectId, projectId))
    .orderBy(desc(feedback.createdAt))
    .limit(5000);
  const samples: TrainingSample[] = rows.map(
    (r: {
      itemId: string;
      itemType: string;
      helpful: boolean;
      query: string;
      createdAt: Date | null;
    }) => ({
      itemId: r.itemId,
      itemType: r.itemType,
      helpful: r.helpful,
    })
  );
  return trainRanker(samples);
}

function clamp(x: number): number {
  return Math.max(-1, Math.min(1, x));
}
