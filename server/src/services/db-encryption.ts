/**
 * db-encryption.ts — transparent field-level encryption for sensitive DB columns.
 *
 * Uses AES-256-GCM with a key resolved from the HSM provider. Each encrypted value
 * is stored as `nexenc:<iv>:<tag>:<ct>` so the column stays a normal string. A
 * column-level KMS key id can be supplied per field.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { encrypt as hsmEncrypt, decrypt as hsmDecrypt } from '../lib/hsm-provider.js';
import { ApiError } from '../lib/errors.js';

const PREFIX = 'nexenc:';
const IV_LEN = 12;

/** Encrypt a string for storage. The envelope key is itself wrapped by the HSM. */
export async function encryptField(plaintext: string): Promise<string> {
  if (plaintext.startsWith(PREFIX)) return plaintext; // idempotent
  const dek = randomBytes(32);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const wrappedKey = await hsmEncrypt(dek.toString('base64'));
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}:${wrappedKey}`;
}

export async function decryptField(stored: string): Promise<string> {
  if (!stored.startsWith(PREFIX)) return stored;
  const [, ivB64, tagB64, ctB64, wrappedKey] = stored.split(':');
  if (!ivB64 || !tagB64 || !ctB64 || !wrappedKey)
    throw new ApiError('DB_ENC_MALFORMED', 'Malformed encrypted field.');
  const dekB64 = await hsmDecrypt(wrappedKey);
  const dek = Buffer.from(dekB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', dek, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}

/** Convenience: encrypt a single column value if present. */
export async function encryptIfPresent(value: string | null | undefined): Promise<string | null> {
  if (value == null) return null;
  return encryptField(value);
}
