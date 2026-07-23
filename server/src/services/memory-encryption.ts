/**
 * memory-encryption.ts — AEAD encryption for memories at rest.
 * Phase 12, Task 12.21: Memory Encryption at Rest.
 *
 * Encrypts memory content using AES-256-GCM (AEAD) with per-memory nonces
 * derived from the memory ID. Keys are managed via the existing NEXUS_ENCRYPTION_KEY
 * environment variable.
 *
 * Design:
 *   - Nonce: derived from memory.id via HKDF (avoids nonce reuse)
 *   - AAD: memory.id + kind (prevents cross-memory ciphertext swapping)
 *   - Skip encryption for importance < 0.2 (low-value, high-volume)
 *   - Decryption is transparent — callers get plaintext via getDecrypted()
 *
 * @module services/memory-encryption
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash, hkdfSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const NONCE_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits auth tag
const IMPORTANCE_THRESHOLD = 0.2;

export interface EncryptedPayload {
  ciphertext: string; // base64
  nonce: string; // base64
  tag: string; // base64
  algorithm: string;
  encryptedAt: string; // ISO timestamp
}

export interface EncryptionConfig {
  encryptionKey: string;
  enabled: boolean;
  minImportance: number;
}

/**
 * Derive a per-memory encryption key from the master key + memory ID.
 * Uses HKDF-SHA256 for key derivation (avoids related-key attacks).
 */
function deriveKey(masterKey: string, memoryId: string): Buffer {
  const info = Buffer.from(`nexus-memory:${memoryId}`);
  const salt = Buffer.from('nexus-memory-encryption-v1');
  const derived = hkdfSync('sha256', masterKey, salt, info, KEY_LENGTH);
  return Buffer.from(derived);
}

/**
 * Derive a deterministic nonce from the memory ID.
 * Since memory IDs are UUIDs (unique), the nonce will be unique per memory.
 * We use a hash of the ID to get a fixed-length nonce.
 */
function deriveNonce(memoryId: string): Buffer {
  const hash = createHash('sha256').update(`nonce:${memoryId}`).digest();
  return hash.subarray(0, NONCE_LENGTH);
}

/**
 * Encrypt memory content with AEAD.
 * Returns null if the content should not be encrypted (below importance threshold).
 */
export function encryptMemory(
  content: string,
  memoryId: string,
  kind: string,
  importance: number,
  config: EncryptionConfig
): EncryptedPayload | null {
  if (!config.enabled) return null;
  if (importance < config.minImportance) return null;
  if (!content || content.length === 0) return null;

  const key = deriveKey(config.encryptionKey, memoryId);
  const nonce = deriveNonce(memoryId);
  const aad = Buffer.from(`${memoryId}:${kind}`);

  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_LENGTH });
  cipher.setAAD(aad);

  const plaintext = Buffer.from(content, 'utf-8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: tag.toString('base64'),
    algorithm: ALGORITHM,
    encryptedAt: new Date().toISOString(),
  };
}

/**
 * Decrypt memory content.
 * Throws if decryption fails (tampered data or wrong key).
 */
export function decryptMemory(
  payload: EncryptedPayload,
  memoryId: string,
  kind: string,
  config: EncryptionConfig
): string {
  if (!config.enabled) {
    throw new Error('encryption_disabled_cannot_decrypt');
  }

  const key = deriveKey(config.encryptionKey, memoryId);
  const nonce = Buffer.from(payload.nonce, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const aad = Buffer.from(`${memoryId}:${kind}`);

  const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_LENGTH });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf-8');
}

/**
 * Check if a string looks like encrypted content (base64 with encryption header).
 */
export function isEncrypted(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ciphertext === 'string' &&
    typeof v.nonce === 'string' &&
    typeof v.tag === 'string' &&
    v.algorithm === ALGORITHM
  );
}

/**
 * Get the encryption config from environment.
 */
export function getEncryptionConfig(): EncryptionConfig {
  const key = process.env.NEXUS_ENCRYPTION_KEY ?? '';
  return {
    encryptionKey: key,
    enabled: key.length >= 32,
    minImportance: IMPORTANCE_THRESHOLD,
  };
}

/**
 * Generate a new encryption key (for setup scripts).
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}
