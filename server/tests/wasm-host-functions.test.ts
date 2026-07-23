/**
 * wasm-host-functions.test.ts — Tests for WASM host function implementations.
 * Phase 2, Task P2-01.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createHostFunctions,
  createMemoryKvStore,
  createArrayBufferMemory,
  estimateFuelCost,
  hasCapability,
  validateSandboxPath,
  WASM_OK,
  WASM_ERR_BUDGET,
  WASM_ERR_DENIED,
  WASM_ERR_NOT_FOUND,
  type HostFunctionContext,
  type KvStore,
  type WasmMemory,
} from '../src/services/wasm-host-functions.js';

function makeContext(overrides: Partial<HostFunctionContext> = {}): HostFunctionContext {
  return {
    pluginId: 'test-plugin-1',
    installId: 'install-1',
    agentId: 'agent-1',
    capabilities: [
      'http.outbound.api.github.com',
      'vault.read',
      'recall.query',
      'filesystem.read.*',
      'filesystem.write.*',
    ],
    fuelBudget: 1000,
    fuelUsed: 0,
    ...overrides,
  };
}

/** Writes a UTF-8 string into a WasmMemory at ptr 0 and returns its length. */
function seedString(memory: WasmMemory, value: string): number {
  const bytes = Buffer.from(value, 'utf8');
  memory.writeBytes(0, bytes, bytes.length);
  return bytes.length;
}

describe('wasm-host-functions', () => {
  describe('createHostFunctions', () => {
    let ctx: HostFunctionContext;
    let kvStore: KvStore;
    let memory: WasmMemory;
    let sandboxDir: string;
    let hostFns: ReturnType<typeof createHostFunctions>;

    beforeEach(async () => {
      ctx = makeContext();
      kvStore = createMemoryKvStore();
      memory = createArrayBufferMemory();
      sandboxDir = await mkdtemp(join(tmpdir(), 'wasm-sandbox-'));
      hostFns = createHostFunctions(ctx, sandboxDir, kvStore, memory);
    });

    afterEach(async () => {
      await rm(sandboxDir, { recursive: true, force: true });
    });

    it('env_time_now returns current time in nanoseconds', () => {
      const before = BigInt(Date.now()) * BigInt(1_000_000);
      const result = hostFns.env_time_now();
      const after = BigInt(Date.now() + 1) * BigInt(1_000_000);
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });

    it('env_time_now consumes fuel', () => {
      const initialFuel = ctx.fuelUsed;
      hostFns.env_time_now();
      expect(ctx.fuelUsed).toBe(initialFuel + 1);
    });

    it('env_time_now returns 0 when budget exhausted', () => {
      ctx.fuelBudget = 0;
      const result = hostFns.env_time_now();
      expect(result).toBe(BigInt(0));
    });

    it('env_log does not throw and reads the message from memory', () => {
      const len = seedString(memory, 'info');
      expect(() => hostFns.env_log(0, len, 0, len)).not.toThrow();
    });

    it('env_random writes the requested number of bytes', () => {
      hostFns.env_random(0, 32);
      const bytes = memory.readBytes(0, 32);
      expect(bytes).toHaveLength(32);
      // Extremely unlikely all 32 random bytes are zero.
      expect(bytes.some((b) => b !== 0)).toBe(true);
    });

    it('env_http_fetch denies a host without a matching capability', async () => {
      const urlLen = seedString(memory, 'https://evil.example.com/');
      const result = await hostFns.env_http_fetch(0, 0, 0, urlLen, 0, 0, 0, 0);
      expect(result).toBe(WASM_ERR_DENIED);
    });

    it('env_read_file returns NOT_FOUND for a missing file in the sandbox', async () => {
      const pathLen = seedString(memory, 'does-not-exist.txt');
      const result = await hostFns.env_read_file(0, pathLen, 0, 1024);
      expect(result).toBe(WASM_ERR_NOT_FOUND);
    });

    it('env_write_file then env_read_file round-trips real file content', async () => {
      const path = 'notes/output.txt';
      const content = Buffer.from('hello from wasm guest');

      const pathLen = seedString(memory, path);
      memory.writeBytes(64, content, content.length);
      const writeResult = await hostFns.env_write_file(0, pathLen, 64, content.length);
      expect(writeResult).toBe(WASM_OK);

      const readPathLen = seedString(memory, path);
      const readResult = await hostFns.env_read_file(0, readPathLen, 128, 1024);
      expect(readResult).toBe(WASM_OK);
      const readBack = memory.readBytes(128, content.length);
      expect(Buffer.from(readBack).toString('utf8')).toBe('hello from wasm guest');
    });

    it('env_write_file denies path traversal outside the sandbox', async () => {
      const pathLen = seedString(memory, '../../etc/passwd');
      const result = await hostFns.env_write_file(0, pathLen, 0, 0);
      expect(result).toBe(WASM_ERR_DENIED);
    });

    it('env_kv_get returns NOT_FOUND for missing key, OK after env_kv_put', async () => {
      const key = 'settings';
      const keyLen = seedString(memory, key);
      const missResult = await hostFns.env_kv_get(0, keyLen, 256, 1024);
      expect(missResult).toBe(WASM_ERR_NOT_FOUND);

      const value = Buffer.from('{"theme":"dark"}');
      const keyLen2 = seedString(memory, key);
      memory.writeBytes(64, value, value.length);
      const putResult = await hostFns.env_kv_put(0, keyLen2, 64, value.length);
      expect(putResult).toBe(WASM_OK);

      const keyLen3 = seedString(memory, key);
      const getResult = await hostFns.env_kv_get(0, keyLen3, 256, 1024);
      expect(getResult).toBe(WASM_OK);
      expect(Buffer.from(memory.readBytes(256, value.length)).toString('utf8')).toBe(
        '{"theme":"dark"}'
      );
    });

    it('all operations consume fuel', async () => {
      const initial = ctx.fuelUsed;
      const urlLen = seedString(memory, 'https://api.github.com/repos');
      await hostFns.env_http_fetch(0, 0, 0, urlLen, 0, 0, 0, 0);
      expect(ctx.fuelUsed).toBeGreaterThan(initial);
    });

    it('operations return BUDGET error when fuel exhausted', async () => {
      ctx.fuelBudget = 0;
      const urlLen = seedString(memory, 'https://api.github.com/repos');
      const result = await hostFns.env_http_fetch(0, 0, 0, urlLen, 0, 0, 0, 0);
      expect(result).toBe(WASM_ERR_BUDGET);
    });

    it('env_http_fetch performs a real fetch for an allowed host', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
      try {
        const urlLen = seedString(memory, 'https://api.github.com/repos');
        const result = await hostFns.env_http_fetch(0, 0, 0, urlLen, 0, 0, 512, 4096);
        expect(result).toBe(WASM_OK);
        expect(fetchSpy).toHaveBeenCalledWith(
          'https://api.github.com/repos',
          expect.objectContaining({ method: 'GET' })
        );
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('hasCapability', () => {
    it('matches exact capability strings', () => {
      const ctx = makeContext({ capabilities: ['vault.read'] });
      expect(hasCapability(ctx, 'vault.read')).toBe(true);
      expect(hasCapability(ctx, 'vault.write')).toBe(false);
    });

    it('matches wildcard prefix capabilities', () => {
      const ctx = makeContext({ capabilities: ['http.outbound.*'] });
      expect(hasCapability(ctx, 'http.outbound.api.github.com')).toBe(true);
      expect(hasCapability(ctx, 'vault.read')).toBe(false);
    });
  });

  describe('validateSandboxPath', () => {
    it('accepts a relative path within the sandbox', () => {
      const result = validateSandboxPath('notes/a.txt', '/tmp/sandbox');
      expect(result.ok).toBe(true);
    });

    it('rejects an absolute path', () => {
      const result = validateSandboxPath('/etc/passwd', '/tmp/sandbox');
      expect(result.ok).toBe(false);
    });

    it('rejects a traversal path', () => {
      const result = validateSandboxPath('../../etc/passwd', '/tmp/sandbox');
      expect(result.ok).toBe(false);
    });
  });

  describe('createMemoryKvStore', () => {
    let store: KvStore;

    beforeEach(() => {
      store = createMemoryKvStore();
    });

    it('put and get round-trip', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      await store.put('key1', data);
      const result = await store.get('key1');
      expect(result).toEqual(data);
    });

    it('get returns null for missing key', async () => {
      const result = await store.get('nonexistent');
      expect(result).toBeNull();
    });

    it('delete removes a key', async () => {
      await store.put('key1', new Uint8Array([1]));
      const deleted = await store.delete('key1');
      expect(deleted).toBe(true);
      expect(await store.get('key1')).toBeNull();
    });

    it('delete returns false for missing key', async () => {
      const deleted = await store.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    it('list returns keys with prefix', async () => {
      await store.put('plugin:a', new Uint8Array([1]));
      await store.put('plugin:b', new Uint8Array([2]));
      await store.put('other:c', new Uint8Array([3]));
      const keys = await store.list('plugin:');
      expect(keys).toHaveLength(2);
      expect(keys).toContain('plugin:a');
      expect(keys).toContain('plugin:b');
    });
  });

  describe('createArrayBufferMemory', () => {
    it('round-trips bytes written and read at the same offset', () => {
      const memory = createArrayBufferMemory();
      const bytes = Buffer.from([10, 20, 30, 40]);
      const written = memory.writeBytes(100, bytes, bytes.length);
      expect(written).toBe(4);
      expect(memory.readBytes(100, 4)).toEqual(new Uint8Array(bytes));
    });

    it('round-trips UTF-8 strings', () => {
      const memory = createArrayBufferMemory();
      const str = 'hello wasm';
      const bytes = Buffer.from(str, 'utf8');
      memory.writeBytes(0, bytes, bytes.length);
      expect(memory.readString(0, bytes.length)).toBe(str);
    });
  });

  describe('estimateFuelCost', () => {
    it('http_fetch has base cost 10', () => {
      expect(estimateFuelCost('http_fetch', 0)).toBe(10);
    });

    it('http_fetch scales with body size', () => {
      const small = estimateFuelCost('http_fetch', 100);
      const large = estimateFuelCost('http_fetch', 10000);
      expect(large).toBeGreaterThan(small);
    });

    it('read_file has base cost 5', () => {
      expect(estimateFuelCost('read_file', 0)).toBe(5);
    });

    it('kv_get has fixed cost 3', () => {
      expect(estimateFuelCost('kv_get', 0)).toBe(3);
      expect(estimateFuelCost('kv_get', 1000)).toBe(3);
    });

    it('unknown operation has cost 1', () => {
      expect(estimateFuelCost('unknown_op', 0)).toBe(1);
    });
  });
});
