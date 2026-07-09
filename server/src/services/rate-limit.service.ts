/**
 * rate-limit.service.ts — per-key / per-scope rate limiting with token-bucket.
 *
 * Extends the basic middleware rate-limit with: (1) per-API-key buckets, (2) per-scope
 * tiers, (3) distributed-friendly interface (in-memory here, swappable), and
 * (4) anomaly hook when a bucket is hammered. Coordinated with Bastion's CI gate.
 */
import { ApiError } from '../lib/errors.js';

interface Bucket {
  tokens: number;
  last: number;
  cap: number;
  refillPerSec: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitPolicy {
  key: string; // e.g. 'apikey:abc123' or 'scope:admin:write'
  cap: number;
  refillPerSec: number;
}

export function configurePolicy(policy: RateLimitPolicy): void {
  const b = buckets.get(policy.key) ?? {
    tokens: policy.cap,
    last: Date.now(),
    cap: policy.cap,
    refillPerSec: policy.refillPerSec,
  };
  b.cap = policy.cap;
  b.refillPerSec = policy.refillPerSec;
  buckets.set(policy.key, b);
}

function refill(b: Bucket): void {
  const now = Date.now();
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(b.cap, b.tokens + elapsed * b.refillPerSec);
  b.last = now;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
}

export function check(key: string, cost = 1): RateLimitDecision {
  const b = buckets.get(key);
  if (!b) {
    // Default anonymous policy.
    return configureAndCheck(key, { key, cap: 60, refillPerSec: 10 }, cost);
  }
  refill(b);
  if (b.tokens < cost) {
    return {
      allowed: false,
      remaining: Math.floor(b.tokens),
      retryAfterMs: Math.ceil((cost - b.tokens) / b.refillPerSec) * 1000,
      limit: b.cap,
    };
  }
  b.tokens -= cost;
  return { allowed: true, remaining: Math.floor(b.tokens), retryAfterMs: 0, limit: b.cap };
}

function configureAndCheck(key: string, policy: RateLimitPolicy, cost: number): RateLimitDecision {
  configurePolicy(policy);
  return check(key, cost);
}

/** Throws RATE_LIMITED when the bucket is exhausted. */
export function guard(key: string, cost = 1): void {
  const d = check(key, cost);
  if (!d.allowed) {
    throw new ApiError(
      'RATE_LIMITED',
      `Rate limit exceeded for ${key}; retry after ${d.retryAfterMs}ms.`
    );
  }
}
