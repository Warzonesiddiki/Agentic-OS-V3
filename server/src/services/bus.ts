/**
 * services/bus.ts — Distributed Event Bus (memory or Redis).
 *
 * Provides a unified pub/sub interface for SSE streaming and inter-instance
 * communication. Supports two backends:
 *   - memory: in-process Set (no external deps, single-instance only)
 *   - redis: Redis pub/sub (multi-instance, requires ioredis)
 *
 * The rest of the system imports `broadcastSSE` and `addSSEClient` from here
 * instead of `sse.ts`. The backend is chosen at boot via NEXUS_BUS_BACKEND.
 */
import { getEnv } from "../lib/env.js";
import { log } from "../lib/logging.js";
import type { SSEEvent, SSEWriter } from "./sse.js";
import { addSSEClient as addMemClient, broadcastSSE as memBroadcast, getSSEClientCount as memClientCount } from "./sse.js";

// ── Backend Interface ─────────────────────────────────────────

export interface BusBackend {
  publish(event: SSEEvent): void;
  getClientCount(): number;
  registerClient(writer: SSEWriter): () => void;
}

// ── Memory Backend (default) ──────────────────────────────────

const memoryBackend: BusBackend = {
  publish: (event) => memBroadcast(event),
  getClientCount: () => memClientCount(),
  registerClient: (writer) => addMemClient(writer),
};

// ── Redis Backend ─────────────────────────────────────────────

let _redisBackend: BusBackend | null = null;

async function getRedisBackend(): Promise<BusBackend> {
  if (_redisBackend) return _redisBackend;

  let Redis: typeof import("ioredis").Redis;
  try {
    Redis = (await import("ioredis")).Redis;
  } catch {
    log.warn("redis_not_available", { fix: "npm install ioredis" });
    return memoryBackend;
  }
  const env = getEnv();
  const CHANNEL = "nexus:events";

  const pub = new Redis(env.NEXUS_REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => Math.min(times * 200, 3000),
    lazyConnect: false,
  });

  const sub = new Redis(env.NEXUS_REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => Math.min(times * 200, 3000),
    lazyConnect: false,
  });

  // Track connected writers by client ID
  const writers = new Map<string, SSEWriter>();
  let seq = 0;

  sub.on("message", (_channel: string, message: string) => {
    try {
      const payload = `data: ${message}\n\n`;
      for (const [id, writer] of writers) {
        try {
          writer.write(payload);
        } catch {
          writers.delete(id);
        }
      }
    } catch {
      // malformed message — skip
    }
  });

  await sub.subscribe(CHANNEL);
  log.info("redis_bus_connected", { channel: CHANNEL });

  _redisBackend = {
    publish(event: SSEEvent): void {
      const msg = JSON.stringify(event);
      pub.publish(CHANNEL, msg).catch((e: Error) => {
        log.error("redis_bus_publish_failed", { error: e.message });
      });
    },

    getClientCount(): number {
      return writers.size;
    },

    registerClient(writer: SSEWriter): () => void {
      const id = `sse_${++seq}`;
      writer.write(`data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}\n\n`);
      writers.set(id, writer);
      return () => {
        writers.delete(id);
        try { writer.close(); } catch { /* already closed */ }
      };
    },
  };

  return _redisBackend;
}

// ── Factory ───────────────────────────────────────────────────

let _backend: BusBackend = memoryBackend;

export async function initBus(): Promise<void> {
  const env = getEnv();
  if (env.NEXUS_BUS_BACKEND === "redis") {
    _backend = await getRedisBackend();
    log.info("bus_initialized", { backend: "redis", url: env.NEXUS_REDIS_URL.replace(/\/\/.*@/, "//***@") });
  } else {
    _backend = memoryBackend;
    log.info("bus_initialized", { backend: "memory" });
  }
}

export function getBusBackend(): BusBackend {
  return _backend;
}

// ── Compat exports (same signatures as sse.ts) ────────────────

export function broadcastSSE(event: SSEEvent): void {
  _backend.publish(event);
}

export function addSSEClient(writer: SSEWriter): () => void {
  return _backend.registerClient(writer);
}

export function getSSEClientCount(): number {
  return _backend.getClientCount();
}
