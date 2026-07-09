# marketplace.service

## Purpose
Plugin/skill marketplace backend. Zod schemas for publishing a plugin, publishing a version, submitting a
review, and installing. `resolveDependencyClosure` computes the transitive install set; `marketplaceService`
bundles CRUD/install/review/list operations. (Artisan area.)

## Public exports (selected)
- `publishPluginSchema`, `publishVersionSchema`, `reviewSchema`, `installSchema` (Zod).
- `async function resolveDependencyClosure(rootIds): Promise<string[]>`.
- `const marketplaceService` — `{ publishPlugin, publishVersion, listPlugins, getPlugin, submitReview,
  listReviews, install, uninstall, getInstalled, listInstalled }`.

## Env vars
None directly.

## Test file
- `server/tests/marketplace.test.ts` (dependency closure, publish/install flow).
