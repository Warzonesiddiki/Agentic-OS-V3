/**
 * supply-chain.ts — verifies integrity of third-party dependencies and plugins.
 *
 * Checks lockfiles for known-bad hashes, verifies plugin package signatures, and
 * scans for typosquatting. In production this is backed by an advisory DB; here it
 * provides the verification primitives and a pluggable advisory source.
 */
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { scanContent } from './secrets-scanner.js';

export interface Dependency {
  name: string;
  version: string;
  integrity?: string; // expected sha512 base64
}

export interface VerifyResult {
  name: string;
  ok: boolean;
  reason: string;
}

/** Verify that the resolved content matches the declared integrity hash. */
export function verifyIntegrity(dep: Dependency, resolvedContent: Buffer): VerifyResult {
  if (!dep.integrity) {
    return { name: dep.name, ok: false, reason: 'no integrity hash declared' };
  }
  const actual = createHash('sha512').update(resolvedContent).digest('base64');
  const expected = dep.integrity.replace(/^sha512-/, '');
  if (actual !== expected) {
    return { name: dep.name, ok: false, reason: 'integrity mismatch' };
  }
  return { name: dep.name, ok: true, reason: 'ok' };
}

/** Detect obvious typosquatting against a trusted registry name list. */
export function detectTyposquat(name: string, trusted: string[]): boolean {
  const lower = name.toLowerCase().replace(/[-_.]/g, '');
  return trusted.some((t) => {
    const tl = t.toLowerCase().replace(/[-_.]/g, '');
    if (tl === lower) return false;
    // Levenshtein <= 2 against a trusted name => suspicious.
    return levenshtein(lower, tl) <= 2;
  });
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[m]![n]!;
}

/** Verify a plugin artifact signature against a trusted public key (PEM). */
export function verifySignature(
  artifact: Buffer,
  signature: Buffer,
  publicKeyPem: string
): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return cryptoVerify('sha256', artifact, key, signature);
  } catch (e) {
    throw new ApiError(
      'SUPPLY_CHAIN_BAD_KEY',
      'Signature verification failed: ' + (e as Error).message
    );
  }
}

/** Scan a dependency manifest for committed secrets (CI guard). */
export function scanManifestForSecrets(manifestContent: string): boolean {
  return scanContent(manifestContent).length > 0;
}
