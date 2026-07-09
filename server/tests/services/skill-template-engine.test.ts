/**
 * Artisan — Phase 16/19 namespace.
 * Unit tests for skill-template-engine env-threshold parsing (Phase 16 fix):
 * `NEXUS_EVAL_MATCH_THRESHOLD` must be treated as a NUMBER so the match-rate
 * gate (`matchRate >= EVAL_MATCH_THRESHOLD`) is correct and the DEFAULT of 1.0
 * (100%) is applied when unset.
 *
 * `vitest run` cannot execute in the agent shell (better-sqlite3 ABI); this file
 * is type-checked by tsc and executed by Quill's merge gate (`pnpm run validate`).
 */
import { describe, expect, it } from 'vitest';
import {
  generateScript,
  evaluateScript,
  type DetectedPattern,
} from '../../src/services/skill-template-engine.js';

function basePattern(overrides: Partial<DetectedPattern> = {}): DetectedPattern {
  return {
    taskLabel: 'format-name',
    occurrences: 12,
    avgTokensPerCall: 120,
    avgLatencyMs: 80,
    sampleInputs: [{ name: 'john doe' }],
    sampleOutputs: [{ name: 'John Doe' }],
    inputShape: { name: 'string' },
    outputShape: { name: 'string' },
    ...overrides,
  } as DetectedPattern;
}

describe('skill-template-engine — env-threshold gate', () => {
  it('generateScript produces a callable compiled function for a simple mapping', () => {
    const pattern = basePattern();
    const script = generateScript(pattern);
    expect(script).toBeDefined();
    expect(script.code).toContain('function compiledTask');
    expect(script.language).toBe('javascript');
  });

  it('default threshold is 1.0 (100%) — a partial-match script does NOT pass', async () => {
    // 1 of 2 samples matches => matchRate 0.5 < default 1.0 => passed false
    const pattern = basePattern({
      sampleInputs: [{ name: 'john doe' }, { name: 'jane roe' }],
      sampleOutputs: [{ name: 'John Doe' }, { name: 'WRONG' }],
    });
    const script = generateScript(pattern);
    const result = await evaluateScript(script, pattern);
    expect(result.testedSamples).toBe(2);
    expect(result.matchRate).toBeLessThan(1);
    expect(result.passed).toBe(false);
  });

  it('a fully-matching script passes under the default 100% threshold', async () => {
    const pattern = basePattern();
    const script = generateScript(pattern);
    const result = await evaluateScript(script, pattern);
    expect(result.matchRate).toBe(1);
    expect(result.passed).toBe(true);
  });
});
