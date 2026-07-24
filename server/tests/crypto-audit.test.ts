/**
 * SecB — NONSTOP security perfection workstream.
 *
 * Targeted cryptographic audit of the encryption / rate-limit namespace:
 *   server/src/services/{crypto-suite,db-encryption,memory-encryption,hsm-provider,file-watcher,rate-limit.service}.ts
 *   server/src/lib/{rate-limit,crypto-sign,hsm-provider}.ts
 *
 * Proofs required by the task:
 *   (a) ciphertext differs per encryption (nonce/IV uniqueness)
 *   (b) tampered ciphertext fails authentication (GCM auth tag rejects)
 *   (c) rate-limit enforces budgets (token bucket denies past the cap)
 *
 * No FROZEN files are touched. All tests are pure unit tests (no DB required —
 * the rate limiter uses its in-memory store).
 */
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

// The HSM local backend needs a 32-byte base64 key. getHsmConfig() caches on the
// FIRST CALL (not at import time), so setting the env here — before any test runs
// a crypto call — is sufficient.
process.env.HSM_LOCAL_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.HSM_BACKEND = 'local';
// Tighten the rate-limit budget for the budget-enforcement proof.
process.env.NEXUS_RATE_LIMIT_PER_MINUTE = '25';

import {
  encrypt as hsmEncrypt,
  decrypt as hsmDecrypt,
  rotateKey,
} from '../src/lib/hsm-provider.js';
import { encryptField, decryptField } from '../src/services/db-encryption.js';
import {
  encryptMemory,
  decryptMemory,
  isEncrypted,
  type EncryptionConfig,
} from '../src/services/memory-encryption.js';
import { signArtifactEd25519, verifyArtifactEd25519, sha256Hex } from '../src/lib/crypto-sign.js';
import { safeEqual, constantTimeEqual, genKey, KEY_LEN } from '../src/services/crypto-suite.js';

// rate-limit must be imported AFTER NEXUS_RATE_LIMIT_PER_MINUTE is set so that
// its cached `env` snapshot reflects the tight budget.
const { consume, clientIpFromHeaders } = await import('../src/lib/rate-limit.js');

const memoryEncryptionConfig: EncryptionConfig = {
  encryptionKey: 'crypto-audit-memory-encryption-key-material',
  enabled: true,
  minImportance: 0.2,
};
const memoryId = 'crypto-audit-memory';
const memoryKind = 'fact';

function encryptAuditMemory(content: string) {
  const payload = encryptMemory(content, memoryId, memoryKind, 0.9, memoryEncryptionConfig);
  if (payload === null) throw new Error('memory encryption fixture unexpectedly returned null');
  return payload;
}

/** Flips a single byte in a base64 string deterministically. */
function tamperBase64(b64: string): string {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length === 0) return b64;
  buf[0] = buf[0] ^ 0x01; // flip lowest bit of first byte
  return buf.toString('base64');
}

describe('SecB audit (a): ciphertext/IV uniqueness per encryption', () => {
  it('hsm-provider: two encryptions of the same plaintext yield different ciphertext', async () => {
    const a = await hsmEncrypt('top-secret-value');
    const b = await hsmEncrypt('top-secret-value');
    expect(a).not.toBe(b);
    // format is iv|tag|ct — the iv (first segment) must differ
    expect(a.split('|')[0]).not.toBe(b.split('|')[0]);
  });

  it('db-encryption: same plaintext produces a different envelope each time', async () => {
    const a = await encryptField('sensitive-column');
    const b = await encryptField('sensitive-column');
    expect(a).not.toBe(b);
    expect(a.split(':')[1]).not.toBe(b.split(':')[1]); // IV segment differs
  });

  it('memory-encryption: same plaintext produces a different blob each time', () => {
    const a = encryptAuditMemory('a memory payload');
    const b = encryptAuditMemory('a memory payload');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.tag).not.toBe(b.tag);
  });

  it('crypto-suite: genKey produces unique 32-byte keys', () => {
    expect(genKey().equals(genKey())).toBe(false);
    expect(genKey().length).toBe(KEY_LEN);
  });
});

describe('SecB audit (b): tampered ciphertext fails authentication', () => {
  it('hsm-provider: flipping a ciphertext byte makes decrypt throw', async () => {
    const ct = await hsmEncrypt('payload');
    const [iv, tag, enc] = ct.split('|');
    const tampered = [iv, tag, tamperBase64(enc)].join('|');
    await expect(hsmDecrypt(tampered)).rejects.toBeDefined();
  });

  it('hsm-provider: flipping the auth tag makes decrypt throw', async () => {
    const ct = await hsmEncrypt('payload');
    const [iv, tag, enc] = ct.split('|');
    const tampered = [iv, tamperBase64(tag), enc].join('|');
    await expect(hsmDecrypt(tampered)).rejects.toBeDefined();
  });

  it('db-encryption: tampering the ciphertext segment fails to decrypt', async () => {
    const stored = await encryptField('column-value');
    const parts = stored.split(':'); // prefix:iv:tag:ct:wrappedKey
    parts[3] = tamperBase64(parts[3]);
    const tampered = parts.join(':');
    await expect(decryptField(tampered)).rejects.toBeDefined();
  });

  it('db-encryption: tampering the auth tag segment fails to decrypt', async () => {
    const stored = await encryptField('column-value');
    const parts = stored.split(':');
    parts[2] = tamperBase64(parts[2]);
    const tampered = parts.join(':');
    await expect(decryptField(tampered)).rejects.toBeDefined();
  });

  it('db-encryption: tampering the wrapped key fails to decrypt', async () => {
    const stored = await encryptField('column-value');
    const parts = stored.split(':');
    parts[4] = tamperBase64(parts[4]);
    const tampered = parts.join(':');
    await expect(decryptField(tampered)).rejects.toBeDefined();
  });

  it('memory-encryption: tampering ciphertext fails decryptMemory', () => {
    const blob = encryptAuditMemory('memory');
    const tampered = { ...blob, ciphertext: tamperBase64(blob.ciphertext) };
    expect(() => decryptMemory(tampered, memoryId, memoryKind, memoryEncryptionConfig)).toThrow();
  });

  it('memory-encryption: tampered auth tag fails decrypt', () => {
    const blob = encryptAuditMemory('memory');
    const tampered = { ...blob, tag: tamperBase64(blob.tag) };
    expect(() => decryptMemory(tampered, memoryId, memoryKind, memoryEncryptionConfig)).toThrow();
  });

  it('memory-encryption: isEncrypted rejects malformed input', () => {
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted({ v: 1 })).toBe(false);
  });

  it('crypto-sign: signature verification fails on a tampered digest', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const digest = sha256Hex('authoritative payload');
    const sig = signArtifactEd25519(privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, digest);
    const tampered = sha256Hex('tampered payload!!');
    expect(
      verifyArtifactEd25519(publicKey.export({ type: 'spki', format: 'pem' }) as string, tampered, sig),
    ).toBe(false);
  });

  it('crypto-sign: signature verification succeeds for the intact digest', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const digest = sha256Hex('authoritative payload');
    const sig = signArtifactEd25519(privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, digest);
    expect(
      verifyArtifactEd25519(publicKey.export({ type: 'spki', format: 'pem' }) as string, digest, sig),
    ).toBe(true);
  });

  it('crypto-suite: safeEqual / constantTimeEqual reject mismatched secrets', () => {
    expect(safeEqual('secret-a', 'secret-b')).toBe(false);
    expect(constantTimeEqual('token-1', 'token-2')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('a', 'ab')).toBe(false);
  });
});

describe('SecB audit (c): rate-limit enforces budgets', () => {
  it('allows requests up to the budget then denies the overflow', async () => {
    const key = `budget-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let allowed = 0;
    let denied = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const r = await consume(key, 'audit-test');
      if (r.allowed) allowed++;
      else denied++;
    }
    // Budget capped at 25 (NEXUS_RATE_LIMIT_PER_MINUTE). Synchronous drain hits the cap.
    expect(allowed).toBeLessThanOrEqual(25);
    expect(allowed).toBeGreaterThan(0);
    expect(denied).toBeGreaterThan(0);
    expect(denied).toBe(N - allowed);
  });

  it('isolates budgets per key (independent buckets)', async () => {
    const k1 = `iso-${Date.now()}-a`;
    const k2 = `iso-${Date.now()}-b`;
    const r1 = await consume(k1, 'audit-test');
    const r2 = await consume(k2, 'audit-test');
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it('clientIpFromHeaders does NOT trust X-Forwarded-For by default (secure)', () => {
    // With no NEXUS_TRUST_PROXY, a spoofed XFF must be ignored.
    expect(clientIpFromHeaders({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1' }, '10.0.0.1')).toBe('10.0.0.1');
  });

  it('clientIpFromHeaders falls back to supplied value then unknown', () => {
    expect(clientIpFromHeaders({}, '192.168.0.5')).toBe('192.168.0.5');
    expect(clientIpFromHeaders({})).toBe('unknown');
  });
});

describe('SecB audit: key rotation path', () => {
  it('hsm-provider: rotateKey returns a new key id in local backend', async () => {
    const res = await rotateKey();
    expect(res.newKeyId).toMatch(/^local-rotated-/);
  });

  it('hsm-provider: data encrypted before rotation cannot decrypt after a key change', async () => {
    const before = await hsmEncrypt('rotate-me');
    await rotateKey(); // changes process.env.HSM_LOCAL_KEY → new local key
    await expect(hsmDecrypt(before)).rejects.toBeDefined();
  });
});
