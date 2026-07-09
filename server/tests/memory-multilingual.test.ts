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

import { detectLanguage, type LanguageCode } from '../src/services/memory-multilingual.js';

describe('memory-multilingual — detectLanguage', () => {
  it('detects Spanish from Spanish stopwords', () => {
    expect(detectLanguage('el la los una que por con para')).toBe<LanguageCode>('es');
  });

  it('detects German from German stopwords', () => {
    expect(detectLanguage('der die das und ist ein mit für')).toBe<LanguageCode>('de');
  });

  it('is deterministic', () => {
    const input = 'el la los una que por con para';
    expect(detectLanguage(input)).toBe(detectLanguage(input));
  });

  it('returns a string language code for any input', () => {
    const code = detectLanguage('the quick brown fox jumps');
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(0);
  });
});
