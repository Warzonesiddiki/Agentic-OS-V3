/**
 * Artisan — Phase 16/19 namespace.
 * Unit tests for WASM plugin capability resolution (most-specific-wins + deny lists).
 *
 * Note: `vitest run` cannot execute in the agent shell (better-sqlite3 ABI), but this
 * file is type-checked by `tsc` and executed by Quill's merge gate (`pnpm run validate`).
 */
import { describe, expect, it } from 'vitest';
import { checkCapability, type LoadedPlugin } from '../../src/services/wasm-plugin-runtime.js';
import type { CapabilitySpec } from '../../src/services/plugin-manifest.js';

function makePlugin(capabilities: CapabilitySpec[]): LoadedPlugin {
  return {
    id: 'test-plugin',
    instance: {} as never,
    manifest: {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 't',
      author: 'artisan',
      capabilities,
      memoryLimitMb: 64,
      cpuLimit: 1,
      network: false,
      filesystem: false,
    },
    state: 'active' as never,
    loadedAt: Date.now(),
  } as unknown as LoadedPlugin;
}

describe('checkCapability — most-specific-wins resolution', () => {
  it('grants an exact capability', () => {
    const p = makePlugin([{ exact: 'skill.invoke.test' }]);
    expect(checkCapability(p, 'skill.invoke.test')).not.toBeNull();
  });

  it('denies an unmatched capability (default-deny)', () => {
    const p = makePlugin([{ exact: 'skill.invoke.test' }]);
    expect(checkCapability(p, 'skill.delete.test')).toBeNull();
  });

  it('honors a prefix allow and rejects a non-matching child', () => {
    const p = makePlugin([{ prefix: 'recall.' }]);
    expect(checkCapability(p, 'recall.query')).not.toBeNull();
    expect(checkCapability(p, 'memory.query')).toBeNull();
  });

  it('prefixExcept denies a narrow sub-capability while allowing siblings', () => {
    const p = makePlugin([{ prefix: 'recall.', prefixExcept: ['recall.delete'] }]);
    expect(checkCapability(p, 'recall.query')).not.toBeNull();
    // deny wins: the excluded suffix is not granted
    expect(checkCapability(p, 'recall.delete')).toBeNull();
  });

  it('narrow allow beats broad deny (most-specific-wins)', () => {
    const p = makePlugin([
      { prefix: 'recall.', prefixExcept: ['recall.delete'] },
      { exact: 'recall.delete' },
    ]);
    // exact allow outranks the prefix deny
    expect(checkCapability(p, 'recall.delete')).not.toBeNull();
  });

  it('narrow deny beats broad allow (most-specific-wins, safe default)', () => {
    const p = makePlugin([{ prefix: 'recall.' }, { prefix: 'recall.delete', prefixExcept: [] }]);
    // the narrower recall.delete deny governs over the broad recall.* allow
    expect(checkCapability(p, 'recall.delete')).toBeNull();
  });

  it('prefixExcept exclusion may itself be a prefix (denies sub-tree)', () => {
    const p = makePlugin([{ prefix: 'fs.', prefixExcept: ['fs.write.'] }]);
    expect(checkCapability(p, 'fs.read')).not.toBeNull();
    expect(checkCapability(p, 'fs.write.tmp')).toBeNull();
    expect(checkCapability(p, 'fs.write')).toBeNull();
  });

  it('returns null when no specs are declared', () => {
    const p = makePlugin([]);
    expect(checkCapability(p, 'anything')).toBeNull();
  });
});
