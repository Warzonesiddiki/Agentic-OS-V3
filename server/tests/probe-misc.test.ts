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

import { selectWinner, type MemoryLite } from '../src/services/memory-conflict-resolver.js';
import { canRead, applyZone, type PrivacyZone } from '../src/services/memory-privacy-zones.js';

describe('probe', () => {
  it('logs', () => {
    const a: MemoryLite = { id: 'a', importance: 0.9, retrievedAt: 1 } as any;
    const b: MemoryLite = { id: 'b', importance: 0.5, retrievedAt: 2 } as any;
    const w = selectWinner('recency', a, b);
    console.log('WIN_SHAPE', JSON.stringify(w));
    console.log('CANREAD pub/pub', canRead('public', 'public'));
    console.log('CANREAD conf/conf', canRead('confidential', 'confidential'));
    const zone: PrivacyZone = { id: 'z1', level: 'secret', allow: ['u1'] } as any;
    console.log('APPLY readable-true', JSON.stringify(applyZone('m1', { ...zone, level: 'public' } as any)));
    expect(true).toBe(true);
  });
});
