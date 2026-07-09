/**
 * sandbox.ts — unit tests (Artisan namespace coverage).
 * AST pre-parse validation + telemetry + Docker probe. DB/worker paths
 * are mocked so no Docker is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/client.js', () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => Promise.resolve()) })) })),
  },
  isSqlite: false,
  isPg: true,
}));
vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/lib/env.js', () => ({
  getEnv: () => ({
    NEXUS_SANDBOX_ENABLED: false,
    NEXUS_SANDBOX_TIMEOUT_MS: 5000,
    NEXUS_SANDBOX_IMAGE: 'alpine:3',
  }),
}));
// Worker executor: a minimal in-process evaluator that runs compiledTask.
vi.mock('../src/services/sandbox-worker.js', () => ({
  executeInWorker: async (input: { code: string; input?: unknown }) => {
    const ctx: any = { module: {}, console, Math, JSON, Date, String, Number, Array, Object };
    const fn = new Function('module', 'input', 'console', `${input.code}\nreturn module.exports.compiledTask(input);`);
    try {
      const output = fn(ctx.module, input.input ?? {}, console);
      return { ok: true, output, stdout: '', stderr: '', durationMs: 1, exitCode: 0 };
    } catch (e) {
      return { ok: false, output: null, stdout: '', stderr: String(e), durationMs: 1, exitCode: 1 };
    }
  },
}));

import { preParseAndValidate, getSandboxMetrics, isDockerAvailable, executeSandboxed } from '../src/services/sandbox.js';

describe('preParseAndValidate', () => {
  it('rejects empty code', () => {
    expect(preParseAndValidate('   ')).toContain('Empty');
  });
  it('rejects process access', () => {
    expect(preParseAndValidate('process.exit(1)')).toContain('process');
  });
  it('rejects require()', () => {
    expect(preParseAndValidate('require("fs")')).toContain('require');
  });
  it('rejects dynamic import()', () => {
    expect(preParseAndValidate('import("x")')).toContain('import');
  });
  it('rejects __proto__', () => {
    expect(preParseAndValidate('a.__proto__')).toContain('__proto__');
  });
  it('rejects syntax errors', () => {
    expect(preParseAndValidate('function (')).toContain('Syntax');
  });
  it('accepts valid safe code', () => {
    expect(preParseAndValidate('const x = 1; module.exports = { f: () => x };')).toBeNull();
  });
});

describe('getSandboxMetrics', () => {
  it('returns a metrics record with avg', () => {
    const m = getSandboxMetrics();
    expect(m.sandbox_executions_total).toBe(0);
    expect(m.sandbox_latency_ms_avg).toBe(0);
  });
});

describe('isDockerAvailable', () => {
  it('returns false in this environment', async () => {
    expect(await isDockerAvailable()).toBe(false);
  });
});

describe('executeSandboxed', () => {
  beforeEach(() => vi.clearAllMocks());
  it('rejects dangerous code before execution', async () => {
    const r = await executeSandboxed({ code: 'require("fs")', language: 'javascript', input: {} });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
  });
  it('executes safe compiled code via worker fallback', async () => {
    const code = `function compiledTask(input){ return { out: (input.a||0)*2 }; }\nmodule.exports = { compiledTask };`;
    const r = await executeSandboxed({ code, language: 'javascript', input: { a: 21 } });
    expect(r.ok).toBe(true);
    expect((r.output as any).out).toBe(42);
  });
  it('reports failure on throwing code', async () => {
    const code = `function compiledTask(){ throw new Error('boom'); }\nmodule.exports = { compiledTask };`;
    const r = await executeSandboxed({ code, language: 'javascript', input: {} });
    expect(r.ok).toBe(false);
  });
});
