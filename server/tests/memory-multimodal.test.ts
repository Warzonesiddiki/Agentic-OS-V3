/**
 * memory-multimodal.test.ts — deep coverage for Mnemosyne multimodal slice.
 * Tests caption-quality scoring, attachment hashing, language detection,
 * low-quality down-weighting, and the add-multimodal path (mocked DB/embeddings).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  attachmentHash,
  scoreCaptionQuality,
  isLowQualityCaption,
  detectLanguage,
  CAPTION_QUALITY_THRESHOLD,
  addMultimodalMemory,
} from '../src/services/memory-multimodal.js';
import * as dbClient from '../src/db/client.js';

// eslint-disable-next-line no-var
var mmCaptured: any = { values: undefined };

vi.mock('../src/db/client.js', () => ({
  db: {
    insert: vi.fn(() => ({
      values: (v: any) => {
        mmCaptured.values = v;
        return { returning: () => Promise.resolve([{ id: 'm', importance: v?.importance ?? 0.5, language: v?.language ?? 'und', content: 'x' }]) };
      },
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => ({})) })) })),
    select: vi.fn(),
  },
  memories: { id: 'id', kind: 'kind', title: 'title', content: 'content', embedding: 'embedding' },
}));

vi.mock('../src/services/embeddings.js', () => ({
  embedQuery: vi.fn(async () => [0.1, 0.2, 0.3]),
  embeddingsAvailable: vi.fn(() => true),
}));

vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(async () => ({})) }));

describe('attachmentHash', () => {
  it('is stable for identical inputs', () => {
    const a = attachmentHash('image', 's3://x/1.png', { w: 10 });
    const b = attachmentHash('image', 's3://x/1.png', { w: 10 });
    expect(a).toBe(b);
  });

  it('differs when uri changes', () => {
    const a = attachmentHash('image', 's3://x/1.png', {});
    const b = attachmentHash('image', 's3://x/2.png', {});
    expect(a).not.toBe(b);
  });

  it('differs when meta changes', () => {
    const a = attachmentHash('image', 'u', { w: 10 });
    const b = attachmentHash('image', 'u', { w: 20 });
    expect(a).not.toBe(b);
  });

  it('is an 8-char hex string', () => {
    const h = attachmentHash('file', 'uri', {});
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('scoreCaptionQuality', () => {
  it('returns 0 for empty caption', () => {
    expect(scoreCaptionQuality('')).toBe(0);
    expect(scoreCaptionQuality('   ')).toBe(0);
  });

  it('flags boilerplate captions as near-zero', () => {
    expect(scoreCaptionQuality('no caption')).toBeCloseTo(0.05);
    expect(scoreCaptionQuality('untitled')).toBeCloseTo(0.05);
  });

  it('returns low score for a single word', () => {
    expect(scoreCaptionQuality('cat')).toBeCloseTo(0.1);
  });

  it('scores a rich, unique caption higher than a repetitive one', () => {
    const good = scoreCaptionQuality('a red bicycle parked next to a blue warehouse under the bridge');
    const poor = scoreCaptionQuality('image image image image image image image image');
    expect(good).toBeGreaterThan(poor);
    expect(good).toBeGreaterThan(CAPTION_QUALITY_THRESHOLD);
  });

  it('applies a language penalty for unknown/und languages', () => {
    const withLang = scoreCaptionQuality('a small dog runs across the green field', 'en');
    const withoutLang = scoreCaptionQuality('a small dog runs across the green field');
    expect(withLang).toBeGreaterThan(withoutLang);
  });

  it('stays within [0,1]', () => {
    for (const c of ['', 'x', 'no caption', 'a b c d e f g h i j k l m n o p q r s t u v w x y z']) {
      const s = scoreCaptionQuality(c);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('isLowQualityCaption', () => {
  it('true for empty / boilerplate / single word', () => {
    expect(isLowQualityCaption('')).toBe(true);
    expect(isLowQualityCaption('no caption')).toBe(true);
    expect(isLowQualityCaption('cat')).toBe(true);
  });

  it('false for a detailed caption', () => {
    expect(isLowQualityCaption('the engineer deployed the service after the integration tests passed')).toBe(false);
  });
});

describe('detectLanguage', () => {
  it('detects spanish via stopwords (length > 2)', () => {
    expect(detectLanguage('los gatos corren para una casa con perros')).toBe('es');
  });

  it('detects french via stopwords', () => {
    expect(detectLanguage('les chats sont sur la table et une chaise est petite')).toBe('fr');
  });

  it('returns und for english (no en sample list by design)', () => {
    expect(detectLanguage('the cat is on the table and the dog are outside')).toBe('und');
  });

  it('returns und for empty / ambiguous text', () => {
    expect(detectLanguage('')).toBe('und');
    expect(detectLanguage('x y z q w')).toBe('und');
  });
});

describe('addMultimodalMemory (mocked)', () => {
  it('stores a quality caption without down-weighting importance', async () => {
    mmCaptured.values = undefined;
    await addMultimodalMemory({
      projectId: 'p1',
      agentId: 'a1',
      kind: 'image',
      blobRef: 's3://b/sunset.png',
      caption: 'a vivid orange sunset over the calm ocean with silhouetted palm trees',
      importance: 0.9,
      lang: 'en',
    });
    expect(mmCaptured.values.importance).toBeCloseTo(0.9);
    expect(mmCaptured.values.language).toBe('en');
  });

  it('down-weights importance for a low-quality caption', async () => {
    mmCaptured.values = undefined;
    await addMultimodalMemory({
      projectId: 'p1',
      agentId: 'a1',
      kind: 'image',
      blobRef: 's3://b/x.png',
      caption: 'no caption',
      importance: 0.9,
      lang: 'en',
    });
    expect(mmCaptured.values.importance).toBeLessThan(0.9);
  });
});
