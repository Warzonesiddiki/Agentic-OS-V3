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

import { generateImageThumbnail, highlightCode } from '../src/services/memory-attachments.js';

describe('memory-attachments — generateImageThumbnail', () => {
  it('returns an SVG data URI for a small image', () => {
    const out = generateImageThumbnail({ data: Buffer.from('fake'), width: 100, height: 80 } as any);
    expect(typeof out).toBe('string');
    expect(out.startsWith('data:image/svg+xml')).toBe(true);
  });
  it('is stable for identical input', () => {
    const a = generateImageThumbnail({ data: Buffer.from('x'), width: 10, height: 10 } as any);
    const b = generateImageThumbnail({ data: Buffer.from('x'), width: 10, height: 10 } as any);
    expect(a).toBe(b);
  });
});

describe('memory-attachments — highlightCode', () => {
  it('returns a string for supported languages', () => {
    const out = highlightCode('const x = 1;', 'ts');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
  it('falls back gracefully for unknown languages', () => {
    const out = highlightCode('print(1)', 'unknownlang');
    expect(typeof out).toBe('string');
  });
  it('handles empty code', () => {
    expect(highlightCode('', 'ts')).toBeDefined();
  });
});
