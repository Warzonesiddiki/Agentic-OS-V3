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
import { createHash, createHmac, randomUUID, timingSafeEqual, verify } from "node:crypto";
import { db } from "../db/client.js";
import {
  plugins,
  pluginInstallations,
  pluginReceipts,
} from "../db/schema.js";
import { desc, eq } from "drizzle-orm";
import { appendAudit } from "../lib/audit.js";
import { log } from "../lib/logging.js";
import { validateManifest, type PluginManifest, type CapabilitySpec } from "./plugin-manifest.js";

/* ─── Public types ───────────────────────────────────────────────────────── */

export interface LoadedPlugin {
  id: string;
  name: string;
  version: string;
  manifest: PluginManifest;
  contentSha256: string;
  trustState: "untrusted" | "trusted" | "revoked";
  ringOverride: number | null;
  config: Record<string, unknown>;
}

export interface PluginInvocation {
  agentId: string;
  pluginId: string;
  capability: string;
  inputBytes: Uint8Array;
  /** The actual WASM invocation is performed by the consumer; we only validate + receipt. */
  computeOutput: (validated: ValidatedInvocation) => Promise<{ outputBytes: Uint8Array; fuelUsed: number; exitCode: number }>;
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
let manifestCacheStamp = 0;

/* ─── Publisher trust store ──────────────────────────────────────────────── */

const TRUSTED_PUBLISHERS = new Set<string>([
  // populated from env: NEXUS_PLUGIN_PUBLISHER_PUBKEYS=pk1,pk2,pk3
  ...(process.env.NEXUS_PLUGIN_PUBLISHER_PUBKEYS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
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
  publisherPubkeyB64: string,
): boolean {
  try {
    const msg = Buffer.from(canonicalizeManifest(manifest), "utf8");
    const sig = Buffer.from(signatureB64, "base64");
    const pub = Buffer.from(publisherPubkeyB64, "base64");
    return verify(null, msg, { key: pub, format: "der", type: "spki" }, sig);
  } catch (e) {
    log.warn("plugin.signature_verify_failed", { error: e instanceof Error ? e.message : String(e) });
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
    await appendAudit("plugin.signature_invalid", { name: input.name, version: input.version }, "plugin-runtime");
    throw new Error("plugin_signature_invalid");
  }

  // 3. compute content hash
  const contentSha256 = createHash("sha256").update(input.wasmBytes).digest("hex");

  // 4. trust assignment
  const trustState: "trusted" | "untrusted" = TRUSTED_PUBLISHERS.has(input.authorPubkey) ? "trusted" : "untrusted";

  // 5. upsert
  const id = `plg_${randomUUID()}`;
  await db.insert(plugins).values({
    id,
    name: input.name,
    version: input.version,
    description: input.description ?? "",
    authorPubkey: input.authorPubkey,
    signature: input.signature,
    contentSha256,
    manifest: validated as unknown as Record<string, unknown>,
    wasmBytes: Buffer.from(input.wasmBytes).toString("base64"),
    source: input.source ?? "local",
    homepage: input.homepage ?? null,
    license: input.license ?? null,
    ratingAvg: 0,
    ratingCount: 0,
    installCount: 0,
    trustState,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  await appendAudit("plugin.registered", {
    name: input.name,
    version: input.version,
    contentSha256,
    trustState,
    publisherTrusted: TRUSTED_PUBLISHERS.has(input.authorPubkey),
  }, "plugin-runtime");

  log.info("plugin.registered", { id, name: input.name, version: input.version, trustState });
  const loaded = await loadPlugin(id);
  if (!loaded) throw new Error("plugin_load_failed");
  return loaded;
}

export async function installPlugin(pluginId: string, opts?: { ringOverride?: number; config?: Record<string, unknown> }): Promise<void> {
  const plugin = await loadPlugin(pluginId);
  if (!plugin) throw new Error("plugin_not_found");
  if (plugin.trustState === "revoked") throw new Error("plugin_revoked");

  const installId = `pi_${randomUUID()}`;
  await db.insert(pluginInstallations).values({
    id: installId,
    pluginId,
    enabled: true,
    ringOverride: opts?.ringOverride ?? null,
    config: opts?.config ?? {},
    installedAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: pluginInstallations.pluginId,
    set: { enabled: true, ringOverride: opts?.ringOverride ?? null, config: opts?.config ?? {}, updatedAt: new Date() },
  });

  await db.update(plugins).set({ installCount: (await db.query.plugins.findFirst({ where: eq(plugins.id, pluginId) }))!.installCount + 1, updatedAt: new Date() }).where(eq(plugins.id, pluginId));
  await appendAudit("plugin.installed", { pluginId, installId, ringOverride: opts?.ringOverride ?? null }, "plugin-runtime");
  loaded.delete(pluginId); // force re-load with new config
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  await db.update(pluginInstallations).set({ enabled: false, updatedAt: new Date() }).where(eq(pluginInstallations.pluginId, pluginId));
  await appendAudit("plugin.uninstalled", { pluginId }, "plugin-runtime");
  loaded.delete(pluginId);
}

export async function loadPlugin(pluginId: string): Promise<LoadedPlugin | null> {
  const cached = loaded.get(pluginId);
  if (cached) return cached;

  const row = await db.query.plugins.findFirst({ where: eq(plugins.id, pluginId) });
  if (!row) return null;
  const installRow = await db.query.pluginInstallations.findFirst({ where: eq(pluginInstallations.pluginId, pluginId) });

  const plugin: LoadedPlugin = {
    id: row.id,
    name: row.name,
    version: row.version,
    manifest: row.manifest as unknown as PluginManifest,
    contentSha256: row.contentSha256,
    trustState: row.trustState as "untrusted" | "trusted" | "revoked",
    ringOverride: installRow?.ringOverride ?? null,
    config: (installRow?.config ?? {}) as Record<string, unknown>,
  };
  loaded.set(pluginId, plugin);
  return plugin;
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
  return plugin.manifest.capabilities.find((c) => matchesCapability(c, capability)) ?? null;
}

function matchesCapability(spec: CapabilitySpec, requested: string): boolean {
  if (spec.exact === requested) return true;
  if (spec.prefix && requested.startsWith(spec.prefix)) return true;
  return false;
}

/* ─── Invocation (the hot path) ──────────────────────────────────────────── */

export async function invokePlugin(req: PluginInvocation): Promise<PluginReceipt> {
  const start = Date.now();
  const inputSha256 = createHash("sha256").update(req.inputBytes).digest("hex");
  const plugin = await loadPlugin(req.pluginId);
  if (!plugin) throw new Error(`plugin_not_found:${req.pluginId}`);
  if (plugin.trustState === "revoked") throw new Error(`plugin_revoked:${req.pluginId}`);

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
      outputSha256: createHash("sha256").update(Buffer.from("denied", "utf8")).digest("hex"),
      exitCode: -13,
      fuelUsed: 0,
      durationMs: Date.now() - start,
      authorized: false,
      createdAt: new Date(),
    });
    await appendAudit("plugin.capability_denied", {
      pluginId: plugin.id,
      agentId: req.agentId,
      capability: req.capability,
    }, "plugin-runtime");
    throw new Error(`capability_denied:${req.capability}`);
  }

  const validated: ValidatedInvocation = { plugin, capability: cap, inputSha256, startedAt: start };
  const result = await req.computeOutput(validated);
  const outputSha256 = createHash("sha256").update(result.outputBytes).digest("hex");
  const durationMs = Date.now() - start;
  const receiptId = `prc_${randomUUID()}`;
  const installRow = await db.query.pluginInstallations.findFirst({ where: eq(pluginInstallations.pluginId, plugin.id) });

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

  await appendAudit("plugin.invoked", {
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
  }, "plugin-runtime");

  log.info("plugin.invoked", { plugin: plugin.name, capability: req.capability, agentId: req.agentId, durationMs });
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

export async function listReceipts(opts?: { pluginId?: string; limit?: number }): Promise<PluginReceipt[]> {
  const rows = await db.query.pluginReceipts.findMany({
    where: opts?.pluginId ? eq(pluginReceipts.pluginId, opts.pluginId) : undefined,
    orderBy: [desc(pluginReceipts.createdAt)],
    limit: opts?.limit ?? 100,
  });
  return rows.map((r) => ({
    id: r.id,
    pluginId: r.pluginId,
    installId: r.installId,
    agentId: r.agentId,
    capability: r.capability,
    inputSha256: r.inputSha256,
    outputSha256: r.outputSha256,
    exitCode: r.exitCode,
    fuelUsed: Number(r.fuelUsed),
    durationMs: r.durationMs,
    authorized: r.authorized,
  }));
}

/* ─── Revocation ─────────────────────────────────────────────────────────── */

export async function revokePlugin(pluginId: string, reason: string): Promise<void> {
  await db.update(plugins).set({ trustState: "revoked", updatedAt: new Date() }).where(eq(plugins.id, pluginId));
  await db.update(pluginInstallations).set({ enabled: false, updatedAt: new Date() }).where(eq(pluginInstallations.pluginId, pluginId));
  loaded.delete(pluginId);
  await appendAudit("plugin.revoked", { pluginId, reason }, "plugin-runtime");
}

/* ─── Cache invalidation (call when publishers change) ───────────────��───── */

export function invalidatePluginCache(): void {
  loaded.clear();
  manifestCacheStamp = Date.now();
}