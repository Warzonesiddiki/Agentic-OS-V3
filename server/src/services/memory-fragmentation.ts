import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { memories } from '../db/client.js';
import { memoryClusters, memoryClusterMembers } from '../db/schema.js';

export interface ClusterDescriptor {
  id: string;
  centroid: number[] | null;
  memberIds: string[];
}

export interface FragmentationReport {
  totalMemories: number;
  clusteredMemories: number;
  unclusteredCount: number;
  unclusteredRatio: number;
  singletonClusters: number;
  singletonClusterRatio: number;
  avgIntraClusterDistance: number;
  silhouetteScore: number;
  fragmentationScore: number;
  clusterCount: number;
}

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

function meanEmbedding(vecs: number[][]): number[] | null {
  if (vecs.length === 0) return null;
  const first = vecs[0];
  if (!first) return null;
  const dim = first.length;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) {
      sum[i] = (sum[i] ?? 0) + (v[i] ?? 0);
    }
  }
  for (let i = 0; i < dim; i++) {
    sum[i] = (sum[i] ?? 0) / vecs.length;
  }
  return sum;
}

function centroidFor(
  cluster: ClusterDescriptor,
  embeddings: Map<string, number[]>
): number[] | null {
  if (cluster.centroid && cluster.centroid.length > 0) return cluster.centroid;
  const vecs = cluster.memberIds
    .map((id) => embeddings.get(id))
    .filter((e): e is number[] => e != null);
  return meanEmbedding(vecs);
}

export function computeFragmentationMetrics(input: {
  embeddings: Map<string, number[]>;
  clusters: ClusterDescriptor[];
}): FragmentationReport {
  const { embeddings, clusters } = input;
  const totalMemories = embeddings.size;

  const seen = new Set<string>();
  let clusteredCount = 0;
  for (const c of clusters) {
    for (const id of c.memberIds) {
      if (!seen.has(id)) {
        seen.add(id);
        clusteredCount += 1;
      }
    }
  }
  const unclusteredCount = Math.max(0, totalMemories - clusteredCount);
  const unclusteredRatio = totalMemories > 0 ? unclusteredCount / totalMemories : 0;

  const singletonClusters = clusters.filter((c) => c.memberIds.length <= 1).length;
  const singletonClusterRatio = clusters.length > 0 ? singletonClusters / clusters.length : 0;

  const intraDistances: number[] = [];
  const silhouettePoints: Array<{ a: number; b: number }> = [];

  for (const c of clusters) {
    const centroid = centroidFor(c, embeddings);
    for (const id of c.memberIds) {
      const emb = embeddings.get(id);
      if (!emb) continue;
      const intra = centroid ? 1 - cosineSimilarity(emb, centroid) : 0;
      intraDistances.push(intra);

      let best = Infinity;
      for (const other of clusters) {
        if (other.id === c.id) continue;
        const oCentroid = centroidFor(other, embeddings);
        if (!oCentroid) continue;
        const d = 1 - cosineSimilarity(emb, oCentroid);
        if (d < best) best = d;
      }
      const b = best === Infinity ? 1 : best;
      silhouettePoints.push({ a: intra, b });
    }
  }

  const avgIntraClusterDistance =
    intraDistances.length > 0
      ? intraDistances.reduce((s, x) => s + x, 0) / intraDistances.length
      : 0;

  let silhouetteSum = 0;
  for (const p of silhouettePoints) {
    const denom = Math.max(p.a, p.b);
    silhouetteSum += denom === 0 ? 0 : (p.b - p.a) / denom;
  }
  const silhouetteScore = silhouettePoints.length > 0 ? silhouetteSum / silhouettePoints.length : 0;
  const fragmentationScore =
    silhouettePoints.length === 0 ? 0 : Math.min(1, Math.max(0, 1 - silhouetteScore));

  return {
    totalMemories,
    clusteredMemories: clusteredCount,
    unclusteredCount,
    unclusteredRatio,
    singletonClusters,
    singletonClusterRatio,
    avgIntraClusterDistance,
    silhouetteScore,
    fragmentationScore,
    clusterCount: clusters.length,
  };
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

interface ClusterRow {
  id: string;
  label: string;
  centroidEmbedding: unknown;
}

interface MemberRow {
  clusterId: string;
  memoryId: string;
}

interface EmbRow {
  id: string;
  embedding: unknown;
}

export async function getFragmentationScore(options?: {
  projectId?: string;
}): Promise<FragmentationReport> {
  const clusterRows: ClusterRow[] = await db.select().from(memoryClusters);
  if (clusterRows.length === 0) {
    return {
      totalMemories: 0,
      clusteredMemories: 0,
      unclusteredCount: 0,
      unclusteredRatio: 0,
      singletonClusters: 0,
      singletonClusterRatio: 0,
      avgIntraClusterDistance: 0,
      silhouetteScore: 0,
      fragmentationScore: 0,
      clusterCount: 0,
    };
  }

  const ids = clusterRows.map((c) => c.id);
  const memberRows: MemberRow[] = await db
    .select()
    .from(memoryClusterMembers)
    .where(inArray(memoryClusterMembers.clusterId, ids));

  let keepClusterIds: Set<string> | null = null;
  if (options?.projectId) {
    const projMemRows: Array<{ id: string }> = await db
      .select({ id: memories.id })
      .from(memories)
      .where(eq(memories.projectId, options.projectId));
    const projMem = new Set<string>(projMemRows.map((r) => r.id));
    keepClusterIds = new Set<string>(
      memberRows.filter((m) => projMem.has(m.memoryId)).map((m) => m.clusterId)
    );
  }

  const filteredClusterRows = keepClusterIds
    ? clusterRows.filter((c) => keepClusterIds!.has(c.id))
    : clusterRows;
  const filteredMemberRows = keepClusterIds
    ? memberRows.filter((m) => keepClusterIds!.has(m.clusterId))
    : memberRows;

  const memberIds = uniqueStrings(filteredMemberRows.map((m) => m.memoryId));
  const embRows: EmbRow[] =
    memberIds.length > 0
      ? await db
          .select({ id: memories.id, embedding: memories.embedding })
          .from(memories)
          .where(and(isNotNull(memories.embedding), inArray(memories.id, memberIds)))
      : [];

  const embeddings = new Map<string, number[]>();
  for (const r of embRows) {
    const emb = asNumberArray(r.embedding);
    if (emb) embeddings.set(r.id, emb);
  }

  const clusters: ClusterDescriptor[] = filteredClusterRows.map((c) => ({
    id: c.id,
    centroid: asNumberArray(c.centroidEmbedding),
    memberIds: filteredMemberRows.filter((m) => m.clusterId === c.id).map((m) => m.memoryId),
  }));

  return computeFragmentationMetrics({ embeddings, clusters });
}
