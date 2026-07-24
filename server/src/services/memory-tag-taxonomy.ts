import { randomUUID } from 'node:crypto';
import { and, eq, or, sql } from 'drizzle-orm';
import { db, tagTaxonomy, memoryTags, memories, getBackend } from '../db/client.js';
import { ApiError } from '../lib/errors.js';
import type { Tx } from '../lib/audit.js';

export interface TagNode {
  id: string;
  name: string;
  parentId: string | null;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TagTreeNode extends TagNode {
  children: TagTreeNode[];
}

interface TagRow {
  id: string;
  name: string;
  parentId: string | null;
  aliases: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return String(value);
}

function rowToTag(row: TagRow): TagNode {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const candidate = err as { code?: unknown; message?: unknown };
  if (candidate.code === '23505') return true;
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return message.includes('unique') || message.includes('duplicate');
}

// ---------- Pure helpers (unit-testable) ----------

export function renameTagInList(tags: string[], oldName: string, newName: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const mapped = t === oldName ? newName : t;
    if (!seen.has(mapped)) {
      seen.add(mapped);
      out.push(mapped);
    }
  }
  return out;
}

export function buildTagTree(nodes: TagNode[]): TagTreeNode[] {
  const byId = new Map<string, TagTreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });
  const roots: TagTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function detectOrphanTagNodes(
  nodes: TagNode[],
  usedNames: ReadonlySet<string>,
  linkedIds: ReadonlySet<string>
): TagNode[] {
  return nodes.filter((n) => !linkedIds.has(n.id) && !usedNames.has(n.name));
}

// ---------- CRUD ----------

export async function createTag(
  name: string,
  parentId?: string | null,
  aliases: string[] = []
): Promise<TagNode> {
  const normalizedName = name.trim();
  if (!normalizedName) throw new ApiError('VALIDATION_ERROR', 'tag name is required');
  const id = `tag_${randomUUID()}`;
  const now = new Date();
  const row: TagRow = {
    id,
    name: normalizedName,
    parentId: parentId ?? null,
    aliases,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.insert(tagTaxonomy).values({
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      aliases: row.aliases,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError('VALIDATION_ERROR', 'tag name already exists');
    throw err;
  }
  return rowToTag(row);
}

export async function getTag(id: string): Promise<TagNode | null> {
  const rows = await db.select().from(tagTaxonomy).where(eq(tagTaxonomy.id, id)).limit(1);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0] as TagRow;
  // Defend against a misconfigured/mock executor returning an unfiltered row:
  // a caller must never receive a tag different from the requested identity.
  if (row.id !== id) return null;
  return rowToTag(row);
}

export async function listTags(): Promise<TagNode[]> {
  const rows = await db.select().from(tagTaxonomy).orderBy(tagTaxonomy.name);
  return (Array.isArray(rows) ? rows : []).map((r) => rowToTag(r as TagRow));
}

export async function getTagTree(): Promise<TagTreeNode[]> {
  const nodes = await listTags();
  return buildTagTree(nodes);
}

// ---------- Cascade operations ----------

export async function renameTag(id: string, newName: string): Promise<void> {
  const tag = await getTag(id);
  if (!tag) throw new ApiError('NOT_FOUND', 'tag not found');
  const oldName = tag.name;
  if (oldName === newName) return;
  const aliases = tag.aliases.includes(oldName) ? tag.aliases : [...tag.aliases, oldName];
  await db.transaction(async (tx: Tx) => {
    await tx
      .update(tagTaxonomy)
      .set({ name: newName, aliases, updatedAt: new Date() })
      .where(eq(tagTaxonomy.id, id));
    if (getBackend() === 'postgresql') {
      await tx.execute(
        sql`UPDATE memories SET tags = array_replace(tags, ${oldName}, ${newName}), updated_at = now() WHERE ${oldName} = ANY(tags)`
      );
    } else {
      const rows = await tx.select({ id: memories.id, tags: memories.tags }).from(memories);
      const affected = (Array.isArray(rows) ? rows : []).filter(
        (r) => Array.isArray(r.tags) && (r.tags as string[]).includes(oldName)
      );
      for (const r of affected) {
        const next = (r.tags as string[]).map((t) => (t === oldName ? newName : t));
        await tx
          .update(memories)
          .set({ tags: next, updatedAt: new Date() })
          .where(eq(memories.id, r.id));
      }
    }
  });
}

export async function mergeTags(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) return;
  const rows = await db
    .select()
    .from(tagTaxonomy)
    .where(or(eq(tagTaxonomy.id, sourceId), eq(tagTaxonomy.id, targetId)));
  const tags = Array.isArray(rows) ? rows.map((row) => rowToTag(row as TagRow)) : [];
  const source = tags.find((tag) => tag.id === sourceId);
  const target = tags.find((tag) => tag.id === targetId);
  if (!source) throw new ApiError('NOT_FOUND', 'source tag not found');
  if (!target) throw new ApiError('NOT_FOUND', 'target tag not found');
  await db.transaction(async (tx: Tx) => {
    await tx.update(memoryTags).set({ tagId: targetId }).where(eq(memoryTags.tagId, sourceId));
    await tx
      .update(tagTaxonomy)
      .set({ parentId: targetId })
      .where(eq(tagTaxonomy.parentId, sourceId));
    if (getBackend() === 'postgresql') {
      await tx.execute(
        sql`UPDATE memories SET tags = array_replace(tags, ${source.name}, ${target.name}), updated_at = now() WHERE ${source.name} = ANY(tags)`
      );
    } else {
      const rows = await tx.select({ id: memories.id, tags: memories.tags }).from(memories);
      const affected = (Array.isArray(rows) ? rows : []).filter(
        (r) => Array.isArray(r.tags) && (r.tags as string[]).includes(source.name)
      );
      for (const r of affected) {
        const next = (r.tags as string[]).map((t) => (t === source.name ? target.name : t));
        await tx
          .update(memories)
          .set({ tags: next, updatedAt: new Date() })
          .where(eq(memories.id, r.id));
      }
    }
    await tx.delete(tagTaxonomy).where(eq(tagTaxonomy.id, sourceId));
  });
}

export async function deleteTag(id: string): Promise<void> {
  const tag = await getTag(id);
  if (!tag) throw new ApiError('NOT_FOUND', 'tag not found');
  await db.transaction(async (tx: Tx) => {
    await tx.delete(memoryTags).where(eq(memoryTags.tagId, id));
    await tx
      .update(tagTaxonomy)
      .set({ parentId: tag.parentId })
      .where(eq(tagTaxonomy.parentId, id));
    await tx.delete(tagTaxonomy).where(eq(tagTaxonomy.id, id));
  });
}

// ---------- Memory linkage ----------

export async function assignTagToMemory(memoryId: string, tagId: string): Promise<void> {
  const tag = await getTag(tagId);
  if (!tag) throw new ApiError('NOT_FOUND', 'tag not found');
  await db
    .insert(memoryTags)
    .values({ memoryId, tagId, createdAt: new Date() })
    .onConflictDoNothing();
  const mem = await db
    .select({ tags: memories.tags })
    .from(memories)
    .where(eq(memories.id, memoryId))
    .limit(1);
  const current =
    Array.isArray(mem) && mem.length > 0 && Array.isArray(mem[0].tags)
      ? (mem[0].tags as string[])
      : [];
  if (!current.includes(tag.name)) {
    await db
      .update(memories)
      .set({ tags: [...current, tag.name], updatedAt: new Date() })
      .where(eq(memories.id, memoryId));
  }
}

export async function removeTagFromMemory(memoryId: string, tagId: string): Promise<void> {
  const tag = await getTag(tagId);
  if (!tag) throw new ApiError('NOT_FOUND', 'tag not found');
  await db
    .delete(memoryTags)
    .where(and(eq(memoryTags.memoryId, memoryId), eq(memoryTags.tagId, tagId)));
  const mem = await db
    .select({ tags: memories.tags })
    .from(memories)
    .where(eq(memories.id, memoryId))
    .limit(1);
  const current =
    Array.isArray(mem) && mem.length > 0 && Array.isArray(mem[0].tags)
      ? (mem[0].tags as string[])
      : [];
  const next = current.filter((t) => t !== tag.name);
  await db
    .update(memories)
    .set({ tags: next, updatedAt: new Date() })
    .where(eq(memories.id, memoryId));
}

// ---------- Orphan detection ----------

export async function detectOrphanTags(): Promise<TagNode[]> {
  const tags = await listTags();
  if (tags.length === 0) return [];
  const linkedIds = new Set<string>();
  const linkRows = await db.select({ tagId: memoryTags.tagId }).from(memoryTags);
  for (const r of Array.isArray(linkRows) ? linkRows : []) linkedIds.add(r.tagId as string);
  const usedNames = new Set<string>();
  const memRows = await db.select({ tags: memories.tags }).from(memories);
  for (const r of Array.isArray(memRows) ? memRows : []) {
    if (Array.isArray(r.tags)) for (const t of r.tags as string[]) usedNames.add(t);
  }
  return detectOrphanTagNodes(tags, usedNames, linkedIds);
}

export async function detectUnmanagedTags(): Promise<string[]> {
  const tags = await listTags();
  const managed = new Set(tags.map((t) => t.name));
  const usedNames = new Set<string>();
  const memRows = await db.select({ tags: memories.tags }).from(memories);
  for (const r of Array.isArray(memRows) ? memRows : []) {
    if (Array.isArray(r.tags)) for (const t of r.tags as string[]) usedNames.add(t);
  }
  return [...usedNames].filter((name) => !managed.has(name));
}
