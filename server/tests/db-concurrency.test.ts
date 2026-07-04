/**
 * db-concurrency.test.ts — Phase 4: Database Mutex, WAL & Transaction Safety
 *
 * Tests concurrent write safety using the api_keys table (UUID primary key).
 * All tables use UUID text primary keys, so we generate them with crypto.randomUUID().
 * Uses drizzle `eq()` helper for type-safe where clauses.
 */

import { describe, it, expect, afterAll } from 'vitest';
import * as crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= '';
process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'silent';

const { db, withTransaction, dbHealthy, closeDb, apiKeys } = await import('../src/db/client.js');

afterAll(async () => {
  try {
    await closeDb();
  } catch {
    /* ignore */
  }
});

function uid(): string {
  return crypto.randomUUID();
}

describe('Database Mutex & WAL Concurrency', () => {
  it('should report healthy database connection', async () => {
    expect(await dbHealthy()).toBe(true);
  });

  it('should execute a simple transaction with commit', async () => {
    const tag = `simple_${Date.now()}`;
    const result = await withTransaction(async (tx: any) => {
      return await tx
        .insert(apiKeys)
        .values({
          id: uid(),
          name: tag,
          keyHash: uid(),
        })
        .returning();
    });
    expect(result).toBeDefined();
    await db.delete(apiKeys).where(eq(apiKeys.name, tag));
  });

  it('should rollback on error inside transaction', async () => {
    const tag = `rollback_${Date.now()}`;
    const before = await db.select().from(apiKeys).where(eq(apiKeys.name, tag));
    expect(before.length).toBe(0);

    try {
      await withTransaction(async (tx: any) => {
        await tx.insert(apiKeys).values({ id: uid(), name: tag, keyHash: uid() });
        throw new Error('forced rollback');
      });
    } catch {
      /* expected */
    }

    const after = await db.select().from(apiKeys).where(eq(apiKeys.name, tag));
    expect(after.length).toBe(0);
  });

  it('should handle 50 concurrent writes without corruption', async () => {
    const tag = `conc_${Date.now()}`;
    const ops: Promise<unknown>[] = [];

    for (let i = 0; i < 50; i++) {
      ops.push(
        withTransaction(async (tx: any) => {
          await tx.insert(apiKeys).values({ id: uid(), name: tag, keyHash: uid() });
        })
      );
    }

    await Promise.all(ops);
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.name, tag));
    expect(rows.length).toBe(50);
    await db.delete(apiKeys).where(eq(apiKeys.name, tag));
  });

  it('should maintain row count under concurrent load', async () => {
    const tag = `intg_${Date.now()}`;
    const target = 25;
    const ops: Promise<unknown>[] = [];

    for (let i = 0; i < target; i++) {
      ops.push(
        withTransaction(async (tx: any) => {
          await tx.insert(apiKeys).values({ id: uid(), name: tag, keyHash: uid() });
        })
      );
    }

    await Promise.all(ops);
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.name, tag));
    expect(rows.length).toBe(target);
    await db.delete(apiKeys).where(eq(apiKeys.name, tag));
  });

  it('should handle concurrent reads interleaved with writes', async () => {
    const tag = `rw_${Date.now()}`;
    const readers: Promise<unknown>[] = [];
    const writers: Promise<unknown>[] = [];

    for (let i = 0; i < 10; i++) {
      writers.push(
        withTransaction(async (tx: any) => {
          await tx.insert(apiKeys).values({ id: uid(), name: tag, keyHash: uid() });
        })
      );
      readers.push(db.select().from(apiKeys).where(eq(apiKeys.name, tag)));
    }

    await Promise.all([...writers, ...readers]);
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.name, tag));
    expect(rows.length).toBe(10);
    await db.delete(apiKeys).where(eq(apiKeys.name, tag));
  });
});
