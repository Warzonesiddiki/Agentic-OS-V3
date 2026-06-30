import { env } from "./env.js";

interface RateLimitResult { allowed: boolean; remaining: number; resetMs: number; }

const buckets = new Map<string, { tokens: number; lastRefill: number }>();
const WINDOW_MS = 60_000;
const MAX_TOKENS = () => Number(env.NEXUS_RATE_LIMIT_PER_MINUTE) || 60;

export function clientIpFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  fallback?: string
): string {
  const xff = headers["x-forwarded-for"];
  if (typeof xff === "string") {
    const first = xff.split(",")[0];
    if (first) return first.trim();
  }
  if (Array.isArray(xff)) {
    const first = xff[0];
    if (first) {
      const sub = first.split(",")[0];
      if (sub) return sub.trim();
    }
  }
  return fallback ?? "unknown";
}

export async function consume(key: string, _route?: string): Promise<RateLimitResult> {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.lastRefill >= WINDOW_MS) {
    bucket = { tokens: MAX_TOKENS(), lastRefill: now };
    buckets.set(key, bucket);
  }
  const allowed = bucket.tokens > 0;
  if (allowed) bucket.tokens--;
  return { allowed, remaining: bucket.tokens, resetMs: WINDOW_MS - (now - bucket.lastRefill) };
}
