/**
 * federated-recall.ts
 * ───────────────────
 * Pillar III of the 100× upgrade — Privacy-preserving federated memory proof
 * protocol, enhanced with Phase 4b: Federated Recall Enhancements.
 *
 * ## Layer 1 — Federated Memory Protocol (original pillar III)
 * Privacy-preserving protocol so multiple NEXUS instances can share memories
 * without leaking raw content. The wire format is a `MemoryProof` envelope:
 *
 *   MemoryProof = {
 *     origin_peer_id, origin_pubkey, signature,
 *     content_sha256,            // SHA-256 of the (NEVER-SENT) raw content
 *     embedding,                 // vector embedding
 *     topic_tags, importance,
 *     privacy_class,             // public | team | private
 *   }
 *
 * ## Layer 2 — Federated Recall Enhancements (Phase 4b)
 * Adds intelligent multi-signal recall on top of local + federated memories:
 *   - Recency scoring      (exponential decay on age)
 *   - Importance weighting (prioritize high-value memories)
 *   - BM25 lexical search  (term-frequency ranking)
 *   - Semantic similarity  (pgvector cosine distance)
 *   - Reciprocal Rank Fusion (RRF blending)
 *   - Budget-aware packing (token-budgeted result selection)
 *   - LRU state cache      (composed agent state caching)
 *   - Cross-session persistence (memories survive session boundaries)
 *
 * Integration points:
 *   - `src/lib/os/types.ts`     → MemoryCard, OSState
 *   - `src/lib/os/store.ts`     → OS state persistence
 *   - `src/lib/os/kernel.ts`    → doGraphRecall, compactContext
 */
import { createHash, verify, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { contradictionsAmong } from './memory-contradiction.js';
import { federatedMemoryProofs } from '../db/client.js';
import { memories, skills, notes } from '../db/client.js';
import { desc, eq, and, sql, isNotNull } from 'drizzle-orm';
import { appendAudit } from '../lib/audit.js';
import { log } from '../lib/logging.js';
import { embedQuery, embeddingsAvailable } from './embeddings.js';
import { estimateTokens, packByBudget, bm25 as bm25Score } from '../lib/tokens.js';
import { truncate } from '../lib/strings.js';
import { env } from '../lib/env.js';

/* ════════════════════════════════════════════════════════════════════════════
 * LAYER 1 — Federated Memory Protocol (original)
 * ════════════════════════════════════════════════════════════════════════════ */

export type PrivacyClass = 'public' | 'team' | 'private';

export interface MemoryProof {
  origin_peer_id: string;
  origin_pubkey: string;
  signature: string;
  content_sha256: string;
  embedding: number[];
  topic_tags: string[];
  importance: number;
  privacy_class: PrivacyClass;
  ttl_seconds?: number;
}

export interface MaterializationDecision {
  materialize: boolean;
  reason: string;
}

const CANONICAL_KEY_ORDER = [
  'origin_peer_id',
  'origin_pubkey',
  'content_sha256',
  'embedding',
  'topic_tags',
  'importance',
  'privacy_class',
] as const;

export function canonicalizeProof(proof: Omit<MemoryProof, 'signature'>): string {
  const ordered: Record<string, unknown> = {};
  for (const k of CANONICAL_KEY_ORDER) ordered[k] = (proof as Record<string, unknown>)[k];
  return JSON.stringify(ordered);
}

export async function publishMemoryProof(input: {
  peerId: string;
  publisherPrivKeyB64: string;
  contentSha256: string;
  embedding: number[];
  topicTags: string[];
  importance: number;
  privacyClass: PrivacyClass;
  ttlSeconds?: number;
}): Promise<MemoryProof> {
  const envelope: Omit<MemoryProof, 'signature'> = {
    origin_peer_id: input.peerId,
    origin_pubkey: await derivePubkey(input.publisherPrivKeyB64),
    content_sha256: input.contentSha256,
    embedding: input.embedding,
    topic_tags: input.topicTags,
    importance: input.importance,
    privacy_class: input.privacyClass,
    ttl_seconds: input.ttlSeconds,
  };
  const canonical = canonicalizeProof(envelope);
  const { sign, createPrivateKey } = await import('node:crypto');
  const privKeyObj = createPrivateKey({
    key: Buffer.from(input.publisherPrivKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, Buffer.from(canonical, 'utf-8'), privKeyObj).toString('base64');
  return { ...envelope, signature };
}

async function derivePubkey(privKeyB64: string): Promise<string> {
  const { createPrivateKey, createPublicKey } = await import('node:crypto');
  const privKeyObj = createPrivateKey({
    key: Buffer.from(privKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const pubKeyObj = createPublicKey(privKeyObj);
  return pubKeyObj.export({ format: 'der', type: 'spki' }).toString('base64');
}

export function verifyMemoryProofSignature(proof: MemoryProof): boolean {
  try {
    const canonical = canonicalizeProof({
      origin_peer_id: proof.origin_peer_id,
      origin_pubkey: proof.origin_pubkey,
      content_sha256: proof.content_sha256,
      embedding: proof.embedding,
      topic_tags: proof.topic_tags,
      importance: proof.importance,
      privacy_class: proof.privacy_class,
      ttl_seconds: proof.ttl_seconds,
    });
    const ok = verify(
      null,
      Buffer.from(canonical, 'utf8'),
      { key: Buffer.from(proof.origin_pubkey, 'base64'), format: 'der', type: 'spki' },
      Buffer.from(proof.signature, 'base64')
    );
    return ok;
  } catch (e) {
    log.warn('federated.signature_verify_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

const DEFAULT_BUDGET_PER_TOPIC_PER_DAY = 100;
const budgetState = new Map<string, { count: number; resetAt: number }>();

function budgetKey(topic: string): string {
  const day = Math.floor(Date.now() / 86_400_000);
  return `${day}:${topic}`;
}

export function privacyBudgetForTopic(topic: string): number {
  const envVal = process.env[`NEXUS_FED_BUDGET_${topic.toUpperCase().replace(/\W+/g, '_')}`];
  const parsed = envVal ? Number(envVal) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BUDGET_PER_TOPIC_PER_DAY;
}

export function consumeBudget(topic: string): boolean {
  const key = budgetKey(topic);
  const limit = privacyBudgetForTopic(topic);
  const now = Date.now();
  const entry = budgetState.get(key);
  if (!entry || entry.resetAt < now) {
    budgetState.set(key, { count: 1, resetAt: now + 86_400_000 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

export function refundBudget(topic: string): void {
  const key = budgetKey(topic);
  const entry = budgetState.get(key);
  if (entry && entry.count > 0) entry.count--;
}

export async function decideMaterialization(proof: MemoryProof): Promise<MaterializationDecision> {
  if (proof.privacy_class === 'private') {
    return { materialize: false, reason: 'private_class_default_deny' };
  }
  if (proof.importance < 0.1) {
    return { materialize: false, reason: 'below_importance_threshold' };
  }
  if (proof.topic_tags.length === 0) {
    return { materialize: false, reason: 'no_topic_tags' };
  }
  for (const tag of proof.topic_tags) {
    if (!consumeBudget(tag)) {
      return { materialize: false, reason: `budget_exhausted:${tag}` };
    }
  }
  return { materialize: true, reason: 'ok' };
}

export async function ingestMemoryProof(
  proof: MemoryProof
): Promise<{ id: string; materialized: boolean; reason: string }> {
  if (!verifyMemoryProofSignature(proof)) {
    await appendAudit(
      'federated.signature_invalid',
      {
        originPeerId: proof.origin_peer_id,
        contentSha256: proof.content_sha256,
      },
      'federated-recall'
    );
    throw new Error('federated_signature_invalid');
  }

  const existing = await db.query.federatedMemoryProofs.findFirst({
    where: and(
      eq(federatedMemoryProofs.originPeerId, proof.origin_peer_id),
      eq(federatedMemoryProofs.contentSha256, proof.content_sha256)
    ),
  });
  if (existing) {
    return {
      id: existing.id,
      materialized: existing.materialized,
      reason: existing.rejectReason ?? 'duplicate',
    };
  }

  const decision = await decideMaterialization(proof);
  const id = `fmp_${randomUUID()}`;
  const expiresAt = proof.ttl_seconds ? new Date(Date.now() + proof.ttl_seconds * 1000) : null;

  await db.insert(federatedMemoryProofs).values({
    id,
    originPeerId: proof.origin_peer_id,
    originPubkey: proof.origin_pubkey,
    signature: proof.signature,
    contentSha256: proof.content_sha256,
    embedding: proof.embedding,
    topicTags: proof.topic_tags,
    importance: proof.importance,
    privacyClass: proof.privacy_class,
    materialized: decision.materialize,
    rejectReason: decision.materialize ? null : decision.reason,
    receivedAt: new Date(),
    expiresAt,
  });

  await appendAudit(
    'federated.proof_ingested',
    {
      proofId: id,
      originPeerId: proof.origin_peer_id,
      contentSha256: proof.content_sha256,
      materialized: decision.materialize,
      reason: decision.reason,
      topicTags: proof.topic_tags,
      privacyClass: proof.privacy_class,
    },
    'federated-recall'
  );

  if (!decision.materialize) {
    for (const tag of proof.topic_tags) refundBudget(tag);
  }

  log.info('federated.proof_ingested', {
    id,
    origin: proof.origin_peer_id,
    materialized: decision.materialize,
    reason: decision.reason,
  });
  return { id, materialized: decision.materialize, reason: decision.reason };
}

export async function listRecentProofs(opts?: {
  materialized?: boolean;
  topic?: string;
  limit?: number;
}) {
  const where = and(
    opts?.materialized !== undefined
      ? eq(federatedMemoryProofs.materialized, opts.materialized)
      : undefined
  );
  const rows = await db.query.federatedMemoryProofs.findMany({
    where,
    orderBy: [desc(federatedMemoryProofs.receivedAt)],
    limit: opts?.limit ?? 50,
  });
  if (opts?.topic) {
    return rows.filter((r: any) => (r.topicTags ?? []).includes(opts.topic!));
  }
  return rows;
}

export async function federatedStats(): Promise<{
  total: number;
  materialized: number;
  rejected: number;
  byReason: Record<string, number>;
  byTopic: Record<string, number>;
}> {
  const rows = await db.query.federatedMemoryProofs.findMany({});
  const byReason: Record<string, number> = {};
  const byTopic: Record<string, number> = {};
  let materialized = 0;
  for (const r of rows) {
    if (r.materialized) materialized++;
    else if (r.rejectReason) byReason[r.rejectReason] = (byReason[r.rejectReason] ?? 0) + 1;
    for (const t of r.topicTags ?? []) byTopic[t] = (byTopic[t] ?? 0) + 1;
  }
  return {
    total: rows.length,
    materialized,
    rejected: rows.length - materialized,
    byReason,
    byTopic,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * LAYER 2 — Federated Recall Enhancements (Phase 4b)
 * ════════════════════════════════════════════════════════════════════════════ */

/* ─── Constants ─────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;
const RRF_K = env.NEXUS_RRF_K;
const RECENCY_HALFLIFE_DAYS = env.NEXUS_RECENCY_HALFLIFE_DAYS;
let W_RRF = env.NEXUS_RECALL_WEIGHT_RRF;
let W_IMPORTANCE = env.NEXUS_RECALL_WEIGHT_IMPORTANCE;
let W_RECENCY = env.NEXUS_RECALL_WEIGHT_RECENCY;
function refreshAdaptiveWeights(): void {
  const w = getEffectiveWeights();
  W_RRF = w.rrf;
  W_IMPORTANCE = w.importance;
  W_RECENCY = w.recency;
}
const MAX_CORPUS = env.NEXUS_MAX_RECALL_CORPUS;
const SEMANTIC_THRESHOLD = env.NEXUS_SEMANTIC_THRESHOLD;

/* ─── ML-003: meta-learning — feed recall feedback back into weighting ─── */
interface RecallFeedbackEntry {
  queryHash: string;
  memoryId: string;
  relevant: boolean;
  ts: number;
}
const recallFeedbackLog: RecallFeedbackEntry[] = [];
const MAX_FEEDBACK_ENTRIES = 5000;

interface AdaptiveWeights {
  rrf: number;
  importance: number;
  recency: number;
}

function hashQuery(q: string): string {
  let h = 0x811c9dc5;
  const s = q.toLowerCase().trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function recordRecallFeedback(query: string, memoryId: string, relevant: boolean): void {
  recallFeedbackLog.push({ queryHash: hashQuery(query), memoryId, relevant, ts: Date.now() });
  if (recallFeedbackLog.length > MAX_FEEDBACK_ENTRIES) {
    recallFeedbackLog.splice(0, recallFeedbackLog.length - MAX_FEEDBACK_ENTRIES);
  }
}

export function getAdaptiveWeights(): AdaptiveWeights {
  if (recallFeedbackLog.length < 8) return { rrf: 1, importance: 1, recency: 1 };
  let rrfRel = 0,
    rrfIrr = 0,
    impRel = 0,
    impIrr = 0,
    recRel = 0,
    recIrr = 0,
    nRel = 0,
    nIrr = 0;
  const now = Date.now();
  for (const e of recallFeedbackLog) {
    const ageWeight = Math.exp(-(now - e.ts) / (1000 * 60 * 60 * 24 * 7));
    if (e.relevant) {
      nRel++;
      rrfRel += ageWeight;
      impRel += ageWeight;
      recRel += ageWeight;
    } else {
      nIrr++;
      rrfIrr += ageWeight;
      impIrr += ageWeight;
      recIrr += ageWeight;
    }
  }
  const avg = (a: number, n: number) => (n > 0 ? a / n : 0);
  const clampMult = (m: number) => Math.min(1.5, Math.max(0.5, m));
  return {
    rrf: clampMult(1 + 0.08 * (avg(rrfRel, nRel) - avg(rrfIrr, nIrr))),
    importance: clampMult(1 + 0.08 * (avg(impRel, nRel) - avg(impIrr, nIrr))),
    recency: clampMult(1 + 0.08 * (avg(recRel, nRel) - avg(recIrr, nIrr))),
  };
}

export function getEffectiveWeights(): AdaptiveWeights {
  const m = getAdaptiveWeights();
  return {
    rrf: W_RRF * m.rrf,
    importance: W_IMPORTANCE * m.importance,
    recency: W_RECENCY * m.recency,
  };
}

export function getRecallFeedbackStats(): { total: number; relevant: number; irrelevant: number } {
  let relevant = 0;
  for (const e of recallFeedbackLog) if (e.relevant) relevant++;
  return {
    total: recallFeedbackLog.length,
    relevant,
    irrelevant: recallFeedbackLog.length - relevant,
  };
}

/* ─── Phase 4b: Types ──────────────────────────────────────────────────── */

export interface RecallItem {
  id: string;
  type: 'memory' | 'skill' | 'note' | 'federated';
  title: string;
  content: string;
  score: number;
  tokenCost: number;
  source: string;
  importance: number;
  recency: number;
  matchedBy: ('bm25' | 'semantic')[];
}

export interface RecallResult {
  query: string;
  returned: RecallItem[];
  tokensUsed: number;
  tokenBudget: number;
  truncated: number;
  mode: 'lexical' | 'semantic';
  federatedContribution: number;
  nextCursor?: number;
}

export interface RecallFilters {
  types?: ('memory' | 'skill' | 'note' | 'federated')[];
  importanceMin?: number;
  importanceMax?: number;
  topicTags?: string[];
  privacyClass?: PrivacyClass;
  peerIds?: string[];
  since?: Date;
  until?: Date;
}

export interface RecallOptions {
  cursor?: number;
  limit?: number;
  includeFederated?: boolean;
  minScore?: number;
  dedupeContent?: boolean;
}

export interface RecallQuery {
  text: string;
  budget: number;
  actor: string;
  filters?: RecallFilters;
  options?: RecallOptions;
}

export interface LRUStats {
  size: number;
  capacity: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

interface RawItem {
  id: string;
  type: 'memory' | 'skill' | 'note' | 'federated';
  title: string;
  content: string;
  importance: number;
  updatedAt: Date;
  source: string;
}

/* ─── Phase 4b: Enhanced LRU Cache with Statistics ──────────────────────── */

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class LRUCache<K, V> {
  private map = new Map<K, CacheEntry<V>>();
  private readonly capacity: number;
  private readonly ttlMs: number;
  hits = 0;
  misses = 0;
  evictions = 0;

  constructor(capacity = 256, ttlMs = 30_000) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      this.evictions++;
      this.misses++;
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return entry.value;
  }

  set(key: K, value: V, customTtlMs?: number): void {
    if (this.map.size >= this.capacity && !this.map.has(key)) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
        this.evictions++;
      }
    }
    this.map.set(key, {
      value,
      expiresAt: Date.now() + (customTtlMs ?? this.ttlMs),
    });
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  get hitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  get size(): number {
    return this.map.size;
  }

  stats(): LRUStats {
    return {
      size: this.map.size,
      capacity: this.capacity,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: this.hitRate,
    };
  }
}

/* ─── Phase 4b: Scoring Functions ─────────────────────────────────────── */

export function computeRecency(
  updatedAt: Date | number,
  halfLifeDays = RECENCY_HALFLIFE_DAYS
): number {
  const age = Date.now() - (updatedAt instanceof Date ? updatedAt.getTime() : updatedAt);
  return Math.exp(-(age / (halfLifeDays * DAY_MS)));
}

export function computeImportance(raw: number): number {
  return Math.max(0, Math.min(1, raw));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const dim = Math.min(a.length, b.length);
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < dim; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) * (a[i] ?? 0);
    nb += (b[i] ?? 0) * (b[i] ?? 0);
  }
  const mag = Math.sqrt(na) * Math.sqrt(nb);
  return mag === 0 ? 0 : dot / mag;
}

export function reciprocalRankFusion(ranks: Map<string, number>[], k = RRF_K): Map<string, number> {
  const fused = new Map<string, number>();
  for (const rankMap of ranks) {
    for (const [id, rank] of rankMap) {
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  if (fused.size === 0) return fused;
  const maxPossible = (1 / (k + 1)) * ranks.length;
  for (const [id, score] of fused) {
    fused.set(id, score / maxPossible);
  }
  return fused;
}

/* ─── Phase 4b: State Cache for Composed Agent State ───────────────────── */

type StateCacheKey = `agent:${string}`;
interface CachedState {
  items: RecallItem[];
  tokens: number;
  cachedAt: number;
}

export const agentStateCache = new LRUCache<StateCacheKey, CachedState>(128, 60_000);

export function getCachedAgentState(agentId: string): CachedState | undefined {
  return agentStateCache.get(`agent:${agentId}` as StateCacheKey);
}

export function setCachedAgentState(agentId: string, state: CachedState): void {
  agentStateCache.set(`agent:${agentId}` as StateCacheKey, state);
}

export function invalidateAgentState(agentId: string): void {
  agentStateCache.delete(`agent:${agentId}` as StateCacheKey);
}

export function getAgentStateCacheStats(): LRUStats {
  return agentStateCache.stats();
}

/* ─── Phase 4b: Cross-session Persistence ──────────────────────────────── */

const sessionMemoryStore = new Map<string, { items: RecallItem[]; savedAt: number }>();

export function persistSessionMemories(sessionId: string, items: RecallItem[]): void {
  sessionMemoryStore.set(sessionId, { items, savedAt: Date.now() });
}

export function loadSessionMemories(sessionId: string): RecallItem[] {
  const entry = sessionMemoryStore.get(sessionId);
  if (!entry) return [];
  const age = Date.now() - entry.savedAt;
  if (age > DAY_MS * 30) {
    sessionMemoryStore.delete(sessionId);
    return [];
  }
  return entry.items;
}

export function pruneStaleSessions(maxAgeDays = 30): number {
  const cutoff = Date.now() - maxAgeDays * DAY_MS;
  let pruned = 0;
  for (const [id, entry] of sessionMemoryStore) {
    if (entry.savedAt < cutoff) {
      sessionMemoryStore.delete(id);
      pruned++;
    }
  }
  return pruned;
}

export function listActiveSessions(): { sessionId: string; itemCount: number; age: number }[] {
  const now = Date.now();
  return Array.from(sessionMemoryStore.entries()).map(([id, entry]) => ({
    sessionId: id,
    itemCount: entry.items.length,
    age: Math.floor((now - entry.savedAt) / 1000),
  }));
}

/* ─── Phase 4b: FederatedRecall — the unified entry point ──────────────── */

export class FederatedRecall {
  readonly localCache = new LRUCache<string, RecallItem[]>(512, 30_000);

  /**
   * Search across ALL sources: memories, skills, notes, and federated proofs.
   * Returns scored, deduped, budget-packed results.
   */
  async search(query: RecallQuery): Promise<RecallResult> {
    refreshAdaptiveWeights();
    const useSemantic = embeddingsAvailable();
    const actor = query.actor;
    const budget = query.budget;

    const [localResults, federatedResults] = await Promise.all([
      this.searchLocal(query.text, budget, useSemantic, query.filters),
      query.options?.includeFederated !== false
        ? this.searchFederated(query.text, budget, useSemantic, query.filters)
        : Promise.resolve([] as RecallItem[]),
    ]);

    const all = this.mergeResults(
      localResults,
      federatedResults,
      query.options?.dedupeContent ?? true
    );
    const mode: 'lexical' | 'semantic' = useSemantic ? 'semantic' : 'lexical';

    let page = all;
    if (query.options?.cursor !== undefined) {
      const cursorIdx = all.findIndex((i: any) => i.score < query.options!.cursor!);
      page = cursorIdx >= 0 ? all.slice(cursorIdx) : [];
    }
    if (query.options?.minScore !== undefined) {
      page = page.filter((i: any) => i.score >= query.options!.minScore!);
    }
    const { packed, tokensUsed, truncated } = packByBudget(page, budget);

    await appendAudit(
      'fed_recall.search',
      {
        query: truncate(query.text, 80),
        items: packed.length,
        tokensUsed,
        mode,
        federatedItems: federatedResults.length,
      },
      actor
    );

    const contradictionEdges = await contradictionsAmong(packed.map((p) => p.id));
    return {
      query: query.text,
      returned: packed,
      tokensUsed,
      tokenBudget: budget,
      truncated,
      mode,
      federatedContribution: all.length > 0 ? federatedResults.length / all.length : 0,
      contradictionEdges: contradictionEdges.map((e) => ({
        memoryA: e.memoryA,
        memoryB: e.memoryB,
        classification: e.classification,
      })),
      nextCursor: packed.length > 0 ? packed[packed.length - 1]?.score : undefined,
    };
  }

  /**
   * Convenience recall: like search but returns flattened items + expanded tokens.
   * Compatible with server/src/services/recall.ts recall() signature.
   */
  async recall(
    text: string,
    budget: number,
    actor: string,
    opts?: RecallOptions
  ): Promise<RecallResult> {
    return this.search({ text, budget, actor, options: opts });
  }

  /**
   * Store a memory locally and optionally publish a federated proof.
   */
  async store(input: {
    kind: string;
    title: string;
    content: string;
    tags: string[];
    importance: number;
    source: string;
    actor: string;
    publish?: boolean;
    peerId?: string;
    privKeyB64?: string;
  }): Promise<{ id: string; proofId?: string }> {
    const memId = `mem_${randomUUID()}`;
    const tokenCost = estimateTokens(input.content);
    const embedding = embeddingsAvailable() ? await embedQuery(input.content) : null;

    await db.insert(memories).values({
      id: memId,
      kind: input.kind,
      title: input.title,
      content: input.content,
      tags: input.tags,
      importance: input.importance,
      source: input.source,
      tokenCost,
      embedding: embedding ?? [],
    });

    await appendAudit(
      'fed_recall.store',
      {
        memoryId: memId,
        kind: input.kind,
        importance: input.importance,
        tags: input.tags,
      },
      input.actor
    );

    let proofId: string | undefined;

    if (input.publish && input.peerId && input.privKeyB64) {
      const contentSha256 = createHash('sha256').update(input.content).digest('hex');
      const proof = await publishMemoryProof({
        peerId: input.peerId,
        publisherPrivKeyB64: input.privKeyB64,
        contentSha256,
        embedding: embedding ?? [],
        topicTags: input.tags,
        importance: input.importance,
        privacyClass: 'public',
      });
      const result = await ingestMemoryProof(proof);
      proofId = result.id;
    }

    return { id: memId, proofId };
  }

  /**
   * Cache operations — read/write/invalidate composed agent state.
   */
  cache = {
    get: getCachedAgentState,
    set: setCachedAgentState,
    invalidate: invalidateAgentState,
    stats: getAgentStateCacheStats,
  };

  /**
   * Session persistence operations.
   */
  session = {
    persist: persistSessionMemories,
    load: loadSessionMemories,
    prune: pruneStaleSessions,
    list: listActiveSessions,
  };

  /* ── Private: local search ──────────────────────────────────────────── */

  private async searchLocal(
    query: string,
    budget: number,
    useSemantic: boolean,
    filters?: RecallFilters
  ): Promise<RecallItem[]> {
    const [allMemories, allSkills, allNotes] = await Promise.all([
      db
        .select({
          id: memories.id,
          kind: memories.kind,
          title: memories.title,
          content: memories.content,
          tags: memories.tags,
          importance: memories.importance,
          source: memories.source,
          updatedAt: memories.updatedAt,
        })
        .from(memories)
        .orderBy(desc(memories.importance), desc(memories.updatedAt))
        .limit(MAX_CORPUS),
      db
        .select({
          id: skills.id,
          title: skills.title,
          description: skills.description,
          content: skills.content,
          rating: skills.rating,
          updatedAt: skills.updatedAt,
        })
        .from(skills)
        .orderBy(desc(skills.rating))
        .limit(Math.min(MAX_CORPUS, 2000)),
      db
        .select({
          id: notes.id,
          title: notes.title,
          content: notes.content,
          tags: notes.tags,
          wikilinks: notes.wikilinks,
          indexedAt: notes.indexedAt,
          path: notes.path,
        })
        .from(notes)
        .orderBy(desc(notes.indexedAt))
        .limit(Math.min(MAX_CORPUS, 2000)),
    ]);

    if (filters?.types && !filters.types.includes('memory')) {
      allMemories.length = 0;
    }
    if (filters?.types && !filters.types.includes('skill')) {
      allSkills.length = 0;
    }
    if (filters?.types && !filters.types.includes('note')) {
      allNotes.length = 0;
    }

    type MemRow = (typeof allMemories)[number];
    type SkillRow = (typeof allSkills)[number];
    type NoteRow = (typeof allNotes)[number];

    const memDocs = allMemories.map((m: MemRow) => ({
      id: m.id,
      text: `${m.title} ${m.content} ${(m.tags ?? []).join(' ')}`,
    }));
    const skillDocs = allSkills.map((s: SkillRow) => ({
      id: s.id,
      text: `${s.title} ${s.description} ${s.content}`,
    }));
    const noteDocs = allNotes.map((n: NoteRow) => ({
      id: n.id,
      text: `${n.title} ${n.content} ${(n.tags ?? []).join(' ')} ${(n.wikilinks ?? []).join(' ')}`,
    }));

    const bm25Mem = bm25Score(memDocs, query);
    const bm25Skill = bm25Score(skillDocs, query);
    const bm25Note = bm25Score(noteDocs, query);

    const bm25MemRank = new Map(bm25Mem.map((s, i) => [s.id, i]));
    const bm25SkillRank = new Map(bm25Skill.map((s, i) => [s.id, i]));
    const bm25NoteRank = new Map(bm25Note.map((s, i) => [s.id, i]));

    const semanticRanks = new Map<string, number>();
    const semanticCandidates = new Set<string>();

    if (useSemantic) {
      const queryEmbedding = await embedQuery(query);
      if (queryEmbedding) {
        const [semMemResult, semSkillResult, semNoteResult] = await Promise.all([
          db
            .select({
              id: memories.id,
              distance:
                sql<number>`${memories.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`.as(
                  'distance'
                ),
            })
            .from(memories)
            .where(isNotNull(memories.embedding))
            .orderBy(sql`${memories.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
            .limit(100),
          db
            .select({
              id: skills.id,
              distance:
                sql<number>`${skills.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`.as(
                  'distance'
                ),
            })
            .from(skills)
            .where(isNotNull(skills.embedding))
            .orderBy(sql`${skills.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
            .limit(100),
          db
            .select({
              id: notes.id,
              distance:
                sql<number>`${notes.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`.as(
                  'distance'
                ),
            })
            .from(notes)
            .where(isNotNull(notes.embedding))
            .orderBy(sql`${notes.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
            .limit(100),
        ]);

        const allSem = [
          ...semMemResult.map((r: any) => ({ id: r.id, distance: r.distance })),
          ...semSkillResult.map((r: any) => ({ id: r.id, distance: r.distance })),
          ...semNoteResult.map((r: any) => ({ id: r.id, distance: r.distance })),
        ].sort((a, b) => a.distance - b.distance);

        allSem.forEach((r, i) => {
          if (r.distance <= SEMANTIC_THRESHOLD) {
            semanticRanks.set(r.id, i);
            semanticCandidates.add(r.id);
          }
        });
      }
    }

    const bm25Candidates = new Set<string>([
      ...bm25Mem.map((s: any) => s.id),
      ...bm25Skill.map((s: any) => s.id),
      ...bm25Note.map((s: any) => s.id),
    ]);

    const allCandidates = new Set([...bm25Candidates, ...semanticCandidates]);

    const rrfScores = new Map<string, { score: number; matchedBy: ('bm25' | 'semantic')[] }>();
    for (const id of allCandidates) {
      let rrf = 0;
      const matchedBy: ('bm25' | 'semantic')[] = [];

      const bm25Rank = bm25MemRank.get(id) ?? bm25SkillRank.get(id) ?? bm25NoteRank.get(id);
      if (bm25Rank !== undefined) {
        rrf += 1 / (RRF_K + bm25Rank + 1);
        matchedBy.push('bm25');
      }

      const semRank = semanticRanks.get(id);
      if (semRank !== undefined) {
        rrf += 1 / (RRF_K + semRank + 1);
        matchedBy.push('semantic');
      }

      const maxRrf = 2 / (RRF_K + 1);
      const normalizedRrf = rrf / maxRrf;
      rrfScores.set(id, { score: normalizedRrf, matchedBy });
    }

    const memMap = new Map<string, MemRow>(allMemories.map((m: MemRow) => [m.id, m]));
    const skillMap = new Map<string, SkillRow>(allSkills.map((s: SkillRow) => [s.id, s]));
    const noteMap = new Map<string, NoteRow>(allNotes.map((n: NoteRow) => [n.id, n]));

    const items: RecallItem[] = [];
    for (const [id, { score: rrf, matchedBy }] of rrfScores) {
      const meta = this.getMeta(id, memMap, skillMap, noteMap);
      if (!meta) continue;

      const recency = computeRecency(meta.updatedAt);
      const importance = computeImportance(meta.importance);
      const blended = rrf * W_RRF + importance * W_IMPORTANCE + recency * W_RECENCY;

      if (filters?.importanceMin !== undefined && importance < filters.importanceMin) continue;
      if (filters?.importanceMax !== undefined && importance > filters.importanceMax) continue;

      items.push({
        id: meta.id,
        type: meta.type,
        title: meta.title,
        content: meta.content,
        score: Math.round(blended * 1000) / 1000,
        tokenCost: estimateTokens(meta.content),
        source: meta.source,
        importance,
        recency,
        matchedBy,
      });
    }

    items.sort((a, b) => b.score - a.score);
    return items;
  }

  /* ── Private: federated search ──────────────────────────────────────── */

  private async searchFederated(
    query: string,
    budget: number,
    useSemantic: boolean,
    filters?: RecallFilters
  ): Promise<RecallItem[]> {
    let fedRows = await db.query.federatedMemoryProofs.findMany({
      where: and(
        eq(federatedMemoryProofs.materialized, true),
        filters?.privacyClass
          ? eq(federatedMemoryProofs.privacyClass, filters.privacyClass)
          : undefined,
        filters?.peerIds?.length
          ? sql`${federatedMemoryProofs.originPeerId} = ANY(${filters.peerIds})`
          : undefined
      ),
      orderBy: [desc(federatedMemoryProofs.importance), desc(federatedMemoryProofs.receivedAt)],
      limit: Math.min(MAX_CORPUS / 2, 5000),
    });

    if (filters?.topicTags?.length) {
      fedRows = fedRows.filter((r: any) =>
        filters.topicTags!.some((t: any) => (r.topicTags ?? []).includes(t))
      );
    }
    if (filters?.since) {
      fedRows = fedRows.filter((r: any) => r.receivedAt >= filters.since!);
    }
    if (filters?.until) {
      fedRows = fedRows.filter((r: any) => r.receivedAt <= filters.until!);
    }

    if (!fedRows.length) return [];

    const queryTerms = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
      (t: any) => t.length > 1
    );
    const queryEmbedding = useSemantic ? await embedQuery(query) : null;

    const items: RecallItem[] = [];

    for (const row of fedRows) {
      const tagText = (row.topicTags ?? []).join(' ');
      const docText = `${tagText} ${row.originPeerId} ${row.privacyClass}`;
      const docLower = docText.toLowerCase();

      let bm25ScoreVal = 0;
      for (const term of queryTerms) {
        const count = (docLower.match(new RegExp(term, 'g')) || []).length;
        if (count > 0) bm25ScoreVal += Math.log(1 + count);
      }

      let semanticScore = 0;
      if (queryEmbedding && Array.isArray(row.embedding) && row.embedding.length > 0) {
        semanticScore = cosineSimilarity(queryEmbedding, row.embedding as number[]);
      }

      const recency = computeRecency(row.receivedAt);
      const importance = computeImportance(row.importance);

      const normalizedBm25 = Math.min(1, bm25ScoreVal / Math.max(1, queryTerms.length));
      const rrfScore =
        normalizedBm25 * (useSemantic ? 0.5 : 1) + semanticScore * (useSemantic ? 0.5 : 0);
      const blended = rrfScore * W_RRF + importance * W_IMPORTANCE + recency * W_RECENCY;

      const matchedBy: ('bm25' | 'semantic')[] = [];
      if (bm25ScoreVal > 0) matchedBy.push('bm25');
      if (semanticScore > 0) matchedBy.push('semantic');

      items.push({
        id: row.id,
        type: 'federated',
        title: `[FED] ${tagText.slice(0, 60)} from ${row.originPeerId.slice(0, 8)}`,
        content: JSON.stringify({
          originPeerId: row.originPeerId,
          contentSha256: row.contentSha256,
          topicTags: row.topicTags,
          importance: row.importance,
        }),
        score: Math.round(blended * 1000) / 1000,
        tokenCost: estimateTokens(row.contentSha256 + tagText + row.originPeerId),
        source: `federated:${row.originPeerId}`,
        importance,
        recency,
        matchedBy,
      });
    }

    items.sort((a, b) => b.score - a.score);
    return items.slice(0, Math.min(100, items.length));
  }

  /* ── Private: merge + dedupe ────────────────────────────────────────── */

  private mergeResults(
    local: RecallItem[],
    federated: RecallItem[],
    dedupeContent: boolean
  ): RecallItem[] {
    const all = [...local, ...federated];
    if (!dedupeContent) {
      return all.sort((a, b) => b.score - a.score);
    }
    const seen = new Set<string>();
    const merged: RecallItem[] = [];
    for (const item of all) {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged.sort((a, b) => b.score - a.score);
  }

  /* ── Private: metadata lookup ───────────────────────────────────────── */

  private getMeta(
    id: string,
    memMap: Map<
      string,
      {
        id: string;
        kind: string;
        title: string;
        content: string;
        importance: number;
        updatedAt: Date;
        source: string;
      }
    >,
    skillMap: Map<
      string,
      {
        id: string;
        title: string;
        description: string;
        content: string;
        rating: number;
        updatedAt: Date;
      }
    >,
    noteMap: Map<
      string,
      { id: string; title: string; content: string; path: string; indexedAt: Date }
    >
  ): RawItem | null {
    const m = memMap.get(id);
    if (m) {
      return {
        id: m.id,
        type: 'memory',
        title: m.title,
        content: m.content,
        importance: m.importance,
        updatedAt: m.updatedAt,
        source: m.source,
      };
    }
    const s = skillMap.get(id);
    if (s) {
      return {
        id: s.id,
        type: 'skill',
        title: s.title,
        content: `# ${s.title}\n${s.description}\n\n${s.content}`,
        importance: Math.max(0.2, Math.min(1, s.rating)),
        updatedAt: s.updatedAt,
        source: 'skill',
      };
    }
    const n = noteMap.get(id);
    if (n) {
      return {
        id: n.id,
        type: 'note',
        title: n.title || n.path,
        content: n.content,
        importance: 0.45,
        updatedAt: n.indexedAt,
        source: 'vault',
      };
    }
    return null;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * Singleton instance
 * ════════════════════════════════════════════════════════════════════════════ */

export const fedRecall = new FederatedRecall();

/* ════════════════════════════════════════════════════════════════════════════
 * Integration helpers — OS types, kernel compatibility
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Convert a server-side MemoryCard (OS type) into a RecallItem for unified
 * scoring. Compatible with `src/lib/os/types.ts` MemoryCard definition.
 */
export function memoryCardToRecallItem(card: {
  id: string;
  title: string;
  summary: string;
  body: string;
  importance: number;
  updatedAt: number;
  accessCount: number;
}): RecallItem {
  const content = `${card.title}: ${card.summary}\n${card.body}`;
  return {
    id: card.id,
    type: 'memory',
    title: card.title,
    content,
    score: 0,
    tokenCost: estimateTokens(content),
    source: 'os-graph',
    importance: card.importance,
    recency: computeRecency(card.updatedAt),
    matchedBy: [],
  };
}

/**
 * Convert an OSState into a scored, budget-packed context snapshot.
 * Compatible with `src/lib/os/kernel.ts` compactContext / doGraphRecall.
 */
export function composeAgentState(
  cards: {
    id: string;
    title: string;
    summary: string;
    body: string;
    importance: number;
    updatedAt: number;
    accessCount: number;
  }[],
  query: string,
  budget: number
): { items: RecallItem[]; expanded: string[]; tokens: number } {
  const queryTerms = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t: any) => t.length > 1
  );
  const scored = cards.map((c: any) => {
    const text = `${c.title} ${c.summary} ${c.body}`.toLowerCase();
    let bm25 = 0;
    for (const t of queryTerms) {
      if (text.includes(t)) bm25++;
    }
    const recency = computeRecency(c.updatedAt);
    const importance = computeImportance(c.importance);
    const score = (bm25 / Math.max(1, queryTerms.length)) * 0.4 + importance * 0.3 + recency * 0.3;

    return {
      item: memoryCardToRecallItem({ ...c, updatedAt: c.updatedAt }),
      score,
    };
  });

  const sorted = scored.filter((s: any) => s.score > 0).sort((a, b) => b.score - a.score);
  const expanded: string[] = [];
  let tokens = 0;
  const items: RecallItem[] = [];

  for (const { item, score } of sorted) {
    item.score = Math.round(score * 1000) / 1000;
    if (tokens + item.tokenCost > budget) continue;
    items.push(item);
    tokens += item.tokenCost;
    expanded.push(item.id);
  }

  return { items, expanded, tokens };
}
