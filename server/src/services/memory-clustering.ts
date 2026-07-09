import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { memories } from '../db/client.js';
import { memoryClusters, memoryClusterMembers } from '../db/schema.js';
import { callLLMStructured } from './llm.js';
import { llmConfigured } from '../lib/env.js';
import { assertOperational } from './safety.service.js';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../lib/audit.js';

export interface ClusterOptions {
  projectId?: string;
  similarityThreshold?: number;
  minClusterSize?: number;
  maxClusters?: number;
}

export interface ClusterResult {
  id: string;
  label: string;
  centroid: number[] | null;
  size: number;
  memberIds: string[];
}

export interface ClusterSummary {
  id: string;
  label: string;
  size: number;
  memberIds: string[];
}

interface MemoryVector {
  id: string;
  title: string;
  content: string;
  importance: number;
  embedding: number[];
}

/**
 * Active-learning pass (DB-free): given unlabeled candidate memories and the
 * centroids of existing clusters, rank candidates by uncertainty so the
 * orchestrator/operator knows which memory to label/cluster NEXT for maximum
 * information gain. We use distance-to-nearest-centroid as the uncertainty
 * signal (higher = more novel / ambiguous = more valuable to label). Pure over
 * vectors; fully unit-testable.
 */
export interface ActiveLearningCandidate {
  id: string;
  uncertainty: number;
}

function vecDist(a: number[], b: number[]): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) * (a[i]! - b[i]!);
  return Math.sqrt(s);
}

export function activeLearningSample(
  candidates: MemoryVector[],
  centroids: number[][],
  limit = 10
): ActiveLearningCandidate[] {
  if (centroids.length === 0) {
    // No clusters yet: rank by intrinsic importance (everything is novel).
    return candidates
      .map((c) => ({ id: c.id, uncertainty: 1 + c.importance }))
      .sort((a, b) => b.uncertainty - a.uncertainty)
      .slice(0, limit);
  }
  return candidates
    .map((c) => {
      let nearest = Number.POSITIVE_INFINITY;
      for (const ctr of centroids) nearest = Math.min(nearest, vecDist(c.embedding, ctr));
      if (!Number.isFinite(nearest)) nearest = 1;
      // Blend distance (novelty) with importance so high-value novel memories rank first.
      return { id: c.id, uncertainty: nearest * (0.5 + c.importance) };
    })
    .sort((a, b) => b.uncertainty - a.uncertainty)
    .slice(0, limit);
}

interface MemorySelectRow {
  id: string;
  title: string;
  content: string;
  importance: number;
  embedding: unknown;
}

interface ClusterRow {
  id: string;
  label: string;
}

interface MemberRow {
  clusterId: string;
  memoryId: string;
}

// NOTE: HDBSCAN is not available as a dependency in this project. We implement a
// density/cosine connected-components clustering approximation: build a similarity
// graph where edges connect memories whose cosine similarity exceeds a threshold,
// then take connected components as clusters (a simplified stand-in for HDBSCAN's
// mutability / cluster stability). It is deterministic and uses only embeddings.

function asNumberArray(v: unknown): number[] | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s.startsWith('[')) return null;
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed)) return (parsed as unknown[]).map((x) => Number(x));
      return null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) return (v as unknown[]).map((x) => Number(x));
  return null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function meanEmbedding(vecs: number[][]): number[] {
  const first = vecs[0];
  if (!first) return [];
  const dim = first.length;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) sum[i] = (sum[i] ?? 0) + (v[i] ?? 0);
  }
  for (let i = 0; i < dim; i++) sum[i] = (sum[i] ?? 0) / vecs.length;
  return sum;
}

async function fetchMemoriesWithEmbeddings(projectId?: string): Promise<MemoryVector[]> {
  const rows: MemorySelectRow[] = projectId
    ? await db
        .select({
          id: memories.id,
          title: memories.title,
          content: memories.content,
          importance: memories.importance,
          embedding: memories.embedding,
        })
        .from(memories)
        .where(and(isNotNull(memories.embedding), eq(memories.projectId, projectId)))
    : await db
        .select({
          id: memories.id,
          title: memories.title,
          content: memories.content,
          importance: memories.importance,
          embedding: memories.embedding,
        })
        .from(memories)
        .where(isNotNull(memories.embedding));

  const result: MemoryVector[] = [];
  for (const r of rows) {
    const emb = asNumberArray(r.embedding);
    if (emb)
      result.push({
        id: r.id,
        title: r.title,
        content: r.content,
        importance: r.importance,
        embedding: emb,
      });
  }
  return result;
}

async function labelCluster(members: MemoryVector[]): Promise<{ label: string }> {
  const samples = members
    .slice(0, 5)
    .map((m) => `- ${m.title}: ${m.content.slice(0, 200)}`)
    .join('\n');
  const userMessage = `Cluster of ${members.length} memories.\nSample memories:\n${samples}\n\nProduce a short label (at most 6 words) describing the shared theme.`;

  if (!llmConfigured()) {
    const top = members.slice().sort((a, b) => b.importance - a.importance)[0];
    return { label: top ? top.title.slice(0, 60) : 'Untitled cluster' };
  }

  try {
    const res = await callLLMStructured<{ label: string }>(
      'You are a memory taxonomy assistant. Respond with strict JSON only: {"label": string}.',
      userMessage
    );
    return {
      label: res.label && res.label.length > 0 ? res.label.slice(0, 120) : 'Untitled cluster',
    };
  } catch {
    const top = members.slice().sort((a, b) => b.importance - a.importance)[0];
    return { label: top ? top.title.slice(0, 60) : 'Untitled cluster' };
  }
}

export async function clusterMemories(options?: ClusterOptions): Promise<ClusterResult[]> {
  await assertOperational();

  const threshold = options?.similarityThreshold ?? 0.82;
  const minSize = options?.minClusterSize ?? 2;
  const maxClusters = options?.maxClusters ?? 50;

  const mems = await fetchMemoriesWithEmbeddings(options?.projectId);
  if (mems.length < 2) return [];

  const n = mems.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = cosineSimilarity(mems[i]!.embedding, mems[j]!.embedding);
      if (s >= threshold) {
        adj[i]!.push(j);
        adj[j]!.push(i);
      }
    }
  }

  const comp = new Array<number>(n).fill(-1);
  let cid = 0;
  for (let i = 0; i < n; i++) {
    if (comp[i] !== -1) continue;
    const queue: number[] = [i];
    comp[i] = cid;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of adj[cur]!) {
        if (comp[nb] === -1) {
          comp[nb] = cid;
          queue.push(nb);
        }
      }
    }
    cid += 1;
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const c = comp[i]!;
    const list = groups.get(c);
    if (list) list.push(i);
    else groups.set(c, [i]);
  }

  const results: ClusterResult[] = [];
  for (const idxs of groups.values()) {
    if (results.length >= maxClusters) break;
    if (idxs.length < minSize) continue;

    const members = idxs.map((i) => mems[i]!);
    const centroid = meanEmbedding(members.map((m) => m.embedding));
    if (centroid.length === 0) continue;
    const { label } = await labelCluster(members);
    const clusterId = `clu_${randomUUID()}`;

    await db.transaction(async (tx: Tx) => {
      await tx.insert(memoryClusters).values({
        id: clusterId,
        label,
        centroidEmbedding: centroid,
        singletonRatio: members.length <= 1 ? 1 : 0,
      });
      // perfA: batch all member rows into a single multi-row insert (was an N+1
      // per-member loop, one round-trip per member).
      if (members.length > 0) {
        await tx.insert(memoryClusterMembers).values(
          members.map((m) => ({ clusterId, memoryId: m.id }))
        );
      }
    });

    results.push({
      id: clusterId,
      label,
      centroid,
      size: members.length,
      memberIds: members.map((m) => m.id),
    });
  }

  return results;
}

export async function getClusters(projectId?: string): Promise<ClusterSummary[]> {
  const clusterRows: ClusterRow[] = await db.select().from(memoryClusters);
  if (clusterRows.length === 0) return [];

  const ids = clusterRows.map((c) => c.id);
  const memberRows: MemberRow[] = await db
    .select()
    .from(memoryClusterMembers)
    .where(inArray(memoryClusterMembers.clusterId, ids));

  let keep = clusterRows;
  let keepMembers = memberRows;
  if (projectId) {
    const projMemRows: Array<{ id: string }> = await db
      .select({ id: memories.id })
      .from(memories)
      .where(eq(memories.projectId, projectId));
    const projMem = new Set<string>(projMemRows.map((r) => r.id));
    const keepIds = new Set<string>(
      memberRows.filter((m) => projMem.has(m.memoryId)).map((m) => m.clusterId)
    );
    keep = clusterRows.filter((c) => keepIds.has(c.id));
    keepMembers = memberRows.filter((m) => keepIds.has(m.clusterId));
  }

  return keep.map((c) => ({
    id: c.id,
    label: c.label,
    size: keepMembers.filter((m) => m.clusterId === c.id).length,
    memberIds: keepMembers.filter((m) => m.clusterId === c.id).map((m) => m.memoryId),
  }));
}
