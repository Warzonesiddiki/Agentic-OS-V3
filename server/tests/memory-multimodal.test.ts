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

import {
  attachmentHash,
  scoreCaptionQuality,
  isLowQualityCaption,
  CAPTION_QUALITY_THRESHOLD,
  detectLanguage,
  type LanguageCode,
} from '../src/services/memory-multimodal.js';

describe('memory-multimodal — attachmentHash', () => {
  it('is stable for identical inputs', () => {
    const a = attachmentHash('image', 's3://x', { w: 1 });
    const b = attachmentHash('image', 's3://x', { w: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
  it('differs when uri changes', () => {
    expect(attachmentHash('image', 's3://a', {})).not.toBe(attachmentHash('image', 's3://b', {}));
  });
});

describe('memory-multimodal — scoreCaptionQuality', () => {
  it('returns 0 for empty caption', () => {
    expect(scoreCaptionQuality('')).toBe(0);
  });
  it('returns near-0 for boilerplate', () => {
    expect(scoreCaptionQuality('no caption')).toBeLessThanOrEqual(0.05);
    expect(scoreCaptionQuality('image')).toBeLessThanOrEqual(0.05);
  });
  it('penalizes lang=und', () => {
    const withLang = scoreCaptionQuality('a detailed diagram of the neural network topology', 'en');
    const without = scoreCaptionQuality('a detailed diagram of the neural network topology', 'und');
    expect(withLang).toBeGreaterThan(without);
  });
  it('scores a good caption in [0,1]', () => {
    const s = scoreCaptionQuality('a detailed architectural diagram showing the recall pipeline and vector store', 'en');
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThan(CAPTION_QUALITY_THRESHOLD);
  });
  it('classifies low-quality captions', () => {
    expect(isLowQualityCaption('image')).toBe(true);
    expect(isLowQualityCaption('a detailed photo of a red fox sitting on snow', 'en')).toBe(false);
  });
});

describe('memory-multimodal — detectLanguage', () => {
  it('detects Spanish', () => {
    expect(detectLanguage('el la los una que por con para')).toBe<LanguageCode>('es');
  });
  it('detects German', () => {
    expect(detectLanguage('der die das und ist ein mit für')).toBe<LanguageCode>('de');
  });
  it('detects Japanese', () => {
    expect(detectLanguage('の に は を が で た と')).toBe<LanguageCode>('ja');
  });
  it('falls back to und for ambiguous/short input', () => {
    expect(detectLanguage('the cat sat')).toBe<LanguageCode>('und');
  });
  it('filters english stopwords', () => {
    expect(detectLanguage('the a an and or but of to in on for with is are was the')).toBe<LanguageCode>('und');
  });
});
