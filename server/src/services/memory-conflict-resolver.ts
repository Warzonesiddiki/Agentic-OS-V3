import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { memories } from '../db/client.js';
import { memoryContradictions } from '../db/schema.js';
import { callLLMStructured } from './llm.js';
import { llmConfigured } from '../lib/env.js';
import { assertOperational } from './safety.service.js';
import { createMemory } from './memory.service.js';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';

export type ConflictStrategy = 'newest_wins' | 'highest_importance' | 'llm_merge' | 'prompt_user';

export interface MemoryLite {
  id: string;
  createdAt: Date;
  importance: number;
  title: string;
  content: string;
  tags: string[];
  projectId: string | null;
}

export interface ConflictResolutionProposal {
  strategy: ConflictStrategy;
  memoryAId: string;
  memoryBId: string;
  winnerId: string | null;
  needsUserInput: boolean;
  rationale: string;
}

export interface ResolveResult {
  proposal: ConflictResolutionProposal;
  mergedMemoryId?: string;
  supersededIds: string[];
}

export function selectWinner(strategy: ConflictStrategy, a: MemoryLite, b: MemoryLite): string {
  if (strategy === 'newest_wins') {
    return a.createdAt >= b.createdAt ? a.id : b.id;
  }
  if (strategy === 'highest_importance') {
    return a.importance >= b.importance ? a.id : b.id;
  }
  // llm_merge and prompt_user do not pick a single surviving memory.
  return '';
}

async function fetchLite(id: string): Promise<MemoryLite | null> {
  const [r] = await db
    .select({
      id: memories.id,
      createdAt: memories.createdAt,
      importance: memories.importance,
      title: memories.title,
      content: memories.content,
      tags: memories.tags,
      projectId: memories.projectId,
    })
    .from(memories)
    .where(eq(memories.id, id))
    .limit(1);
  return r ?? null;
}

async function mergeContent(a: MemoryLite, b: MemoryLite): Promise<string> {
  const userMessage = `Memory A (${a.title}):\n${a.content}\n\nMemory B (${b.title}):\n${b.content}\n\nProduce a single consolidated memory that preserves all non-redundant information from both. Respond with strict JSON only: {"content": string}.`;
  if (!llmConfigured()) {
    return `MERGED from "${a.title}" and "${b.title}":\n${a.content}\n\n---\n${b.content}`;
  }
  try {
    const res = await callLLMStructured<{ content: string }>(
      'You merge overlapping or conflicting memories into one coherent record. Respond with strict JSON only.',
      userMessage
    );
    return res.content && res.content.length > 0 ? res.content : `${a.content}\n\n${b.content}`;
  } catch {
    return `${a.content}\n\n${b.content}`;
  }
}

async function mergeMemories(a: MemoryLite, b: MemoryLite): Promise<string> {
  const content = await mergeContent(a, b);
  const title = `Merged: ${a.title} / ${b.title}`.slice(0, 200);
  const importance = Math.max(a.importance, b.importance);
  const tags = Array.from(new Set<string>([...(a.tags ?? []), ...(b.tags ?? [])]));
  const created = await createMemory(
    {
      kind: 'semantic',
      title,
      content,
      tags,
      importance,
      source: 'conflict-resolution',
      projectId: a.projectId,
    },
    'conflict-resolver'
  );
  const id =
    typeof created === 'object' && created !== null && 'id' in created
      ? String((created as { id: unknown }).id)
      : '';
  if (!id) throw new ApiError('INTERNAL', 'Failed to create merged memory.');
  return id;
}

async function markSuperseded(memoryId: string, byMemoryId: string): Promise<void> {
  await db.update(memories).set({ supersededBy: byMemoryId }).where(eq(memories.id, memoryId));
}

async function recordResolution(aId: string, bId: string, resolvedBy: string): Promise<void> {
  const id = `con_${randomUUID()}`;
  await db.insert(memoryContradictions).values({
    id,
    memoryA: aId,
    memoryB: bId,
    relation: 'contradicting',
    resolutionOf: resolvedBy,
  });
}

export async function proposeResolution(
  memoryAId: string,
  memoryBId: string
): Promise<ConflictResolutionProposal> {
  const a = await fetchLite(memoryAId);
  const b = await fetchLite(memoryBId);
  if (!a || !b)
    throw new ApiError('NOT_FOUND', 'Both memories must exist to propose a resolution.');
  return {
    strategy: 'prompt_user',
    memoryAId: a.id,
    memoryBId: b.id,
    winnerId: null,
    needsUserInput: true,
    rationale: 'A human decision is required to resolve this conflict.',
  };
}

export async function resolveConflict(
  strategy: ConflictStrategy,
  memoryAId: string,
  memoryBId: string
): Promise<ResolveResult> {
  await assertOperational();

  const a = await fetchLite(memoryAId);
  const b = await fetchLite(memoryBId);
  if (!a || !b) throw new ApiError('NOT_FOUND', 'Both memories must exist to resolve a conflict.');

  if (strategy === 'prompt_user') {
    const proposal = await proposeResolution(memoryAId, memoryBId);
    return { proposal, supersededIds: [] };
  }

  if (strategy === 'llm_merge') {
    const mergedId = await mergeMemories(a, b);
    await db.update(memories).set({ resolutionOf: a.id }).where(eq(memories.id, mergedId));
    await markSuperseded(a.id, mergedId);
    await markSuperseded(b.id, mergedId);
    await recordResolution(a.id, b.id, mergedId);
    const proposal: ConflictResolutionProposal = {
      strategy,
      memoryAId: a.id,
      memoryBId: b.id,
      winnerId: mergedId,
      needsUserInput: false,
      rationale:
        'Both memories merged into a new consolidated memory; originals marked superseded.',
    };
    return { proposal, mergedMemoryId: mergedId, supersededIds: [a.id, b.id] };
  }

  const winnerId = selectWinner(strategy, a, b);
  const loserId = winnerId === a.id ? b.id : a.id;
  await markSuperseded(loserId, winnerId);
  await recordResolution(a.id, b.id, winnerId);
  const proposal: ConflictResolutionProposal = {
    strategy,
    memoryAId: a.id,
    memoryBId: b.id,
    winnerId,
    needsUserInput: false,
    rationale: `${strategy}: memory ${loserId} superseded by ${winnerId}.`,
  };
  return { proposal, supersededIds: [loserId] };
}
