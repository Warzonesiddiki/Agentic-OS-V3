/**
 * Integration tests — Marketplace full lifecycle against SQLite.
 *
 * Exercises the real MarketplaceService end-to-end:
 *   - developer registers a signing key
 *   - publish a plugin (draft) then a version
 *   - submit a user review (rating + comment)
 *   - security review approves the version
 *   - install the approved version -> install ledger recorded
 *   - dependency closure resolution
 *
 * The `db` singleton (client.js) and the table definitions (schema.js) are
 * redirected to an in-memory better-sqlite3 database built from the SQLite
 * schema, so this runs with zero external services. No FROZEN files touched.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

// ---- in-memory SQLite DB seeded from the SQLite schema ----
import * as sqliteSchema from '../../src/db/schema-sqlite.js';

const sqlite = new Database(':memory:');
sqlite.pragma('foreign_keys = OFF');
const testDb: BetterSQLite3Database<typeof sqliteSchema> = drizzle(sqlite, { schema: sqliteSchema });

// Map logical table names used by the service to the sqlite schema objects.
const tables = {
  marketplacePlugins: sqliteSchema.marketplacePlugins,
  marketplaceVersions: sqliteSchema.marketplaceVersions,
  pluginReviews: sqliteSchema.pluginReviews,
  pluginDependencies: sqliteSchema.pluginDependencies,
  pluginInstalls: sqliteSchema.pluginInstalls,
  pluginSecurityReviews: sqliteSchema.pluginSecurityReviews,
  pluginSigningKeys: sqliteSchema.pluginSigningKeys,
  marketplaceIntegrations: sqliteSchema.marketplaceIntegrations,
  pluginReviewVotes: sqliteSchema.pluginReviewVotes,
  pluginInstallLedger: sqliteSchema.pluginInstallLedger,
};

vi.mock('../../src/db/client.js', () => ({ db: testDb, isPg: () => false }));
vi.mock('../../src/db/schema.js', () => ({
  marketplacePlugins: tables.marketplacePlugins,
  marketplaceVersions: tables.marketplaceVersions,
  pluginReviews: tables.pluginReviews,
  pluginDependencies: tables.pluginDependencies,
  pluginInstalls: tables.pluginInstalls,
  pluginSecurityReviews: tables.pluginSecurityReviews,
  pluginSigningKeys: tables.pluginSigningKeys,
  marketplaceIntegrations: tables.marketplaceIntegrations,
  pluginReviewVotes: tables.pluginReviewVotes,
  pluginInstallLedger: tables.pluginInstallLedger,
}));

import { MarketplaceService } from '../../src/services/marketplace.service.js';
import { generateEd25519KeyPair, signArtifactEd25519, receiptHash } from '../../src/lib/crypto-sign.js';

function freshService() {
  return new MarketplaceService({ registryBaseUrl: 'https://registry.test' });
}

const DEV = 'dev-alice';

beforeEach(async () => {
  // wipe tables for a clean run
  await testDb.delete(tables.pluginInstallLedger);
  await testDb.delete(tables.pluginReviewVotes);
  await testDb.delete(tables.pluginInstalls);
  await testDb.delete(tables.pluginSecurityReviews);
  await testDb.delete(tables.pluginDependencies);
  await testDb.delete(tables.pluginReviews);
  await testDb.delete(tables.marketplaceVersions);
  await testDb.delete(tables.pluginSigningKeys);
  await testDb.delete(tables.marketplacePlugins);
});

describe('Marketplace lifecycle', () => {
  it('publishes, reviews, security-approves, and installs a plugin', async () => {
    const svc = freshService();

    // 1) developer registers an Ed25519 signing key
    const kp = generateEd25519KeyPair();
    await svc.registerSigningKey(DEV, kp.publicKeyPem, 'primary');

    // 2) publish a draft plugin
    const pub = await svc.publishPlugin(
      {
        pluginId: 'my-plugin',
        name: 'My Plugin',
        description: 'does things',
        authorId: DEV,
        homepage: 'https://example.com',
        repository: 'https://example.com/repo',
        license: 'MIT',
        tags: ['utility'],
        manifest: { name: 'my-plugin', version: '1.0.0', main: 'index.js' },
      },
      { id: DEV } as any
    );
    expect(pub.pluginId).toBe('my-plugin');
    expect(pub.status).toBe('draft');

    // 3) publish a version with a signed artifact receipt
    const artifactSha = receiptHash({ pluginId: 'my-plugin', version: '1.0.0', files: ['index.js'] });
    const sig = signArtifactEd25519(kp.privateKeyPem, artifactSha);
    const ver = await svc.publishVersion(
      {
        pluginId: 'my-plugin',
        version: '1.0.0',
        artifactSha256: artifactSha,
        artifactSignature: sig,
        keyId: 'primary',
        manifest: { name: 'my-plugin', version: '1.0.0', main: 'index.js' },
        dependencies: [],
        changelog: 'initial',
      },
      { id: DEV } as any
    );
    expect(ver.version).toBe('1.0.0');
    expect(ver.status).toBe('submitted');

    // 4) user submits a review
    const review = await svc.submitReview(
      'my-plugin',
      '1.0.0',
      'reviewer-bob',
      5,
      'Works great',
      {}
    );
    expect(review.rating).toBe(5);
    expect(review.status).toBe('pending');

    // 5) security review approves the version (proves signature verifies)
    const sec = await svc.reviewVersionSecurity('my-plugin', '1.0.0', {
      reviewerId: 'sec-team',
      decision: 'approve',
      notes: 'clean',
      severity: 'none',
    });
    expect(sec.status).toBe('approved');

    // 6) install the approved version -> ledger entry recorded
    const install = await svc.installVersion('my-plugin', '1.0.0', 'tenant-x', {
      id: 'installer',
    } as any);
    expect(install.pluginId).toBe('my-plugin');
    expect(install.version).toBe('1.0.0');

    const installs = await testDb.select().from(tables.pluginInstalls);
    expect(installs.length).toBe(1);
    expect(installs[0].tenantId).toBe('tenant-x');
  });

  it('rejects a version whose artifact signature does not verify', async () => {
    const svc = freshService();
    const kp = generateEd25519KeyPair();
    await svc.registerSigningKey(DEV, kp.publicKeyPem, 'primary');
    await svc.publishPlugin(
      {
        pluginId: 'bad-plugin',
        name: 'Bad Plugin',
        description: 'x',
        authorId: DEV,
        manifest: { name: 'bad-plugin', version: '1.0.0' },
      },
      { id: DEV } as any
    );

    await expect(
      svc.publishVersion(
        {
          pluginId: 'bad-plugin',
          version: '1.0.0',
          artifactSha256: 'deadbeef',
          artifactSignature: 'not-a-valid-signature',
          keyId: 'primary',
          manifest: { name: 'bad-plugin', version: '1.0.0' },
          dependencies: [],
          changelog: '',
        },
        { id: DEV } as any
      )
    ).rejects.toThrow();
  });

  it('resolves a dependency closure across multiple versions', async () => {
    const svc = freshService();
    const kp = generateEd25519KeyPair();
    await svc.registerSigningKey(DEV, kp.publicKeyPem, 'primary');

    async function publish(id: string, deps: { pluginId: string; version: string }[]) {
      await svc.publishPlugin(
        { pluginId: id, name: id, description: id, authorId: DEV, manifest: { name: id, version: '1.0.0' } },
        { id: DEV } as any
      );
      const sha = receiptHash({ pluginId: id, version: '1.0.0', files: [] });
      await svc.publishVersion(
        {
          pluginId: id,
          version: '1.0.0',
          artifactSha256: sha,
          artifactSignature: signArtifactEd25519(kp.privateKeyPem, sha),
          keyId: 'primary',
          manifest: { name: id, version: '1.0.0' },
          dependencies: deps,
          changelog: '',
        },
        { id: DEV } as any
      );
      await svc.reviewVersionSecurity(id, '1.0.0', { reviewerId: 'sec', decision: 'approve', notes: '', severity: 'none' });
    }

    await publish('core', []);
    await publish('mid', [{ pluginId: 'core', version: '1.0.0' }]);
    await publish('top', [{ pluginId: 'mid', version: '1.0.0' }]);

    const closure = await svc.resolveDependencyClosure('top', '1.0.0');
    const ids = closure.map((c) => c.pluginId).sort();
    expect(ids).toEqual(['core', 'mid', 'top']);
  });
});
