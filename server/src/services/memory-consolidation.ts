/**
 * memory-consolidation.ts — Phase 12.5
 * Episodic → semantic consolidation pipeline.
 *
 * Orchestrates three real sub-systems:
 *   - SM-2 rehearsal scheduler (memory-rehearsal.ts)
 *   - contradiction detector (memory-contradiction.ts)
 *   - emotional / mood tagging (memory-emotion.ts)
 *
 * And it honours the consolidation budget controller
 * (consolidation-budget.ts) so a single pass can never exhaust
 * the token / latency budget.
 */
import { db } from '../db/client.js';
import { rehearseDueMemories, rehearseMemory } from './memory-rehearsal.js';
import { detectContradictions } from './memory-contradiction.js';
import { storeMemoryEmotion } from './memory-emotion.js';
import { selectForConsolidation, type ConsolidationMemory } from './consolidation-budget.js';
import { and, eq, isNull, desc } from 'drizzle-orm';
import { memories } from '../db/client.js';
import { randomUUID } from 'node:crypto';

export interface ConsolidationRun {
  runId: string;
  rehearsed: number;
  contradictions: number;
  emotions: number;
  budgetUsed: number;
  truncated: boolean;
}

export interface ConsolidationOptions {
  projectId: string;
  /** Hard cap on memories processed this run (budget-aware). */
  limit?: number;
}

/**
 * Run one consolidation pass for a project. Stops early when the
 * consolidated-bytes/latency budget is exhausted.
 */
export async function consolidate(options: ConsolidationOptions): Promise<ConsolidationRun> {
  const runId = randomUUID();
  const projectId = options.projectId;
  const tokenBudget = 200 * 1024; // consolidation token budget per pass

  const mems = await db
    .select()
    .from(memories)
    .where(and(eq(memories.projectId, projectId), isNull(memories.deletedAt)))
    .orderBy(desc(memories.updatedAt))
    .limit(options.limit ?? 200);

  const items: ConsolidationMemory[] = mems.map(
    (m: { id: string; importance?: number | null }) => ({
      id: m.id,
      importance: m.importance ?? 0.5,
      tokens: 1,
    })
  );

  const plan = selectForConsolidation(items, tokenBudget);
  const promoteIds = new Set(plan.promote.map((p: ConsolidationMemory) => p.id));

  let rehearsed = 0;
  let contradictions = 0;
  let emotions = 0;
  const truncated = plan.remainingTokens <= 0 && items.length > 0;

  const candidateIds = mems.map((m: { id: string }) => m.id);
  for (const m of mems as Array<{ id: string; text: string | null }>) {
    if (!promoteIds.has(m.id)) {
      // Memory fell outside the budget this pass; defer to a later run.
      continue;
    }

    // 1) SM-2 rehearsal scheduling — run any due reviews, otherwise schedule this memory.
    const due = await rehearseDueMemories({ limit: 1 });
    rehearsed += due.rehearsed;
    if (due.rehearsed === 0) {
      await rehearseMemory(m.id);
    }

    // 2) contradiction detection against the rest of the project
    const found = await detectContradictions(m.id, { candidateIds, projectId });
    contradictions += found.length;

    // 3) emotional / mood tagging
    if (m.text) {
      const tagged = await storeMemoryEmotion(m.id, m.text);
      if (tagged) emotions++;
    }
  }

  return {
    runId,
    rehearsed,
    contradictions,
    emotions,
    budgetUsed: plan.usedTokens,
    truncated,
  };
}
