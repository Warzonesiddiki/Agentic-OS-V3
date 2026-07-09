/**
 * memory-privacy-zones.ts — Phase 12.34
 * Privacy zones for memory scoping.
 *
 * A privacy zone is a label attached to memories (e.g. "private",
 * "pii", "shared", "public"). Recall and export honor zone policy so
 * that e.g. PII memories never leave a zone or are masked in shared
 * exports. Pure policy helpers are unit-tested without a DB.
 */
import { db } from '../db/client.js';
import { memories } from '../db/client.js';
import { and, eq, inArray, isNull } from 'drizzle-orm';

export type PrivacyZone = 'public' | 'shared' | 'private' | 'pii';

const ZONE_RANK: Record<PrivacyZone, number> = {
  public: 0,
  shared: 1,
  private: 2,
  pii: 3,
};

/**
 * Determine if a reader with `clearance` may read `targetZone`.
 * Higher-rank zones require higher clearance.
 */
export function canRead(targetZone: PrivacyZone, clearance: PrivacyZone): boolean {
  return ZONE_RANK[clearance] >= ZONE_RANK[targetZone];
}

/** Mask a payload if its zone is above the reader clearance. */
export function applyZone(
  payload: string,
  targetZone: PrivacyZone,
  clearance: PrivacyZone
): { readable: boolean; value: string } {
  if (canRead(targetZone, clearance)) return { readable: true, value: payload };
  return { readable: false, value: `[redacted:${targetZone}]` };
}

/** Assign a privacy zone to a memory (idempotent). */
export async function setZone(memoryId: string, zone: PrivacyZone): Promise<void> {
  await db.update(memories).set({ privacyZone: zone }).where(eq(memories.id, memoryId));
}

/** Read a memory only if the clearance permits it. */
export async function readScoped(
  memoryId: string,
  clearance: PrivacyZone
): Promise<{ id: string; text: string; zone: PrivacyZone } | null> {
  const [row] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.id, memoryId), isNull(memories.deletedAt)))
    .limit(1);
  if (!row) return null;
  const z = (row.privacyZone as PrivacyZone) ?? 'public';
  const masked = applyZone(row.text ?? '', z, clearance);
  return { id: row.id, text: masked.value, zone: z };
}

/** List ids in a set of zones (used by export v3 to drop PII). */
export async function idsInZones(zones: PrivacyZone[]): Promise<string[]> {
  const rows = await db
    .select({ id: memories.id })
    .from(memories)
    .where(inArray(memories.privacyZone, zones));
  return rows.map((r: { id: string }) => r.id);
}
