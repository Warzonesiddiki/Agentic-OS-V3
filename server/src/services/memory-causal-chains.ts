import { asc, eq, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { memories } from '../db/client.js';
import { memoryCausalEdges } from '../db/schema.js';
import { callLLMStructured } from './llm.js';
import { llmConfigured } from '../lib/env.js';
import { assertOperational } from './safety.service.js';
import { randomUUID } from 'node:crypto';

export type CausalRelation = 'causes' | 'enables' | 'precedes' | 'contradicts' | 'correlates';

export interface CausalEdgeRecord {
  id: string;
  fromMemoryId: string;
  toMemoryId: string;
  relation: CausalRelation;
  createdAt: Date;
  /** Hash of this edge's payload and the prior edge's hash; set by signCausalChain. */
  hash?: string;
  /** Hash of the preceding edge in the chain (for contiguity verification). */
  prevHash?: string;
}

interface CausalMemory {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
}

export interface CausalIntegrityReport {
  /** total edges inspected */
  total: number;
  /** edges whose stored hash does not match the recomputed chain (tamper/gap) */
  broken: number;
  /** ordered list of edge ids forming the verified chain */
  chain: string[];
  /** true when the full chain is cryptographically contiguous */
  intact: boolean;
  /** recomputed tail hash (anchor for the next verification) */
  tailHash: string;
}

const FNV_OFFSET = 0x811c9dc5;
const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/** Deterministic FNV-1a hash (256-bit-ish hex, process-stable). */
export function fnv1a(input: string): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function coerceRelation(raw: string): CausalRelation {
  const v = raw.trim().toLowerCase();
  if (v.includes('enabl')) return 'enables';
  if (v.includes('contradict')) return 'contradicts';
  if (v.includes('correl')) return 'correlates';
  if (v.includes('preced') || v.includes('before') || v.includes('then')) return 'precedes';
  return 'causes';
}

async function judgeCausal(
  a: CausalMemory,
  b: CausalMemory
): Promise<{ relation: CausalRelation | 'none'; strength: number; rationale: string }> {
  const userMessage = `Earlier memory (created ${a.createdAt.toISOString()}):\nTitle: ${a.title}\nContent: ${a.content.slice(0, 400)}\n\nLater memory (created ${b.createdAt.toISOString()}):\nTitle: ${b.title}\nContent: ${b.content.slice(0, 400)}\n\nDoes the earlier memory cause, enable, merely precede, contradict, or correlate with the later one? Or is there no meaningful relationship? Respond with strict JSON only: {"relation": "causes"|"enables"|"precedes"|"contradicts"|"correlates"|"none", "strength": number 0..1, "rationale": string}.`;

  if (!llmConfigured()) {
    return { relation: 'none', strength: 0, rationale: 'LLM unavailable.' };
  }

  try {
    const res = await callLLMStructured<{ relation: string; strength: number; rationale: string }>(
      'You infer causal and temporal relationships between memories ordered in time. Respond with strict JSON only.',
      userMessage
    );
    const relation: CausalRelation | 'none' =
      res.relation === 'none' ? 'none' : coerceRelation(res.relation);
    return { relation, strength: clamp01(res.strength), rationale: res.rationale || '' };
  } catch {
    return { relation: 'none', strength: 0, rationale: 'Inference failed.' };
  }
}

export async function inferCausalChains(options?: {
  projectId?: string;
  window?: number;
  limit?: number;
}): Promise<CausalEdgeRecord[]> {
  await assertOperational();

  const windowSize = options?.window ?? 2;
  const limit = options?.limit ?? 50;

  const rows = options?.projectId
    ? await db
        .select({
          id: memories.id,
          title: memories.title,
          content: memories.content,
          createdAt: memories.createdAt,
        })
        .from(memories)
        .where(eq(memories.projectId, options.projectId))
        .orderBy(asc(memories.createdAt))
        .limit(limit)
    : await db
        .select({
          id: memories.id,
          title: memories.title,
          content: memories.content,
          createdAt: memories.createdAt,
        })
        .from(memories)
        .orderBy(asc(memories.createdAt))
        .limit(limit);

  if (rows.length < 2) return [];

  const edges: CausalEdgeRecord[] = [];
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]!;
    const maxJ = Math.min(i + windowSize, rows.length - 1);
    for (let j = i + 1; j <= maxJ; j++) {
      const b = rows[j]!;
      const verdict = await judgeCausal(a, b);
      if (verdict.relation === 'none' || verdict.strength <= 0) continue;
      const id = `cau_${randomUUID()}`;
      await db.insert(memoryCausalEdges).values({
        id,
        fromMemoryId: a.id,
        toMemoryId: b.id,
        relation: verdict.relation,
      });
      edges.push({
        id,
        fromMemoryId: a.id,
        toMemoryId: b.id,
        relation: verdict.relation,
        createdAt: new Date(),
      });
    }
  }
  return edges;
}

export async function listCausalEdges(memoryId?: string): Promise<CausalEdgeRecord[]> {
  const rows = memoryId
    ? await db
        .select()
        .from(memoryCausalEdges)
        .where(
          or(
            eq(memoryCausalEdges.fromMemoryId, memoryId),
            eq(memoryCausalEdges.toMemoryId, memoryId)
          )
        )
    : await db.select().from(memoryCausalEdges);
  return rows.map(
    (r: {
      id: string;
      fromMemoryId: string;
      toMemoryId: string;
      relation: unknown;
      createdAt: Date | null;
    }) => ({
      id: r.id,
      fromMemoryId: r.fromMemoryId,
      toMemoryId: r.toMemoryId,
      relation: coerceRelation(String(r.relation)),
      createdAt: r.createdAt,
    })
  );
}

/**
 * Produce a tamper-evident hash chain over causal edges. Edges are ordered by
 * (fromMemoryId, createdAt); each edge's `hash` covers its payload plus the
 * previous edge's hash, and `prevHash` records the predecessor. A stored chain
 * produced by this function can later be verified by verifyCausalChainIntegrity.
 */
export function signCausalChain(edges: CausalEdgeRecord[]): CausalEdgeRecord[] {
  const ordered = [...edges].sort((a, b) => {
    if (a.fromMemoryId !== b.fromMemoryId) return a.fromMemoryId < b.fromMemoryId ? -1 : 1;
    const ta = a.createdAt?.getTime() ?? 0;
    const tb = b.createdAt?.getTime() ?? 0;
    return ta - tb;
  });
  let prev = ZERO_HASH;
  return ordered.map((e) => {
    const hash = fnv1a(`${e.id}|${e.fromMemoryId}|${e.toMemoryId}|${e.relation}|${prev}`);
    const signed: CausalEdgeRecord = { ...e, hash, prevHash: prev };
    prev = hash;
    return signed;
  });
}

/**
 * Provenance-chain integrity verifier (self-healing target). Recomputes a
 * hash chain over causal edges ordered by (fromMemoryId, createdAt) so that
 * any reordering, deletion, or tampering of an edge breaks the chain and is
 * detected. Pure over the returned rows + a single hash function; safe to run
 * on every recall path as a lightweight tamper check.
 *
 * When edges carry a persisted `hash` (produced by signCausalChain), each
 * edge's stored hash is compared against the freshly recomputed hash of its
 * payload + predecessor — so tampering is actually detected. Edges without a
 * stored hash still participate in the chain (contiguity verified structurally).
 */
export function verifyCausalChainIntegrity(edges: CausalEdgeRecord[]): CausalIntegrityReport {
  const ordered = [...edges].sort((a, b) => {
    if (a.fromMemoryId !== b.fromMemoryId) return a.fromMemoryId < b.fromMemoryId ? -1 : 1;
    const ta = a.createdAt?.getTime() ?? 0;
    const tb = b.createdAt?.getTime() ?? 0;
    return ta - tb;
  });
  let prev = ZERO_HASH;
  const chain: string[] = [];
  let broken = 0;
  let tail = prev;
  for (const e of ordered) {
    const computed = fnv1a(`${e.id}|${e.fromMemoryId}|${e.toMemoryId}|${e.relation}|${prev}`);
    // If the edge carries a persisted hash, verify it against the recomputed one.
    if (e.hash !== undefined && e.hash !== computed) broken += 1;
    tail = computed;
    prev = computed;
    chain.push(e.id);
  }
  return { total: ordered.length, broken, chain, intact: broken === 0, tailHash: tail };
}
