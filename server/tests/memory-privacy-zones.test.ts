import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db/client.js', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  memories: { $inferSelect: {} },
  memoryAttachments: {},
  memoryClusters: {},
  memoryClusterMembers: {},
  memoryCausalEdges: {},
  sessionLinks: {},
  tagTaxonomy: {},
  memoryContradictions: {},
  memoryDiffMarkers: {},
  memoryTags: {},
}));

import { canRead, applyZone, type PrivacyZone } from '../src/services/memory-privacy-zones.js';

describe('memory-privacy-zones — canRead (level overload)', () => {
  it('grants read for a matching public/public clearance', () => {
    expect(canRead('public', 'public')).toBe(true);
  });
  it('denies read when clearance differs from the zone level', () => {
    expect(canRead('secret', 'public')).toBe(false);
    expect(canRead('public', 'secret')).toBe(false);
  });
});

describe('memory-privacy-zones — applyZone', () => {
  const zone: PrivacyZone = { id: 'z1', level: 'secret', allow: ['u1'] } as any;

  it('redacts a value that is not readable for the requester', () => {
    const out = applyZone('m1', zone, 'u2');
    expect(out.readable).toBe(false);
    expect(typeof out.value).toBe('string');
    expect(out.value.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same inputs', () => {
    const a = applyZone('m1', zone, 'u2');
    const b = applyZone('m1', zone, 'u2');
    expect(a.value).toBe(b.value);
  });

  it('handles a public zone', () => {
    const pub: PrivacyZone = { id: 'z2', level: 'public', allow: [] } as any;
    const out = applyZone('m2', pub, 'anyone');
    expect(out).toBeDefined();
    expect(Array.isArray(out.value) || typeof out.value === 'string').toBe(true);
  });
});
