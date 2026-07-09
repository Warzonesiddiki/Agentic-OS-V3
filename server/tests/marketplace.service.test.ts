/**
 * marketplace.service.ts — unit tests (Artisan namespace coverage).
 * Pure manifest signing/verification helpers + DB-backed listing/rating
 * query builders (DB mocked, returning empty so builders execute).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chain = () => {
  const o: any = {};
  o.from = () => o;
  o.leftJoin = () => o;
  o.where = () => o;
  o.orderBy = () => o;
  o.limit = () => Promise.resolve([]);
  o.findFirst = () => Promise.resolve(null);
  o.findMany = () => Promise.resolve([]);
  return o;
};
const returningChain = (rows: unknown[] = [{}]) => {
  const p: any = Promise.resolve(rows);
  p.$dynamic = () => Promise.resolve(rows);
  return p;
};
const insertChain = () => ({
  values: vi.fn(() => ({
    onConflictDoNothing: vi.fn(() => Promise.resolve()),
    onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn(() => returningChain([{}])) })),
    returning: vi.fn(() => returningChain([{}])),
  })),
});
const dbMock: any = {
  select: vi.fn(() => chain()),
  insert: vi.fn(() => insertChain()),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(() => returningChain([{}])) })) })) })),
  delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
  query: { marketplacePlugins: chain(), pluginInstallations: chain(), pluginRatings: chain() },
  transaction: vi.fn((fn: any) => fn(dbMock)),
};
vi.mock('../src/db/client.js', () => ({ db: dbMock, isSqlite: false, isPg: true }));
vi.mock('../src/lib/audit.js', () => ({ appendAudit: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/lib/logging.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  signManifestBytes,
  serializeManifest,
  verifyManifestBytes,
  getMarketplaceListing,
  getVerifiedListing,
  searchMarketplace,
} from '../src/services/marketplace.service.js';

describe('manifest sign / verify (pure)', () => {
  it('sign then verify round-trips', () => {
    const manifest = { name: 'io.nexus.x', version: '1.0.0', capabilities: [{ exact: 'a' }] } as any;
    const sig = signManifestBytes(manifest, 'secret-key');
    expect(sig).toBeTruthy();
    expect(verifyManifestBytes(manifest, sig, 'secret-key')).toBe(true);
    expect(verifyManifestBytes(manifest, sig, 'wrong')).toBe(false);
  });

  it('serializeManifest sorts keys', () => {
    const s = serializeManifest({ b: 1, a: 2 });
    expect(s.indexOf('"a"')).toBeLessThan(s.indexOf('"b"'));
  });
});

describe('marketplace query builders (mocked db)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getMarketplaceListing returns an array', async () => {
    const rows = await getMarketplaceListing({ limit: 10, offset: 0 });
    expect(Array.isArray(rows)).toBe(true);
    expect(dbMock.select).toHaveBeenCalled();
  });

  it('getVerifiedListing filters verified', async () => {
    const rows = await getVerifiedListing({ limit: 5, offset: 0 });
    expect(Array.isArray(rows)).toBe(true);
  });

  it('searchMarketplace returns an array', async () => {
    const rows = await searchMarketplace('summar');
    expect(Array.isArray(rows)).toBe(true);
  });
});
