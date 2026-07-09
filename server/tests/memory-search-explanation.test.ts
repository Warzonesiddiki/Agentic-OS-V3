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

import { explainRecallResults } from '../src/services/memory-search-explanation.js';

describe('memory-search-explanation — explainRecallResults', () => {
  it('requires a results object with a returned list', () => {
    expect(() => explainRecallResults(null as any)).toThrow();
  });
  it('returns a defined explanation for an empty returned list', () => {
    const out = explainRecallResults({ returned: [] } as any);
    expect(out).toBeDefined();
  });
});
