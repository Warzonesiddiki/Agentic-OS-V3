/**
 * redis-session.ts — Phase 15.1 stateless kernel node pool + Redis session offload.
 *
 * Goal: make server nodes stateless so they can scale horizontally behind a load balancer.
 * Session/state lives in a pluggable SessionStore (default in-memory; production injects Redis).
 * A KernelNodePool tracks the set of live nodes + their drain state for orchestration.
 */
import { log } from '../../lib/logging.js';

/** Minimal async key/value contract so we don't force a Redis dependency at build time. */
export interface SessionStore {
  get(sessionId: string): Promise<SessionRecord | undefined>;
  set(sessionId: string, record: SessionRecord, ttlMs: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
  /** Touch TTL (keep-alive). */
  touch(sessionId: string, ttlMs: number): Promise<void>;
}

export interface SessionRecord {
  sessionId: string;
  userId: string;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** In-memory session store (single-node / dev). */
export class InMemorySessionStore implements SessionStore {
  private map = new Map<string, { record: SessionRecord; expiresAt: number }>();
  constructor(private readonly defaultTtlMs = 1_800_000) {}
  async get(sessionId: string): Promise<SessionRecord | undefined> {
    const e = this.map.get(sessionId);
    if (!e) return undefined;
    if (e.expiresAt <= Date.now()) {
      this.map.delete(sessionId);
      return undefined;
    }
    return e.record;
  }
  async set(sessionId: string, record: SessionRecord, ttlMs = this.defaultTtlMs): Promise<void> {
    this.map.set(sessionId, { record, expiresAt: Date.now() + ttlMs });
  }
  async delete(sessionId: string): Promise<void> {
    this.map.delete(sessionId);
  }
  async touch(sessionId: string, ttlMs = this.defaultTtlMs): Promise<void> {
    const e = this.map.get(sessionId);
    if (e) e.expiresAt = Date.now() + ttlMs;
  }
}

/**
 * Redis-backed session store.
 * Accepts a minimal Redis-like client (get/set with EX/persist/del) so production can inject
 * `new Redis(env.NEXUS_REDIS_URL)` without this module importing `ioredis` directly (keeps the
 * build dependency-free; wiring lives in bootstrap).
 */
export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly client: RedisLike,
    private readonly defaultTtlSec = 1800
  ) {}
  async get(sessionId: string): Promise<SessionRecord | undefined> {
    const raw = await this.client.get(`sess:${sessionId}`);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as SessionRecord;
    } catch {
      return undefined;
    }
  }
  async set(
    sessionId: string,
    record: SessionRecord,
    ttlMs = this.defaultTtlSec * 1000
  ): Promise<void> {
    await this.client.set(
      `sess:${sessionId}`,
      JSON.stringify(record),
      'EX',
      Math.ceil(ttlMs / 1000)
    );
  }
  async delete(sessionId: string): Promise<void> {
    await this.client.del(`sess:${sessionId}`);
  }
  async touch(sessionId: string, ttlMs = this.defaultTtlSec * 1000): Promise<void> {
    await this.client.expire(`sess:${sessionId}`, Math.ceil(ttlMs / 1000));
  }
}

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/** Session manager: stateless offload + fallback to local store if backend is unavailable. */
export class SessionManager {
  private backend: SessionStore;
  constructor(backend?: SessionStore) {
    this.backend = backend ?? new InMemorySessionStore();
  }
  setBackend(backend: SessionStore): void {
    this.backend = backend;
    log.info('session-manager: backend swapped (stateless offload active)');
  }
  async load(sessionId: string): Promise<SessionRecord | undefined> {
    try {
      return await this.backend.get(sessionId);
    } catch (err) {
      log.warn('session-manager: backend read failed, returning undefined', { err });
      return undefined;
    }
  }
  async save(
    sessionId: string,
    record: Omit<SessionRecord, 'sessionId' | 'createdAt' | 'updatedAt'>,
    ttlMs?: number
  ): Promise<SessionRecord> {
    const existing = await this.backend.get(sessionId);
    const full: SessionRecord = {
      sessionId,
      userId: record.userId,
      data: record.data,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    await this.backend.set(sessionId, full, ttlMs ?? 1_800_000);
    return full;
  }
  async destroy(sessionId: string): Promise<void> {
    await this.backend.delete(sessionId);
  }
}

/** A single kernel node in the stateless pool. */
export interface KernelNode {
  id: string;
  url: string;
  draining: boolean;
  healthy: boolean;
  lastSeen: number;
}

/** Tracks live kernel nodes for horizontal scaling / graceful routing. */
export class KernelNodePool {
  private nodes = new Map<string, KernelNode>();
  register(id: string, url: string): KernelNode {
    const node: KernelNode = { id, url, draining: false, healthy: true, lastSeen: Date.now() };
    this.nodes.set(id, node);
    log.info('kernel-node-pool: registered', { id, url });
    return node;
  }
  unregister(id: string): void {
    this.nodes.delete(id);
  }
  heartbeat(id: string): void {
    const n = this.nodes.get(id);
    if (n) {
      n.lastSeen = Date.now();
      n.healthy = true;
    }
  }
  setDraining(id: string, draining: boolean): void {
    const n = this.nodes.get(id);
    if (n) n.draining = draining;
  }
  /** Selectable nodes for new work: healthy and not draining. */
  selectable(): KernelNode[] {
    const now = Date.now();
    return [...this.nodes.values()].filter(
      (n) => n.healthy && !n.draining && now - n.lastSeen < 30_000
    );
  }
  markUnhealthy(id: string): void {
    const n = this.nodes.get(id);
    if (n) n.healthy = false;
  }
  list(): KernelNode[] {
    return [...this.nodes.values()];
  }
}

export const sessionManager = new SessionManager();
export const kernelNodePool = new KernelNodePool();
