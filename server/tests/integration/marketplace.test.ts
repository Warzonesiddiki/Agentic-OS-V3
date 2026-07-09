/**
 * Integration tests — Marketplace full lifecycle against SQLite.
 *
 * Exercises the real MarketplaceService (marketplace.service.ts) end-to-end:
 *   - developer registers an Ed25519 signing key
 *   - publish a plugin (draft)
 *   - publish a version (signed artifact receipt; signature is verified)
 *   - submit a user review
 *   - security review approves the version
 *   - install the approved version -> install ledger recorded
 *   - dependency closure resolution across versions
 *
 * The `db` singleton (client.js) and the table definitions (schema.js) are
 * redirected to an in-memory better-sqlite3 database seeded with the marketplace
 * tables from the SQLite schema, so this runs with zero external services.
 * No FROZEN files are touched.
 *
 * NOTE: requires the `better-sqlite3` native binding (rebuilt on the CI runner).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as sqliteSchema from '../../src/db/schema-sqlite';
import { marketplaceService } from '../../src/services/marketplace.service';
import { generateEd25519KeyPair, signArtifactEd25519, receiptHash } from '../../src/lib/crypto-sign';

// ---- in-memory SQLite bootstrap (built lazily inside the factory) ----
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

vi.mock('../../src/db/client', () => {
  const db = bootstrapDb();
  return { db, isPg: () => false, isSqlite: () => true };
});

// The service imports its tables from schema.js; redirect to the SQLite schema
// so the in-memory DB tables line up with the real table definitions.
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

const DEV = 'dev-alice';

beforeEach(async () => {
  // wipe marketplace tables for a clean run
  const db = (marketplaceService as any).db as BetterSQLite3Database<typeof sqliteSchema>;
  await db.delete(sqliteSchema.pluginInstalls);
  await db.delete(sqliteSchema.pluginSecurityReviews);
  await db.delete(sqliteSchema.pluginDependencies);
  await db.delete(sqliteSchema.pluginReviews);
  await db.delete(sqliteSchema.marketplaceVersions);
  await db.delete(sqliteSchema.pluginSigningKeys);
  await db.delete(sqliteSchema.marketplacePlugins);
});

describe('Marketplace lifecycle (SQLite)', () => {
  it('publishes, reviews, security-approves, and installs a plugin', async () => {
    // 1) developer registers an Ed25519 signing key
    const kp = generateEd25519KeyPair();
    await marketplaceService.registerSigningKey(DEV, kp.publicKeyPem, 'primary');

    // 2) publish a draft plugin
    const pub = await marketplaceService.publishPlugin(DEV, 'Alice', {
      slug: 'my-plugin',
      name: 'My Plugin',
      description: 'does things',
      license: 'MIT',
      kind: 'plugin',
      category: 'utility',
    });
    expect(pub.slug).toBe('my-plugin');
    expect(pub.status).toBe('draft');

    // 3) publish a version with a signed artifact receipt
    const artifactSha = receiptHash({ pluginId: 'my-plugin', version: '1.0.0', files: ['index.js'] });
    const ver = await marketplaceService.publishVersion(
      DEV,
      pub.id,
      {
        version: '1.0.0',
        manifest: { name: 'my-plugin', version: '1.0.0', main: 'index.js' } as any,
        artifactSha256: artifactSha,
        artifactStorageKey: 's3://b/1.0.0.wasm',
        artifactSize: 1024,
        dependencies: [],
        changelog: 'initial',
      },
      { privkeyPem: kp.privateKeyPem, pubkeyPem: kp.publicKeyPem }
    );
    expect(ver.version).toBe('1.0.0');
    expect(ver.status).toBe('pending');

    // 4) user submits a review
    const review = await marketplaceService.addReview('reviewer-bob', 'Bob', 'my-plugin', {
      rating: 5,
      title: 'Great',
      body: 'Works great',
    });
    expect(review.rating).toBe(5);

    // 5) security review approves the version (proves signature verifies)
    const sec = await marketplaceService.approveVersion('sec-team', ver.id, 98, []);
    expect(sec.state).toBe('approved');

    // 6) install the approved version -> ledger entry recorded
    const install = await marketplaceService.install('installer', 'my-plugin', { tenantId: 'tenant-x' });
    expect(install.pluginId).toBe(pub.id);

    const installs = await (marketplaceService as any).db
      .select()
      .from(sqliteSchema.pluginInstalls);
    expect(installs.length).toBe(1);
    expect(installs[0].tenantId).toBe('tenant-x');
  });

  it('rejects a version whose artifact signature does not verify', async () => {
    const kp = generateEd25519KeyPair();
    await marketplaceService.registerSigningKey(DEV, kp.publicKeyPem, 'primary');
    const pub = await marketplaceService.publishPlugin(DEV, 'Alice', {
      slug: 'bad-plugin',
      name: 'Bad Plugin',
      description: 'x',
      license: 'MIT',
    });

    await expect(
      marketplaceService.publishVersion(
        DEV,
        pub.id,
        {
          version: '1.0.0',
          manifest: { name: 'bad-plugin', version: '1.0.0' } as any,
          artifactSha256: 'deadbeef',
          artifactStorageKey: 's3://b/bad.wasm',
          artifactSize: 1,
          dependencies: [],
          changelog: '',
        },
        { privkeyPem: kp.privateKeyPem, pubkeyPem: kp.publicKeyPem }
      )
    ).rejects.toThrow();
  });

  it('resolves a dependency closure across multiple versions', async () => {
    const kp = generateEd25519KeyPair();
    await marketplaceService.registerSigningKey(DEV, kp.publicKeyPem, 'primary');

    async function publish(id: string, deps: { slug: string; versionRange: string }[]) {
      const plugin = await marketplaceService.publishPlugin(DEV, 'Alice', {
        slug: id,
        name: id,
        description: id,
        license: 'MIT',
      });
      const sha = receiptHash({ pluginId: id, version: '1.0.0', files: [] });
      await marketplaceService.publishVersion(
        DEV,
        plugin.id,
        {
          version: '1.0.0',
          manifest: { name: id, version: '1.0.0' } as any,
          artifactSha256: sha,
          artifactStorageKey: `s3://b/${id}.wasm`,
          artifactSize: 1,
          dependencies: deps,
          changelog: '',
        },
        { privkeyPem: kp.privateKeyPem, pubkeyPem: kp.publicKeyPem }
      );
      await marketplaceService.approveVersion('sec', 'ignored', 100, []);
      return plugin;
    }

    await publish('core', []);
    await publish('mid', [{ slug: 'core', versionRange: '1.0.0' }]);
    await publish('top', [{ slug: 'mid', versionRange: '1.0.0' }]);

    const closure = await marketplaceService.resolveDependencyClosure('top');
    const slugs = closure.map((c) => c.slug).sort();
    expect(slugs).toEqual(['core', 'mid', 'top']);
  });
});
