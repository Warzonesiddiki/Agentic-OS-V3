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
import { canRead, type PrivacyZone } from '../src/services/memory-privacy-zones.js';

describe('probe', () => {
  it('logs', () => {
    const a: MemoryLite = { id: 'a', importance: 0.9, retrievedAt: 1 } as any;
    const b: MemoryLite = { id: 'b', importance: 0.5, retrievedAt: 2 } as any;
    const w: any = selectWinner('recency', a, b);
    console.log('WIN_TYPE', typeof w, 'WIN_KEYS', w ? Object.keys(w).join(',') : 'n/a', 'WIN_STR', String(w));
    console.log('CANREAD secret/secret', canRead('secret', 'secret'));
    console.log('CANREAD restricted/restricted', canRead('restricted', 'restricted'));
    console.log('CANREAD internal/internal', canRead('internal', 'internal'));
    console.log('CANREAD private/private', canRead('private', 'private'));
    expect(true).toBe(true);
  });
});
