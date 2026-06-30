// @ts-nocheck — db.query.* pattern resolves at runtime through Proxy
/**
 * federated-recall.ts
 * ───────────────────
 * Pillar III of the 100× upgrade.
 *
 * Privacy-preserving protocol so multiple NEXUS instances can share memories
 * without leaking raw content. The wire format is a `MemoryProof` envelope:
 *
 *   MemoryProof = {
 *     origin_peer_id, origin_pubkey, signature,
 *     content_sha256,            // SHA-256 of the (NEVER-SENT) raw content
 *     embedding,                 // vector embedding
 *     topic_tags, importance,
 *     privacy_class,             // public | team | private
 *   }
 *
 * Steps on the wire:
 *   1. publisher hashes content, computes embedding, signs canonical envelope
 *   2. gossip on topic "nexus.recall.v1"
 *   3. receiver validates signature, dedupes by content_sha256,
 *      checks privacy budget, decides to materialize or reject
 *
 * Raw content is NEVER transmitted. Receivers can only reconstruct what they
 * already had, OR — if they don't — they get a *pointer* (content_sha256) and
 * can pull the full content through a separate, authorized channel.
 */
import { createHash, verify, randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { federatedMemoryProofs } from "../db/schema-v3-100x.js";
import { desc, eq, and, sql } from "drizzle-orm";
import { appendAudit } from "../lib/audit.js";
import { log } from "../lib/logging.js";

/* ─── Public types ───────────────────────────────────────────────────────── */

export type PrivacyClass = "public" | "team" | "private";

export interface MemoryProof {
  origin_peer_id: string;
  origin_pubkey: string;        // base64 ed25519 pubkey
  signature: string;             // base64 ed25519 sig over canonical envelope (excluding signature)
  content_sha256: string;
  embedding: number[];
  topic_tags: string[];
  importance: number;            // 0..1
  privacy_class: PrivacyClass;
  /** Optional TTL in seconds. */
  ttl_seconds?: number;
}

export interface MaterializationDecision {
  materialize: boolean;
  reason: string;
}

/* ─── Canonicalization (must match the publisher side) ───────────────────── */

const CANONICAL_KEY_ORDER = [
  "origin_peer_id", "origin_pubkey", "content_sha256",
  "embedding", "topic_tags", "importance", "privacy_class",
] as const;

export function canonicalizeProof(proof: Omit<MemoryProof, "signature">): string {
  const ordered: Record<string, unknown> = {};
  for (const k of CANONICAL_KEY_ORDER) ordered[k] = (proof as Record<string, unknown>)[k];
  return JSON.stringify(ordered);
}

/* ─── Publisher side: produce a proof ────────────────────────────────────── */

export async function publishMemoryProof(input: {
  peerId: string;
  publisherPrivKeyB64: string;   // base64 ed25519 private key (DER)
  contentSha256: string;
  embedding: number[];
  topicTags: string[];
  importance: number;
  privacyClass: PrivacyClass;
  ttlSeconds?: number;
}): Promise<MemoryProof> {
  const envelope: Omit<MemoryProof, "signature"> = {
    origin_peer_id: input.peerId,
    origin_pubkey: derivePubkey(input.publisherPrivKeyB64),
    content_sha256: input.contentSha256,
    embedding: input.embedding,
    topic_tags: input.topicTags,
    importance: input.importance,
    privacy_class: input.privacyClass,
    ttl_seconds: input.ttlSeconds,
  };
  const canonical = canonicalizeProof(envelope);
  const { sign, createPrivateKey } = await import("node:crypto");
  const privKeyObj = createPrivateKey({ key: Buffer.from(input.publisherPrivKeyB64, "base64"), format: "der", type: "pkcs8" });
  const signature = sign(null, Buffer.from(canonical, "utf-8"), privKeyObj).toString("base64");
  return { ...envelope, signature };
}

function derivePubkey(privKeyB64: string): string {
  const { createPrivateKey, createPublicKey } = require("node:crypto") as typeof import("node:crypto");
  const privKeyObj = createPrivateKey({ key: Buffer.from(privKeyB64, "base64"), format: "der", type: "pkcs8" });
  const pubKeyObj = createPublicKey(privKeyObj);
  return pubKeyObj.export({ format: "der", type: "spki" }).toString("base64");
}

/* ─── Receiver side: validate a proof ────────────────────────────────────── */

export function verifyMemoryProofSignature(proof: MemoryProof): boolean {
  try {
    const canonical = canonicalizeProof({
      origin_peer_id: proof.origin_peer_id,
      origin_pubkey: proof.origin_pubkey,
      content_sha256: proof.content_sha256,
      embedding: proof.embedding,
      topic_tags: proof.topic_tags,
      importance: proof.importance,
      privacy_class: proof.privacy_class,
      ttl_seconds: proof.ttl_seconds,
    });
    const ok = verify(
      null,
      Buffer.from(canonical, "utf8"),
      { key: Buffer.from(proof.origin_pubkey, "base64"), format: "der", type: "spki" },
      Buffer.from(proof.signature, "base64"),
    );
    return ok;
  } catch (e) {
    log.warn("federated.signature_verify_failed", { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/* ─── Privacy budget (per-topic daily cap) ───────────────────────────────── */

const DEFAULT_BUDGET_PER_TOPIC_PER_DAY = 100;
const budgetState = new Map<string, { count: number; resetAt: number }>();

function budgetKey(topic: string): string {
  const day = Math.floor(Date.now() / 86_400_000);
  return `${day}:${topic}`;
}

/** Returns the per-topic daily limit. Override via env if needed. */
export function privacyBudgetForTopic(topic: string): number {
  const env = process.env[`NEXUS_FED_BUDGET_${topic.toUpperCase().replace(/\W+/g, "_")}`];
  const parsed = env ? Number(env) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BUDGET_PER_TOPIC_PER_DAY;
}

export function consumeBudget(topic: string): boolean {
  const key = budgetKey(topic);
  const limit = privacyBudgetForTopic(topic);
  const now = Date.now();
  const entry = budgetState.get(key);
  if (!entry || entry.resetAt < now) {
    budgetState.set(key, { count: 1, resetAt: now + 86_400_000 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

export function refundBudget(topic: string): void {
  const key = budgetKey(topic);
  const entry = budgetState.get(key);
  if (entry && entry.count > 0) entry.count--;
}

/* ─── Materialization decision (default-deny for private, default-allow for public) ── */

export async function decideMaterialization(proof: MemoryProof): Promise<MaterializationDecision> {
  if (proof.privacy_class === "private") {
    return { materialize: false, reason: "private_class_default_deny" };
  }
  if (proof.importance < 0.1) {
    return { materialize: false, reason: "below_importance_threshold" };
  }
  if (proof.topic_tags.length === 0) {
    return { materialize: false, reason: "no_topic_tags" };
  }
  for (const tag of proof.topic_tags) {
    if (!consumeBudget(tag)) {
      return { materialize: false, reason: `budget_exhausted:${tag}` };
    }
  }
  return { materialize: true, reason: "ok" };
}

/* ─── Ingest (the hot path on the receiver side) ────────────────────────── */

export async function ingestMemoryProof(proof: MemoryProof): Promise<{ id: string; materialized: boolean; reason: string }> {
  // 1. Signature MUST verify
  if (!verifyMemoryProofSignature(proof)) {
    await appendAudit("federated.signature_invalid", {
      originPeerId: proof.origin_peer_id,
      contentSha256: proof.content_sha256,
    }, "federated-recall");
    throw new Error("federated_signature_invalid");
  }

  // 2. Dedupe by (origin_peer_id, content_sha256)
  const existing = await db.query.federatedMemoryProofs.findFirst({
    where: and(
      eq(federatedMemoryProofs.originPeerId, proof.origin_peer_id),
      eq(federatedMemoryProofs.contentSha256, proof.content_sha256),
    ),
  });
  if (existing) {
    return { id: existing.id, materialized: existing.materialized, reason: existing.rejectReason ?? "duplicate" };
  }

  // 3. Decide whether to materialize
  const decision = await decideMaterialization(proof);
  const id = `fmp_${randomUUID()}`;
  const expiresAt = proof.ttl_seconds
    ? new Date(Date.now() + proof.ttl_seconds * 1000)
    : null;

  await db.insert(federatedMemoryProofs).values({
    id,
    originPeerId: proof.origin_peer_id,
    originPubkey: proof.origin_pubkey,
    signature: proof.signature,
    contentSha256: proof.content_sha256,
    embedding: proof.embedding,
    topicTags: proof.topic_tags,
    importance: proof.importance,
    privacyClass: proof.privacy_class,
    materialized: decision.materialize,
    rejectReason: decision.materialize ? null : decision.reason,
    receivedAt: new Date(),
    expiresAt,
  });

  await appendAudit("federated.proof_ingested", {
    proofId: id,
    originPeerId: proof.origin_peer_id,
    contentSha256: proof.content_sha256,
    materialized: decision.materialize,
    reason: decision.reason,
    topicTags: proof.topic_tags,
    privacyClass: proof.privacy_class,
  }, "federated-recall");

  if (!decision.materialize) {
    for (const tag of proof.topic_tags) refundBudget(tag);
  }

  log.info("federated.proof_ingested", {
    id,
    origin: proof.origin_peer_id,
    materialized: decision.materialize,
    reason: decision.reason,
  });
  return { id, materialized: decision.materialize, reason: decision.reason };
}

/* ─── Query (used by the recall UI to surface federated hints) ──────────── */

export async function listRecentProofs(opts?: { materialized?: boolean; topic?: string; limit?: number }) {
  const where = and(
    opts?.materialized !== undefined ? eq(federatedMemoryProofs.materialized, opts.materialized) : undefined,
  );
  const rows = await db.query.federatedMemoryProofs.findMany({
    where,
    orderBy: [desc(federatedMemoryProofs.receivedAt)],
    limit: opts?.limit ?? 50,
  });
  // Filter by topic in-app (the GIN index helps but only with a query DSL Drizzle doesn't expose)
  if (opts?.topic) {
    return rows.filter((r) => (r.topicTags ?? []).includes(opts.topic!));
  }
  return rows;
}

/* ─── Stats (used by the analytics page) ────────────────────────────────── */

export async function federatedStats(): Promise<{
  total: number;
  materialized: number;
  rejected: number;
  byReason: Record<string, number>;
  byTopic: Record<string, number>;
}> {
  const rows = await db.query.federatedMemoryProofs.findMany({});
  const byReason: Record<string, number> = {};
  const byTopic: Record<string, number> = {};
  let materialized = 0;
  for (const r of rows) {
    if (r.materialized) materialized++;
    else if (r.rejectReason) byReason[r.rejectReason] = (byReason[r.rejectReason] ?? 0) + 1;
    for (const t of r.topicTags ?? []) byTopic[t] = (byTopic[t] ?? 0) + 1;
  }
  return { total: rows.length, materialized, rejected: rows.length - materialized, byReason, byTopic };
}