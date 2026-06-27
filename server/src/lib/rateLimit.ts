import { env } from "./env.js";
import { log } from "./logging.js";

export interface RateResult {
  allowed: boolean;
  remaining: number;
}

interface BucketBackend {
  consume(key: string, cap: number): Promise<RateResult>;
}

// ── Memory backend (default) ────────────────────────────────

const MAX_BUCKETS = 10_000;
const buckets = new Map<string, { tokens: number; last: number }>();

const memoryBackend: BucketBackend = {
  async consume(nsKey: string, cap: number): Promise<RateResult> {
    const now = Date.now();
    let b = buckets.get(nsKey);
    if (!b) {
      if (buckets.size >= MAX_BUCKETS) {
        const oldest = buckets.keys().next().value;
        if (oldest) buckets.delete(oldest);
      }
      b = { tokens: cap, last: now };
      buckets.set(nsKey, b);
    }
    b.tokens = Math.min(cap, b.tokens + ((now - b.last) / 60000) * cap);
    b.last = now;
    if (b.tokens < 1) return { allowed: false, remaining: 0 };
    b.tokens -= 1;
    return { allowed: true, remaining: b.tokens };
  },
};

// ── Redis backend (multi-instance) ──────────────────────────

let _redisBackend: BucketBackend | null = null;

async function getRedisBackend(): Promise<BucketBackend | null> {
  if (_redisBackend) return _redisBackend;
  try {
    const { Redis } = await import("ioredis");
    const client = new Redis(env.NEXUS_REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    await client.connect();
    _redisBackend = {
      async consume(nsKey: string, cap: number): Promise<RateResult> {
        const now = Date.now();
        const windowMs = 60000;
        const key = `rl:${nsKey}`;
        const val = await client.get(key);
        if (!val) {
          await client.set(key, String(cap - 1), "PX", windowMs);
          return { allowed: true, remaining: cap - 1 };
        }
        const tokens = Number(val);
        if (tokens < 1) return { allowed: false, remaining: 0 };
        await client.decr(key);
        return { allowed: true, remaining: tokens - 1 };
      },
    };
    return _redisBackend;
  } catch {
    log.warn("redis_rate_limit_unavailable", { msg: "Falling back to memory rate limiter" });
    return null;
  }
}

// ── Backend selection ───────────────────────────────────────

let _backend: BucketBackend | null = null;

async function getBackend(): Promise<BucketBackend> {
  if (_backend) return _backend;
  if (env.NEXUS_BUS_BACKEND === "redis") {
    const rb = await getRedisBackend();
    if (rb) {
      _backend = rb;
      return _backend;
    }
  }
  _backend = memoryBackend;
  return _backend;
}

/** Reset backend cache (for tests). */
export function resetRateLimiter(): void {
  _backend = null;
  _redisBackend = null;
  buckets.clear();
}

/** Consume one token for `key`. Returns whether it was allowed. */
export async function consume(key: string, namespace?: string): Promise<RateResult> {
  const nsKey = namespace ? `${namespace}:${key}` : key;
  const cap = env.NEXUS_RATE_LIMIT_PER_MINUTE;
  const backend = await getBackend();
  const result = await backend.consume(nsKey, cap);
  if (!result.allowed) {
    log.warn("rate_limited", { key, namespace });
  }
  return result;
}

/** Trust X-Forwarded-For only behind a configured proxy; else use socket addr. */
export function clientIpFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress: string | undefined,
): string {
  if (env.NEXUS_TRUST_PROXY) {
    const raw = headers["x-forwarded-for"];
    const xff = Array.isArray(raw) ? raw[0] : raw;
    if (xff) return xff.split(",")[0]!.trim();
  }
  return remoteAddress ?? "anon";
}
