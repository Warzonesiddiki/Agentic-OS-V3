import { randomUUID } from 'node:crypto';
import { recall } from './recall.js';
import { estimateTokens } from '../lib/tokens.js';
import { recordMemoryInfluences } from './memory-provenance.js';

export const PRIMING_BUDGET_TOKENS = 500;
export const PRIMING_TOP_K = 5;
export const PRIMING_RECALL_BUDGET = 4000;

export interface PrimingItem {
  memoryId: string;
  compressed: string;
  tokens: number;
  similarityScore: number;
}

export interface PrimingResult {
  sessionKey: string;
  context: string;
  items: PrimingItem[];
  tokenUsage: number;
  truncated: boolean;
}

function compressToTokens(content: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  if (estimateTokens(content) <= maxTokens) return content;
  const words = content.split(/\s+/);
  let out = '';
  for (const word of words) {
    const candidate = out ? `${out} ${word}` : word;
    if (estimateTokens(candidate) > maxTokens) break;
    out = candidate;
  }
  return out ? `${out}…` : '';
}

export async function buildSessionPriming(
  task: string,
  opts?: { sessionKey?: string; budget?: number; actor?: string; limit?: number }
): Promise<PrimingResult> {
  const budget = opts?.budget ?? PRIMING_BUDGET_TOKENS;
  const limit = opts?.limit ?? PRIMING_TOP_K;
  const actor = opts?.actor ?? 'nexus-priming';
  const sessionKey = opts?.sessionKey ?? `session-${randomUUID()}`;

  const result = await recall(task, PRIMING_RECALL_BUDGET, actor, { limit });
  const candidates = result.returned.slice(0, limit);

  const items: PrimingItem[] = [];
  let used = 0;
  let truncated = false;

  for (const candidate of candidates) {
    const remaining = budget - used;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const compressed = compressToTokens(candidate.content, remaining);
    if (!compressed) {
      truncated = true;
      break;
    }
    const tokens = estimateTokens(compressed);
    used += tokens;
    items.push({
      memoryId: candidate.id,
      compressed,
      tokens,
      similarityScore: candidate.score,
    });
  }

  const context = items.map((item, index) => `[${index + 1}] ${item.compressed}`).join('\n\n');

  await recordMemoryInfluences(
    items.map((item, index) => ({
      memoryId: item.memoryId,
      contextKey: sessionKey,
      reason: 'priming' as const,
      tokens: item.tokens,
      position: index,
    }))
  );

  return {
    sessionKey,
    context,
    items,
    tokenUsage: used,
    truncated,
  };
}
