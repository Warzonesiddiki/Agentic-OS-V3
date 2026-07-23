/**
 * wasm-host-functions.test.ts — Tests for WASM host function implementations.
 * Phase 2, Task P2-01.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createHostFunctions,
  createMemoryKvStore,
  estimateFuelCost,
  WASM_OK,
  WASM_ERR_BUDGET,
  type HostFunctionContext,
  type KvStore,
} from '../src/services/wasm-host-functions.js';

function makeContext(overrides: Partial<HostFunctionContext> = {}): HostFunctionContext {
  return {
    pluginId: 'test-plugin-1',
    installId: 'install-1',
    agentId: 'agent-1',
    capabilities: ['http.outbound.api.github.com', 'http.outbound.*', 'vault.read', 'recall.query'],
    fuelBudget: 1000,
    fuelUsed: 0,
    ...overrides,
  };
}

describe('wasm-host-functions', () => {
  describe('createHostFunctions', () => {
    let ctx: HostFunctionContext;
    let kvStore: KvStore;
    let hostFns: ReturnType<typeof createHostFunctions>;

    beforeEach(() => {
      ctx = makeContext();
      kvStore = createMemoryKvStore();
      hostFns = createHostFunctions(ctx, '/tmp/wasm-sandbox', kvStore);
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

    it('env_log does not throw', () => {
      expect(() => hostFns.env_log(0, 4, 0, 10)).not.toThrow();
    });

    it('env_random does not throw', () => {
      expect(() => hostFns.env_random(0, 32)).not.toThrow();
    });

    it('env_http_fetch returns OK', async () => {
      const result = await hostFns.env_http_fetch(0, 3, 0, 30, 0, 0, 0);
      expect(result).toBe(WASM_OK);
    });

    it('env_read_file returns OK', async () => {
      const result = await hostFns.env_read_file(0, 10, 0, 1024);
      expect(result).toBe(WASM_OK);
    });

    it('env_write_file returns OK', async () => {
      const result = await hostFns.env_write_file(0, 10, 0, 100);
      expect(result).toBe(WASM_OK);
    });

    it('env_kv_get returns OK', async () => {
      const result = await hostFns.env_kv_get(0, 5, 0, 1024);
      expect(result).toBe(WASM_OK);
    });

    it('env_kv_put returns OK', async () => {
      const result = await hostFns.env_kv_put(0, 5, 0, 100);
      expect(result).toBe(WASM_OK);
    });

    it('all operations consume fuel', async () => {
      const initial = ctx.fuelUsed;
      await hostFns.env_http_fetch(0, 3, 0, 30, 0, 0, 0);
      expect(ctx.fuelUsed).toBeGreaterThan(initial);
    });

    it('operations return BUDGET error when fuel exhausted', async () => {
      ctx.fuelBudget = 0;
      const result = await hostFns.env_http_fetch(0, 3, 0, 30, 0, 0, 0);
      expect(result).toBe(WASM_ERR_BUDGET);
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
