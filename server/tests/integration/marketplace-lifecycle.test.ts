/**
 * Integration test — Marketplace full lifecycle (submit -> review -> approve ->
 * publish -> install -> rate) against an in-memory SQLite database.
 *
 * Drives the REAL MarketplaceService public API end-to-end and asserts every
 * state transition plus review gating. The `db` singleton (client.js) and the
 * table definitions (schema.js) are redirected to an in-memory better-sqlite3
 * database seeded with the marketplace tables from the SQLite schema, so this
 * runs with zero external services. No FROZEN files are touched.
 *
 * NOTE: requires the `better-sqlite3` native binding (rebuilt on the CI runner).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, eq, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as sqliteSchema from '../../src/db/schema-sqlite';
import { marketplaceService } from '../../src/services/marketplace.service';
import { generateEd25519KeyPair, signArtifactEd25519, receiptHash } from '../../src/lib/crypto-sign';

function bootstrapDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_plugins (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      kind TEXT NOT NULL DEFAULT 'plugin',
      license TEXT NOT NULL DEFAULT 'MIT',
      homepage TEXT,
      repository TEXT,
      latest_version TEXT,
      latest_version_id TEXT,
      avg_rating REAL NOT NULL DEFAULT 0,
      rating_count INTEGER NOT NULL DEFAULT 0,
      install_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE TABLE IF NOT EXISTS marketplace_versions (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      version TEXT NOT NULL,
      manifest TEXT NOT NULL DEFAULT '{}',
      artifact_sha256 TEXT NOT NULL,
      artifact_size INTEGER NOT NULL DEFAULT 0,
      artifact_storage_key TEXT NOT NULL,
      wasm_entry TEXT,
      min_engine_version TEXT,
      changelog TEXT NOT NULL DEFAULT '',
      signature TEXT,
      signer_pubkey TEXT,
      fuel_limit INTEGER NOT NULL DEFAULT 1000000000,
      sandbox_profile TEXT NOT NULL DEFAULT 'default',
      status TEXT NOT NULL DEFAULT 'pending',
      security_review_id TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE TABLE IF NOT EXISTS plugin_reviews (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      version_id TEXT,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL DEFAULT '',
      rating INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      helpful_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE TABLE IF NOT EXISTS plugin_dependencies (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      version_id TEXT NOT NULL,
      dep_slug TEXT NOT NULL,
      dep_version_range TEXT NOT NULL DEFAULT '*',
      kind TEXT NOT NULL DEFAULT 'runtime',
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE TABLE IF NOT EXISTS plugin_installs (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      version_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      installed_by TEXT NOT NULL,
      install_path TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE TABLE IF NOT EXISTS plugin_security_reviews (
      id TEXT PRIMARY KEY,
      version_id TEXT NOT NULL,
      reviewer_id TEXT,
      state TEXT NOT NULL DEFAULT 'queued',
      score INTEGER,
      findings TEXT NOT NULL DEFAULT '[]',
      scanned_with TEXT NOT NULL DEFAULT 'static-sandbox',
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE TABLE IF NOT EXISTS plugin_signing_keys (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      pubkey TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT 'default',
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
  return drizzle(sqlite, { schema: sqliteSchema });
}



vi.mock('../../src/db/client', () => ({
  db: bootstrapDb(),
  isPg: () => false,
  isSqlite: () => true,
}));

vi.mock('../../src/db/schema', () => ({
  marketplacePlugins: sqliteSchema.marketplacePlugins,
  marketplaceVersions: sqliteSchema.marketplaceVersions,
  pluginReviews: sqliteSchema.pluginReviews,
  pluginDependencies: sqliteSchema.pluginDependencies,
  pluginInstalls: sqliteSchema.pluginInstalls,
  pluginSecurityReviews: sqliteSchema.pluginSecurityReviews,
  pluginSigningKeys: sqliteSchema.pluginSigningKeys,
  marketplaceIntegrations: sqliteSchema.marketplaceIntegrations,
}));

function db(): BetterSQLite3Database<typeof sqliteSchema> {
  return (marketplaceService as any).db as BetterSQLite3Database<typeof sqliteSchema>;
}

const DEV = 'dev-alice';

beforeEach(async () => {
  await db().delete(sqliteSchema.pluginInstalls);
  await db().delete(sqliteSchema.pluginSecurityReviews);
  await db().delete(sqliteSchema.pluginDependencies);
  await db().delete(sqliteSchema.pluginReviews);
  await db().delete(sqliteSchema.marketplaceVersions);
  await db().delete(sqliteSchema.pluginSigningKeys);
  await db().delete(sqliteSchema.marketplacePlugins);
});

describe('Marketplace lifecycle — submit -> review -> approve -> publish -> install -> rate', () => {
  it('walks every state transition through the public API', async () => {
    const kp = generateEd25519KeyPair();
    await marketplaceService.registerSigningKey(DEV, kp.publicKeyPem, 'primary');

    // 1) author publishes a draft plugin
    const plugin = await marketplaceService.publishPlugin(DEV, 'Alice', {
      slug: 'lifecycle-plugin',
      name: 'Lifecycle Plugin',
      description: 'full lifecycle',
      license: 'MIT',
    });
    expect(plugin.status).toBe('draft');
    expect(plugin.latestVersionId).toBeNull();

    // 2) author publishes a signed version (status defaults to pending)
    const artifactSha = receiptHash({ pluginId: plugin.id, version: '1.0.0', files: ['index.js'] });
    const version = await marketplaceService.publishVersion(
      DEV,
      plugin.id,
      {
        version: '1.0.0',
        manifest: { name: 'lifecycle-plugin', version: '1.0.0', main: 'index.js' } as any,
        artifactSha256: artifactSha,
        artifactStorageKey: 's3://b/1.0.0.wasm',
        artifactSize: 1024,
        dependencies: [],
        changelog: 'initial',
      },
      { privkeyPem: kp.privateKeyPem, pubkeyPem: kp.publicKeyPem }
    );
    expect(version.version).toBe('1.0.0');
    expect(version.status).toBe('pending');

    // 3) author submits the version for review -> security review queued
    const submitted = await marketplaceService.submitForReview(version.id);
    expect(submitted.status).toBe('pending');
    const queued = await db()
      .select()
      .from(sqliteSchema.pluginSecurityReviews)
      .where(eq(sqliteSchema.pluginSecurityReviews.versionId, version.id));
    expect(queued.length).toBe(1);
    expect(queued[0].state).toBe('queued');

    // 4) security reviewer approves -> version approved AND plugin published
    const approved = await marketplaceService.approveVersion('sec-team', version.id, 97, []);
    expect(approved.status).toBe('approved');

    const published = await marketplaceService.getPlugin('lifecycle-plugin');
    expect(published.status).toBe('published');
    expect(published.latestVersionId).toBe(version.id);
    expect(published.versions[0].status).toBe('approved');

    // 5) a tenant installs the published version (creates/updates install ledger)
    const install = await marketplaceService.install('installer', 'lifecycle-plugin', {
      tenantId: 'tenant-x',
    });
    expect(install.id).toBeTruthy();
    expect(install.receipt).toBeTruthy();
    const installs = await db().select().from(sqliteSchema.pluginInstalls);
    expect(installs.length).toBe(1);
    expect(installs[0].tenantId).toBe('tenant-x');

    const afterInstall = await marketplaceService.getPlugin('lifecycle-plugin');
    expect(afterInstall.installCount).toBe(1);

    // 6) users rate the plugin -> avg rating recomputed
    await marketplaceService.addReview('bob', 'Bob', 'lifecycle-plugin', {
      rating: 5,
      title: 'Great',
      body: 'works',
    });
    await marketplaceService.addReview('carol', 'Carol', 'lifecycle-plugin', {
      rating: 3,
      title: 'Ok',
      body: 'fine',
    });
    const rated = await marketplaceService.getPlugin('lifecycle-plugin');
    expect(rated.ratingCount).toBe(2);
    expect(rated.avgRating).toBe(4); // (5+3)/2
  });

  it('review gating: a review on a non-existent plugin is rejected', async () => {
    await expect(
      marketplaceService.addReview('eve', 'Eve', 'does-not-exist', { rating: 4, title: 'x', body: 'y' })
    ).rejects.toThrow(/not found/i);
  });

  it('review gating: a rating outside 1..5 is rejected by schema validation', async () => {
    const kp = generateEd25519KeyPair();
    await marketplaceService.registerSigningKey(DEV, kp.publicKeyPem, 'primary');
    const plugin = await marketplaceService.publishPlugin(DEV, 'Alice', {
      slug: 'gate-plugin',
      name: 'Gate',
      description: 'x',
      license: 'MIT',
    });
    await expect(
      marketplaceService.addReview('eve', 'Eve', 'gate-plugin', { rating: 9, title: 'x', body: 'y' })
    ).rejects.toThrow();
  });

  it('rejection keeps the plugin unpublished (no install possible)', async () => {
    const kp = generateEd25519KeyPair();
    await marketplaceService.registerSigningKey(DEV, kp.publicKeyPem, 'primary');
    const plugin = await marketplaceService.publishPlugin(DEV, 'Alice', {
      slug: 'reject-plugin',
      name: 'Reject',
      description: 'x',
      license: 'MIT',
    });
    const artifactSha = receiptHash({ pluginId: plugin.id, version: '1.0.0', files: [] });
    const version = await marketplaceService.publishVersion(
      DEV,
      plugin.id,
      {
        version: '1.0.0',
        manifest: { name: 'reject-plugin', version: '1.0.0' } as any,
        artifactSha256: artifactSha,
        artifactStorageKey: 's3://b/r.wasm',
        artifactSize: 1,
        dependencies: [],
        changelog: '',
      },
      { privkeyPem: kp.privateKeyPem, pubkeyPem: kp.publicKeyPem }
    );
    const rejected = await marketplaceService.rejectVersion('sec', version.id, 'unsafe', []);
    expect(rejected.status).toBe('rejected');

    const after = await marketplaceService.getPlugin('reject-plugin');
    expect(after.status).toBe('draft'); // plugin never published
    expect(after.latestVersionId).toBeNull();

    await expect(
      marketplaceService.install('installer', 'reject-plugin', { tenantId: 'tenant-y' })
    ).rejects.toThrow(/not found/i);
  });
});
