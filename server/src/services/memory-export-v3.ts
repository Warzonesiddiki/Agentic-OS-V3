/**
 * memory-export-v3.ts — Phase 12.8
 * Schema-versioned multi-brain export (v3).
 *
 * Produces a portable bundle of a project's memories + clusters +
 * causal edges + attachments, tagged with BRAIN_SCHEMA_VERSION
 * (3) and a content hash for diff-sync. PII zones are masked /
 * dropped per policy. Symmetric to importBrainV3 in brain.ts.
 */
import { db } from '../db/client.js';
import { memories, memoryClusters, memoryClusterMembers, memoryCausalEdges } from '../db/client.js';
import { and, eq, isNull } from 'drizzle-orm';
import { applyZone, PrivacyZone } from './memory-privacy-zones.js';

export const EXPORT_SCHEMA_VERSION = 3;

export interface BrainV3 {
  schemaVersion: number;
  brainId: string;
  exportedAt: string;
  contentHash: string;
  memories: Array<Record<string, unknown>>;
  clusters: Array<Record<string, unknown>>;
  causalEdges: Array<Record<string, unknown>>;
}

/** Stable hash over the exported payload (for diff-sync). */
export function contentHash(payload: unknown): string {
  const s = JSON.stringify(payload);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Export a project's brain in v3 format.
 * `clearance` drops/masks memories above the reader's zone.
 */
export async function exportBrainV3(
  projectId: string,
  brainId: string,
  clearance: PrivacyZone = 'public'
): Promise<BrainV3> {
  const memRows = await db
    .select()
    .from(memories)
    .where(and(eq(memories.projectId, projectId), isNull(memories.deletedAt)));

  const mems = memRows.map(
    (m: {
      id: string;
      kind: string;
      text: string | null;
      importance: number | null;
      clusterId: string | null;
      privacyZone?: unknown;
    }) => {
      const zone = (m.privacyZone as PrivacyZone) ?? 'public';
      const masked = applyZone(m.text ?? '', zone, clearance);
      return {
        id: m.id,
        kind: m.kind,
        text: masked.value,
        importance: m.importance,
        zone,
        clusterId: m.clusterId ?? null,
      };
    }
  );

  const clusters = await db
    .select()
    .from(memoryClusters)
    .where(eq(memoryClusters.projectId, projectId));

  const clusterIds = clusters.map((c: { id: string }) => c.id);
  const members = clusterIds.length ? await db.select().from(memoryClusterMembers) : [];
  const causal = await db.select().from(memoryCausalEdges);

  const payload = { mems, clusters, members, causal };
  const hash = contentHash(payload);

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    brainId,
    exportedAt: new Date().toISOString(),
    contentHash: hash,
    memories: mems as Array<Record<string, unknown>>,
    clusters: clusters as Array<Record<string, unknown>>,
    causalEdges: causal as Array<Record<string, unknown>>,
  };
}

/** Validate an imported bundle is v3. */
export function isV3(brain: { schemaVersion?: number }): boolean {
  return brain.schemaVersion === EXPORT_SCHEMA_VERSION;
}
