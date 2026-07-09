/**
 * Sandbox service unit tests — pure, no database required.
 * Tests the worker-thread-based sandbox execution environment.
 *
 * NOTE: The old `vm.createContext` execution paths have been deprecated
 * in favor of the worker thread sandbox (sandbox-worker.ts). The vm.Script
 * tests below are retained as reference for the deprecated API but should
 * not be used as the primary security validation path.
 */
import { describe, it, expect, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgres://p:pass@localhost:5432/nexus_test';
process.env.NODE_ENV ??= 'test';

// Mock the db module to avoid real database calls
vi.mock('../src/db/client.js', () => ({
  db: {
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockResolvedValue([]) }),
  },
  sandboxExecutions: {},
  auditLog: {},
}));

import { isDockerAvailable, executeSandboxed, getSandboxMetrics } from '../src/services/sandbox.js';

describe('sandbox — docker detection', () => {
  it('isDockerAvailable returns a boolean', async () => {
    const result = await isDockerAvailable();
    expect(typeof result).toBe('boolean');
  });

  it('isDockerAvailable is deterministic within a process', async () => {
    const r1 = await isDockerAvailable();
    const r2 = await isDockerAvailable();
    expect(r1).toBe(r2);
  });
});

describe('sandbox — worker thread execution (primary path)', () => {
  it('executes simple arithmetic via worker sandbox', async () => {
    const result = await executeSandboxed({
      code: '(function(input) { return input.a + input.b; })',
      language: 'javascript',
      input: { a: 5, b: 7 },
    });
    expect(result.ok).toBe(true);
    expect(result.output).toBe(12);
  });

  it('executes string manipulation via worker sandbox', async () => {
    const result = await executeSandboxed({
      code: '(function(input) { return input.message.split("").reverse().join(""); })',
      language: 'javascript',
      input: { message: 'hello' },
    });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('olleh');
  });

  it('blocks dangerous require() call', async () => {
    const result = await executeSandboxed({
      code: 'require("fs")',
      language: 'javascript',
    });
    expect(result.ok).toBe(false);
  });

  it('handles null/undefined input gracefully', async () => {
    const result = await executeSandboxed({
      code: '(function() { return "no-input"; })',
      language: 'javascript',
      input: null,
    });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('no-input');
  });
});

describe('sandbox — metrics', () => {
  it('getSandboxMetrics returns a well-formed metrics object', () => {
    const metrics = getSandboxMetrics();
    expect(metrics).toHaveProperty('sandbox_executions_total');
    expect(metrics).toHaveProperty('sandbox_executions_success');
    expect(metrics).toHaveProperty('sandbox_executions_failure');
    expect(metrics).toHaveProperty('sandbox_latency_ms_total');
    expect(metrics).toHaveProperty('sandbox_latency_ms_max');
    expect(metrics).toHaveProperty('sandbox_latency_ms_avg');
  });
});

describe('sandbox — vm context creation (deprecated path)', () => {
  // These tests use the old vm.createContext API which has been
  // deprecated in favor of worker thread sandbox (sandbox-worker.ts).
  // They are retained for regression reference only. New tests should
  // use executeSandboxed() instead.
  it('vm.Script can execute simple code in isolated context (deprecated)', async () => {
    const vm = await import('node:vm');
    const context = vm.createContext({
      input: { x: 10, y: 20 },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      JSON,
      Math,
      Array,
      Object,
      String,
      Number,
      Boolean,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      ReferenceError,
      undefined: undefined,
      null: null,
      NaN: NaN,
      Infinity: Infinity,
    });

    const script = new vm.Script('(function(input) { return input.x + input.y; })');
    const fn = script.runInContext(context, { timeout: 1000 });
    const result = fn({ x: 10, y: 20 });
    expect(result).toBe(30);
  });

  it('vm.Script blocks access to require', async () => {
    const vm = await import('node:vm');
    const context = vm.createContext({
      input: {},
      console: { log: () => {}, warn: () => {}, error: () => {} },
      JSON,
      Math,
      Array,
      Object,
      String,
      Number,
      Boolean,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      ReferenceError,
      undefined: undefined,
      null: null,
      NaN: NaN,
      Infinity: Infinity,
    });

    const script = new vm.Script(
      "(function(input) { try { require('fs'); return 'BAD'; } catch(e) { return 'BLOCKED'; } })"
    );
    const fn = script.runInContext(context, { timeout: 1000 });
    const result = fn({});
    expect(result).toBe('BLOCKED');
  });

  it('vm.Script blocks access to process', async () => {
    const vm = await import('node:vm');
    const context = vm.createContext({
      input: {},
      console: { log: () => {}, warn: () => {}, error: () => {} },
      JSON,
      Math,
      Array,
      Object,
      String,
      Number,
      Boolean,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      ReferenceError,
      undefined: undefined,
      null: null,
      NaN: NaN,
      Infinity: Infinity,
    });

    const script = new vm.Script(
      "(function(input) { try { return typeof process; } catch(e) { return 'BLOCKED'; } })"
    );
    const fn = script.runInContext(context, { timeout: 1000 });
    const result = fn({});
    expect(result).toBe('undefined');
  });

  it('vm.Script enforces timeout', async () => {
    const vm = await import('node:vm');
    const context = vm.createContext({});
    const script = new vm.Script('while(true) {}');
    expect(() => script.runInContext(context, { timeout: 100 })).toThrow();
  });

  it('console.log captures output', async () => {
    const vm = await import('node:vm');
    const lines: string[] = [];
    const context = vm.createContext({
      input: {},
      console: {
        log: (...args: unknown[]) => lines.push(args.map(String).join(' ')),
        warn: (...args: unknown[]) => lines.push('[warn] ' + args.map(String).join(' ')),
        error: (...args: unknown[]) => lines.push('[error] ' + args.map(String).join(' ')),
      },
      JSON,
      Math,
      Array,
      Object,
      String,
      Number,
      Boolean,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      ReferenceError,
      undefined: undefined,
      null: null,
      NaN: NaN,
      Infinity: Infinity,
    });

    const script = new vm.Script(
      "(function(input) { console.log('hello'); console.log('world'); return 42; })"
    );
    const fn = script.runInContext(context, { timeout: 1000 });
    const result = fn({});
    expect(result).toBe(42);
    expect(lines).toEqual(['hello', 'world']);
  });
});
