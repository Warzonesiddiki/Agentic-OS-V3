/**
 * Tests for Phase 12-20 implementations: memory encryption, data classification,
 * cache stampede prevention, and severity classification.
 */
import { describe, it, expect } from 'vitest';
import {
  encryptMemory,
  decryptMemory,
  isEncrypted,
  generateEncryptionKey,
  type EncryptionConfig,
} from '../src/services/memory-encryption.js';

describe('memory-encryption', () => {
  const config: EncryptionConfig = {
    encryptionKey: generateEncryptionKey(),
    enabled: true,
    minImportance: 0.2,
  };

  it('encrypts and decrypts content round-trip', () => {
    const content = 'This is a secret memory about API keys and passwords.';
    const encrypted = encryptMemory(content, 'mem-123', 'fact', 0.8, config);
    expect(encrypted).not.toBeNull();
    expect(encrypted!.ciphertext).not.toBe(content);

    const decrypted = decryptMemory(encrypted!, 'mem-123', 'fact', config);
    expect(decrypted).toBe(content);
  });

  it('returns null for disabled encryption', () => {
    const disabledConfig = { ...config, enabled: false };
    const result = encryptMemory('test', 'mem-1', 'fact', 0.8, disabledConfig);
    expect(result).toBeNull();
  });

  it('returns null for low importance', () => {
    const result = encryptMemory('test', 'mem-1', 'fact', 0.1, config);
    expect(result).toBeNull();
  });

  it('returns null for empty content', () => {
    const result = encryptMemory('', 'mem-1', 'fact', 0.8, config);
    expect(result).toBeNull();
  });

  it('detects encrypted payloads', () => {
    const encrypted = encryptMemory('secret', 'mem-1', 'fact', 0.8, config);
    expect(isEncrypted(encrypted)).toBe(true);
    expect(isEncrypted('plain text')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted({})).toBe(false);
  });

  it('fails decryption with wrong kind (AAD mismatch)', () => {
    const encrypted = encryptMemory('secret', 'mem-1', 'fact', 0.8, config);
    expect(() => decryptMemory(encrypted!, 'mem-1', 'semantic', config)).toThrow();
  });

  it('fails decryption with wrong ID (AAD mismatch)', () => {
    const encrypted = encryptMemory('secret', 'mem-1', 'fact', 0.8, config);
    expect(() => decryptMemory(encrypted!, 'mem-2', 'fact', config)).toThrow();
  });

  it('generates unique encryption keys', () => {
    const key1 = generateEncryptionKey();
    const key2 = generateEncryptionKey();
    expect(key1).not.toBe(key2);
    expect(key1.length).toBe(64); // 32 bytes hex
  });

  it('produces deterministic nonces per memory ID', () => {
    const enc1 = encryptMemory('a', 'mem-same', 'fact', 0.8, config);
    const enc2 = encryptMemory('b', 'mem-same', 'fact', 0.8, config);
    // Same memory ID → same nonce
    expect(enc1!.nonce).toBe(enc2!.nonce);
    // But different content → different ciphertext
    expect(enc1!.ciphertext).not.toBe(enc2!.ciphertext);
  });
});
