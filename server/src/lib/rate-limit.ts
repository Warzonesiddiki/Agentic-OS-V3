import { env } from "./env.js";

interface RateLimitResult { allowed: boolean; remaining: number; resetMs: number; }

const WINDOW_MS = 60_000;

/**
 * Return the max tokens per window for a given route type.
 * SSE and REST have independent configurable budgets so aggressive SSE
 * reconnection cannot starve REST requests from the same IP.
 */
function maxTokens(route?: string): number {
  if (route === 'sse') return Number(env.NEXUS_RATE_LIMIT_SSE_PER_MINUTE) || 1200;
  return Number(env.NEXUS_RATE_LIMIT_PER_MINUTE) || 60;
}

// ── Memory-safe bucket store ────────────────────────────────────
// Prevents OOM from rotating-IP DoS: stale entries are evicted
// periodically and the Map is capped at MAX_BUCKETS entries.
const buckets = new Map<string, { tokens: number; lastRefill: number }>();
const MAX_BUCKETS = 10_000;
const CLEANUP_INTERVAL_MS = 120_000; // 2 minutes
const STALE_THRESHOLD_MS = 2 * WINDOW_MS; // 2 windows without activity

// Periodic cleanup of stale entries — unref so it doesn't keep the
// process alive during shutdown.
setInterval(() => {
  const now = Date.now();
  buckets.forEach((bucket, key) => {
    if (now - bucket.lastRefill >= STALE_THRESHOLD_MS) {
      buckets.delete(key);
    }
  });
}, CLEANUP_INTERVAL_MS).unref();

export function clientIpFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  fallback?: string
): string {
  // Only trust X-Forwarded-For when NEXUS_TRUST_PROXY=true.
  // Without this gate, any client can forge the header and bypass per-IP rate limits.
  if (env.NEXUS_TRUST_PROXY) {
    const xff = headers['x-forwarded-for'];
    if (typeof xff === 'string') {
      const first = xff.split(',')[0];
      if (first) return first.trim();
    }
    if (Array.isArray(xff)) {
      const first = xff[0];
      if (first) {
        const sub = first.split(',')[0];
        if (sub) return sub.trim();
      }
    }
  }
  return fallback ?? 'unknown';
}

export async function consume(key: string, route?: string): Promise<RateLimitResult> {
  const now = Date.now();
  // Use a prefixed bucket key to keep SSE and REST rate limits independent.
  const bucketKey = route === 'sse' ? `sse:${key}` : `rest:${key}`;
  const limit = maxTokens(route);
  let bucket = buckets.get(bucketKey);
  if (!bucket || now - bucket.lastRefill >= WINDOW_MS) {
    // Enforce max capacity: evict the oldest entry when at cap.
    if (buckets.size >= MAX_BUCKETS) {
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      buckets.forEach((b, k) => {
        if (b.lastRefill < oldestTime) {
          oldestTime = b.lastRefill;
          oldestKey = k;
        }
      });
      if (oldestKey) buckets.delete(oldestKey);
    }
    bucket = { tokens: limit, lastRefill: now };
    buckets.set(bucketKey, bucket);
  }
  const allowed = bucket.tokens > 0;
  if (allowed) bucket.tokens--;
  return { allowed, remaining: bucket.tokens, resetMs: WINDOW_MS - (now - bucket.lastRefill) };
}

export async function consumePrincipal(principalId: string, route?: string): Promise<RateLimitResult> {
  const PRINCIPAL_LIMIT_MULTIPLIER = 5;
  const baseLimit = maxTokens(route);
  const limit = PRINCIPAL_LIMIT_MULTIPLIER * baseLimit;
  const now = Date.now();
  const bucketKey = route === 'sse' ? `principal:sse:${principalId}` : `principal:rest:${principalId}`;
  
  let bucket = buckets.get(bucketKey);
  if (!bucket || now - bucket.lastRefill >= WINDOW_MS) {
    if (buckets.size >= MAX_BUCKETS) {
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      buckets.forEach((b, k) => {
        if (b.lastRefill < oldestTime) {
          oldestTime = b.lastRefill;
          oldestKey = k;
        }
      });
      if (oldestKey) buckets.delete(oldestKey);
    }
    bucket = { tokens: limit, lastRefill: now };
    buckets.set(bucketKey, bucket);
  }
  const allowed = bucket.tokens > 0;
  if (allowed) bucket.tokens--;
  return { allowed, remaining: bucket.tokens, resetMs: WINDOW_MS - (now - bucket.lastRefill) };
}
