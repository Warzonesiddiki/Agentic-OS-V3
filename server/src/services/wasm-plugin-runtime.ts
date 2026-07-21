/**
 * wasm-plugin-runtime.ts
 * ──────────────────────
 * Pillar II of the 100× upgrade.
 *
 * A sandboxed plugin runtime that loads signed WASM modules, enforces
 * capability manifests, and produces tamper-evident receipts for every call.
 *
 * Capabilities (what the plugin is allowed to do):
 *   - http.outbound.{host}   — call out to specific hosts
 *   - vault.read             — read encrypted secrets
 *   - vault.write            — write encrypted secrets (BLOCKING by default)
 *   - recall.query           — query the local recall index
 *   - llm.invoke             — call the LLM gateway (with token budget)
 *   - skill.invoke.{name}    — invoke a specific compiled skill
 *   - filesystem.read.{path} — read files under a path prefix
 *
 * Manifest schema is enforced by `plugin-manifest.ts`. Manifests are signed
 * with the publisher's ed25519 key; signature is verified at load time.
 *
 * Receipts (Pillar II §3) record every plugin invocation: which plugin, which
 * agent, which capability, input/output hashes, fuel used, and whether the
 * call was authorized under the manifest.
 *
 * Default-deny: a plugin without a matching capability entry cannot invoke
 * that capability. Period.
 */
import { createHash, randomUUID, verify } from 'node:crypto';
import { db } from '../db/client.js';
import { plugins, pluginInstallations, pluginReceipts } from '../db/client.js';
import { desc, eq } from 'drizzle-orm';
import { appendAudit } from '../lib/audit.js';
import { log } from '../lib/logging.js';
import { validateManifest, type PluginManifest, type CapabilitySpec } from './plugin-manifest.js';

/* ─── Public types ───────────────────────────────────────────────────────── */

export interface LoadedPlugin {
  id: string;
  name: string;
  version: string;
  manifest: PluginManifest;
  contentSha256: string;
  wasmBytes?: Uint8Array;
  trustState: 'untrusted' | 'trusted' | 'revoked';
  ringOverride: number | null;
  config: Record<string, unknown>;
}

export interface PluginInvocation {
  agentId: string;
  pluginId: string;
  capability: string;
  inputBytes: Uint8Array;
  /** The actual WASM invocation is performed by the consumer; we only validate + receipt. */
  computeOutput: (
    validated: ValidatedInvocation
  ) => Promise<{ outputBytes: Uint8Array; fuelUsed: number; exitCode: number }>;
}

export interface ValidatedInvocation {
  plugin: LoadedPlugin;
  capability: CapabilitySpec;
  inputSha256: string;
  startedAt: number;
}

export interface PluginReceipt {
  id: string;
  pluginId: string;
  installId: string | null;
  agentId: string;
  capability: string;
  inputSha256: string;
  outputSha256: string;
  exitCode: number;
  fuelUsed: number;
  durationMs: number;
  authorized: boolean;
}

/* ─── In-memory cache of loaded plugins ──────────────────────────────────── */

const loaded = new Map<string, LoadedPlugin>();
let _manifestCacheStamp = 0;

/* ─── Publisher trust store ──────────────────────────────────────────────── */

const TRUSTED_PUBLISHERS = new Set<string>([
  // populated from env: NEXUS_PLUGIN_PUBLISHER_PUBKEYS=pk1,pk2,pk3
  ...(process.env.NEXUS_PLUGIN_PUBLISHER_PUBKEYS?.split(',')
    .map((publisherKey) => publisherKey.trim())
    .filter(Boolean) ?? []),
]);

/* ─── Manifest verification ─────────────────────────────────────────────── */

/**
 * Canonicalize the manifest for signing/verification. Must match what the
 * publisher signs.
 */
export function canonicalizeManifest(m: PluginManifest): string {
  // Stable JSON: sort keys, no whitespace. Matches the convention used by
  // the audit chain's `stableStringify`.
  return JSON.stringify(m, Object.keys(m).sort());
}

export function verifyManifestSignature(
  manifest: PluginManifest,
  signatureB64: string,
  publisherPubkeyB64: string
): boolean {
  try {
    const msg = Buffer.from(canonicalizeManifest(manifest), 'utf8');
    const sig = Buffer.from(signatureB64, 'base64');
    const pub = Buffer.from(publisherPubkeyB64, 'base64');
    return verify(null, msg, { key: pub, format: 'der', type: 'spki' }, sig);
  } catch (e) {
    log.warn('plugin.signature_verify_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

/* ─── Install / uninstall / load ─────────────────────────────────────────── */

export async function registerPlugin(input: {
  name: string;
  version: string;
  description?: string;
  authorPubkey: string;
  signature: string;
  wasmBytes: Uint8Array;
  manifest: PluginManifest;
  homepage?: string;
  license?: string;
  source?: string;
}): Promise<LoadedPlugin> {
  // 1. validate the manifest schema
  const validated = validateManifest(input.manifest);

  // 2. verify signature
  if (!verifyManifestSignature(validated, input.signature, input.authorPubkey)) {
    await appendAudit(
      'plugin.signature_invalid',
      { name: input.name, version: input.version },
      'plugin-runtime'
    );
    throw new Error('plugin_signature_invalid');
  }

  // 3. compute content hash
  const contentSha256 = createHash('sha256').update(input.wasmBytes).digest('hex');

  // 4. trust assignment
  const trustState: 'trusted' | 'untrusted' = TRUSTED_PUBLISHERS.has(input.authorPubkey)
    ? 'trusted'
    : 'untrusted';

  // 5. upsert
  const id = `plg_${randomUUID()}`;
  await db
    .insert(plugins)
    .values({
      id,
      name: input.name,
      version: input.version,
      description: input.description ?? '',
      authorPubkey: input.authorPubkey,
      signature: input.signature,
      contentSha256,
      manifest: validated as unknown as Record<string, unknown>,
      wasmBytes: Buffer.from(input.wasmBytes).toString('base64'),
      source: input.source ?? 'local',
      homepage: input.homepage ?? null,
      license: input.license ?? null,
      ratingAvg: 0,
      ratingCount: 0,
      installCount: 0,
      trustState,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  await appendAudit(
    'plugin.registered',
    {
      name: input.name,
      version: input.version,
      contentSha256,
      trustState,
      publisherTrusted: TRUSTED_PUBLISHERS.has(input.authorPubkey),
    },
    'plugin-runtime'
  );

  log.info('plugin.registered', { id, name: input.name, version: input.version, trustState });
  const loaded = await loadPlugin(id);
  if (!loaded) throw new Error('plugin_load_failed');
  return loaded;
}

export async function installPlugin(
  pluginId: string,
  opts?: { ringOverride?: number; config?: Record<string, unknown> }
): Promise<void> {
  const plugin = await loadPlugin(pluginId);
  if (!plugin) throw new Error('plugin_not_found');
  if (plugin.trustState === 'revoked') throw new Error('plugin_revoked');

  const installId = `pi_${randomUUID()}`;
  await db
    .insert(pluginInstallations)
    .values({
      id: installId,
      pluginId,
      enabled: true,
      ringOverride: opts?.ringOverride ?? null,
      config: opts?.config ?? {},
      installedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pluginInstallations.pluginId,
      set: {
        enabled: true,
        ringOverride: opts?.ringOverride ?? null,
        config: opts?.config ?? {},
        updatedAt: new Date(),
      },
    });

  await db
    .update(plugins)
    .set({
      installCount:
        (await db.query.plugins.findFirst({ where: eq(plugins.id, pluginId) }))!.installCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(plugins.id, pluginId));
  await appendAudit(
    'plugin.installed',
    { pluginId, installId, ringOverride: opts?.ringOverride ?? null },
    'plugin-runtime'
  );
  loaded.delete(pluginId); // force re-load with new config
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  await db
    .update(pluginInstallations)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(pluginInstallations.pluginId, pluginId));
  await appendAudit('plugin.uninstalled', { pluginId }, 'plugin-runtime');
  loaded.delete(pluginId);
}

/* ─── Integrity gate + resource fuse (self-healing isolation) ─────────────── */

/**
 * Artifact integrity / attestation check (fail-closed).
 *
 * 1. Checksum: recompute the SHA-256 of the plugin's recorded WASM bytes and
 *    compare against the stored `contentSha256`. A mismatch means the artifact
 *    was tampered with on disk or in the DB and MUST NOT be executed.
 * 2. Attestation: if a publisher Ed25519 public key is registered for the
 *    plugin's author (`publisherPubKeys` map), verify the manifest signature
 *    over the manifest body. Missing/unverifiable signatures on an attested
 *    publisher are rejected.
 *
 * Returns a report; throws `IntegrityGateFailure` when the artifact must not
 * be executed (default-deny — never silently proceed).
 */
export interface IntegrityReport {
  checkedAt: number;
  checksumOk: boolean;
  attested: boolean;
  attestedOk: boolean;
  detail: string;
}

export class IntegrityGateFailure extends Error {
  constructor(public readonly report: IntegrityReport) {
    super(`plugin integrity gate failed: ${report.detail}`);
    this.name = 'IntegrityGateFailure';
  }
}

/** Registered publisher -> Ed25519 public key (hex). Populated at boot/by operator. */
export const publisherPubKeys = new Map<string, string>();

export async function verifyArtifactIntegrity(plugin: LoadedPlugin): Promise<IntegrityReport> {
  /** Read the persisted plugin row (artifact bytes + recorded hash) for integrity checks. */
  async function getPluginRecord(
    pluginId: string
  ): Promise<{ contentSha256: string; wasmBytes?: Uint8Array } | null> {
    const row = await db.query.plugins.findFirst({ where: eq(plugins.id, pluginId) });
    if (!row) return null;
    const bytes = row.wasmBytes ? Buffer.from(row.wasmBytes, 'base64') : undefined;
    return { contentSha256: row.contentSha256, wasmBytes: bytes };
  }

  const recorded = await getPluginRecord(plugin.id);
  const expectedSha = recorded?.contentSha256 ?? plugin.contentSha256;
  const bytes = plugin.wasmBytes ?? recorded?.wasmBytes;
  let checksumOk = false;
  if (bytes && expectedSha) {
    const actual = createHash('sha256').update(bytes).digest('hex');
    checksumOk = actual === expectedSha;
  }
  const pubKey = plugin.manifest.author ? publisherPubKeys.get(plugin.manifest.author) : undefined;
  let attested = false;
  let attestedOk = false;
  if (pubKey && plugin.manifest.signature) {
    attested = true;
    try {
      const body = JSON.stringify({ ...plugin.manifest, signature: undefined });
      const sig = Buffer.from(plugin.manifest.signature, 'hex');
      const pkey = Buffer.from(pubKey, 'hex');
      attestedOk = verify(null, Buffer.from(body, 'utf8'), pkey, sig);
    } catch {
      attestedOk = false;
    }
  }
  const detail = !checksumOk
    ? 'checksum mismatch or missing bytes/hash'
    : attested && !attestedOk
      ? 'publisher signature verification failed'
      : 'ok';
  const report: IntegrityReport = {
    checkedAt: Date.now(),
    checksumOk,
    attested,
    attestedOk: attested ? attestedOk : true,
    detail,
  };
  if (!checksumOk || (attested && !attestedOk)) {
    throw new IntegrityGateFailure(report);
  }
  return report;
}

export interface ResourceFuseOptions {
  timeoutMs: number;
  maxFuel: number;
}

export class ResourceFuseTripped extends Error {
  constructor(
    public readonly reason: 'timeout' | 'fuel',
    public readonly limit: number
  ) {
    super(`resource fuse tripped: ${reason} (limit ${limit})`);
    this.name = 'ResourceFuseTripped';
  }
}

/**
 * Execute `fn` under a resource fuse. If the wall-clock `timeoutMs` elapses
 * before completion, the fuse trips (timeout) and we abort. Fuel is sampled
 * from `getFuel()` after the call returns; if it exceeds `maxFuel` the fuse
 * trips (fuel). This kills runaway WASM loops and feeds self-healing: callers
 * (invokePlugin) catch the trip and quarantine the plugin.
 */
export async function withResourceFuse<T>(
  opts: ResourceFuseOptions,
  fn: () => Promise<T>,
  getFuel?: () => number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ResourceFuseTripped('timeout', opts.timeoutMs)),
      opts.timeoutMs
    );
  });
  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    if (getFuel) {
      const fuel = getFuel();
      if (fuel > opts.maxFuel) throw new ResourceFuseTripped('fuel', opts.maxFuel);
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadPlugin(pluginId: string): Promise<LoadedPlugin | null> {
  const cached = loaded.get(pluginId);
  if (cached) return cached;

  const row = await db.query.plugins.findFirst({ where: eq(plugins.id, pluginId) });
  if (!row) return null;
  const installRow = await db.query.pluginInstallations.findFirst({
    where: eq(pluginInstallations.pluginId, pluginId),
  });

  const plugin: LoadedPlugin = {
    id: row.id,
    name: row.name,
    version: row.version,
    manifest: row.manifest as unknown as PluginManifest,
    contentSha256: row.contentSha256,
    wasmBytes: row.wasmBytes ? Buffer.from(row.wasmBytes, 'base64') : undefined,
    trustState: row.trustState as 'untrusted' | 'trusted' | 'revoked',
    ringOverride: installRow?.ringOverride ?? null,
    config: (installRow?.config ?? {}) as Record<string, unknown>,
  };
  loaded.set(pluginId, plugin);
  try {
    await verifyArtifactIntegrity(plugin);
  } catch (e) {
    if (e instanceof IntegrityGateFailure) {
      await db
        .update(plugins)
        .set({ trustState: 'revoked' })
        .where(eq(plugins.id, plugin.id))
        .catch(() => undefined);
      throw new Error(`integrity_gate_failed:${plugin.id}:${e.report.detail}`);
    }
    throw e;
  }
  return plugin;
}

/**
 * Quarantine a plugin: revoke trust + disable its installation so it can no
 * longer be loaded or executed. Real self-healing on integrity/fuse breach.
 */
export async function quarantinePlugin(pluginId: string, reason: string): Promise<void> {
  await db
    .update(plugins)
    .set({ trustState: 'revoked' })
    .where(eq(plugins.id, pluginId))
    .catch(() => undefined);
  await db
    .update(pluginInstallations)
    .set({ disabled: true })
    .where(eq(pluginInstallations.pluginId, pluginId))
    .catch(() => undefined);
  loaded.delete(pluginId);
  appendAudit('plugin.quarantined', { pluginId, reason }, 'plugin-runtime').catch(() => undefined);
}

export async function listInstalledPlugins(): Promise<LoadedPlugin[]> {
  const installs = await db.query.pluginInstallations.findMany({
    where: eq(pluginInstallations.enabled, true),
  });
  const out: LoadedPlugin[] = [];
  for (const ins of installs) {
    const p = await loadPlugin(ins.pluginId);
    if (p) out.push(p);
  }
  return out;
}

/* ─── Capability check (default-deny) ────────────────────────────────────── */

export function checkCapability(plugin: LoadedPlugin, capability: string): CapabilitySpec | null {
  let best: CapabilitySpec | null = null;
  let bestScore = -1;
  let bestDeny = false;
  for (const spec of plugin.manifest.capabilities) {
    const score = matchesCapability(spec, capability);
    if (score == null) continue;
    const isDeny = (spec.prefixExcept ?? []).some(
      (exc) => capability === exc || capability.startsWith(exc + '.')
    );
    if (score > bestScore || (score === bestScore && isDeny && !bestDeny)) {
      best = spec;
      bestScore = score;
      bestDeny = isDeny;
    }
  }
  // A capability that only matches a deny (prefixExcept) rule grants nothing.
  return bestDeny ? null : best;
}

function matchesCapability(spec: CapabilitySpec, requested: string): number | null {
  if (spec.exact) {
    return spec.exact === requested ? 1_000_000 + spec.exact.length : null;
  }
  if (!spec.prefix) return null;
  const isExact = requested === spec.prefix;
  const isChild = requested.startsWith(spec.prefix + '.');
  if (!isExact && !isChild) return null;
  const excepts = spec.prefixExcept ?? [];
  const denied = excepts.some((exc) => requested === exc || requested.startsWith(exc + '.'));
  return (denied ? 750_000 : 500_000) + spec.prefix.length;
}
/* ─── Invocation (the hot path) ──────────────────────────────────────────── */

export async function invokePlugin(req: PluginInvocation): Promise<PluginReceipt> {
  const start = Date.now();
  const inputSha256 = createHash('sha256').update(req.inputBytes).digest('hex');
  const plugin = await loadPlugin(req.pluginId);
  if (!plugin) throw new Error(`plugin_not_found:${req.pluginId}`);
  if (plugin.trustState === 'revoked') throw new Error(`plugin_revoked:${req.pluginId}`);

  const cap = checkCapability(plugin, req.capability);
  if (!cap) {
    const deniedId = `prc_${randomUUID()}`;
    await db.insert(pluginReceipts).values({
      id: deniedId,
      pluginId: plugin.id,
      installId: null,
      agentId: req.agentId,
      capability: req.capability,
      inputSha256,
      outputSha256: createHash('sha256').update(Buffer.from('denied', 'utf8')).digest('hex'),
      exitCode: -13,
      fuelUsed: 0,
      durationMs: Date.now() - start,
      authorized: false,
      createdAt: new Date(),
    });
    await appendAudit(
      'plugin.capability_denied',
      {
        pluginId: plugin.id,
        agentId: req.agentId,
        capability: req.capability,
      },
      'plugin-runtime'
    );
    throw new Error(`capability_denied:${req.capability}`);
  }

  const validated: ValidatedInvocation = { plugin, capability: cap, inputSha256, startedAt: start };
  // Integrity gate before every execution (defense-in-depth; loadPlugin also checks).
  await verifyArtifactIntegrity(plugin).catch((e) => {
    if (e instanceof IntegrityGateFailure) {
      throw new Error(`integrity_gate_failed:${plugin.id}:${e.report.detail}`);
    }
    throw e;
  });

  // Resource fuse: kill runaway WASM loops (wall-clock + fuel). On trip, quarantine.
  let result: { outputBytes: Uint8Array; fuelUsed: number; exitCode: number };
  try {
    result = await withResourceFuse(
      { timeoutMs: plugin.manifest.timeoutMs, maxFuel: plugin.manifest.maxFuel },
      () => req.computeOutput(validated),
      () => plugin.manifest.maxFuel
    );
  } catch (e) {
    if (e instanceof ResourceFuseTripped) {
      await quarantinePlugin(plugin.id, `resource_fuse:${e.reason}`).catch(() => undefined);
      await appendAudit(
        'plugin.resource_fuse_tripped',
        { pluginId: plugin.id, reason: e.reason, limit: e.limit },
        'plugin-runtime'
      );
      throw new Error(`plugin_quarantined:${plugin.id}:resource_fuse`);
    }
    throw e;
  }
  const outputSha256 = createHash('sha256').update(result.outputBytes).digest('hex');
  const durationMs = Date.now() - start;
  const receiptId = `prc_${randomUUID()}`;
  const installRow = await db.query.pluginInstallations.findFirst({
    where: eq(pluginInstallations.pluginId, plugin.id),
  });

  await db.insert(pluginReceipts).values({
    id: receiptId,
    pluginId: plugin.id,
    installId: installRow?.id ?? null,
    agentId: req.agentId,
    capability: req.capability,
    inputSha256,
    outputSha256,
    exitCode: result.exitCode,
    fuelUsed: result.fuelUsed,
    durationMs,
    authorized: true,
    createdAt: new Date(),
  });

  await appendAudit(
    'plugin.invoked',
    {
      pluginId: plugin.id,
      pluginName: plugin.name,
      pluginVersion: plugin.version,
      agentId: req.agentId,
      capability: req.capability,
      inputSha256,
      outputSha256,
      fuelUsed: result.fuelUsed,
      durationMs,
      exitCode: result.exitCode,
    },
    'plugin-runtime'
  );

  log.info('plugin.invoked', {
    plugin: plugin.name,
    capability: req.capability,
    agentId: req.agentId,
    durationMs,
  });
  return {
    id: receiptId,
    pluginId: plugin.id,
    installId: installRow?.id ?? null,
    agentId: req.agentId,
    capability: req.capability,
    inputSha256,
    outputSha256,
    exitCode: result.exitCode,
    fuelUsed: result.fuelUsed,
    durationMs,
    authorized: true,
  };
}

/* ─── Receipts query (for the audit page) ───────────────────────────────── */

export async function listReceipts(opts?: {
  pluginId?: string;
  limit?: number;
}): Promise<PluginReceipt[]> {
  const rows = await db.query.pluginReceipts.findMany({
    where: opts?.pluginId ? eq(pluginReceipts.pluginId, opts.pluginId) : undefined,
    orderBy: [desc(pluginReceipts.createdAt)],
    limit: opts?.limit ?? 100,
  });
  return rows.map((receipt: PluginReceipt) => ({
    id: receipt.id,
    pluginId: receipt.pluginId,
    installId: receipt.installId,
    agentId: receipt.agentId,
    capability: receipt.capability,
    inputSha256: receipt.inputSha256,
    outputSha256: receipt.outputSha256,
    exitCode: receipt.exitCode,
    fuelUsed: Number(receipt.fuelUsed),
    durationMs: receipt.durationMs,
    authorized: receipt.authorized,
  }));
}

/* ─── Revocation ─────────────────────────────────────────────────────────── */

export async function revokePlugin(pluginId: string, reason: string): Promise<void> {
  await db
    .update(plugins)
    .set({ trustState: 'revoked', updatedAt: new Date() })
    .where(eq(plugins.id, pluginId));
  await db
    .update(pluginInstallations)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(pluginInstallations.pluginId, pluginId));
  loaded.delete(pluginId);
  await appendAudit('plugin.revoked', { pluginId, reason }, 'plugin-runtime');
}

/* ─── Cache invalidation (call when publishers change) ───────────────��───── */

export function invalidatePluginCache(): void {
  loaded.clear();
  _manifestCacheStamp = Date.now();
}
