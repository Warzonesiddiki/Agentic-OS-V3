/**
 * Tests for server/src/services/memory-export-v3.ts
 *
 * Export memories to various formats. DB is mocked. The serializer is format-
 * specific; the zod schema validates the input.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const memRows: Array<Record<string, unknown>> = [];

vi.mock('../src/db/client.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve(memRows),
        }),
      }),
    }),
  },
  memories: { id: 'id', projectId: 'projectId', title: 'title', content: 'content', kind: 'kind', createdAt: 'createdAt' },
  isSqlite: true,
}));

vi.mock('../lib/logging.js', () => ({ log: { error: () => undefined } }));

import { exportMemories, serializeMemory } from '../src/services/memory-export-v3.js';

beforeEach(() => {
  memRows.length = 0;
});

const sample = {
  id: 'm1',
  projectId: 'p1',
  title: 'A',
  content: 'B',
  kind: 'fact',
  createdAt: '2024-01-01T00:00:00.000Z',
  tags: ['x'],
  importance: 0.5,
};

describe('serializeMemory', () => {
  it('serializes to JSON by default', () => {
    const s = serializeMemory(sample, 'json');
    expect(JSON.parse(s)).toMatchObject({ id: 'm1', title: 'A' });
  });
  it('serializes to markdown', () => {
    const s = serializeMemory(sample, 'markdown');
    expect(s).toContain('# A');
    expect(s).toContain('B');
  });
  it('serializes to CSV rows', () => {
    const s = serializeMemory(sample, 'csv');
    expect(s).toContain('id,title');
    expect(s).toContain('m1,A');
  });
  it('throws for an unsupported format', () => {
    expect(() => serializeMemory(sample, 'xml' as never)).toThrow();
  });
});

describe('exportMemories', () => {
  it('exports memories in JSON format', async () => {
    memRows.push(sample);
    const out = await exportMemories({ projectId: 'p1', format: 'json' });
    expect(out.format).toBe('json');
    const parsed = JSON.parse(out.data);
    expect(parsed[0].id).toBe('m1');
  });

  it('exports memories in markdown format', async () => {
    memRows.push(sample);
    const out = await exportMemories({ projectId: 'p1', format: 'markdown' });
    expect(out.data).toContain('# A');
  });

  it('exports memories in CSV format', async () => {
    memRows.push(sample);
    const out = await exportMemories({ projectId: 'p1', format: 'csv' });
    expect(out.data).toContain('id,title');
  });

  it('returns an empty payload when nothing matches', async () => {
    const out = await exportMemories({ projectId: 'p2', format: 'json' });
    expect(JSON.parse(out.data)).toEqual([]);
  });

  it('validates the export request schema', async () => {
    await expect(exportMemories({ projectId: '', format: 'json' })).rejects.toBeTruthy();
  });
});
