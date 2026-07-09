/**
 * QUILL2 — MERGE GATE ENFORCEMENT TEST
 *
 * This test is the automated gate that must pass before any branch can be merged
 * (equivalent to the husky pre-push `pnpm -r lint` gate, but runnable inside vitest).
 *
 * It enforces the NEXUS Perfection Bar:
 *   1. LINT GATE   - eslint over server/src plus server/tests must exit 0
 *                    (no lint errors; no-explicit-any warnings are allowed).
 *   2. MARKER GATE - no TODO / FIXME / XXX / HACK defect markers and no
 *                    real `stub` markers may remain anywhere under `server/src`
 *                    (the Perfection Bar forbids stubs/TODOs/FIXMEs).
 *   3. COVERAGE GATE — `vitest.config.ts` must enforce global coverage thresholds
 *                    >= 80% on lines / branches / functions / statements.
 *
 * Run with:  npx vitest run tests/gate.test.ts
 * (the full suite also runs it: `npx vitest run`)
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/ is the parent of tests/
const SERVER_ROOT = path.resolve(__dirname, '..');

/**
 * Collect every *.ts file under `dir` (recursive), returned as absolute paths.
 */
function collectTs(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && p.endsWith('.ts')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/**
 * Run eslint programmatically over the given globs and return its exit code.
 */
function eslintExitCode(globs: string[]): { code: number; stdout: string } {
  try {
    const stdout = execFileSync('npx', ['eslint', ...globs, '--format', 'compact'], {
      cwd: SERVER_ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 256,
      windowsHide: true,
    });
    return { code: 0, stdout };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '' };
  }
}

describe('Merge Gate — Lint', () => {
  it(
    'eslint exits 0 over server/src and server/tests (no lint errors)',
    () => {
      const { code, stdout } = eslintExitCode(['src/**/*.ts', 'tests/**/*.ts']);
      if (code !== 0) {
        // surface the first handful of errors to make CI failures actionable
        const head = stdout
          .split('\n')
          .filter((l) => /error/i.test(l))
          .slice(0, 30)
          .join('\n');
        throw new Error(
          `eslint reported lint errors (exit ${code}). First errors:\n${head}\n` +
            `Run: npx eslint "src/**/*.ts" "tests/**/*.ts"`,
        );
      }
      expect(code).toBe(0);
    },
    { timeout: 600_000 },
  );
});

describe('Merge Gate — No defect markers (Perfection Bar)', () => {
  // Patterns that, if found in source, violate the Perfection Bar.
  const defectRe = /\b(TODO|FIXME|XXX|HACK)\b/;
  // A *real* stub marker: the word "stub" used as a status, not in benign
  // documentation phrases ("not a stub", "no stub", "stubbed", "stubs will",
  // "stub &", "stub ... removed", "stub)", "stub,", "stub.").
  const benignStubRe =
    /(not a stub|no stub|stubbed|stubs will|stub &|stub\b.*removed|stub\)|stub,|stub\.)/i;
  const stubRe = /\bstub\b/i;

  it('no TODO/FIXME/XXX/HACK markers remain in server/src', () => {
    const files = collectTs(path.join(SERVER_ROOT, 'src'));
    const hits: string[] = [];
    for (const f of files) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      lines.forEach((ln, i) => {
        if (defectRe.test(ln)) {
          hits.push(`${path.relative(SERVER_ROOT, f)}:${i + 1} ${ln.trim()}`);
        }
      });
    }
    expect(hits, `Defect markers found:\n${hits.join('\n')}`).toEqual([]);
  });

  it('no real "stub" markers remain in server/src', () => {
    const files = collectTs(path.join(SERVER_ROOT, 'src'));
    const hits: string[] = [];
    for (const f of files) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      lines.forEach((ln, i) => {
        if (stubRe.test(ln) && !benignStubRe.test(ln)) {
          hits.push(`${path.relative(SERVER_ROOT, f)}:${i + 1} ${ln.trim()}`);
        }
      });
    }
    expect(hits, `Stub markers found:\n${hits.join('\n')}`).toEqual([]);
  });
});

describe('Merge Gate — Coverage thresholds enforced', () => {
  it('vitest.config.ts enforces global coverage >= 80%', () => {
    const cfgPath = path.join(SERVER_ROOT, 'vitest.config.ts');
    expect(fs.existsSync(cfgPath), 'vitest.config.ts must exist').toBe(true);
    const src = fs.readFileSync(cfgPath, 'utf8');

    // Extract the four threshold numbers from the coverage config block.
    const thresholdRe =
      /(lines|branches|functions|statements)\s*:\s*(\d{1,3})/g;
    const found: Record<string, number> = {};
    let m: RegExpExecArray | null;
    while ((m = thresholdRe.exec(src)) !== null) {
      found[m[1]] = Number(m[2]);
    }

    const required = ['lines', 'branches', 'functions', 'statements'];
    for (const key of required) {
      expect(
        found[key],
        `coverage threshold for "${key}" missing in vitest.config.ts`,
      ).toBeDefined();
      expect(
        found[key],
        `coverage threshold for "${key}" must be >= 80 (got ${found[key]})`,
      ).toBeGreaterThanOrEqual(80);
    }
  });
});
