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

interface PrimingRecallCandidate { id?: unknown; content?: unknown; score?: unknown }
function asPrimingCandidates(value: unknown): PrimingRecallCandidate[] {
  if (Array.isArray(value)) return value as PrimingRecallCandidate[];
  if (value !== null && typeof value === 'object') {
    const record = value as { returned?: unknown; items?: unknown };
    if (Array.isArray(record.returned)) return record.returned as PrimingRecallCandidate[];
    if (Array.isArray(record.items)) return record.items as PrimingRecallCandidate[];
  }
  return [];
}
function stringValue(value: unknown, fallback: string): string { return typeof value === 'string' ? value : fallback; }
function numberValue(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }

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

// ── Legacy API wrappers (Phase 12 refactor) ──────────────────────

export interface PrimingCandidate {
  id: string;
  importance: number;
  recency: number;
  accessCount: number;
  influenceCount: number;
  decayedImportance: number;
  tokenEstimate: number;
}

export interface PrimingBudget {
  topK: number;
  perItemTokens: number;
  totalTokens: number;
}

export function computePrimingBudget(topK?: number, totalTokens?: number): PrimingBudget {
  const k = topK ?? PRIMING_TOP_K;
  const total = totalTokens ?? PRIMING_BUDGET_TOKENS;
  return {
    topK: k,
    perItemTokens: k > 0 ? Math.floor(total / k) : 0,
    totalTokens: total,
  };
}

export interface SelectPrimingResult {
  selected: PrimingCandidate[];
  budgetConsumed: number;
}

export function selectPrimingCandidates(
  items: PrimingCandidate[],
  opts: { tokenBudget: number; limit: number }
): SelectPrimingResult {
  const sorted = [...items].sort((a, b) => {
    const pa = a.importance + a.recency;
    const pb = b.importance + b.recency;
    return pb - pa;
  });
  const selected: PrimingCandidate[] = [];
  let consumed = 0;
  for (const item of sorted) {
    if (consumed + item.tokenEstimate > opts.tokenBudget) continue;
    if (selected.length >= opts.limit) break;
    selected.push(item);
    consumed += item.tokenEstimate;
  }
  return { selected, budgetConsumed: consumed };
}

export async function primingScopeForContext(opts: {
  context: string;
  agentId?: string;
}): Promise<{ items: PrimingItem[]; budget: PrimingBudget }> {
  const recalled: unknown = await recall(opts.context, PRIMING_RECALL_BUDGET, opts.agentId ?? 'system', { limit: PRIMING_TOP_K });
  const candidates = asPrimingCandidates(recalled);
  const items: PrimingItem[] = candidates.slice(0, PRIMING_TOP_K).map((candidate, index) => {
    const content = stringValue(candidate.content, '');
    return {
      memoryId: stringValue(candidate.id, `mem-${index}`),
      compressed: content,
      tokens: Math.ceil(content.length / 4),
      similarityScore: numberValue(candidate.score, 0.5),
    };
  });
  try {
    await recordMemoryInfluences(
      items.map((item, index) => ({
        memoryId: item.memoryId,
        contextKey: `session-${randomUUID()}`,
        reason: 'priming' as const,
        tokens: item.tokens,
        position: index,
      }))
    );
  } catch { /* best-effort */ }
  const budget = computePrimingBudget(PRIMING_TOP_K, PRIMING_BUDGET_TOKENS);
  return { items, budget };
}
