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

import { hashMemory } from '../src/services/memory-diff-sync.js';

describe('memory-diff-sync — hashMemory', () => {
  it('returns a stable hex hash for identical memory', () => {
    const a = hashMemory({ id: 'a', content: 'hello', title: 't' } as any);
    const b = hashMemory({ id: 'a', content: 'hello', title: 't' } as any);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]+$/);
  });
  it('differs when content changes', () => {
    const a = hashMemory({ id: 'a', content: 'hello' } as any);
    const b = hashMemory({ id: 'a', content: 'world' } as any);
    expect(a).not.toBe(b);
  });
});
