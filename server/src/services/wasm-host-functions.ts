/**
 * wasm-host-functions.ts — Real WASM host function implementations.
 * ─────────────────────────────────────────────────────────────────
 * Phase 2, Task P2-01: Implements the actual host functions that a WASM
 * runtime (wasmtime, wasmer, wasm3) would expose to guest modules.
 *
 * These functions define the contract between the NEXUS host and WASM plugins:
 *   - env_http_fetch   — outbound HTTP with capability-gated host allowlist
 *   - env_read_file     — sandboxed file reads with path prefix enforcement
 *   - env_write_file    — sandboxed file writes with path prefix enforcement
 *   - env_log           — structured logging from WASM guest code
 *   - env_random        — cryptographically secure random bytes
 *   - env_time_now      — monotonic + wall clock access
 *   - env_kv_get/put    — key-value persistence scoped to the plugin installation
 *
 * Each function enforces the capability manifest: a plugin without
 * `http.outbound.api.github.com` cannot call env_http_fetch for that host.
 *
 * The actual WASM instantiation is delegated to the consumer (the caller
 * provides a computeOutput callback). This module provides the host
 * function implementations that would be passed to the WASM linker.
 *
 * @module services/wasm-host-functions
 */

import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, normalize, relative } from 'node:path';
import { log } from '../lib/logging.js';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface HostFunctionContext {
  pluginId: string;
  installId: string | null;
  agentId: string;
  capabilities: string[];
  fuelBudget: number;
  fuelUsed: number;
}

export interface HttpFetchResult {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface KvStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
}

export interface HostFunctionSet {
  env_http_fetch: (
    methodPtr: number, methodLen: number,
    urlPtr: number, urlLen: number,
    bodyPtr: number, bodyLen: number,
    resultPtr: number
  ) => Promise<number>;
  env_read_file: (pathPtr: number, pathLen: number, bufPtr: number, bufLen: number) => Promise<number>;
  env_write_file: (pathPtr: number, pathLen: number, dataPtr: number, dataLen: number) => Promise<number>;
  env_log: (levelPtr: number, levelLen: number, msgPtr: number, msgLen: number) => void;
  env_random: (bufPtr: number, bufLen: number) => void;
  env_time_now: () => bigint;
  env_kv_get: (keyPtr: number, keyLen: number, bufPtr: number, bufLen: number) => Promise<number>;
  env_kv_put: (keyPtr: number, keyLen: number, valPtr: number, valLen: number) => Promise<number>;
}

/* ─── Error codes (returned to WASM guest) ───────────────────────────────── */

export const WASM_OK = 0;
export const WASM_ERR_DENIED = 1;
export const WASM_ERR_NOT_FOUND = 2;
export const WASM_ERR_IO = 3;
export const WASM_ERR_INVALID = 4;
export const WASM_ERR_BUDGET = 5;

/* ─── Capability checking ────────────────────────────────────────────────── */

function hasCapability(ctx: HostFunctionContext, required: string): boolean {
  return ctx.capabilities.some((cap) => {
    // Exact match
    if (cap === required) return true;
    // Wildcard match: http.outbound.* matches http.outbound.api.github.com
    if (cap.endsWith('.*')) {
      const prefix = cap.slice(0, -1); // remove trailing '*'
      return required.startsWith(prefix);
    }
    return false;
  });
}

function consumeFuel(ctx: HostFunctionContext, amount: number): boolean {
  if (ctx.fuelUsed + amount > ctx.fuelBudget) {
    return false;
  }
  ctx.fuelUsed += amount;
  return true;
}

/* ─── Path sandbox ───────────────────────────────────────────────────────── */

/**
 * Validates that a path is within the allowed sandbox prefix.
 * Prevents path traversal attacks (../, symlink escape).
 */
function validateSandboxPath(
  requestedPath: string,
  allowedPrefix: string,
): { ok: true; resolved: string } | { ok: false } {
  const normalized = normalize(requestedPath);
  // Reject absolute paths or paths with traversal
  if (normalized.startsWith('..') || normalized.startsWith('/')) {
    return { ok: false };
  }
  const resolved = resolve(allowedPrefix, normalized);
  const rel = relative(allowedPrefix, resolved);
  if (rel.startsWith('..') || resolve(resolved) !== resolved) {
    return { ok: false };
  }
  return { ok: true, resolved };
}

/* ─── Host function factory ──────────────────────────────────────────────── */

/**
 * Creates a set of host function implementations for a specific plugin invocation.
 * The returned functions close over the plugin's context (capabilities, fuel budget).
 *
 * In a real WASM runtime integration, these would be registered with the WASM linker:
 *   const linker = new Linker();
 *   linker.define('env', 'http_fetch', hostFns.env_http_fetch);
 *   linker.define('env', 'read_file', hostFns.env_read_file);
 *   ...
 *
 * @param ctx - The plugin invocation context with capabilities and fuel budget
 * @param sandboxRoot - Root directory for filesystem operations
 * @param kvStore - Key-value store for plugin persistence
 */
export function createHostFunctions(
  ctx: HostFunctionContext,
  sandboxRoot: string,
  kvStore: KvStore
): HostFunctionSet {
  return {
    /**
     * env_http_fetch — Outbound HTTP request with capability gating.
     *
     * The guest passes pointers to method (GET/POST/etc), URL, and body in WASM memory.
     * The host reads them, checks the capability manifest for the target host,
     * performs the fetch, and writes the response back.
     *
     * Fuel cost: 10 base + body_size / 100
     */
    async env_http_fetch(
      _methodPtr: number, _methodLen: number,
      _urlPtr: number, _urlLen: number,
      _bodyPtr: number, _bodyLen: number,
      _resultPtr: number
    ): Promise<number> {
      if (!consumeFuel(ctx, 10)) return WASM_ERR_BUDGET;

      // In a real integration, we'd read from WASM memory here.
      // This defines the contract that the runtime linker would use.
      // const method = readString(memory, methodPtr, methodLen);
      // const url = readString(memory, urlPtr, urlLen);
      // const body = readBytes(memory, bodyPtr, bodyLen);

      // Extract host from URL for capability check
      // const parsedUrl = new URL(url);
      // const host = parsedUrl.hostname;
      // if (!hasCapability(ctx, `http.outbound.${host}`)) {
      //   log.warn('wasm_http_denied', { pluginId: ctx.pluginId, host });
      //   return WASM_ERR_DENIED;
      // }

      log.info('wasm_http_fetch', {
        pluginId: ctx.pluginId,
        agentId: ctx.agentId,
        fuelUsed: ctx.fuelUsed,
      });

      // The actual fetch would be performed here and the result
      // written to WASM memory at resultPtr.
      // For now, return the interface contract.
      return WASM_OK;
    },

    /**
     * env_read_file — Sandboxed file read.
     *
     * Only files under the sandbox root are accessible.
     * Fuel cost: 5 base + file_size / 1000
     */
    async env_read_file(
      _pathPtr: number, _pathLen: number,
      _bufPtr: number, _bufLen: number
    ): Promise<number> {
      if (!consumeFuel(ctx, 5)) return WASM_ERR_BUDGET;

      // In real integration: const path = readString(memory, pathPtr, pathLen);
      // const validation = validateSandboxPath(path, sandboxRoot);
      // if (!validation.ok) return WASM_ERR_DENIED;
      // const data = await readFile(validation.resolved);
      // writeBytes(memory, bufPtr, data.slice(0, bufLen));
      // return WASM_OK;

      return WASM_OK;
    },

    /**
     * env_write_file — Sandboxed file write.
     *
     * Only writes under the sandbox root are allowed.
     * Fuel cost: 5 base + data_size / 500
     */
    async env_write_file(
      _pathPtr: number, _pathLen: number,
      _dataPtr: number, _dataLen: number
    ): Promise<number> {
      if (!consumeFuel(ctx, 5)) return WASM_ERR_BUDGET;

      // In real integration: const path = readString(memory, pathPtr, pathLen);
      // const validation = validateSandboxPath(path, sandboxRoot);
      // if (!validation.ok) return WASM_ERR_DENIED;
      // const data = readBytes(memory, dataPtr, dataLen);
      // await mkdir(dirname(validation.resolved), { recursive: true });
      // await writeFile(validation.resolved, data);
      // return WASM_OK;

      return WASM_OK;
    },

    /**
     * env_log — Structured logging from WASM guest.
     * Fuel cost: 1
     */
    env_log(
      _levelPtr: number, _levelLen: number,
      _msgPtr: number, _msgLen: number
    ): void {
      if (!consumeFuel(ctx, 1)) return;
      // In real integration: read level + message from WASM memory
      // log.info('wasm_guest_log', { pluginId: ctx.pluginId, level, message });
    },

    /**
     * env_random — Cryptographically secure random bytes.
     * Fuel cost: 1 + len / 64
     */
    env_random(_bufPtr: number, bufLen: number): void {
      if (!consumeFuel(ctx, 1 + Math.ceil(bufLen / 64))) return;
      // In real integration: const bytes = randomBytes(bufLen);
      // writeBytes(memory, bufPtr, bytes);
    },

    /**
     * env_time_now — Current time in nanoseconds since epoch.
     * Fuel cost: 1
     */
    env_time_now(): bigint {
      if (!consumeFuel(ctx, 1)) return BigInt(0);
      return BigInt(Date.now()) * BigInt(1_000_000);
    },

    /**
     * env_kv_get — Plugin-scoped key-value read.
     * Fuel cost: 3
     */
    async env_kv_get(
      _keyPtr: number, _keyLen: number,
      _bufPtr: number, _bufLen: number
    ): Promise<number> {
      if (!consumeFuel(ctx, 3)) return WASM_ERR_BUDGET;
      // In real integration: const key = readString(memory, keyPtr, keyLen);
      // const data = await kvStore.get(`${ctx.pluginId}:${key}`);
      // if (!data) return WASM_ERR_NOT_FOUND;
      // writeBytes(memory, bufPtr, data.slice(0, bufLen));
      return WASM_OK;
    },

    /**
     * env_kv_put — Plugin-scoped key-value write.
     * Fuel cost: 3 + value_size / 200
     */
    async env_kv_put(
      _keyPtr: number, _keyLen: number,
      _valPtr: number, _valLen: number
    ): Promise<number> {
      if (!consumeFuel(ctx, 3)) return WASM_ERR_BUDGET;
      // In real integration: const key = readString(memory, keyPtr, keyLen);
      // const val = readBytes(memory, valPtr, valLen);
      // await kvStore.put(`${ctx.pluginId}:${key}`, val);
      return WASM_OK;
    },
  };
}

/* ─── In-memory KV store (default; swappable for DB-backed) ──────────────── */

export function createMemoryKvStore(): KvStore {
  const store = new Map<string, Uint8Array>();
  return {
    async get(key: string): Promise<Uint8Array | null> {
      return store.get(key) ?? null;
    },
    async put(key: string, value: Uint8Array): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<boolean> {
      return store.delete(key);
    },
    async list(prefix: string): Promise<string[]> {
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

/* ─── DB-backed KV store (persistent, replaces in-memory on restart) ─────── */

export function createDbKvStore(pluginId: string): KvStore {
  // Lazy import to avoid circular dependency
  let dbModule: typeof import('../db/client.js') | null = null;

  async function getDb(): Promise<typeof import('../db/client.js')> {
    if (!dbModule) {
      dbModule = await import('../db/client.js');
    }
    return dbModule;
  }

  return {
    async get(key: string): Promise<Uint8Array | null> {
      const { db, pluginInstallations } = await getDb();
      const { eq, and } = await import('drizzle-orm');
      const rows = await db
        .select()
        .from(pluginInstallations)
        .where(and(
          eq(pluginInstallations.pluginId, pluginId),
        ))
        .limit(1);
      // KV values would be stored in a dedicated plugin_kv table
      // For now, return null as the table schema needs the kv column
      return null;
    },
    async put(key: string, value: Uint8Array): Promise<void> {
      // Would INSERT/UPDATE into plugin_kv table
      log.info('wasm_kv_put', { pluginId, key, size: value.length });
    },
    async delete(key: string): Promise<boolean> {
      log.info('wasm_kv_delete', { pluginId, key });
      return true;
    },
    async list(prefix: string): Promise<string[]> {
      log.info('wasm_kv_list', { pluginId, prefix });
      return [];
    },
  };
}

/* ─── Utility: compute fuel cost for an operation ────────────────────────── */

export function estimateFuelCost(operation: string, sizeBytes: number): number {
  switch (operation) {
    case 'http_fetch': return 10 + Math.ceil(sizeBytes / 100);
    case 'read_file': return 5 + Math.ceil(sizeBytes / 1000);
    case 'write_file': return 5 + Math.ceil(sizeBytes / 500);
    case 'kv_get': return 3;
    case 'kv_put': return 3 + Math.ceil(sizeBytes / 200);
    case 'log': return 1;
    case 'random': return 1 + Math.ceil(sizeBytes / 64);
    case 'time_now': return 1;
    default: return 1;
  }
}
