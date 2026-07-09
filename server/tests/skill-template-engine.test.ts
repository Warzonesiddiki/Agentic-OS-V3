/**
 * skill-template-engine.ts — unit tests (Artisan namespace coverage).
 * Exercises the exported pipeline + script generation + check/hot-swap.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })) })) }))),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => Promise.resolve()), returning: vi.fn(() => Promise.resolve([{ id: 'cmp_1' }])) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) }),
    query: {
      compiledScripts: { findFirst: vi.fn(() => Promise.resolve(null)), findMany: vi.fn(() => Promise.resolve([])) },
      agentTasks: { findMany: vi.fn(() => Promise.resolve([])) },
      trajectoryLogs: { findMany: vi.fn(() => Promise.resolve([])) },
    },
  },
  env: {},
  isSqlite: false,
  isPg: true,
}));
vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/lib/env.js', () => ({ env: {} }));
vi.mock('../src/lib/metrics.js', () => ({ skillCompilationsTotal: { inc: vi.fn() } }));
vi.mock('../src/services/sandbox.js', () => ({
  executeSandboxed: async ({ code, input }: any) => {
    try {
      const ctx: any = { module: {}, JSON, Math, Date, String, Number, Array, Object };
      const fn = new Function('module', 'input', `${code}\nreturn module.exports.compiledTask(input);`);
      return { ok: true, output: fn(ctx.module, input ?? {}), stdout: '', stderr: '', durationMs: 1, exitCode: 0 };
    } catch (e: any) {
      return { ok: false, output: null, stdout: '', stderr: String(e), durationMs: 1, exitCode: 1 };
    }
  },
}));

import {
  detectRepetitivePatterns,
  generateScript,
  evaluateScript,
  runCompilationPipeline,
  checkCompiledScript,
  listCompiledScripts,
  type DetectedPattern,
} from '../src/services/skill-template-engine.js';

function pattern(over: Partial<DetectedPattern> = {}): DetectedPattern {
  return {
    signature: 'abc123',
    taskLabel: 'normalize name',
    inputShape: { name: 'string' },
    outputShape: { name: 'string' },
    occurrences: 10,
    avgTokensPerCall: 100,
    avgLatencyMs: 50,
    sampleInputs: [{ name: 'Bob' }, { name: 'Alice' }],
    sampleOutputs: [{ name: 'bob' }, { name: 'alice' }],
    ...over,
  };
}

describe('skill-template-engine', () => {
  beforeEach(() => vi.clearAllMocks());

  it('detectRepetitivePatterns returns empty when no tasks', async () => {
    const p = await detectRepetitivePatterns();
    expect(Array.isArray(p)).toBe(true);
    expect(p.length).toBe(0);
  });

  it('generateScript emits a compiledTask function', () => {
    const s = generateScript(pattern());
    expect(s.language).toBe('javascript');
    expect(s.code).toContain('function compiledTask');
    expect(s.code).toContain('const name = input["name"];');
    expect(s.estimatedTokensSaved).toBe(1000);
  });

  it('evaluateScript passes on deterministic mapping', async () => {
    const s = generateScript(pattern());
    const r = await evaluateScript(s, pattern());
    expect(r.passed).toBe(true);
    expect(r.matchRate).toBe(1);
    expect(r.testedSamples).toBe(2);
  });

  it('runCompilationPipeline detects nothing on empty db', async () => {
    const r = await runCompilationPipeline('actor');
    expect(r.detected).toBe(0);
    expect(r.activated).toBe(0);
  });

  it('checkCompiledScript returns null when no active script', async () => {
    expect(await checkCompiledScript('normalize name', { name: 'x' })).toBeNull();
  });

  it('listCompiledScripts returns rows', async () => {
    const rows = await listCompiledScripts();
    expect(Array.isArray(rows)).toBe(true);
  });
});
