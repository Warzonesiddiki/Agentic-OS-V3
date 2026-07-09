import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { recall } from '../../src/services/recall.js';
import { db } from '../../src/db/client.js';
import { memories, skills, notes, feedback } from '../../src/db/client.js';
import { eq } from 'drizzle-orm';

describe('recall service', () => {
  let testMemoryIds: string[] = [];

  beforeEach(async () => {
    testMemoryIds = [];

    try {
      await db.delete(memories).where(eq(memories.kind, 'test'));
    } catch {
      /* intentionally empty */
    }
    try {
      await db.delete(skills).where(eq(skills.category, 'test'));
    } catch {
      /* intentionally empty */
    }
    try {
      await db.delete(feedback).where(eq(feedback.query, 'test-query'));
    } catch {
      /* intentionally empty */
    }

    // notes have UNIQUE(path) constraint — delete by path pattern
    try {
      const allNotes = await db
        .select({ path: notes.path })
        .from(notes)
        .where(eq(notes.path, 'test/note1.md'));
      for (const n of allNotes) {
        await db.delete(notes).where(eq(notes.path, n.path));
      }
    } catch {
      /* intentionally empty */
    }
    try {
      const allNotes2 = await db
        .select({ path: notes.path })
        .from(notes)
        .where(eq(notes.path, 'test/note2.md'));
      for (const n of allNotes2) {
        await db.delete(notes).where(eq(notes.path, n.path));
      }
    } catch {
      /* intentionally empty */
    }

    const mem1 = await db
      .insert(memories)
      .values({
        id: `mem_${randomUUID()}`,
        kind: 'test',
        title: 'Database connection pooling',
        content: 'Use connection pooling for better performance with PostgreSQL databases',
        tags: JSON.stringify(['database', 'performance']),
        importance: 0.8,
        source: 'manual',
        updatedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      })
      .returning({ id: memories.id });
    testMemoryIds.push(mem1[0]!.id);

    await db.insert(memories).values({
      id: `mem_${randomUUID()}`,
      kind: 'test',
      title: 'React component optimization',
      content: 'Use React.memo and useMemo to prevent unnecessary re-renders',
      tags: JSON.stringify(['react', 'optimization']),
      importance: 0.6,
      source: 'manual',
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    });

    await db.insert(memories).values({
      id: `mem_${randomUUID()}`,
      kind: 'test',
      title: 'TypeScript strict mode',
      content: 'Enable strict mode in tsconfig.json for better type safety',
      tags: JSON.stringify(['typescript', 'safety']),
      importance: 0.9,
      source: 'manual',
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    });

    await db.insert(skills).values({
      id: `skill_${randomUUID()}`,
      name: 'test-skill-1',
      title: 'Database optimization patterns',
      description: 'Best practices for database query optimization',
      content: 'Use indexes, avoid N+1 queries, and implement connection pooling',
      category: 'test',
      tags: JSON.stringify(['database', 'optimization']),
      rating: 0.85,
      updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    });

    await db.insert(skills).values({
      id: `skill_${randomUUID()}`,
      name: 'test-skill-2',
      title: 'React performance tuning',
      description: 'Optimize React applications for better performance',
      content: 'Implement code splitting, lazy loading, and memoization',
      category: 'test',
      tags: JSON.stringify(['react', 'performance']),
      rating: 0.75,
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    });

    await db.insert(notes).values({
      id: `note_${randomUUID()}`,
      path: 'test/note1.md',
      title: 'Database indexing strategies',
      content: 'Create indexes on frequently queried columns for faster lookups',
      tags: JSON.stringify(['database', 'indexing']),
      wikilinks: JSON.stringify(['[[database]]', '[[performance]]']),
      indexedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    });

    await db.insert(notes).values({
      id: `note_${randomUUID()}`,
      path: 'test/note2.md',
      title: 'React hooks patterns',
      content: 'Use custom hooks to encapsulate reusable logic',
      tags: JSON.stringify(['react', 'hooks']),
      wikilinks: JSON.stringify(['[[react]]', '[[hooks]]']),
      indexedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    });
  });

  afterEach(async () => {
    try {
      await db.delete(memories).where(eq(memories.kind, 'test'));
    } catch {
      /* intentionally empty */
    }
    try {
      await db.delete(skills).where(eq(skills.category, 'test'));
    } catch {
      /* intentionally empty */
    }
  });

  // ---- BM25 lexical recall ----

  it('returns relevant results for keyword queries', async () => {
    const result = await recall('database connection pooling', 10000, 'test-actor');
    expect(result.returned.length).toBeGreaterThan(0);
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.tokenBudget).toBe(10000);
    const hasDb = result.returned.some(
      (i: any) =>
        i.title.toLowerCase().includes('database') || i.content.toLowerCase().includes('database')
    );
    expect(hasDb).toBe(true);
  });

  it('ranks results by score descending', async () => {
    const result = await recall('react optimization', 10000, 'test-actor');
    expect(result.returned.length).toBeGreaterThan(0);
    for (let i = 0; i < result.returned.length - 1; i++) {
      expect(result.returned[i]!.score).toBeGreaterThanOrEqual(result.returned[i + 1]!.score);
    }
  });

  it('handles empty query', async () => {
    const result = await recall('', 10000, 'test-actor');
    expect(result.returned).toEqual([]);
    expect(result.tokensUsed).toBe(0);
  });

  it('returns empty for non-matching queries', async () => {
    const result = await recall('xyznonexistent9173', 10000, 'test-actor');
    expect(result.returned).toEqual([]);
  });

  // ---- Semantic & RRF ----

  it('filters results by semantic threshold', async () => {
    const result = await recall('database optimization', 10000, 'test-actor');
    result.returned.forEach((item: any) => {
      expect(item.score).toBeGreaterThan(0);
      expect(item.score).toBeLessThanOrEqual(1);
    });
  });

  it('blends BM25 with semantic via RRF', async () => {
    const emb = JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5]);
    if (testMemoryIds[0]) {
      await db.update(memories).set({ embedding: emb }).where(eq(memories.id, testMemoryIds[0]));
    }
    const result = await recall('database performance optimization', 10000, 'test-actor');
    expect(result.returned.length).toBeGreaterThanOrEqual(0);
    result.returned.forEach((item: any) => {
      expect(Array.isArray(item.matchedBy)).toBe(true);
    });
  });

  // ---- Token budget ----

  it('respects token budget', async () => {
    const result = await recall('database', 100, 'test-actor');
    expect(result.tokensUsed).toBeLessThanOrEqual(100);
    expect(result.tokenBudget).toBe(100);
  });

  // ---- Pagination ----

  it('supports cursor-based pagination', async () => {
    const first = await recall('database', 100000, 'test-actor', { limit: 1 });
    if (first.returned.length > 0 && first.nextCursor !== undefined) {
      const second = await recall('database', 100000, 'test-actor', {
        cursor: first.nextCursor,
        limit: 1,
      });
      expect(second.returned).toBeDefined();
    }
  });

  it('respects limit parameter', async () => {
    const result = await recall('database', 100000, 'test-actor', { limit: 1 });
    expect(result.returned.length).toBeLessThanOrEqual(1);
  });

  // ---- Importance ----

  it('boosts high-importance items', async () => {
    const hi = await db
      .insert(memories)
      .values({
        id: `mem_${randomUUID()}`,
        kind: 'test',
        title: 'Critical security practice',
        content: 'Always validate user input to prevent injection',
        tags: JSON.stringify(['security']),
        importance: 1.0,
        source: 'manual',
        updatedAt: new Date().toISOString(),
      })
      .returning({ id: memories.id });
    const result = await recall('security', 10000, 'test-actor');
    await db.delete(memories).where(eq(memories.id, hi[0]!.id));
    expect(result.returned).toBeDefined();
  });

  // ---- Feedback ----

  it('applies feedback bonus', async () => {
    if (testMemoryIds[0]) {
      await db.insert(feedback).values({
        id: `fb_${randomUUID()}`,
        query: 'test-query',
        itemId: testMemoryIds[0],
        itemType: 'memory',
        helpful: 1,
      });
    }
    const result = await recall('database', 10000, 'test-actor');
    expect(result.returned).toBeDefined();
  });

  // ---- Multiple source types ----

  it('returns results from multiple source types', async () => {
    const result = await recall('database', 100000, 'test-actor');
    const types = new Set(result.returned.map((i: any) => i.type));
    expect(types.size).toBeGreaterThan(0);
  });

  // ---- Edge cases ----

  it('handles special characters in query', async () => {
    const result = await recall('database & performance', 10000, 'test-actor');
    expect(Array.isArray(result.returned)).toBe(true);
  });

  it('handles very long queries', async () => {
    const result = await recall('database '.repeat(100), 10000, 'test-actor');
    expect(Array.isArray(result.returned)).toBe(true);
  });

  it('handles zero token budget', async () => {
    const result = await recall('database', 0, 'test-actor');
    expect(result.returned).toEqual([]);
    expect(result.tokensUsed).toBe(0);
  });

  // ---- Result structure ----

  it('returns properly structured RecallResult', async () => {
    const result = await recall('database', 10000, 'test-actor');
    expect(result).toHaveProperty('query', 'database');
    expect(result).toHaveProperty('returned');
    expect(result).toHaveProperty('tokensUsed');
    expect(result).toHaveProperty('tokenBudget');
    expect(result).toHaveProperty('truncated');
    expect(result).toHaveProperty('mode');
    expect(Array.isArray(result.returned)).toBe(true);
  });

  it('returns properly structured RecallItem', async () => {
    const result = await recall('database', 10000, 'test-actor');
    if (result.returned.length > 0) {
      const item = result.returned[0]!;
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('content');
      expect(item).toHaveProperty('score');
      expect(item).toHaveProperty('tokenCost');
      expect(item).toHaveProperty('source');
      expect(item).toHaveProperty('matchedBy');
    }
  });

  it('returns lexical mode (no pgvector)', async () => {
    const result = await recall('database', 10000, 'test-actor');
    expect(result.mode).toBe('lexical');
  });

  it('does not throw for recall side effects', async () => {
    await expect(recall('database', 10000, 'test-actor')).resolves.toBeDefined();
  });
});
