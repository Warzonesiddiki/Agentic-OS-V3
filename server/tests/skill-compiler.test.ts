/**
 * Artisan — Phase 16/19 namespace.
 * Tests for skill-compiler: template-injection safety (block-comment breakout
 * guard) and the fail-closed capability deny-list (sandbox dry-run gate).
 *
 * `vitest run` cannot execute under the agent shell's better-sqlite3 ABI, but
 * these are type-checked by tsc and executed by Quill's merge gate.
 */
import { describe, expect, it } from 'vitest';
import {
  generateScript,
  dryRunSkill,
  validateSkillCapabilities,
  SKILL_ALLOWED_CAPABILITIES,
  SkillCapabilityViolation,
  type DetectedPattern,
} from '../src/services/skill-compiler.js';

function basePattern(overrides: Partial<DetectedPattern> = {}): DetectedPattern {
  return {
    signature: 'abc123',
    taskLabel: 'format-name',
    inputShape: { name: 'string' },
    outputShape: { name: 'string' },
    occurrences: 12,
    avgTokensPerCall: 120,
    avgLatencyMs: 80,
    sampleInputs: [{ name: 'john doe' }],
    sampleOutputs: [{ name: 'John Doe' }],
    ...overrides,
  };
}

describe('generateScript — template-injection safety', () => {
  it('neutralizes a taskLabel that breaks out of the block comment (RCE guard)', () => {
    const malicious = 'x */ globalThis.__PWNED__ = 1; /*';
    const script = generateScript(basePattern({ taskLabel: malicious }));
    // The generated code must NOT contain the raw injection payload.
    expect(script.code).not.toContain('__PWNED__');
    // And the breakout sequence `*/` inside the comment must be neutralized.
    expect(script.code).not.toMatch(/\*\/\s*globalThis/);
    // The function must still run and return a plain object (no injected side-effect).
    const fn = new Function(`return (${script.code.replace('module.exports =', 'return ').replace(/;\s*$/, '')});`) as () => { compiledTask: (i: unknown) => unknown };
    const compiled = fn();
    expect(() => compiled.compiledTask({ name: 'john doe' })).not.toThrow();
    expect((globalThis as Record<string, unknown>).__PWNED__).toBeUndefined();
  });

  it('neutralizes */ inside a sample output embedded in the comment block', () => {
    const out = { name: 'John */ Doe' };
    const script = generateScript(basePattern({ sampleOutputs: [out] }));
    // The JSON.stringify'd sample (containing */) must be sanitized so it cannot
    // close the comment early.
    expect(script.code).not.toMatch(/\*\/\s*const testResults/);
    expect(script.code).toContain('* /'); // sanitized terminator
  });

  it('produces a callable compiled function for a benign pattern', () => {
    const script = generateScript(basePattern());
    expect(script.code).toContain('function compiledTask');
    expect(script.language).toBe('javascript');
  });
});

describe('capability deny-list (fail-closed sandbox dry-run)', () => {
  it('allows capabilities inside the declared allow-list', () => {
    expect(() =>
      validateSkillCapabilities(SKILL_ALLOWED_CAPABILITIES, ['skill.invoke', 'memory.read'])
    ).not.toThrow();
  });

  it('throws SkillCapabilityViolation for an undeclared capability', () => {
    expect(() => validateSkillCapabilities(['skill.invoke'], ['network.http'])).toThrow(
      SkillCapabilityViolation
    );
  });

  it('prefix allow-list grants children but not siblings', () => {
    expect(() => validateSkillCapabilities(['skill.invoke.'], ['skill.invoke.foo'])).not.toThrow();
    expect(() => validateSkillCapabilities(['skill.invoke.'], ['kernel.enqueue'])).toThrow(
      SkillCapabilityViolation
    );
  });

  it('dryRunSkill captures requestCapability calls', () => {
    const attempted = dryRunSkill(
      "requestCapability('memory.read'); requestCapability('recall.query');",
      [{}]
    );
    expect(attempted).toContain('memory.read');
    expect(attempted).toContain('recall.query');
  });

  it('integration: a skill reaching for network fails dry-run validation', () => {
    const attempted = dryRunSkill("requestCapability('network.http');", [{}]);
    expect(() => validateSkillCapabilities(SKILL_ALLOWED_CAPABILITIES, attempted)).toThrow(
      SkillCapabilityViolation
    );
  });
});
