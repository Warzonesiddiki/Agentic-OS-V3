import { describe, expect, it, vi } from 'vitest';

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
  decryptMemory,
  encryptMemory,
  isEncrypted,
  type EncryptionConfig,
} from '../src/services/memory-encryption.js';

const config: EncryptionConfig = {
  encryptionKey: 'test-memory-encryption-key-material-32-bytes',
  enabled: true,
  minImportance: 0.2,
};
const memoryId = 'memory-encryption-test';
const kind = 'fact';

function encrypted(content: string) {
  const payload = encryptMemory(content, memoryId, kind, 0.9, config);
  if (payload === null) throw new Error('test fixture encryption unexpectedly returned null');
  return payload;
}

describe('memory-encryption — round trip', () => {
  it('encrypts to a blob and decrypts back to the original', () => {
    const blob = encrypted('hello world');
    expect(decryptMemory(blob, memoryId, kind, config)).toBe('hello world');
  });

  it('uses a fresh nonce and does not expose plaintext in ciphertext', () => {
    const first = encrypted('secret');
    const second = encrypted('secret');
    expect(first.nonce).not.toBe(second.nonce);
    expect(JSON.stringify(first)).not.toContain('secret');
  });
});

describe('memory-encryption — isEncrypted', () => {
  it('returns true for an encrypted blob', () => {
    expect(isEncrypted(encrypted('x'))).toBe(true);
  });

  it('returns false for plain strings and objects', () => {
    expect(isEncrypted('plain')).toBe(false);
    expect(isEncrypted({ foo: 'bar' })).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});
