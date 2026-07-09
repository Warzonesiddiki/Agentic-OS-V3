/**
 * Phase 16 — Webhook receiver utilities.
 * Verifies HMAC-SHA256 signed marketplace/event webhooks and exposes a tiny
 * Express/Hono-agnostic verifier. Compatible with server-side `webhookHmac`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WebhookVerifyOptions {
  secret: string;
  /** Raw request body as a string or Buffer. */
  payload: string | Buffer;
  /** The signature header value (hex). */
  signature: string;
  /** Header name used (informational). Default 'x-nexus-signature'. */
  headerName?: string;
}

/** Constant-time HMAC-SHA256 verification. */
export function verifyWebhookSignature(opts: WebhookVerifyOptions): boolean {
  const expected = createHmac('sha256', opts.secret).update(opts.payload).digest();
  const got = Buffer.from(opts.signature, 'hex');
  if (got.length !== expected.length) return false;
  return timingSafeEqual(expected, got);
}

/** Compute the signature to send when emitting a webhook (server side). */
export function signWebhook(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * High-level helper: parse + verify a webhook in one call.
 * Returns the parsed JSON body, or throws NexusWebhookError on failure.
 */
export class NexusWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NexusWebhookError';
    Object.setPrototypeOf(this, NexusWebhookError.prototype);
  }
}

export function parseVerifiedWebhook<T = unknown>(opts: WebhookVerifyOptions): T {
  if (!verifyWebhookSignature(opts)) {
    throw new NexusWebhookError('webhook signature verification failed');
  }
  try {
    return JSON.parse(opts.payload as string) as T;
  } catch (e) {
    throw new NexusWebhookError(`webhook payload is not valid JSON: ${(e as Error).message}`);
  }
}
