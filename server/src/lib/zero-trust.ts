/**
 * zero-trust.ts — every internal/external request carries an attestation token
 * (principal_id, ring, scope, nonce). Every hop re-verifies the token before
 * acting on the request. Tampering yields ZERO_TRUST_FAILURE.
 *
 * Implements a minimal HS256 JWT (header.payload.signature) with node:crypto so no
 * external JWT dependency is required.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';
import { getEnv } from './env.js';

const ZT_SECRET = () =>
  (getEnv().ZERO_TRUST_SECRET as string | undefined) || 'insecure-dev-zero-trust-secret-change-me';
const B64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export interface AttestationClaims {
  principalId: string;
  ring: number;
  scope: string[];
  nonce: string;
  iss: 'nexus-zt';
  exp: number;
}

export interface AttestationInput {
  principalId: string;
  ring: number;
  scope: string[];
}

function sign(data: string, secret: string): string {
  return B64(createHmac('sha256', secret).update(data).digest());
}

export function issueAttestation(input: AttestationInput): string {
  const nonce = randomBytes(16).toString('hex');
  const header = B64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims: AttestationClaims = {
    principalId: input.principalId,
    ring: input.ring,
    scope: input.scope,
    nonce,
    iss: 'nexus-zt',
    exp: Date.now() + 5 * 60_000,
  };
  const payload = B64(JSON.stringify(claims));
  const sig = sign(`${header}.${payload}`, ZT_SECRET());
  return `${header}.${payload}.${sig}`;
}

export function verifyAttestation(token: string): AttestationClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new ApiError('ZERO_TRUST_FAILURE', 'Malformed attestation token.');
  const [header, payload, sig] = parts;
  const expected = sign(`${header}.${payload}`, ZT_SECRET());
  const a = Buffer.from(sig!);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ApiError('ZERO_TRUST_FAILURE', 'Attestation token signature verification failed.');
  }
  let claims: AttestationClaims;
  try {
    claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as AttestationClaims;
  } catch {
    throw new ApiError('ZERO_TRUST_FAILURE', 'Attestation token payload unreadable.');
  }
  if (
    claims.iss !== 'nexus-zt' ||
    !claims.principalId ||
    typeof claims.ring !== 'number' ||
    !Array.isArray(claims.scope)
  ) {
    throw new ApiError(
      'ZERO_TRUST_FAILURE',
      'ZERO_TRUST_FAILURE: attestation token missing required claims.',
    );
  }
  if (claims.exp < Date.now())
    throw new ApiError('ZERO_TRUST_FAILURE', 'Attestation token expired.');
  if (claims.nonce.length < 16)
    throw new ApiError('ZERO_TRUST_FAILURE', 'Attestation nonce too weak.');
  return claims;
}

/** Verify and authorize against required scopes. Throws ZERO_TRUST_FORBIDDEN on gap. */
export function authorize(token: string, required: string[]): AttestationClaims {
  const claims = verifyAttestation(token);
  const have = new Set(claims.scope);
  const missing = required.filter((s) => !have.has(s));
  if (missing.length)
    throw new ApiError('ZERO_TRUST_FORBIDDEN', 'Missing required scope(s): ' + missing.join(', '));
  return claims;
}

export function peekClaims(token: string): Partial<AttestationClaims> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf8')
    ) as Partial<AttestationClaims>;
  } catch {
    return null;
  }
}
