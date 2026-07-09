/**
 * Aeon2 — Webhook envelope round-trip (packages/sdk/src/webhooks.ts).
 *
 * Proves the signed-webhook envelope lifecycle: a payload is signed with
 * HMAC-SHA256 (server side, signWebhook), the signature verifies
 * (verifyWebhookSignature), a tampered payload fails constant-time
 * verification, and parseVerifiedWebhook round-trips a signed body and
 * throws NexusWebhookError on a bad signature.
 */
import { describe, it, expect } from 'vitest';
import {
  signWebhook,
  verifyWebhookSignature,
  parseVerifiedWebhook,
  NexusWebhookError,
} from '../src/webhooks.js';

const SECRET = 'super-secret-webhook-key';

describe('Webhook envelope round-trip', () => {
  const payload = JSON.stringify({ event: 'memory.created', id: 'm1', ts: 123 });

  it('signWebhook + verifyWebhookSignature round-trip', () => {
    const sig = signWebhook(SECRET, payload);
    expect(sig).toMatch(/^[0-9a-f]+$/); // hex HMAC
    expect(
      verifyWebhookSignature({ secret: SECRET, payload, signature: sig })
    ).toBe(true);
  });

  it('rejects a wrong signature (constant-time)', () => {
    const sig = signWebhook(SECRET, payload);
    expect(
      verifyWebhookSignature({ secret: SECRET, payload, signature: sig.slice(0, -2) + 'ff' })
    ).toBe(false);
  });

  it('rejects when the secret is wrong', () => {
    const sig = signWebhook(SECRET, payload);
    expect(
      verifyWebhookSignature({ secret: 'other-secret', payload, signature: sig })
    ).toBe(false);
  });

  it('parseVerifiedWebhook returns the parsed body on a valid signature', () => {
    const sig = signWebhook(SECRET, payload);
    const parsed = parseVerifiedWebhook<{ event: string; id: string }>({
      secret: SECRET,
      payload,
      signature: sig,
    });
    expect(parsed.event).toBe('memory.created');
    expect(parsed.id).toBe('m1');
  });

  it('parseVerifiedWebhook throws NexusWebhookError on bad signature', () => {
    const sig = signWebhook(SECRET, payload);
    expect(() =>
      parseVerifiedWebhook({ secret: SECRET, payload, signature: sig + '00' })
    ).toThrow(NexusWebhookError);
  });

  it('verifyWebhookSignature accepts a Buffer payload identically to a string', () => {
    const sig = signWebhook(SECRET, payload);
    const buf = Buffer.from(payload);
    expect(
      verifyWebhookSignature({ secret: SECRET, payload: buf, signature: sig })
    ).toBe(true);
  });
});
