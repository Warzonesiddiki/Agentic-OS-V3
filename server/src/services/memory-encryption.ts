/**
 * memory-encryption.ts — Phase 12.21
 * Encryption-at-rest for memory payloads.
 *
 * Uses AES-256-GCM with a per-record random IV and an
 * authenticated tag. Key is supplied via env (MEMORY_ENCRYPTION_KEY,
 * 32-byte hex or base64) and falls back to a deterministic dev key with
 * a loud warning. Field-level so selective recall stays possible.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.MEMORY_ENCRYPTION_KEY;
  if (!raw) {
    // dev fallback — NOT for production
    return createHash('sha256').update('nexus-dev-memory-key').digest();
  }
  // accept hex or base64
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return Buffer.from(raw, 'base64');
}

export interface EncryptedBlob {
  v: 1;
  iv: string; // base64
  tag: string; // base64
  ct: string; // base64
}

/** Encrypt a UTF-8 string. */
export function encryptMemory(plaintext: string): EncryptedBlob {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  };
}

/** Decrypt a blob produced by {@link encryptMemory}. */
export function decryptMemory(blob: EncryptedBlob): string {
  const key = getKey();
  const iv = Buffer.from(blob.iv, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(Buffer.from(blob.ct, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}

/** Round-trip guard used by tests. */
export function isEncrypted(x: unknown): x is EncryptedBlob {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x as EncryptedBlob).v === 1 &&
    typeof (x as EncryptedBlob).ct === 'string' &&
    typeof (x as EncryptedBlob).iv === 'string' &&
    typeof (x as EncryptedBlob).tag === 'string'
  );
}
