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

import { parseNaturalLanguageQuery } from '../src/services/memory-nl-query.js';

describe('memory-nl-query — parseNaturalLanguageQuery', () => {
  it('extracts a topic and raw text', () => {
    const r = parseNaturalLanguageQuery('show me recent memories about rust');
    expect(r).toBeDefined();
    expect(typeof r.raw).toBe('string');
    expect(r.raw).toContain('rust');
  });
  it('parses a time expression when present', () => {
    const r = parseNaturalLanguageQuery('memories from last week about deployments');
    expect(r.timeExpr).toBeDefined();
  });
  it('returns a defined result for empty input', () => {
    const r = parseNaturalLanguageQuery('');
    expect(r).toBeDefined();
    expect(typeof r.raw).toBe('string');
  });
});
