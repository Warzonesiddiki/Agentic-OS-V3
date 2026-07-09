import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db/client.js', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  memories: { $inferSelect: {} },
  memoryAttachments: {},
  memoryClusters: {},
  memoryClusterMembers: {},
  memoryCausalEdges: {},
  sessionLinks: {},
  tagTaxonomy: {},
  memoryContradictions: {},
  memoryDiffMarkers: {},
  memoryTags: {},
}));

import { selectWinner, type MemoryLite, type ConflictStrategy } from '../src/services/memory-conflict-resolver.js';

const mk = (id: string, importance: number, createdAt: Date): MemoryLite =>
  ({
    id,
    createdAt,
    importance,
    title: id,
    content: id,
    tags: [],
    projectId: null,
  } as MemoryLite);

describe('memory-conflict-resolver — selectWinner', () => {
  it('picks the newer memory under "newest_wins"', () => {
    const older = mk('a', 0.9, new Date('2024-01-01'));
    const newer = mk('b', 0.5, new Date('2024-06-01'));
    expect(selectWinner('newest_wins', older, newer)).toBe('b');
    expect(selectWinner('newest_wins', newer, older)).toBe('b');
  });

  it('picks the higher-importance memory under "highest_importance"', () => {
    const hi = mk('a', 0.9, new Date('2024-01-01'));
    const lo = mk('b', 0.5, new Date('2024-06-01'));
    expect(selectWinner('highest_importance', hi, lo)).toBe('a');
    expect(selectWinner('highest_importance', lo, hi)).toBe('a');
  });

  it('returns empty string for merge/prompt strategies', () => {
    const a = mk('a', 0.9, new Date('2024-01-01'));
    const b = mk('b', 0.5, new Date('2024-06-01'));
    expect(selectWinner('llm_merge', a, b)).toBe('');
    expect(selectWinner('prompt_user', a, b)).toBe('');
  });

  it('is deterministic', () => {
    const a = mk('a', 0.9, new Date('2024-01-01'));
    const b = mk('b', 0.5, new Date('2024-06-01'));
    expect(selectWinner('newest_wins', a, b)).toBe(selectWinner('newest_wins', a, b));
  });
});
