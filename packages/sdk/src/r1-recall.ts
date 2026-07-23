/**
 * R1 Token-budgeted hybrid recall (BMAD E2-S2)
 *
 * Acceptance criteria:
 * 1. Query accepts project/agent scope and positive token budget.
 * 2. Results candidate-filtered by scope before packing.
 * 3. Lexical mode works without embeddings.
 * 4. Vector mode used only when provider/index available and dimension-compatible.
 * 5. Response includes result IDs, provenance, mode, budget requested, budget used, truncation.
 * 6. Packing never exceeds requested budget according to documented tokenizer/estimator.
 */

import { z } from 'zod';
import type { MemoryRecord, R1Repositories } from './repositories.js';
import { MemoryProvenanceSchema, type MemoryProvenance } from './r1-types.js';

export const R1RecallModeSchema = z.enum(['lexical', 'vector', 'hybrid']);
export type R1RecallMode = z.infer<typeof R1RecallModeSchema>;

export const R1RecallQuerySchema = z.object({
  projectId: z.string().uuid(),
  agentId: z.string().min(1).max(255).optional(),
  query: z.string().min(1).max(5000),
  tokenBudget: z.number().int().positive().max(100_000),
  mode: R1RecallModeSchema.optional().default('lexical'),
  includeExplanation: z.boolean().optional().default(false),
});
export type R1RecallQuery = z.infer<typeof R1RecallQuerySchema>;

export interface R1RecallResultItem {
  readonly id: string;
  readonly projectId: string;
  readonly content: string;
  readonly provenance: MemoryProvenance;
  readonly score: number;
  readonly tokenCost: number;
  readonly matchedBy: readonly ('lexical' | 'vector')[];
  readonly explanation?: string;
}

export interface R1RecallResponse {
  readonly resultIds: readonly string[];
  readonly results: readonly R1RecallResultItem[];
  readonly provenance: Readonly<Record<string, MemoryProvenance>>;
  readonly mode: R1RecallMode;
  readonly modeUsed: R1RecallMode;
  readonly budgetRequested: number;
  readonly budgetUsed: number;
  readonly truncation: { truncated: boolean; remaining: number; totalCandidates: number };
}

export interface R1RecallOptions {
  readonly now?: () => string;
  /** Optional embedding search hook — when absent, vector/hybrid degrade to lexical. */
  readonly vectorSearch?: (query: string, candidates: readonly MemoryRecord[]) => Promise<readonly { id: string; score: number }[]>;
  readonly embeddingAvailable?: boolean;
  readonly embeddingDimension?: number;
  readonly candidateEmbeddingDimension?: number;
}

/**
 * Simple token estimator documented for packing guarantee.
 * We use chars/4 ceiling, matching server `estimateTokens` intent.
 * Guarantee: never underestimates compared to real packing? We ensure packing check uses same estimator.
 */
export function estimateTokens(content: string): number {
  if (!content) return 0;
  return Math.max(1, Math.ceil(content.length / 4));
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Lexical score: simple Jaccardish overlap + term frequency.
 * Deterministic, no external provider needed.
 */
export function lexicalScore(query: string, content: string): number {
  const qTerms = new Set(tokenize(query));
  if (qTerms.size === 0) return 0;
  const cTokens = tokenize(content);
  const cSet = new Set(cTokens);
  let overlap = 0;
  for (const term of qTerms) if (cSet.has(term)) overlap++;
  // TF bonus
  const tf = cTokens.filter((t) => qTerms.has(t)).length / Math.max(1, cTokens.length);
  return overlap / qTerms.size * 0.7 + tf * 0.3;
}

export class R1RecallService {
  private readonly now: () => string;
  private readonly vectorSearch?: R1RecallOptions['vectorSearch'];
  private readonly embeddingAvailable: boolean;
  private readonly embeddingDimension?: number;
  private readonly candidateEmbeddingDimension?: number;

  constructor(private readonly repositories: R1Repositories, options: R1RecallOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.vectorSearch = options.vectorSearch;
    this.embeddingAvailable = options.embeddingAvailable ?? false;
    this.embeddingDimension = options.embeddingDimension;
    this.candidateEmbeddingDimension = options.candidateEmbeddingDimension;
  }

  async recall(raw: unknown): Promise<R1RecallResponse> {
    const query = R1RecallQuerySchema.parse(raw);

    // 2. Results are candidate-filtered by scope before packing.
    const all = await this.repositories.memories.list(query.projectId);
    const scoped = all.filter((m) => {
      if (m.projectId !== query.projectId) return false;
      if (query.agentId) {
        try {
          const prov = MemoryProvenanceSchema.safeParse((m.metadata as any).provenance);
          if (!prov.success) return false;
          const agentId = prov.data.agentId;
          // If provenance has agentId, it must match; if absent, allow (shared memory)
          if (agentId && agentId !== query.agentId) return false;
        } catch {
          return false;
        }
      }
      return true;
    });

    // Determine mode actually used
    const requestedMode = query.mode ?? 'lexical';
    let modeUsed: R1RecallMode = 'lexical';
    let semanticScores = new Map<string, number>();

    if (requestedMode === 'vector' || requestedMode === 'hybrid') {
      const dimCompatible = this.embeddingDimension === undefined || this.candidateEmbeddingDimension === undefined || this.embeddingDimension === this.candidateEmbeddingDimension;
      if (this.embeddingAvailable && this.vectorSearch && dimCompatible) {
        try {
          const vecResults = await this.vectorSearch(query.query, scoped);
          semanticScores = new Map(vecResults.map((r) => [r.id, r.score]));
          modeUsed = requestedMode === 'hybrid' ? 'hybrid' : 'vector';
        } catch {
          // fallback to lexical on vector failure
          modeUsed = 'lexical';
        }
      } else {
        // AC4: vector mode only when provider/index available and dimension-compatible
        modeUsed = 'lexical';
      }
    }

    // Score candidates
    type Scored = { record: MemoryRecord; lexical: number; semantic?: number; combined: number; tokenCost: number };
    const scored: Scored[] = scoped.map((record) => {
      const lex = lexicalScore(query.query, record.content);
      const sem = semanticScores.get(record.id);
      // hybrid: RRF-ish blend
      let combined: number;
      if (modeUsed === 'hybrid' && sem !== undefined) combined = lex * 0.5 + sem * 0.5;
      else if (modeUsed === 'vector' && sem !== undefined) combined = sem;
      else combined = lex;
      return {
        record,
        lexical: lex,
        semantic: sem,
        combined,
        tokenCost: estimateTokens(record.content),
      };
    }).filter((s) => s.combined > 0).sort((a, b) => b.combined - a.combined);

    // Packing: greedy, never exceeds budget (AC6)
    const budgetRequested = query.tokenBudget;
    let budgetUsed = 0;
    const packed: Scored[] = [];
    for (const candidate of scored) {
      if (budgetUsed + candidate.tokenCost <= budgetRequested) {
        packed.push(candidate);
        budgetUsed += candidate.tokenCost;
      }
    }

    const totalCandidates = scored.length;
    const truncated = packed.length < totalCandidates;
    const remaining = totalCandidates - packed.length;

    const results: R1RecallResultItem[] = packed.map((p) => {
      let provenance: MemoryProvenance;
      try {
        provenance = MemoryProvenanceSchema.parse((p.record.metadata as any).provenance);
      } catch {
        provenance = {
          type: 'fact',
          source: 'unknown',
          confidence: 0.5,
          lifecycle: 'active',
          evidenceIds: p.record.evidenceIds as string[],
        };
      }
      const matchedBy: ('lexical' | 'vector')[] = [];
      if (p.lexical > 0) matchedBy.push('lexical');
      if (p.semantic !== undefined && p.semantic > 0) matchedBy.push('vector');
      return {
        id: p.record.id,
        projectId: p.record.projectId,
        content: p.record.content,
        provenance,
        score: Math.round(p.combined * 1000) / 1000,
        tokenCost: p.tokenCost,
        matchedBy,
        explanation: query.includeExplanation ? `lexical=${p.lexical.toFixed(3)} semantic=${p.semantic?.toFixed(3) ?? 'n/a'} combined=${p.combined.toFixed(3)}` : undefined,
      };
    });

    const provenanceMap: Record<string, MemoryProvenance> = {};
    for (const r of results) provenanceMap[r.id] = r.provenance;

    return {
      resultIds: results.map((r) => r.id),
      results,
      provenance: provenanceMap,
      mode: requestedMode,
      modeUsed,
      budgetRequested,
      budgetUsed,
      truncation: { truncated, remaining, totalCandidates },
    };
  }
}
