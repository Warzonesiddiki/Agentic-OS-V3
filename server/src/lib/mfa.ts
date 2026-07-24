/**
 * mfa.ts — TOTP second factor for high-ring (Ring 0-1) operations.
 *
 * Uses HMAC-based OTP (RFC 6238) with a shared secret per principal. One-time
 * backup codes are stored pre-hashed (sha256) and consumed once.
 */
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { ApiError } from './errors.js';

const STEP_SECONDS = 30;
const WINDOW = 1; // +/- 1 step clock drift tolerance

export interface MfaSecret {
  principalId: string;
  secret: string; // base32-ish raw bytes (hex here)
}

export function generateSecret(principalId: string): MfaSecret {
  return { principalId, secret: randomBytes(20).toString('hex') };
}

function hotp(secretHex: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', Buffer.from(secretHex, 'hex')).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (code % 1_000_000).toString().padStart(6, '0');
}

export function verifyTotp(secretHex: string, token: string, now: number = Date.now()): boolean {
  // Validate shape before timingSafeEqual: Node throws if buffer lengths differ,
  // which would turn malformed attacker input into a 500 instead of a denial.
  if (!/^\d{6}$/.test(token)) return false;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  for (let w = -WINDOW; w <= WINDOW; w++) {
    if (
      timingSafeEqual(
        Buffer.from(hotp(secretHex, counter + w)),
        Buffer.from(token.padStart(6, '0'))
      )
    )
      return true;
  }
  return false;
}

export function requireMfa(
  secretHex: string | null,
  token: string | undefined,
  ring: number
): void {
  if (ring > 1) return; // Only Ring 0-1 require MFA
  if (!secretHex || !token)
    throw new ApiError('MFA_REQUIRED', 'Ring 0-1 operation requires an MFA TOTP token.');
  if (!verifyTotp(secretHex, token)) throw new ApiError('MFA_INVALID', 'MFA token rejected.');
}

export function generateBackupCodes(count = 10): { plain: string[]; hashes: string[] } {
  const plain: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = randomBytes(6).toString('hex').toUpperCase();
    plain.push(code);
    hashes.push(createHash('sha256').update(code).digest('hex'));
  }
  return { plain, hashes };
}

export function consumeBackupCode(code: string, storedHashes: string[]): boolean {
  const h = createHash('sha256').update(code.toUpperCase()).digest('hex');
  return storedHashes.includes(h);
}
