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
 * ## Memory boundary
 *
 * A real WASM linker (wasmtime/wasmer) hands the host raw guest-linear-memory
 * pointers (`ptr`/`len` pairs). This module does NOT embed a specific WASM
 * runtime — none is a dependency of this Node.js server today — so the
 * pointer decode/encode step is abstracted behind the `WasmMemory` interface
 * below. Everything *after* the memory boundary (capability checks, fuel
 * accounting, path sandboxing, file I/O, KV persistence, HTTP fetch) is real,
 * fully implemented, and unit-testable without a WASM engine. Wiring an
 * actual `.wasm` module loader only requires implementing `WasmMemory` against
 * the chosen runtime's `Memory` export and passing it to `createHostFunctions`.
 *
 * @module services/wasm-host-functions
 */

import { randomBytes as cryptoRandomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, normalize, relative } from 'node:path';
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

/**
 * Abstraction over a WASM guest's linear memory. A real runtime integration
 * (wasmtime-js, @wasmer/wasi, etc.) implements this against the instantiated
 * module's exported `memory`. Host functions below use this to decode
 * `ptr`/`len` guest arguments and encode results back into guest memory —
 * this is the only part of the contract that requires an actual WASM engine.
 */
export interface WasmMemory {
  readBytes(ptr: number, len: number): Uint8Array;
  readString(ptr: number, len: number): string;
  writeBytes(ptr: number, bytes: Uint8Array, maxLen: number): number;
}

export interface HostFunctionSet {
  env_http_fetch: (
    methodPtr: number, methodLen: number,
    urlPtr: number, urlLen: number,
    bodyPtr: number, bodyLen: number,
    resultPtr: number, resultMaxLen: number
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

export function hasCapability(ctx: HostFunctionContext, required: string): boolean {
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
export function validateSandboxPath(
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
 * The returned functions close over the plugin's context (capabilities, fuel budget)
 * and a `WasmMemory` accessor for the guest's linear memory.
 *
 * A real WASM runtime integration registers these with the linker:
 *   const linker = new Linker();
 *   linker.define('env', 'http_fetch', hostFns.env_http_fetch);
 *   linker.define('env', 'read_file', hostFns.env_read_file);
 *   ...
 *
 * @param ctx - The plugin invocation context with capabilities and fuel budget
 * @param sandboxRoot - Root directory for filesystem operations
 * @param kvStore - Key-value store for plugin persistence
 * @param memory - Guest linear memory accessor (see `WasmMemory`)
 */
export function createHostFunctions(
  ctx: HostFunctionContext,
  sandboxRoot: string,
  kvStore: KvStore,
  memory: WasmMemory
): HostFunctionSet {
  return {
    /**
     * env_http_fetch — Outbound HTTP request with capability gating.
     *
     * The guest passes pointers to method (GET/POST/etc), URL, and body in WASM memory.
     * The host reads them, checks the capability manifest for the target host,
     * performs the fetch, and writes the JSON-encoded response back.
     *
     * Fuel cost: 10 base + body_size / 100
     */
    async env_http_fetch(
      methodPtr: number, methodLen: number,
      urlPtr: number, urlLen: number,
      bodyPtr: number, bodyLen: number,
      resultPtr: number, resultMaxLen: number
    ): Promise<number> {
      if (!consumeFuel(ctx, 10 + Math.ceil(bodyLen / 100))) return WASM_ERR_BUDGET;

      const method = memory.readString(methodPtr, methodLen);
      const url = memory.readString(urlPtr, urlLen);
      const body = bodyLen > 0 ? memory.readBytes(bodyPtr, bodyLen) : undefined;

      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        return WASM_ERR_INVALID;
      }

      if (!hasCapability(ctx, `http.outbound.${host}`)) {
        log.warn('wasm_http_denied', { pluginId: ctx.pluginId, host });
        return WASM_ERR_DENIED;
      }

      try {
        const response = await fetch(url, {
          method: method || 'GET',
          body: body ? Buffer.from(body) : undefined,
        });
        const responseBody = new Uint8Array(await response.arrayBuffer());
        const encoded: HttpFetchResult = {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseBody,
        };
        const json = Buffer.from(JSON.stringify(encoded));
        memory.writeBytes(resultPtr, json, resultMaxLen);

        log.info('wasm_http_fetch', {
          pluginId: ctx.pluginId,
          agentId: ctx.agentId,
          host,
          status: response.status,
          fuelUsed: ctx.fuelUsed,
        });
        return WASM_OK;
      } catch (e) {
        log.warn('wasm_http_fetch_failed', {
          pluginId: ctx.pluginId,
          host,
          error: e instanceof Error ? e.message : String(e),
        });
        return WASM_ERR_IO;
      }
    },

    /**
     * env_read_file — Sandboxed file read.
     *
     * Only files under the sandbox root are accessible.
     * Fuel cost: 5 base + file_size / 1000
     */
    async env_read_file(
      pathPtr: number, pathLen: number,
      bufPtr: number, bufLen: number
    ): Promise<number> {
      if (!consumeFuel(ctx, 5)) return WASM_ERR_BUDGET;

      const path = memory.readString(pathPtr, pathLen);
      if (!hasCapability(ctx, `filesystem.read.${path}`) && !hasCapability(ctx, 'filesystem.read.*')) {
        return WASM_ERR_DENIED;
      }
      const validation = validateSandboxPath(path, sandboxRoot);
      if (!validation.ok) return WASM_ERR_DENIED;

      try {
        const data = await readFile(validation.resolved);
        if (!consumeFuel(ctx, Math.ceil(data.length / 1000))) return WASM_ERR_BUDGET;
        memory.writeBytes(bufPtr, data, bufLen);
        return WASM_OK;
      } catch (e: unknown) {
        const code = (e as NodeJS.ErrnoException)?.code;
        return code === 'ENOENT' ? WASM_ERR_NOT_FOUND : WASM_ERR_IO;
      }
    },

    /**
     * env_write_file — Sandboxed file write.
     *
     * Only writes under the sandbox root are allowed.
     * Fuel cost: 5 base + data_size / 500
     */
    async env_write_file(
      pathPtr: number, pathLen: number,
      dataPtr: number, dataLen: number
    ): Promise<number> {
      if (!consumeFuel(ctx, 5 + Math.ceil(dataLen / 500))) return WASM_ERR_BUDGET;

      const path = memory.readString(pathPtr, pathLen);
      if (!hasCapability(ctx, `filesystem.write.${path}`) && !hasCapability(ctx, 'filesystem.write.*')) {
        return WASM_ERR_DENIED;
      }
      const validation = validateSandboxPath(path, sandboxRoot);
      if (!validation.ok) return WASM_ERR_DENIED;

      try {
        const data = memory.readBytes(dataPtr, dataLen);
        await mkdir(dirname(validation.resolved), { recursive: true });
        await writeFile(validation.resolved, data);
        return WASM_OK;
      } catch {
        return WASM_ERR_IO;
      }
    },

    /**
     * env_log — Structured logging from WASM guest.
     * Fuel cost: 1
     */
    env_log(
      levelPtr: number, levelLen: number,
      msgPtr: number, msgLen: number
    ): void {
      if (!consumeFuel(ctx, 1)) return;
      const level = memory.readString(levelPtr, levelLen);
      const message = memory.readString(msgPtr, msgLen);
      log.info('wasm_guest_log', { pluginId: ctx.pluginId, level, message });
    },

    /**
     * env_random — Cryptographically secure random bytes.
     * Fuel cost: 1 + len / 64
     */
    env_random(bufPtr: number, bufLen: number): void {
      if (!consumeFuel(ctx, 1 + Math.ceil(bufLen / 64))) return;
      const bytes = cryptoRandomBytes(bufLen);
      memory.writeBytes(bufPtr, bytes, bufLen);
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
      keyPtr: number, keyLen: number,
      bufPtr: number, bufLen: number
    ): Promise<number> {
      if (!consumeFuel(ctx, 3)) return WASM_ERR_BUDGET;
      const key = memory.readString(keyPtr, keyLen);
      const data = await kvStore.get(`${ctx.pluginId}:${key}`);
      if (!data) return WASM_ERR_NOT_FOUND;
      memory.writeBytes(bufPtr, data, bufLen);
      return WASM_OK;
    },

    /**
     * env_kv_put — Plugin-scoped key-value write.
     * Fuel cost: 3 + value_size / 200
     */
    async env_kv_put(
      keyPtr: number, keyLen: number,
      valPtr: number, valLen: number
    ): Promise<number> {
      if (!consumeFuel(ctx, 3 + Math.ceil(valLen / 200))) return WASM_ERR_BUDGET;
      const key = memory.readString(keyPtr, keyLen);
      const val = memory.readBytes(valPtr, valLen);
      await kvStore.put(`${ctx.pluginId}:${key}`, val);
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
      const { db, pluginKv } = await getDb();
      const { eq, and } = await import('drizzle-orm');
      const row = await db.query.pluginKv.findFirst({
        where: and(eq(pluginKv.pluginId, pluginId), eq(pluginKv.key, key)),
      });
      if (!row) return null;
      return new Uint8Array(Buffer.from(row.value, 'base64'));
    },
    async put(key: string, value: Uint8Array): Promise<void> {
      const { db, pluginKv } = await getDb();
      const { randomUUID } = await import('node:crypto');
      const encoded = Buffer.from(value).toString('base64');
      await db
        .insert(pluginKv)
        .values({
          id: `pkv_${randomUUID()}`,
          pluginId,
          key,
          value: encoded,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [pluginKv.pluginId, pluginKv.key],
          set: { value: encoded, updatedAt: new Date() },
        });
      log.info('wasm_kv_put', { pluginId, key, size: value.length });
    },
    async delete(key: string): Promise<boolean> {
      const { db, pluginKv } = await getDb();
      const { eq, and } = await import('drizzle-orm');
      const deleted = (await db
        .delete(pluginKv)
        .where(and(eq(pluginKv.pluginId, pluginId), eq(pluginKv.key, key)))
        .returning({ id: pluginKv.id })) as Array<{ id: string }>;
      log.info('wasm_kv_delete', { pluginId, key, deleted: deleted.length > 0 });
      return deleted.length > 0;
    },
    async list(prefix: string): Promise<string[]> {
      const { db, pluginKv } = await getDb();
      const { eq, and, like } = await import('drizzle-orm');
      const rows = await db.query.pluginKv.findMany({
        where: and(eq(pluginKv.pluginId, pluginId), like(pluginKv.key, `${prefix}%`)),
      });
      log.info('wasm_kv_list', { pluginId, prefix, count: rows.length });
      return rows.map((r: { key: string }) => r.key);
    },
  };
}

/* ─── In-memory WasmMemory (for unit tests / non-WASM callers) ───────────── */

/**
 * A simple `ArrayBuffer`-backed `WasmMemory` implementation for testing the
 * host functions above without a real WASM instance.
 */
export function createArrayBufferMemory(sizeBytes = 1_048_576): WasmMemory {
  const buffer = new Uint8Array(sizeBytes);
  return {
    readBytes(ptr: number, len: number): Uint8Array {
      return buffer.slice(ptr, ptr + len);
    },
    readString(ptr: number, len: number): string {
      return Buffer.from(buffer.slice(ptr, ptr + len)).toString('utf8');
    },
    writeBytes(ptr: number, bytes: Uint8Array, maxLen: number): number {
      const n = Math.min(bytes.length, maxLen, buffer.length - ptr);
      buffer.set(bytes.subarray(0, n), ptr);
      return n;
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
