/**
 * Artisan — Phase 16 SDK test.
 * Webhook HMAC-SHA256 sign/verify round-trip using the SDK's own exports.
 */
import { describe, it, expect } from 'vitest';
import {
  signWebhook,
  verifyWebhookSignature,
  parseVerifiedWebhook,
  NexusWebhookError,
} from '../src/webhooks.js';

const SECRET = 'super-secret-webhook-key';
const PAYLOAD = JSON.stringify({ event: 'plugin.published', pluginId: 'p1', version: '1.0.0' });

describe('webhook HMAC round-trip', () => {
  it('verifyWebhookSignature returns true for a correctly signed payload', () => {
    const sig = signWebhook(SECRET, PAYLOAD);
    expect(verifyWebhookSignature({ secret: SECRET, payload: PAYLOAD, signature: sig })).toBe(true);
  });

  it('returns false when the payload is tampered', () => {
    const sig = signWebhook(SECRET, PAYLOAD);
    const tampered = PAYLOAD.replace('p1', 'p2');
    expect(verifyWebhookSignature({ secret: SECRET, payload: tampered, signature: sig })).toBe(false);
  });

  it('returns false when the signature is wrong', () => {
    const wrong = signWebhook('different-secret', PAYLOAD);
    expect(verifyWebhookSignature({ secret: SECRET, payload: PAYLOAD, signature: wrong })).toBe(false);
  });

  it('is constant-time safe (length mismatch returns false without throwing)', () => {
    expect(
      verifyWebhookSignature({ secret: SECRET, payload: PAYLOAD, signature: 'deadbeef' })
    ).toBe(false);
  });

  it('parseVerifiedWebhook returns the parsed body on a valid signature', () => {
    const sig = signWebhook(SECRET, PAYLOAD);
    const parsed = parseVerifiedWebhook<{ event: string; pluginId: string }>({
      secret: SECRET,
      payload: PAYLOAD,
      signature: sig,
    });
    expect(parsed.event).toBe('plugin.published');
    expect(parsed.pluginId).toBe('p1');
  });

  it('parseVerifiedWebhook throws NexusWebhookError on bad signature', () => {
    const sig = signWebhook('nope', PAYLOAD);
    expect(() =>
      parseVerifiedWebhook({ secret: SECRET, payload: PAYLOAD, signature: sig })
    ).toThrow(NexusWebhookError);
  });

  it('parseVerifiedWebhook throws NexusWebhookError on non-JSON payload', () => {
    const sig = signWebhook(SECRET, 'not json');
    expect(() =>
      parseVerifiedWebhook({ secret: SECRET, payload: 'not json', signature: sig })
    ).toThrow(/valid JSON/);
  });
});
