/**
 * plugin-manifest.ts — unit tests (Artisan namespace coverage).
 * Pure schema validation + diff helpers. No DB required.
 */
import { describe, it, expect } from 'vitest';
import {
  validateManifest,
  safeValidateManifest,
  diffManifests,
  EXAMPLE_MANIFEST,
  PluginManifestSchema,
} from '../src/services/plugin-manifest.js';

function minimal(over: any = {}) {
  return { name: 'io.nexus.x', version: '1.0.0', author: 'tester', capabilities: [{ exact: 'a' }], ...over };
}

describe('plugin-manifest validation', () => {
  it('accepts the EXAMPLE_MANIFEST', () => {
    const m = validateManifest(EXAMPLE_MANIFEST);
    expect(m.name).toBe('io.nexus.examples.summarizer');
    expect(m.schemaVersion).toBe(1);
    expect(m.ring).toBe(2);
  });

  it('fills sandbox defaults', () => {
    const m = validateManifest(minimal());
    expect(m.sandbox.maxFuel).toBe(1_000_000_000);
    expect(m.sandbox.allowNetwork).toBe(false);
    expect(m.tags).toEqual([]);
  });

  it('rejects capability without exact/prefix', () => {
    const r = safeValidateManifest(minimal({ capabilities: [{ limits: { maxBytes: 10 } }] }));
    expect(r.ok).toBe(false);
  });

  it('rejects bad version / name', () => {
    expect(safeValidateManifest(minimal({ name: 'X' })).ok).toBe(false);
    expect(safeValidateManifest(minimal({ version: 'not-semver' })).ok).toBe(false);
  });

  it('rejects ring out of range', () => {
    expect(safeValidateManifest(minimal({ ring: 9 })).ok).toBe(false);
  });

  it('rejects empty author', () => {
    expect(safeValidateManifest({ name: 'io.nexus.x', version: '1.0.0', capabilities: [{ exact: 'a' }] }).ok).toBe(false);
  });

  it('safeValidateManifest reports path + message', () => {
    const r = safeValidateManifest(minimal({ capabilities: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]!.path).toContain('capabilities');
      expect(typeof r.errors[0]!.message).toBe('string');
    }
  });
});

describe('plugin-manifest diff', () => {
  it('detects added/removed/changed capabilities', () => {
    const prev = validateManifest(minimal({ capabilities: [{ exact: 'a' }, { prefix: 'skill.invoke.' }] }));
    const next = validateManifest(minimal({ version: '1.1.0', capabilities: [{ exact: 'a' }, { exact: 'b' }], ring: 3 }));
    const d = diffManifests(prev, next);
    expect(d.added).toContain('b');
    expect(d.removed).toContain('skill.invoke.');
    expect(d.changed).toContain('ring');
    expect(d.from).toBe('1.0.0');
    expect(d.to).toBe('1.1.0');
  });

  it('flags sandbox + dependsOn changes', () => {
    const prev = validateManifest(minimal());
    const next = validateManifest(minimal({ version: '1.0.1', dependsOn: ['other'], sandbox: { allowNetwork: true } }));
    const d = diffManifests(prev, next);
    expect(d.changed).toContain('sandbox');
    expect(d.changed).toContain('dependsOn');
  });
});
