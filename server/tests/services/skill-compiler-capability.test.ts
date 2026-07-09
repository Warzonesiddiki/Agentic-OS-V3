/**
 * Artisan — Phase 16/19 namespace.
 * Unit tests for skill-compiler sandbox dry-run capability gate (fail-closed).
 *
 * `vitest run` cannot execute in the agent shell (better-sqlite3 ABI); this file
 * is type-checked by tsc and executed by Quill's merge gate (`pnpm run validate`).
 */
import { describe, expect, it } from 'vitest';
import {
  validateSkillCapabilities,
  dryRunSkill,
  SKILL_ALLOWED_CAPABILITIES,
  SkillCapabilityViolation,
} from '../../src/services/skill-compiler.js';

describe('validateSkillCapabilities — fail-closed', () => {
  it('allows capabilities inside the declared allow-list', () => {
    expect(() =>
      validateSkillCapabilities(SKILL_ALLOWED_CAPABILITIES, ['skill.invoke', 'memory.read'])
    ).not.toThrow();
  });

  it('throws SkillCapabilityViolation for an undeclared capability (fail-closed)', () => {
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
});

describe('dryRunSkill — captures requested capabilities', () => {
  it('records requestCapability calls made by the compiled skill', () => {
    const code = "requestCapability('memory.read'); requestCapability('recall.query');";
    const attempted = dryRunSkill(code, [{}]);
    expect(attempted).toContain('memory.read');
    expect(attempted).toContain('recall.query');
  });

  it('returns no capabilities for a pure mapping skill', () => {
    const code = 'function compiledTask(input){ return input; }';
    const attempted = dryRunSkill(code, [{}]);
    expect(attempted).toHaveLength(0);
  });

  it('integration: a skill reaching for network fails dry-run validation', () => {
    const code = "requestCapability('network.http');";
    const attempted = dryRunSkill(code, [{}]);
    expect(() => validateSkillCapabilities(SKILL_ALLOWED_CAPABILITIES, attempted)).toThrow(
      SkillCapabilityViolation
    );
  });
});
