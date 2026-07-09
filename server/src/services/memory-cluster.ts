/**
 * memory-cluster.ts — Phase 12.3
 * HDBSCAN + LLM topic clustering facade.
 *
 * Delegates the heavy lifting to the real implementation in
 * `services/memory-clustering.ts` (HDBSCAN over embeddings + LLM
 * label generation) and exposes a small, stable surface used by the
 * route layer and the consolidation budget controller.
 *
 * Keep this interface stable: Pulse (Phase 18) self-calibrates recall
 * thresholds and consumes cluster centroids via `getClusterCentroid`.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { memoryClusters, memoryClusterMembers } from '../db/client.js';
import { clusterMemories as runClustering } from './memory-clustering.js';
import { eq } from 'drizzle-orm';

export interface ClusterSummary {
  id: string;
  label: string;
  size: number;
  singletonRatio: number;
  centroid?: number[] | null;
}

export interface ClusterOptions {
  projectId: string;
  /** Recompute even if a recent cluster set exists. */
  force?: boolean;
  minClusterSize?: number;
}

/**
 * Run (or fetch) the topic clustering for a project.
 * Returns the persisted cluster summaries ordered by size desc.
 */
export async function clusterMemories(opts: ClusterOptions): Promise<ClusterSummary[]> {
  await runClustering({ projectId: opts.projectId, minClusterSize: opts.minClusterSize ?? 5 });
  const rows = await db
    .select()
    .from(memoryClusters)
    .where(eq(memoryClusters.projectId, opts.projectId))
    .orderBy(memoryClusters.size);
  return rows.map(
    (r: {
      id: string;
      label: string;
      size: number;
      singletonRatio: number | null;
      centroidEmbedding: unknown;
    }) => ({
      id: r.id,
      label: r.label,
      size: r.size,
      singletonRatio: r.singletonRatio ?? 0,
      centroid: r.centroidEmbedding ? (r.centroidEmbedding as unknown as number[]) : null,
    })
  );
}

/** Fetch a single cluster centroid (used by Pulse for decay calibration). */
export async function getClusterCentroid(clusterId: string): Promise<number[] | null> {
  const [row] = await db
    .select({ centroidEmbedding: memoryClusters.centroidEmbedding })
    .from(memoryClusters)
    .where(eq(memoryClusters.id, clusterId))
    .limit(1);
  if (!row || !row.centroidEmbedding) return null;
  return row.centroidEmbedding as unknown as number[];
}

/** Membership lookup for a cluster (used by the graph browser). */
export async function getClusterMembers(clusterId: string): Promise<string[]> {
  const rows = await db
    .select({ memoryId: memoryClusterMembers.memoryId })
    .from(memoryClusterMembers)
    .where(eq(memoryClusterMembers.clusterId, clusterId));
  return rows.map((r: { memoryId: string }) => r.memoryId);
}

/** Create a synthetic cluster label when LLM labeling is unavailable. */
export function synthesizeClusterLabel(members: { id: string; text?: string }[]): string {
  const top = members
    .map((m: { id: string; text?: string }) => (m.text ?? '').trim())
    .filter(Boolean)
    .sort((a: string, b: string) => b.length - a.length)[0];
  const id = randomUUID().slice(0, 8);
  return top ? `${top.slice(0, 42)}… (${members.length})` : `cluster-${id}`;
}
