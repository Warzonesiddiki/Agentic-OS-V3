/**
 * wasm-plugin-runtime.ts — unit tests (Artisan namespace coverage).
 * Pure functions + signature verification (real ed25519) + capability
 * matching + resource fuse. DB-touching paths are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';

vi.mock('../src/db/client.js', () => ({
  db: {
    query: {
      plugins: { findFirst: vi.fn(() => Promise.resolve(null)) },
      pluginInstallations: { findFirst: vi.fn(() => Promise.resolve(null)) },
      pluginReceipts: { findMany: vi.fn(() => Promise.resolve([])) },
    },
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => Promise.resolve()), returning: vi.fn(() => Promise.resolve([{}])) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })) })) })) })),
  },
  isSqlite: false,
  isPg: true,
}));
vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/lib/logging.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  canonicalizeManifest,
  verifyManifestSignature,
  checkCapability,
  withResourceFuse,
  ResourceFuseTripped,
  IntegrityGateFailure,
  type LoadedPlugin,
} from '../src/services/wasm-plugin-runtime.js';
import { validateManifest, EXAMPLE_MANIFEST } from '../src/services/plugin-manifest.js';

function makePlugin(caps: any[]): LoadedPlugin {
  return {
    id: 'plg_1',
    name: 'io.nexus.x',
    version: '1.0.0',
    manifest: validateManifest({ ...EXAMPLE_MANIFEST, capabilities: caps }),
    contentSha256: 'deadbeef',
    trustState: 'untrusted',
    ringOverride: null,
    config: {},
  };
}

describe('manifest canonicalization + signature', () => {
  it('canonicalizeManifest is key-stable', () => {
    const m = EXAMPLE_MANIFEST as any;
    const a = canonicalizeManifest(m);
    const b = canonicalizeManifest({ ...m, description: 'changed' });
    expect(JSON.parse(a)).toBeTypeOf('object');
    expect(a).toBe(b);
  });

  it('verifies a real ed25519 signature', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pubB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const manifest = validateManifest({ ...EXAMPLE_MANIFEST });
    const body = JSON.stringify({ ...manifest, signature: undefined });
    const sig = cryptoSign(null, Buffer.from(body, 'utf8'), privateKey).toString('base64');
    expect(verifyManifestSignature(manifest, sig, pubB64)).toBe(true);
    expect(verifyManifestSignature(manifest, 'AAAA', pubB64)).toBe(false);
  });

  it('returns false on malformed pubkey (does not throw)', () => {
    const manifest = validateManifest({ ...EXAMPLE_MANIFEST });
    expect(verifyManifestSignature(manifest, 'AAAA', 'not-base64!!')).toBe(false);
  });
});

describe('checkCapability (default-deny)', () => {
  it('matches exact capability', () => {
    const p = makePlugin([{ exact: 'llm.invoke' }]);
    expect(checkCapability(p, 'llm.invoke')).not.toBeNull();
    expect(checkCapability(p, 'llm.invoke.other')).toBeNull();
  });

  it('matches prefix children', () => {
    const p = makePlugin([{ prefix: 'skill.invoke.' }]);
    expect(checkCapability(p, 'skill.invoke.summarize')).not.toBeNull();
    expect(checkCapability(p, 'skill.invoke.')).toBeNull();
  });

  it('honors prefixExcept deny', () => {
    const p = makePlugin([{ prefix: 'http.outbound.', prefixExcept: ['http.outbound.evil.com'] }]);
    expect(checkCapability(p, 'http.outbound.api.com')).not.toBeNull();
    expect(checkCapability(p, 'http.outbound.evil.com')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    const p = makePlugin([{ exact: 'a' }]);
    expect(checkCapability(p, 'z')).toBeNull();
  });

  it('scores exact above prefix', () => {
    const p = makePlugin([{ exact: 'skill.invoke', prefix: 'skill.' }]);
    const cap = checkCapability(p, 'skill.invoke');
    expect(cap).not.toBeNull();
    expect((cap as any).exact).toBe('skill.invoke');
  });
});

describe('withResourceFuse', () => {
  it('resolves normally when fast', async () => {
    const r = await withResourceFuse({ timeoutMs: 1000, maxFuel: 100 }, async () => 42, () => 10);
    expect(r).toBe(42);
  });

  it('trips on timeout', async () => {
    await expect(
      withResourceFuse({ timeoutMs: 20, maxFuel: 100 }, () => new Promise((res) => setTimeout(res, 200)))
    ).rejects.toBeInstanceOf(ResourceFuseTripped);
  });

  it('trips on fuel overage', async () => {
    await expect(
      withResourceFuse({ timeoutMs: 1000, maxFuel: 100 }, async () => 'ok', () => 500)
    ).rejects.toBeInstanceOf(ResourceFuseTripped);
  });

  it('does not trip when no getFuel provided', async () => {
    const r = await withResourceFuse({ timeoutMs: 1000, maxFuel: 100 }, async () => 'ok');
    expect(r).toBe('ok');
  });
});

describe('error types', () => {
  it('IntegrityGateFailure carries report', () => {
    const report = { checkedAt: 1, checksumOk: false, attested: false, attestedOk: true, detail: 'bad' };
    const e = new IntegrityGateFailure(report);
    expect(e.report).toBe(report);
    expect(e.name).toBe('IntegrityGateFailure');
  });

  it('ResourceFuseTripped carries reason + limit', () => {
    const e = new ResourceFuseTripped('timeout', 5);
    expect(e.reason).toBe('timeout');
    expect(e.limit).toBe(5);
    expect(e.name).toBe('ResourceFuseTripped');
  });
});
