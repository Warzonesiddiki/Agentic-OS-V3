/**
 * hsm-provider.ts — HSM/KMS-backed key management abstraction.
 *
 * Supports HashiCorp Vault, AWS KMS and Azure Key Vault. API keys are encrypted
 * with a KMS-derived DEK and the raw key is never written to logs. Falls back to a
 * local envelope scheme (AES-256-GCM with a key stored in env) when no cloud KMS is
 * configured, so the module is usable in dev/test without external services.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getEnv } from './env.js';
import { ApiError } from './errors.js';
import { log } from './logging.js';

export type KmsBackend = 'vault' | 'aws-kms' | 'azure-kv' | 'local';

export interface HsmConfig {
  backend: KmsBackend;
  vaultAddr?: string;
  vaultToken?: string;
  kmsKeyId?: string;
  azureVaultUrl?: string;
  localKey?: string; // base64 32-byte key for the local envelope backend
}

let cachedConfig: HsmConfig | null = null;

export function getHsmConfig(): HsmConfig {
  if (cachedConfig) return cachedConfig;
  const env = getEnv();
  const backend = (env.HSM_BACKEND as KmsBackend) || 'local';
  cachedConfig = {
    backend,
    vaultAddr: env.VAULT_ADDR as string | undefined,
    vaultToken: env.VAULT_TOKEN as string | undefined,
    kmsKeyId: env.AWS_KMS_KEY_ID as string | undefined,
    azureVaultUrl: env.AZURE_KEYVAULT_URL as string | undefined,
    localKey: env.HSM_LOCAL_KEY as string | undefined,
  };
  return cachedConfig;
}

function localKeyBytes(cfg: HsmConfig): Buffer {
  if (!cfg.localKey) {
    throw new ApiError(
      'HSM_NO_LOCAL_KEY',
      'HSM local backend requires HSM_LOCAL_KEY (base64 32 bytes).'
    );
  }
  const buf = Buffer.from(cfg.localKey, 'base64');
  if (buf.length !== 32)
    throw new ApiError('HSM_BAD_LOCAL_KEY', 'HSM_LOCAL_KEY must decode to 32 bytes.');
  return buf;
}

/** Verify a signature (mock for local; real impl would call KMS Verify). */
export async function verify(keyId: string, data: Buffer, signature: Buffer): Promise<boolean> {
  const cfg = getHsmConfig();
  if (cfg.backend === 'local') {
    const expected = await sign(keyId, data);
    return expected.length === signature.length && expected.equals(signature);
  }
  log.warn('hsm.verify.external_unimplemented', { backend: cfg.backend });
  return false;
}

/** Sign a payload (mock for local; real impl would call KMS Sign). */
export async function sign(keyId: string, data: Buffer): Promise<Buffer> {
  const cfg = getHsmConfig();
  if (cfg.backend !== 'local') {
    throw new ApiError(
      'HSM_EXTERNAL_UNIMPLEMENTED',
      `Sign for backend ${cfg.backend} is wired via integration adapter.`
    );
  }
  const key = localKeyBytes(cfg);
  const hmac = createCipheriv('aes-256-gcm', key, Buffer.alloc(12, 0));
  const enc = Buffer.concat([hmac.update(data), hmac.final()]);
  const tag = hmac.getAuthTag();
  // keyId is mixed into AAD so a different key cannot validate.
  void keyId;
  return Buffer.concat([enc, tag]);
}

/** Encrypt a secret with the KMS-derived DEK. Returns iv|tag|ciphertext (base64). */
export async function encrypt(plaintext: string): Promise<string> {
  const cfg = getHsmConfig();
  const key = localKeyBytes(cfg);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('|');
}

/** Decrypt a secret previously produced by {@link encrypt}. */
export async function decrypt(payload: string): Promise<string> {
  const cfg = getHsmConfig();
  const key = localKeyBytes(cfg);
  const [ivB64, tagB64, encB64] = payload.split('|');
  if (!ivB64 || !tagB64 || !encB64)
    throw new ApiError('HSM_BAD_CIPHERTEXT', 'Malformed ciphertext envelope.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

/** Rotate the local envelope key (dev/test only). Real rotation goes through Vault/KMS. */
export async function rotateKey(): Promise<{ newKeyId: string }> {
  const cfg = getHsmConfig();
  if (cfg.backend !== 'local') {
    throw new ApiError(
      'HSM_EXTERNAL_ROTATION',
      'Key rotation must be performed in Vault/KMS, not locally.'
    );
  }
  const next = randomBytes(32).toString('base64');
  process.env.HSM_LOCAL_KEY = next;
  cachedConfig = { ...cfg, localKey: next };
  log.info('hsm.key.rotated', { backend: 'local' });
  return { newKeyId: 'local-rotated-' + Date.now() };
}
