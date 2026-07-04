/**
 * vault.ts — Obsidian vault bridge.
 * Scans markdown files, parses frontmatter/tags/wikilinks, and stores them.
 * Write-back is path-confined: traversal and escapes outside the vault root
 * are rejected. Vault files are never auto-deleted.
 */
import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve, dirname, extname } from 'node:path';
import { env } from '../lib/env.js';
import { db } from '../db/client.js';
import { notes, memories } from '../db/client.js';
import { appendAudit } from '../lib/audit.js';
import { safeVaultPath } from '../lib/guards.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';

interface Parsed {
  title: string;
  content: string;
  frontmatter: Record<string, string>;
  tags: string[];
  wikilinks: string[];
}

/** Parse frontmatter (---), # heading, #tags, and [[wikilinks]]. */
export function parseMarkdown(raw: string): Parsed {
  let body = raw;
  const frontmatter: Record<string, string> = {};
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fm) {
    body = raw.slice(fm[0].length);
    for (const line of (fm[1] ?? '').split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx > 0) frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  const heading = body.match(/^#\s+(.+)$/m);
  const tagSet = new Set<string>();
  if (frontmatter.tags)
    frontmatter.tags
      .replace(/[[\]]/g, '')
      .split(',')
      .forEach((t) => t.trim() && tagSet.add(t.trim()));
  for (const m of body.matchAll(/(?:^|\s)#([a-z][a-z0-9_/-]*)/gi)) tagSet.add(m[1]!.toLowerCase());
  const wikilinks = [
    ...new Set([...body.matchAll(/\[\[([^\]|]+).*?\]\]/g)].map((m) => m[1]!.trim())),
  ];
  const title = frontmatter.title || heading?.[1]?.trim() || 'untitled';
  return { title, content: body.trim(), frontmatter, tags: [...tagSet], wikilinks };
}

async function walk(
  dir: string,
  root: string,
  acc: { path: string; content: string; mtime: Date }[]
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      await walk(full, root, acc);
    } else if (extname(name).toLowerCase() === '.md') {
      const content = await readFile(full, 'utf8');
      acc.push({
        path: '/' + relative(root, full).split(/[\\/]/).join('/'),
        content,
        mtime: s.mtime,
      });
    }
  }
}

/** Scan the configured vault and upsert notes (keyed by path). */
export async function syncVault(actor: string): Promise<{ indexed: number }> {
  const root = env.NEXUS_OBSIDIAN_VAULT;
  if (!root) throw new ApiError('VALIDATION_ERROR', 'NEXUS_OBSIDIAN_VAULT is not configured.');
  const files: { path: string; content: string; mtime: Date }[] = [];
  await walk(resolve(root), resolve(root), files);

  let indexed = 0;
  for (const f of files) {
    const parsed = parseMarkdown(f.content);
    const existing = await db.query.notes.findFirst({ where: eq(notes.path, f.path) });
    if (existing) {
      await db
        .update(notes)
        .set({
          title: parsed.title,
          content: parsed.content,
          frontmatter: parsed.frontmatter,
          tags: parsed.tags,
          wikilinks: parsed.wikilinks,
          charCount: f.content.length,
          mtime: f.mtime,
          indexedAt: new Date(),
        })
        .where(eq(notes.id, existing.id));
    } else {
      await db.insert(notes).values({
        id: `nte_${randomUUID()}`,
        path: f.path,
        title: parsed.title,
        content: parsed.content,
        frontmatter: parsed.frontmatter,
        tags: parsed.tags,
        wikilinks: parsed.wikilinks,
        charCount: f.content.length,
        mtime: f.mtime,
        indexedAt: new Date(),
      });
    }
    indexed++;
  }
  await appendAudit('vault.synced', { files: files.length, notes: indexed }, actor);
  return { indexed };
}

/** Write a memory back to the vault as a markdown note (path-confined). */
export async function writeBack(
  memoryId: string,
  subPath: string | undefined,
  actor: string
): Promise<{ path: string }> {
  const root = env.NEXUS_OBSIDIAN_VAULT;
  if (!root) throw new ApiError('VALIDATION_ERROR', 'NEXUS_OBSIDIAN_VAULT is not configured.');
  const mem = await db.query.memories.findFirst({ where: eq(memories.id, memoryId) });
  if (!mem) throw new ApiError('NOT_FOUND', `Memory ${memoryId} not found.`);

  const target = subPath ?? `export/${slug(mem.title)}.md`;
  const safe = safeVaultPath(target, resolve(root));
  if (!safe.ok || !safe.resolved)
    throw new ApiError('VALIDATION_ERROR', safe.reason ?? 'Unsafe write-back path.');
  // Double-check the resolved absolute path is still within root.
  const rel = relative(resolve(root), safe.resolved);
  if (rel.startsWith('..') || resolve(join(resolve(root), rel)) !== safe.resolved) {
    throw new ApiError('VALIDATION_ERROR', 'Resolved path escapes vault root.');
  }

  const md = `---\ntitle: ${mem.title}\ntags: [${mem.tags.join(', ')}]\nsource: nexus-memory\n---\n\n${mem.content}\n`;
  await mkdir(dirname(safe.resolved), { recursive: true });
  await writeFile(safe.resolved, md, 'utf8');
  await appendAudit('vault.writeback', { memoryId, path: target }, actor);
  return { path: target };
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'memory'
  );
}
