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
  encryptMemory,
  decryptMemory,
  isEncrypted,
} from '../src/services/memory-encryption.js';

describe('memory-encryption — round trip', () => {
  it('encrypts to a blob and decrypts back to the original', () => {
    const blob = encryptMemory('hello world');
    expect(typeof blob).toBe('object');
    const back = decryptMemory(blob);
    expect(back).toBe('hello world');
  });
  it('produces a different ciphertext than the plaintext', () => {
    const blob: any = encryptMemory('secret');
    expect(JSON.stringify(blob)).not.toContain('secret');
  });
});

describe('memory-encryption — isEncrypted', () => {
  it('returns true for an encrypted blob', () => {
    expect(isEncrypted(encryptMemory('x'))).toBe(true);
  });
  it('returns false for plain strings and objects', () => {
    expect(isEncrypted('plain')).toBe(false);
    expect(isEncrypted({ foo: 'bar' })).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});
