/**
 * Pure, dependency-free crypto helpers for the marketplace (Phase 19).
 * Uses Node built-in `node:crypto` (ed25519 + HMAC) — no external deps.
 * Safe to import in tests without a database.
 */
import { createHash, createHmac, sign as ecSign, verify as ecVerify } from 'node:crypto';

export function sha256Hex(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Sign an artifact digest (sha256 hex) with an ed25519 private key (PEM). */
export function signArtifactEd25519(privateKeyPem: string, artifactSha256Hex: string): string {
  const sig = ecSign(null, Buffer.from(artifactSha256Hex, 'utf8'), {
    key: privateKeyPem,
    dsaEncoding: 'der',
  });
  return sig.toString('base64');
}

/** Verify an ed25519 signature over the artifact digest. */
export function verifyArtifactEd25519(
  pubkeyPem: string,
  artifactSha256Hex: string,
  signatureB64: string
): boolean {
  try {
    return ecVerify(
      null,
      Buffer.from(artifactSha256Hex, 'utf8'),
      { key: pubkeyPem },
      Buffer.from(signatureB64, 'base64')
    );
  } catch {
    return false;
  }
}

/** HMAC-SHA256 webhook signature for outbound marketplace events. */
export function webhookHmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export interface ReceiptInput {
  pluginId: string;
  versionId: string;
  tenantId: string;
  actorId: string;
  action: 'install' | 'upgrade' | 'uninstall' | 'publish' | 'review';
  timestamp: string;
  prevReceiptHash?: string | null;
}

/**
 * Deterministic receipt hash (Merkle-ready leaf) for an install/version.
 * Chained with a previous receipt to form an append-only log.
 */
export function receiptHash(inputs: ReceiptInput): string {
  const canon = [
    inputs.pluginId,
    inputs.versionId,
    inputs.tenantId,
    inputs.actorId,
    inputs.action,
    inputs.timestamp,
    inputs.prevReceiptHash ?? '',
  ].join('|');
  return sha256Hex(canon);
}
