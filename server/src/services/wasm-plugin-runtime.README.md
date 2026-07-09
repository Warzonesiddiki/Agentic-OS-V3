# wasm-plugin-runtime

## Purpose
WebAssembly plugin runtime (Phase 19). Manifest signing (`canonicalizeManifest`/`verifyManifestSignature` +
`publisherPubKeys`), register/install/uninstall/revoke/quarantine plugins, artifact integrity gating
(`verifyArtifactIntegrity`/`IntegrityGateFailure`), a `ResourceFuse` breaker (`withResourceFuse` +
`ResourceFuseTripped`), and `invokePlugin`/`listReceipts` with capability checks (`checkCapability`).
(Artisan area.)

## Public exports (selected)
- `interface LoadedPlugin`, `interface PluginInvocation`, `interface ValidatedInvocation`,
  `interface PluginReceipt`.
- `const publisherPubKeys: Map<string, string>`.
- `function canonicalizeManifest(m)`, `verifyManifestSignature(...)`.
- `async function registerPlugin(input)`, `installPlugin(...)`, `uninstallPlugin(id)`,
  `revokePlugin(id, reason)`, `quarantinePlugin(id, reason)`.
- `interface IntegrityReport`, `class IntegrityGateFailure`, `verifyArtifactIntegrity(plugin)`.
- `interface ResourceFuseOptions`, `class ResourceFuseTripped`, `withResourceFuse(fn, opts)`.
- `async function loadPlugin(id)`, `listInstalledPlugins()`.
- `function checkCapability(plugin, capability)`.
- `async function invokePlugin(req)`, `listReceipts(opts?)`, `invalidatePluginCache()`.

## Env vars
- `NEXUS_PLUGIN_PUBLISHER_PUBKEYS` — comma-separated trusted publisher public keys.

## Test file
- `server/tests/wasm-plugin-runtime.test.ts` (signature verify, integrity gate, fuse, invoke).
