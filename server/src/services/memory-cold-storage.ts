/**
 * memory-cold-storage.ts — cold storage migration + tiered recall (Phase 12).
 *
 * Old, low-importance memories are moved from `memories` into `memory_archive`
 * (the "cold" tier). Recall can optionally include the cold tier. A cron job
 * and an SSE hook drive periodic migration best-effort.
 */
import { db, isSqlite, withTransaction } from '../db/client.js';
import { memories, memoryArchive } from '../db/client.js';
import { and, eq, isNull, lt, like, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export interface ColdStorageReport {
  scanned: number;
  moved: number;
  errors: number;
  threshold: number;
  ageDays: number;
  startedAt: string;
  finishedAt: string;
}

export interface MemorySummary {
  id: string;
  kind: string;
  title: string;
  content: string;
  tier: 'hot' | 'cold';
}

export interface RecallResult {
  hot: MemorySummary[];
  cold: MemorySummary[];
}

const MS_PER_DAY = 86_400_000;

function cutoffValue(ageDays: number): string | Date {
  const d = new Date(Date.now() - ageDays * MS_PER_DAY);
  return isSqlite ? d.toISOString() : d;
}

function nowValue(): string | Date {
  return isSqlite ? new Date().toISOString() : new Date();
}

type ColdCandidate = {
  id: string;
  kind: string;
  title: string;
  content: string;
  tags: unknown;
  importance: number;
  source: string;
  projectId: string | null;
  tokenCost: number;
};

export async function runColdStorageMigration(opts?: {
  importanceThreshold?: number;
  ageDays?: number;
  batchSize?: number;
}): Promise<ColdStorageReport> {
  const threshold = opts?.importanceThreshold ?? 0.1;
  const ageDays = opts?.ageDays ?? 90;
  const batchSize = opts?.batchSize ?? 500;
  const startedAt = new Date().toISOString();

  const candidates = (await db
    .select()
    .from(memories)
    .where(
      and(
        isNull(memories.deletedAt),
        lt(memories.importance, threshold),
        lt(memories.updatedAt, cutoffValue(ageDays))
      )
    )
    .limit(batchSize)) as ColdCandidate[];

  let moved = 0;
  let errors = 0;

  await withTransaction(async (tx) => {
    for (const c of candidates) {
      try {
        await tx.insert(memoryArchive).values({
          id: `arc_${randomUUID()}`,
          originalId: c.id,
          kind: c.kind,
          title: c.title,
          content: c.content,
          tags: c.tags,
          importance: c.importance,
          source: c.source,
          projectId: c.projectId,
          tokenCost: c.tokenCost,
          archivedAt: nowValue(),
          reason: 'cold-storage',
        });
        await tx.delete(memories).where(eq(memories.id, c.id));
        moved++;
      } catch {
        errors++;
      }
    }
  });

  return {
    scanned: candidates.length,
    moved,
    errors,
    threshold,
    ageDays,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

type HotRow = { id: string; kind: string; title: string; content: string };
type ColdRow = { id: string; kind: string; title: string; content: string };

export async function recallWithColdStorage(
  query: string,
  includeCold = false
): Promise<RecallResult> {
  const pattern = `%${query}%`;

  const hotRows = (await db
    .select({
      id: memories.id,
      kind: memories.kind,
      title: memories.title,
      content: memories.content,
    })
    .from(memories)
    .where(
      and(
        isNull(memories.deletedAt),
        or(like(memories.title, pattern), like(memories.content, pattern))
      )
    )
    .limit(20)) as HotRow[];

  const coldRows: ColdRow[] = includeCold
    ? ((await db
        .select({
          id: memoryArchive.id,
          kind: memoryArchive.kind,
          title: memoryArchive.title,
          content: memoryArchive.content,
        })
        .from(memoryArchive)
        .where(or(like(memoryArchive.title, pattern), like(memoryArchive.content, pattern)))
        .limit(20)) as ColdRow[])
    : [];

  return {
    hot: hotRows.map((r) => ({ ...r, tier: 'hot' as const })),
    cold: coldRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      content: r.content,
      tier: 'cold' as const,
    })),
  };
}

export async function scheduleColdStorageMigration(actor: string): Promise<void> {
  try {
    const { getScheduler } = await import('./scheduler.js');
    const s = getScheduler();
    await s.scheduleJob(
      {
        name: 'memory-cold-storage',
        expression: '13 3 * * *',
        action: 'memory.coldStorage',
        payload: {},
        timezone: 'UTC',
      } as never,
      actor
    );
  } catch {
    /* best-effort; scheduler dispatch is owned elsewhere */
  }
}

function parseSseChunk(chunk: string): { type?: string; data?: unknown } | null {
  const lines = chunk.split('\n');
  let type: string | undefined;
  let dataStr: string | undefined;
  for (const line of lines) {
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) dataStr = line.slice(5).trim();
  }
  if (!dataStr) return null;
  try {
    return { type, data: JSON.parse(dataStr) };
  } catch {
    return null;
  }
}

/** Best-effort: run cold-storage migration when the scheduler fires it via SSE. */
export function initColdStorageScheduler(): void {
  try {
    void import('./sse-bus.js')
      .then((mod) => {
        const writer = {
          write(chunk: string): void {
            try {
              const event = parseSseChunk(chunk);
              const data = event?.data as { action?: string } | undefined;
              if (event && event.type === 'cron.fired' && data?.action === 'memory.coldStorage') {
                void runColdStorageMigration();
              }
            } catch {
              /* ignore malformed chunk */
            }
          },
          close(): void {
            /* no-op */
          },
        };
        mod.addSSEClient(writer as never);
      })
      .catch(() => {
        /* sse-bus unavailable */
      });
  } catch {
    /* best-effort */
  }
}
