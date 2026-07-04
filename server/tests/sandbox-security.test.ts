/**
 * sandbox-security.test.ts — Security regression test suite for the worker sandbox.
 *
 * This file tests exploit vectors that the sandbox must resist:
 *   - Prototype pollution
 *   - Process/require access
 *   - Infinite loops (timeout enforcement)
 *   - Memory bombs (memory limit enforcement)
 *   - Prototype chain climbing
 *   - Valid execution determinism
 *
 * All tests use the public executeSandboxed() API — no internal mocks.
 */

import { describe, it, expect, vi } from 'vitest';

// Set test environment
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

import { executeSandboxed } from '../src/services/sandbox.js';

describe('sandbox — worker thread isolation', () => {
  it('blocks access to require() inside sandbox', async () => {
    const result = await executeSandboxed({
      code: 'const fs = require("fs"); fs.readFileSync("/etc/passwd");',
      language: 'javascript',
    });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('Rejected');
  });

  it('blocks access to process global inside sandbox', async () => {
    const result = await executeSandboxed({
      code: 'process.exit(1)',
      language: 'javascript',
    });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('Rejected');
  });

  it('blocks access to dynamic import() inside sandbox', async () => {
    const result = await executeSandboxed({
      code: 'import("fs").then(m => m.readFileSync("/etc/passwd"))',
      language: 'javascript',
    });
    expect(result.ok).toBe(false);
    // Either AST rejects it or the worker blocks it
    expect(result.stderr.toLowerCase()).toMatch(/rejected|denied|error/);
  });

  it('blocks access to globalThis.process inside sandbox', async () => {
    const result = await executeSandboxed({
      code: 'globalThis.process.env',
      language: 'javascript',
    });
    expect(result.ok).toBe(false);
  });

  it('blocks __proto__ manipulation', async () => {
    const result = await executeSandboxed({
      code: '({}).__proto__.polluted = true',
      language: 'javascript',
    });
    expect(result.ok).toBe(false);
  });

  it('blocks prototype chain climbing (constructor.constructor)', async () => {
    const result = await executeSandboxed({
      code: 'const F = ({}).constructor.constructor; F("return process")()',
      language: 'javascript',
    });
    expect(result.ok).toBe(false);
  });
});

describe('sandbox — timeout enforcement', () => {
  it('terminates infinite loops via timeout', async () => {
    const start = Date.now();
    const result = await executeSandboxed({
      code: 'while(true) {}',
      language: 'javascript',
      timeoutMs: 2000,
    });
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('timed out');
    // Should have terminated within reasonable margin of timeout
    expect(elapsed).toBeLessThan(10000);
  });

  it('terminates deeply recursive infinite calls', async () => {
    const result = await executeSandboxed({
      code: '(function f() { f() })()',
      language: 'javascript',
      timeoutMs: 3000,
    });
    expect(result.ok).toBe(false);
  });

  it('terminates long-running synchronous computation', async () => {
    const result = await executeSandboxed({
      code: 'let x = 0; for(let i = 0; i < 1e10; i++) { x += i }',
      language: 'javascript',
      timeoutMs: 1500,
    });
    expect(result.ok).toBe(false);
  });
});

describe('sandbox — memory limit enforcement', () => {
  it('rejects memory bomb via large array allocation', async () => {
    const result = await executeSandboxed({
      code: 'const arr = []; while(true) { arr.push(new Array(100000).fill("x")) }',
      language: 'javascript',
      timeoutMs: 5000,
    });
    expect(result.ok).toBe(false);
  }, 15000); // Give extra time for memory exhaustion + termination

  it('rejects string memory bomb', async () => {
    const result = await executeSandboxed({
      code: 'let s = "x"; while(true) { s += s }',
      language: 'javascript',
      timeoutMs: 5000,
    });
    expect(result.ok).toBe(false);
  }, 15000);
});

describe('sandbox — valid JavaScript execution', () => {
  it('executes simple arithmetic expressions', async () => {
    const result = await executeSandboxed({
      code: '(function(input) { return input.x + input.y; })',
      language: 'javascript',
      input: { x: 10, y: 20 },
    });
    expect(result.ok).toBe(true);
    expect(result.output).toBe(30);
  });

  it('executes string manipulation', async () => {
    const result = await executeSandboxed({
      code: '(function(input) { return input.text.toUpperCase(); })',
      language: 'javascript',
      input: { text: 'hello world' },
    });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('HELLO WORLD');
  });

  it('executes array operations', async () => {
    const result = await executeSandboxed({
      code: `(function(input) {
        return input.numbers
          .filter(n => n % 2 === 0)
          .map(n => n * 2)
          .reduce((a, b) => a + b, 0);
      })`,
      language: 'javascript',
      input: { numbers: [1, 2, 3, 4, 5, 6] },
    });
    expect(result.ok).toBe(true);
    expect(result.output).toBe(24); // (2*2) + (4*2) + (6*2) = 4 + 8 + 12 = 24
  });

  it('executes JSON object construction', async () => {
    const result = await executeSandboxed({
      code: `(function(input) {
        return { greeting: "Hello " + input.name, timestamp: Date.now() };
      })`,
      language: 'javascript',
      input: { name: 'Test' },
    });
    expect(result.ok).toBe(true);
    expect(result.output).toHaveProperty('greeting', 'Hello Test');
    expect(result.output).toHaveProperty('timestamp');
    expect(typeof (result.output as Record<string, unknown>).timestamp).toBe('number');
  });

  it('handles Math operations', async () => {
    const result = await executeSandboxed({
      code: `(function(input) {
        return Math.sqrt(input.value) + Math.PI;
      })`,
      language: 'javascript',
      input: { value: 9 },
    });
    expect(result.ok).toBe(true);
    expect(result.output).toBeCloseTo(6.14159, 3);
  });

  it('handles Date operations', async () => {
    const result = await executeSandboxed({
      code: `(function(input) {
        return new Date(Date.UTC(input.year, input.month - 1, input.day)).toISOString();
      })`,
      language: 'javascript',
      input: { year: 2024, month: 12, day: 25 },
    });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('2024-12-25');
  });
});

describe('sandbox — AST pre-parsing rejection', () => {
  it('rejects syntactically invalid code', async () => {
    const result = await executeSandboxed({
      code: 'function ( {',
      language: 'javascript',
    });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('Syntax error');
  });

  it('rejects empty code', async () => {
    const result = await executeSandboxed({
      code: '',
      language: 'javascript',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects code with only whitespace', async () => {
    const result = await executeSandboxed({
      code: '   \n\n  ',
      language: 'javascript',
    });
    expect(result.ok).toBe(false);
  });
});

describe('sandbox — sandbox result shape', () => {
  it('returns a well-formed SandboxResult object', async () => {
    const result = await executeSandboxed({
      code: '(function() { return 42; })',
      language: 'javascript',
    });
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('stdout');
    expect(result).toHaveProperty('stderr');
    expect(result).toHaveProperty('durationMs');
    expect(result).toHaveProperty('exitCode');
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('includes execution duration in the result', async () => {
    const result = await executeSandboxed({
      code: '(function() { let s = 0; for(let i = 0; i < 10000; i++) { s += i } return s; })',
      language: 'javascript',
    });
    expect(result.ok).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
