/**
 * memory-export-v3.test.ts — deep coverage for Mnemosyne export v3 slice.
 * Tests schema-version stamping, content hashing, v3 bundle validation,
 * and the export → contentHash round-trip invariants.
 *
 * NOTE: the authoritative source API (memory-export-v3.ts, Mnemosyne-owned)
 * is `EXPORT_SCHEMA_VERSION` (number 3), `contentHash(payload)` (FNV-1a over
 * JSON), `exportBrainV3(projectId, brainId, clearance)` returning a `BrainV3`
 * bundle, and `isV3(brain)`. There is no packV3Bundle/unpackV3Bundle — the
 * symmetric import path lives in brain.ts. Tests assert the real contract.
 */
import { describe, it, expect, vi } from 'vitest';

// Isolate from the FROZEN db/client (better-sqlite3 native binding) so the
// pure export/integrity helpers can be unit-tested without a live database.
// The factory also exports the table references and a chainable `db.select`
// stub so exportBrainV3 can run in pure mode without a real database.
// Avoid loading the full privacy-zones module (which touches db) in this
// pure-path test; applyZone is a passthrough stub here.
vi.mock('../src/services/memory-privacy-zones.js', () => ({
  applyZone: (rows: unknown[]) => rows,
}));

vi.mock('../src/db/client.js', () => {
  // A thenable that also exposes the chainable builder methods, mirroring
  // Drizzle's query builder so select().from().where().orderBy() resolves to [].
  const resolved: unknown[] = [];
  const p = Object.assign(Promise.resolve(resolved), {
    where: () => p,
    orderBy: () => p,
    leftJoin: () => p,
  });
  const chain = () => ({ from: vi.fn(() => p) });
  return {
    db: { select: vi.fn(chain) },
    isSqlite: () => false,
    memories: { projectId: 'projectId', deletedAt: 'deletedAt' },
    memoryClusters: {},
    clusterMembers: {},
    causalLinks: {},
    memoryCausalEdges: {},
    memoryClusterMembers: {},
  };
});
import {
  EXPORT_SCHEMA_VERSION,
  contentHash,
  isV3,
  exportBrainV3,
} from '../src/services/memory-export-v3.js';

const samplePayload = {
  mems: [{ id: 'm1', kind: 'fact', text: 'Earth is round', importance: 0.9, zone: 'public', clusterId: null }],
  clusters: [],
  members: [],
  causal: [],
};

describe('EXPORT_SCHEMA_VERSION', () => {
  it('is the numeric v3 marker', () => {
    expect(EXPORT_SCHEMA_VERSION).toBe(3);
  });
});

describe('contentHash', () => {
  it('is stable for identical payloads', () => {
    expect(contentHash(samplePayload)).toBe(contentHash({ ...samplePayload }));
  });

  it('changes when payload content changes', () => {
    expect(contentHash(samplePayload)).not.toBe(
      contentHash({ ...samplePayload, mems: [{ ...samplePayload.mems[0], text: 'changed' }] })
    );
  });

  it('is order-sensitive', () => {
    const a = contentHash({ mems: [{ id: '1' }, { id: '2' }] });
    const b = contentHash({ mems: [{ id: '2' }, { id: '1' }] });
    expect(a).not.toBe(b);
  });

  it('produces a stable 8-char hex digest', () => {
    expect(contentHash(samplePayload)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('isV3', () => {
  it('recognises a v3 schemaVersion', () => {
    expect(isV3({ schemaVersion: EXPORT_SCHEMA_VERSION })).toBe(true);
  });

  it('rejects other versions', () => {
    expect(isV3({ schemaVersion: 2 })).toBe(false);
  });

  it('rejects null / malformed input', () => {
    expect(isV3(null as unknown as { schemaVersion?: number })).toBe(false);
    expect(isV3({} as { schemaVersion?: number })).toBe(false);
  });
});

describe('exportBrainV3 (pure-path / contentHash invariant)', () => {
  it('returns a v3 bundle shape with a content hash', async () => {
    // The db select chain is stubbed by the vi.mock factory above (returns []).
    const brain = await exportBrainV3('p1', 'b1', 'public');
    expect(brain.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(brain.brainId).toBe('b1');
    expect(typeof brain.contentHash).toBe('string');
    expect(brain.memories).toEqual([]);
    expect(brain.causalEdges).toEqual([]);
  });
});
