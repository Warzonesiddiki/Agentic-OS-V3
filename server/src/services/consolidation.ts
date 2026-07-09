import { and, desc, eq, gte, isNull, lt } from 'drizzle-orm';
import { db, memories } from '../db/client.js';
import { callLLMStructured, llmConfigured } from './llm.js';
import { createDerivedMemory } from './memory-hierarchy.js';
import type { Memory } from './memory-hierarchy.js';
import { log } from '../lib/logging.js';

export interface ConsolidationResult {
  facts: number;
}

export async function consolidateEpisodicToSemantic(
  opts: { projectId?: string; limit?: number; minImportance?: number } = {}
): Promise<ConsolidationResult> {
  if (!llmConfigured()) return { facts: 0 };
  const minImportance = opts.minImportance ?? 0.7;
  const cutoff = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  const rows: Memory[] = await db.query.memories.findMany({
    where: and(
      isNull(memories.deletedAt),
      isNull(memories.supersededBy),
      eq(memories.kind, 'episodic'),
      gte(memories.importance, minImportance),
      lt(memories.createdAt, cutoff),
      opts.projectId ? eq(memories.projectId, opts.projectId) : undefined
    ),
    orderBy: desc(memories.importance),
    limit: opts.limit ?? 100,
  });

  let facts = 0;
  for (const src of rows) {
    try {
      const result = await callLLMStructured<{
        facts: Array<{ statement: string; confidence: number }>;
      }>(
        'Extract durable factual statements from the episodic memory below. Respond with JSON: { "facts": Array<{ "statement": string; "confidence": number }> }.',
        `Title: ${src.title}\nContent: ${src.content}`
      );
      for (const fact of result.facts ?? []) {
        const fid = await createDerivedMemory({
          kind: 'semantic',
          title: fact.statement.slice(0, 200),
          content: fact.statement,
          tags: ['consolidated'],
          importance: Math.min(1, (fact.confidence ?? 0.5) * (src.importance ?? 0)),
          projectId: src.projectId,
          tier: 'LTM',
          sourceChain: [src.id],
        });
        await db.update(memories).set({ resolutionOf: src.id }).where(eq(memories.id, fid));
        facts++;
      }
    } catch (e) {
      log.error('consolidateEpisodicToSemantic', { error: e });
    }
  }
  return { facts };
}

export async function runWeeklyConsolidation(
  opts: { projectId?: string } = {}
): Promise<ConsolidationResult> {
  return consolidateEpisodicToSemantic(opts);
}
