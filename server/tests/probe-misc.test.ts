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
import { detectLanguage } from '../src/services/memory-multilingual.js';

describe('probe', () => {
  it('logs', () => {
    const a: MemoryLite = { id: 'a', importance: 0.9, retrievedAt: 1 } as any;
    const b: MemoryLite = { id: 'b', importance: 0.5, retrievedAt: 2 } as any;
    console.log('WIN recency', selectWinner('recency', a, b));
    console.log('WIN importance', selectWinner('importance', a, b));
    console.log('WIN confidence', selectWinner('confidence', a, b));

    console.log('CANREAD same', canRead('public', 'public'));
    console.log('CANREAD up', canRead('secret', 'public'));
    console.log('CANREAD down', canRead('public', 'secret'));

    const zone: PrivacyZone = { id: 'z1', level: 'secret', allow: ['u1'] } as any;
    console.log('APPLYZONE', JSON.stringify(applyZone('m1', zone)));

    console.log('LANG es', detectLanguage('el la los una que por con para'));
    console.log('LANG de', detectLanguage('der die das und ist ein mit für'));
    console.log('LANG en-stop', detectLanguage('the a an and or but of to in on for with'));
    expect(true).toBe(true);
  });
});
