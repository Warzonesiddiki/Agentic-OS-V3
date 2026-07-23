/**
 * E2-S3 Recall feedback and contradiction signals
 *
 * AC1: Feedback recorded with query, result, actor, timestamp, scope
 * AC2: Feedback cannot change memory content or provenance by itself
 * AC3: Contradiction candidates flagged with linked evidence
 * AC4: Recall can expose signal explanations without leaking unrelated records
 * AC5: Feedback and contradiction changes are auditable
 */

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { ActionReceipt } from './r1-types.js';
import type { R1Repositories } from './repositories.js';

export const RecallFeedbackSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  query: z.string().min(1).max(5000),
  resultId: z.string().min(1),
  actorId: z.string().min(1).max(255),
  helpful: z.boolean(),
  comment: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
  evidenceIds: z.array(z.string().uuid()).max(20).optional().default([]),
});
export type RecallFeedback = z.infer<typeof RecallFeedbackSchema>;

export const ContradictionSignalSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  memoryAId: z.string().uuid(),
  memoryBId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().uuid()).min(1).max(20),
  createdAt: z.string().datetime(),
  status: z.enum(['candidate', 'confirmed', 'dismissed']).default('candidate'),
});
export type ContradictionSignal = z.infer<typeof ContradictionSignalSchema>;

export interface FeedbackRepository {
  save(feedback: RecallFeedback): Promise<RecallFeedback>;
  list(projectId: string, resultId?: string): Promise<readonly RecallFeedback[]>;
  get(projectId: string, feedbackId: string): Promise<RecallFeedback | null>;
}

export interface ContradictionRepository {
  save(signal: ContradictionSignal): Promise<ContradictionSignal>;
  list(projectId: string): Promise<readonly ContradictionSignal[]>;
  listForMemory(projectId: string, memoryId: string): Promise<readonly ContradictionSignal[]>;
  update(signal: ContradictionSignal): Promise<ContradictionSignal>;
}

class InMemoryFeedback implements FeedbackRepository {
  private readonly values = new Map<string, RecallFeedback>();
  async save(fb: RecallFeedback): Promise<RecallFeedback> { this.values.set(fb.id, fb); return fb; }
  async list(projectId: string, resultId?: string): Promise<readonly RecallFeedback[]> {
    return [...this.values.values()].filter((v) => v.projectId === projectId && (!resultId || v.resultId === resultId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async get(projectId: string, feedbackId: string): Promise<RecallFeedback | null> {
    const v = this.values.get(feedbackId);
    if (!v || v.projectId !== projectId) return null;
    return v;
  }
}

class InMemoryContradiction implements ContradictionRepository {
  private readonly values = new Map<string, ContradictionSignal>();
  async save(s: ContradictionSignal): Promise<ContradictionSignal> { this.values.set(s.id, s); return s; }
  async list(projectId: string): Promise<readonly ContradictionSignal[]> {
    return [...this.values.values()].filter((v) => v.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(b.createdAt));
  }
  async listForMemory(projectId: string, memoryId: string): Promise<readonly ContradictionSignal[]> {
    return [...this.values.values()].filter((v) => v.projectId === projectId && (v.memoryAId === memoryId || v.memoryBId === memoryId));
  }
  async update(s: ContradictionSignal): Promise<ContradictionSignal> {
    if (!this.values.has(s.id)) throw new Error('Contradiction not found');
    this.values.set(s.id, s);
    return s;
  }
}

export interface RecallFeedbackServiceOptions {
  readonly now?: () => string;
}

export class RecallFeedbackService {
  private readonly now: () => string;
  constructor(
    private readonly repos: R1Repositories,
    private readonly feedbackRepo: FeedbackRepository = new InMemoryFeedback(),
    private readonly contradictionRepo: ContradictionRepository = new InMemoryContradiction(),
    options: RecallFeedbackServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Record feedback without mutating memory content or provenance (AC2)
   */
  async recordFeedback(input: Omit<RecallFeedback, 'id' | 'createdAt'> & { id?: string }): Promise<{ feedback: RecallFeedback; receipt: ActionReceipt }> {
    const project = await this.repos.projects.get(input.projectId);
    if (!project) throw new Error('Project not found');

    // ensure result memory exists and belongs to project
    const memory = await this.repos.memories.get(input.projectId, input.resultId);
    if (!memory) throw new Error('Result memory not found or out of scope');

    const feedback: RecallFeedback = RecallFeedbackSchema.parse({
      id: input.id ?? randomUUID(),
      projectId: input.projectId,
      query: input.query,
      resultId: input.resultId,
      actorId: input.actorId,
      helpful: input.helpful,
      comment: input.comment,
      createdAt: this.now(),
      evidenceIds: input.evidenceIds ?? [],
    });

    // Audit receipt (AC5)
    const receipt: ActionReceipt = {
      id: randomUUID(),
      projectId: feedback.projectId,
      correlationId: feedback.id,
      kind: 'db_write',
      actor: feedback.actorId,
      decision: 'allow',
      payload: { operation: 'recall.feedback', resultId: feedback.resultId, helpful: feedback.helpful },
      createdAt: feedback.createdAt,
    };

    await this.feedbackRepo.save(feedback);
    await this.repos.receipts.append(receipt);
    return { feedback, receipt };
  }

  async listFeedback(projectId: string, resultId?: string): Promise<readonly RecallFeedback[]> {
    return this.feedbackRepo.list(projectId, resultId);
  }

  /**
   * Flag contradiction between two memories with linked evidence (AC3)
   * Does not mutate memory content.
   */
  async flagContradiction(input: Omit<ContradictionSignal, 'id' | 'createdAt' | 'status'> & { id?: string }): Promise<{ signal: ContradictionSignal; receipt: ActionReceipt }> {
    const project = await this.repos.projects.get(input.projectId);
    if (!project) throw new Error('Project not found');

    const [a, b] = await Promise.all([
      this.repos.memories.get(input.projectId, input.memoryAId),
      this.repos.memories.get(input.projectId, input.memoryBId),
    ]);
    if (!a || !b) throw new Error('One or both memories not found or out of scope');

    // Evidence must exist and be in scope
    const evidence = await this.repos.evidence.listForProject(input.projectId);
    const known = new Set(evidence.map((e) => e.id));
    if (input.evidenceIds.some((id) => !known.has(id))) throw new Error('Contradiction evidence outside project scope');

    const signal: ContradictionSignal = ContradictionSignalSchema.parse({
      id: input.id ?? randomUUID(),
      projectId: input.projectId,
      memoryAId: input.memoryAId,
      memoryBId: input.memoryBId,
      reason: input.reason,
      confidence: input.confidence,
      evidenceIds: input.evidenceIds,
      createdAt: this.now(),
      status: 'candidate',
    });

    const receipt: ActionReceipt = {
      id: randomUUID(),
      projectId: signal.projectId,
      correlationId: signal.id,
      kind: 'db_write',
      actor: 'system',
      decision: 'allow',
      payload: { operation: 'recall.contradiction', memoryAId: signal.memoryAId, memoryBId: signal.memoryBId },
      createdAt: signal.createdAt,
    };

    await this.contradictionRepo.save(signal);
    await this.repos.receipts.append(receipt);
    return { signal, receipt };
  }

  async listContradictions(projectId: string): Promise<readonly ContradictionSignal[]> {
    return this.contradictionRepo.list(projectId);
  }

  /** AC4: expose explanation without leaking unrelated records */
  async explainResult(projectId: string, resultId: string): Promise<{ feedbackCount: number; helpfulRatio: number; contradictions: readonly ContradictionSignal[] }> {
    const feedback = await this.feedbackRepo.list(projectId, resultId);
    const contradictions = await this.contradictionRepo.listForMemory(projectId, resultId);
    const helpful = feedback.filter((f) => f.helpful).length;
    const ratio = feedback.length ? helpful / feedback.length : 0;
    return {
      feedbackCount: feedback.length,
      helpfulRatio: Math.round(ratio * 1000) / 1000,
      contradictions,
    };
  }
}

export function createInMemoryFeedbackRepositories(): { feedback: FeedbackRepository; contradiction: ContradictionRepository } {
  return { feedback: new InMemoryFeedback(), contradiction: new InMemoryContradiction() };
}
