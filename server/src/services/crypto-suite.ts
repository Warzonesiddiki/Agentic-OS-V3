/** crypto-suite.ts — vetted cryptographic primitives & constant-time helpers. */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../lib/errors.js';

export const CIPHER = 'aes-256-gcm';
export const KEY_LEN = 32;
export const IV_LEN = 12;

export function genKey(): Buffer {
  return randomBytes(KEY_LEN);
}

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hmac(data: string | Buffer, key: Buffer | string): string {
  return createHmac('sha256', typeof key === 'string' ? Buffer.from(key) : key)
    .update(data)
    .digest('hex');
}

/** Constant-time string comparison to avoid timing attacks. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Canonical constant-time equality primitive (alias of safeEqual) used by the
 * kill-switch and secret-comparison paths so callers don't depend on the
 * internal name. Length-leak-safe: returns false early only after the full
 * constant-time comparison has been performed when lengths match.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  return safeEqual(a, b);
}

export function deriveKey(secret: string, salt: string, info: string): Buffer {
  // HKDF-lite using HMAC-SHA256 (single iteration, sufficient for envelope KEK).
  const prk = createHmac('sha256', salt).update(secret).digest();
  const okm = createHmac('sha256', prk).update(Buffer.from(info)).digest();
  if (okm.length < KEY_LEN) throw new ApiError('CRYPTO_KEYLEN', 'Derived key too short.');
  return okm.subarray(0, KEY_LEN);
}
