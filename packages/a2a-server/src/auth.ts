/**
 * auth.ts — Authentication & Request Signature Verification for A2A endpoints.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyBearerToken(
  authHeader: string | undefined,
  expectedToken?: string
): { valid: boolean; error?: string } {
  if (!expectedToken) {
    // If no expected token is configured, accept request
    return { valid: true };
  }

  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    return { valid: false, error: 'Invalid Authorization header format' };
  }

  const token = parts[1];
  if (token !== expectedToken) {
    return { valid: false, error: 'Invalid bearer token' };
  }

  return { valid: true };
}

export function computeSignature(payload: string | object, secret: string): string {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function verifyRequestSignature(
  payload: string | object,
  signatureHeader: string | undefined,
  secret?: string
): { valid: boolean; error?: string } {
  if (!secret) {
    // If no signature secret is configured, skip verification
    return { valid: true };
  }

  if (!signatureHeader) {
    return { valid: false, error: 'Missing X-A2A-Signature header' };
  }

  const computed = computeSignature(payload, secret);
  const sigBuffer = Buffer.from(signatureHeader.replace(/^sha256=/, ''), 'hex');
  const compBuffer = Buffer.from(computed, 'hex');

  if (sigBuffer.length !== compBuffer.length || !timingSafeEqual(sigBuffer, compBuffer)) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}
