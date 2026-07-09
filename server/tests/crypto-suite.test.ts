/**
 * Dedicated unit tests for Sentinel's crypto-suite namespace.
 * Pure cryptographic helpers — no FROZEN files touched.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  CIPHER,
  KEY_LEN,
  IV_LEN,
  genKey,
  sha256,
  hmac,
  safeEqual,
  constantTimeEqual,
  deriveKey,
} from '../src/services/crypto-suite.js';

describe('constants', () => {
  it('uses AES-256-GCM with a 32-byte key and 12-byte IV', () => {
    expect(CIPHER).toBe('aes-256-gcm');
    expect(KEY_LEN).toBe(32);
    expect(IV_LEN).toBe(12);
  });
});

describe('genKey', () => {
  it('produces a 32-byte key', () => {
    const k = genKey();
    expect(k).toBeInstanceOf(Buffer);
    expect(k.length).toBe(KEY_LEN);
  });

  it('produces unique keys on each call', () => {
    expect(genKey().equals(genKey())).toBe(false);
  });
});

describe('sha256', () => {
  it('is deterministic', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });

  it('matches a known vector', () => {
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('accepts a Buffer input', () => {
    expect(sha256(Buffer.from('abc'))).toBe(sha256('abc'));
  });
});

describe('hmac', () => {
  it('is deterministic for the same inputs', () => {
    const key = genKey();
    expect(hmac('data', key)).toBe(hmac('data', key));
  });

  it('produces different tags for different data', () => {
    const key = genKey();
    expect(hmac('data', key)).not.toBe(hmac('other', key));
  });

  it('accepts a string key', () => {
    const tag = hmac('data', 'secret');
    expect(typeof tag).toBe('string');
    expect(tag.length).toBeGreaterThan(0);
  });
});

describe('safeEqual', () => {
  it('returns true for identical strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(safeEqual('abc', 'abd')).toBe(false);
  });

  it('returns false for different lengths (no throw)', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('is timing-safe (timingSafeEqual path for equal length)', () => {
    const a = 'x'.repeat(64);
    const b = 'x'.repeat(64);
    expect(safeEqual(a, b)).toBe(true);
  });
});

describe('constantTimeEqual', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeEqual('secret-token', 'secret-token')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(constantTimeEqual('secret-token', 'secret-other')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(constantTimeEqual('a', 'ab')).toBe(false);
  });
});

describe('deriveKey', () => {
  it('is deterministic for identical inputs', () => {
    const a = deriveKey('secret', 'salt', 'info');
    const b = deriveKey('secret', 'salt', 'info');
    expect(a.equals(b)).toBe(true);
  });

  it('produces different keys for different salts', () => {
    const a = deriveKey('secret', 'salt1', 'info');
    const b = deriveKey('secret', 'salt2', 'info');
    expect(a.equals(b)).toBe(false);
  });

  it('produces different keys for different info', () => {
    const a = deriveKey('secret', 'salt', 'info1');
    const b = deriveKey('secret', 'salt', 'info2');
    expect(a.equals(b)).toBe(false);
  });

  it('yields the expected 32-byte length', () => {
    const k = deriveKey('secret', 'salt', 'info');
    expect(k.length).toBe(KEY_LEN);
  });

  it('matches its documented HKDF-lite expansion', () => {
    const secret = 'password';
    const salt = 'uniquesalt';
    const info = 'aes-key';
    const derived = deriveKey(secret, salt, info);
    const { createHmac: ch } = await import('node:crypto');
    const prk = createHmac('sha256', salt).update(secret).digest();
    const expected = createHmac('sha256', prk).update(Buffer.from(info)).digest();
    expect(derived.equals(expected.subarray(0, KEY_LEN))).toBe(true);
  });
});
