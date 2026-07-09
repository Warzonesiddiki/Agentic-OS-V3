/**
 * memory-export-v3.test.ts — deep coverage for Mnemosyne export v3 slice.
 * Tests version stamping, content hashing, export → import round-trip,
 * and integrity verification.
 */
import { describe, it, expect } from 'vitest';
import {
  EXPORT_SCHEMA_VERSION,
  packV3Bundle,
  contentHash,
  isV3,
  unpackV3Bundle,
} from '../src/services/memory-export-v3.js';

const sampleMemory = {
  id: 'm1',
  projectId: 'p1',
  agentId: 'a1',
  kind: 'fact',
  title: 'Earth is round',
  content: 'scientific consensus',
  importance: 0.9,
  language: 'en',
  tags: ['geo'],
  embedding: [0.1, 0.2],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('EXPORT_SCHEMA_VERSION', () => {
  it('is the v3 magic string', () => {
    expect(EXPORT_SCHEMA_VERSION).toBe('nexus-memory-export@3');
  });
});

describe('contentHash', () => {
  it('is stable for identical memory content', () => {
    expect(contentHash(sampleMemory)).toBe(contentHash({ ...sampleMemory }));
  });

  it('changes when content changes', () => {
    expect(contentHash(sampleMemory)).not.toBe(contentHash({ ...sampleMemory, content: 'changed' }));
  });

  it('ignores volatile fields like updatedAt', () => {
    const a = contentHash({ ...sampleMemory, updatedAt: new Date(0).toISOString() });
    const b = contentHash({ ...sampleMemory, updatedAt: new Date(9_999_999).toISOString() });
    expect(a).toBe(b);
  });
});

describe('packV3Bundle / isV3 / unpackV3Bundle', () => {
  it('stamps the v3 magic version', () => {
    const blob = packV3Bundle({ memories: [sampleMemory], clusterIds: [] });
    expect(blob.version).toBe(EXPORT_SCHEMA_VERSION);
  });

  it('computes a sha256 integrity hash over the payload', () => {
    const blob = packV3Bundle({ memories: [sampleMemory], clusterIds: [] });
    expect(blob.integrity).toMatch(/^[0-9a-f]{64}$/);
  });

  it('isV3 recognises v3 bundles and rejects others', () => {
    const blob = packV3Bundle({ memories: [sampleMemory], clusterIds: [] });
    expect(isV3(blob)).toBe(true);
    expect(isV3({ version: 'nexus-memory-export@2', integrity: 'x', memories: [], clusters: [] })).toBe(false);
    expect(isV3(null)).toBe(false);
  });

  it('round-trips memories through pack → unpack', () => {
    const blob = packV3Bundle({ memories: [sampleMemory], clusterIds: ['c1'] });
    const unpacked = unpackV3Bundle(blob);
    expect(unpacked.memories).toHaveLength(1);
    expect(unpacked.memories[0]!.id).toBe('m1');
    expect(unpacked.clusters).toHaveLength(1);
    expect(unpacked.integrity).toBe(blob.integrity);
  });

  it('round-trips multiple memories preserving order and fields', () => {
    const m2 = { ...sampleMemory, id: 'm2', title: 'second' };
    const blob = packV3Bundle({ memories: [sampleMemory, m2], clusterIds: [] });
    const unpacked = unpackV3Bundle(blob);
    expect(unpacked.memories.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(unpacked.memories[1]!.title).toBe('second');
  });
});
