/**
 * System service — extracted from routes.ts to keep route handlers thin
 * and to satisfy the "no db.query in routes" invariant.
 */
import { db } from '../db/client.js';
import {
  memories,
  skills,
  projects,
  notes,
  tokenLedger,
  systemMeta,
  auditLog,
} from '../db/client.js';
import { eq, gt, sql, desc } from 'drizzle-orm';

export async function getSystemCounts() {
  const count = sql<number>`count(*)::int`;
  const [mem, skl, prj, aud] = await Promise.all([
    db.select({ n: count }).from(memories),
    db.select({ n: count }).from(skills),
    db.select({ n: count }).from(projects),
    db.select({ n: count }).from(auditLog),
  ]);
  return {
    memories: mem[0]?.n ?? 0,
    skills: skl[0]?.n ?? 0,
    projects: prj[0]?.n ?? 0,
    audit: aud[0]?.n ?? 0,
  };
}

export async function listMemoriesPaginated(limit: number, cursor?: string) {
  const items = cursor
    ? await db.query.memories.findMany({
        limit: limit + 1,
        where: gt(memories.id, cursor),
        orderBy: memories.id,
      })
    : await db.query.memories.findMany({ limit: limit + 1, orderBy: memories.id });
  return items;
}

export async function getMemoryById(id: string) {
  return db.query.memories.findFirst({ where: eq(memories.id, id) });
}

export async function listSkillsPaginated(limit: number, offset: number) {
  return db.query.skills.findMany({ limit, offset, orderBy: skills.createdAt });
}

export async function getSkillById(id: string) {
  return db.query.skills.findFirst({ where: eq(skills.id, id) });
}

export async function listProjectsPaginated(limit: number, offset: number) {
  return db.query.projects.findMany({ limit, offset, orderBy: projects.createdAt });
}

export async function listVaultNotesPaginated(limit: number) {
  return db.query.notes.findMany({ limit, orderBy: notes.indexedAt });
}

export async function listLedgerEntries(limit: number, offset: number) {
  const [items, sumRow] = await Promise.all([
    db.select().from(tokenLedger).limit(limit).offset(offset),
    db
      .select({
        total: sql<number>`coalesce(sum(tokens_saved), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(tokenLedger),
  ]);
  return {
    items,
    totalSaved: sumRow[0]?.total ?? 0,
    totalCount: sumRow[0]?.count ?? 0,
  };
}

export async function getSystemMetaMap(): Promise<Map<string, string | null>> {
  const meta = await db.query.systemMeta.findMany();
  return new Map(meta.map((r: { key: string; value: string | null }) => [r.key, r.value]));
}

export async function recordHeartbeat(actor: string) {
  const now = Date.now();
  await db
    .insert(systemMeta)
    .values({ key: 'lastHeartbeat', value: String(now), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemMeta.key,
      set: { value: String(now), updatedAt: new Date() },
    });
  return { lastHeartbeat: now, actor };
}

export async function getAuditCount(): Promise<number> {
  const count = sql<number>`count(*)::int`;
  const aud = await db.select({ n: count }).from(auditLog);
  return aud[0]?.n ?? 0;
}

export async function getDetailedHealth() {
  const count = sql<number>`count(*)::int`;
  const aud = await db.select({ n: count }).from(auditLog);
  return { auditCount: aud[0]?.n ?? 0 };
}
