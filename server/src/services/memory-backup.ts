/**
 * memory-backup.ts — gzip backup + restore of memories/attachments (Phase 12).
 *
 * Serialises `memories` + `memory_attachments` (+ best-effort clusters) to a
 * versioned snapshot, gzips it, and writes it under data/backups/<retention>.
 * `pruneBackups` keeps a bounded number of recent backups per retention class.
 */
import { db, withTransaction } from '../db/client.js';
import { memories, memoryAttachments } from '../db/client.js';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type Retention = 'daily' | 'weekly' | 'monthly';

export interface SerializedMemory {
  id: string;
  kind: string;
  title: string;
  content: string;
  tags: unknown;
  importance: number;
  source: string;
  projectId: string | null;
  tokenCost: number;
  recallCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  lastRecalledAt: string | null;
  deletedAt: string | null;
  privacyZone: string | null;
  language: string | null;
}

export interface SerializedAttachment {
  id: string;
  memoryId: string;
  kind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  content: string;
  thumbnail: string | null;
  highlighted: string | null;
  language: string | null;
  createdAt: string | null;
}

export interface MemoryBackupSnapshot {
  version: number;
  exportedAt: number;
  memories: SerializedMemory[];
  attachments: SerializedAttachment[];
  clusters: unknown[];
}

export interface MemoryBackupResult {
  snapshot: MemoryBackupSnapshot;
  compressed: Buffer;
  path: string | null;
}

export interface RestoreResult {
  memories: number;
  attachments: number;
}

const RETENTION_LIMITS: Record<Retention, number> = { daily: 7, weekly: 4, monthly: 12 };

export async function backupMemories(opts?: {
  retention?: Retention;
}): Promise<MemoryBackupResult> {
  const memRows = (await db.select().from(memories)) as SerializedMemory[];
  const attRows = (await db.select().from(memoryAttachments)) as SerializedAttachment[];

  const clientMod = (await import('../db/client.js')) as Record<string, unknown>;
  const maybeClusters = clientMod['memoryClusters'];
  let clusters: unknown[] = [];
  if (maybeClusters) {
    try {
      clusters = (await db.select().from(maybeClusters as never)) as unknown[];
    } catch {
      clusters = [];
    }
  }

  const snapshot: MemoryBackupSnapshot = {
    version: 2,
    exportedAt: Date.now(),
    memories: memRows,
    attachments: attRows,
    clusters,
  };

  const compressed = gzipSync(Buffer.from(JSON.stringify(snapshot)));

  let path: string | null = null;
  try {
    const dir = join(process.cwd(), 'data', 'backups', opts?.retention ?? 'daily');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${snapshot.exportedAt}.json.gz`);
    writeFileSync(filePath, compressed);
    path = filePath;
  } catch {
    path = null;
  }

  return { snapshot, compressed, path };
}

export async function restoreMemories(
  input: Buffer | MemoryBackupSnapshot
): Promise<RestoreResult> {
  const snapshot = Buffer.isBuffer(input)
    ? (JSON.parse(gunzipSync(input).toString('utf-8')) as MemoryBackupSnapshot)
    : input;

  await withTransaction(async (tx) => {
    for (const m of snapshot.memories) {
      await tx
        .insert(memories)
        .values(m)
        .onConflictDoUpdate({
          target: memories.id,
          set: {
            kind: m.kind,
            title: m.title,
            content: m.content,
            tags: m.tags,
            importance: m.importance,
            source: m.source,
            projectId: m.projectId,
            tokenCost: m.tokenCost,
            recallCount: m.recallCount,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
            lastRecalledAt: m.lastRecalledAt,
            deletedAt: m.deletedAt,
            privacyZone: m.privacyZone,
            language: m.language,
          },
        });
    }
    for (const a of snapshot.attachments) {
      await tx
        .insert(memoryAttachments)
        .values(a)
        .onConflictDoUpdate({
          target: memoryAttachments.id,
          set: {
            memoryId: a.memoryId,
            kind: a.kind,
            fileName: a.fileName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            content: a.content,
            thumbnail: a.thumbnail,
            highlighted: a.highlighted,
            language: a.language,
            createdAt: a.createdAt,
          },
        });
    }
  });

  return { memories: snapshot.memories.length, attachments: snapshot.attachments.length };
}

export async function pruneBackups(retention: Retention): Promise<number> {
  const limit = RETENTION_LIMITS[retention];
  const dir = join(process.cwd(), 'data', 'backups', retention);
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json.gz'))
    .sort();
  const toDelete = files.slice(0, Math.max(0, files.length - limit));
  for (const f of toDelete) {
    try {
      unlinkSync(join(dir, f));
    } catch {
      /* ignore */
    }
  }
  return toDelete.length;
}
