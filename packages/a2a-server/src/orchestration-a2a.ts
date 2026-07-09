/**
 * orchestration-a2a.ts — Phase 13 A2A++ wire-format types for @agentic-os/a2a-server
 *
 * These are PURE types + validators. They do NOT import Forge's kernel/scheduler
 * (Phase 11) and are safe to ship before the orchestration-core wiring lands.
 *
 * Alignment:
 *  - `AgentCapability` maps 1:1 to the `capabilities[]` field in
 *    docs/PERSONA_REGISTRY.md (Lorekeeper) and is the seed for the Phase 13
 *    specialization registry + skill matching (per ADR-0008).
 *  - `A2AEnvelopeExt` is the A2A++ envelope: the canonical `A2ATask` envelope
 *    PLUS blackboard references + a per-role typed channel. It travels over both
 *    transport adapters defined in ADR-0008 (in-process message-bus, cross-node
 *    a2a-bridge HTTP).
 *  - `DagEvent` is the real-time orchestration DAG visualization event consumed by
 *    Prism over SSE topic `viz:<workflowId>` (per phase-13-orchestration-design.md §13.10).
 */

import { z } from 'zod';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { computeSignature } from './auth.js';

/* ------------------------------------------------------------------ *
 * Domain taxonomy — must stay 1:1 with PERSONA_REGISTRY §3 (10 domains)
 * ------------------------------------------------------------------ */
export const DOMAINS = [
  'Dev',
  'Research',
  'Ops',
  'Safety',
  'Comms',
  'Finance',
  'Legal',
  'Persona',
  'Meta',
  'UX',
] as const;

export type Domain = (typeof DOMAINS)[number];

export const DomainSchema = z.enum(DOMAINS);

/* ------------------------------------------------------------------ *
 * AgentCapability — 1:1 with PERSONA_REGISTRY §2 AgentCapability
 * ------------------------------------------------------------------ */
export type SideEffectType =
  | 'file.write'
  | 'file.delete'
  | 'file.read'
  | 'net.send'
  | 'net.listen'
  | 'net.read'
  | 'env.mutate'
  | 'env.read'
  | 'process.spawn'
  | 'memory.write'
  | 'memory.read'
  | 'memory.delete'
  | 'crypto.sign';

export const SideEffectTypeSchema = z.enum([
  'file.write',
  'file.delete',
  'file.read',
  'net.send',
  'net.listen',
  'net.read',
  'env.mutate',
  'env.read',
  'process.spawn',
  'memory.write',
  'memory.read',
  'memory.delete',
  'crypto.sign',
]);

export type CapabilityCategory = 'read' | 'write' | 'exec' | 'comms' | 'state' | 'admin';

export const CapabilityCategorySchema = z.enum([
  'read',
  'write',
  'exec',
  'comms',
  'state',
  'admin',
]);

export type CapabilityFailureMode = 'fail-closed' | 'fail-open' | 'degrade';

export const CapabilityFailureModeSchema = z.enum(['fail-closed', 'fail-open', 'degrade']);

export interface AgentCapability {
  /** e.g. "kernel.spawn", "memory.search" */
  name: string;
  domain: Domain;
  category: CapabilityCategory;
  sideEffects: SideEffectType[];
  /** resources this capability may touch */
  scopes: string[];
  failureMode: CapabilityFailureMode;
}

export const AgentCapabilitySchema = z
  .object({
    name: z.string().min(1),
    domain: DomainSchema,
    category: CapabilityCategorySchema,
    sideEffects: z.array(SideEffectTypeSchema),
    scopes: z.array(z.string()),
    failureMode: CapabilityFailureModeSchema,
  })
  .strict();

/* ------------------------------------------------------------------ *
 * A2A++ envelope — A2ATask envelope + blackboard refs + per-role channel
 * ------------------------------------------------------------------ */

/** A reference to a blackboard entry the message reads/writes. */
export interface BlackboardRef {
  /** blackboard key, namespaced as bb:<workflowId>:<key> */
  key: string;
  access: 'read' | 'write';
}

export const BlackboardRefSchema = z
  .object({
    key: z.string().regex(/^bb:[^:]+:.+/, 'key must be bb:<workflowId>:<name>'),
    access: z.enum(['read', 'write']),
  })
  .strict();

/**
 * Per-role typed channel. The `role` is the target persona role (see
 * PERSONA_REGISTRY) and `schemaId` references a JSON-schema registered for the
 * channel payload so receivers validate input/output at the edge (gap 13.31).
 */
export interface RoleChannel {
  role: string;
  schemaId?: string;
}

export const RoleChannelSchema = z
  .object({
    role: z.string().min(1),
    schemaId: z.string().optional(),
  })
  .strict();

/**
 * A2AEnvelopeExt — the A2A++ message.
 *
 * It carries the canonical A2A task identity (`taskId`, `parentTaskId`,
 * `traceId`) plus orchestration-specific fields. Designed to be serialized as
 * the SAME wire envelope over both ADR-0008 transports; `blackboardRefs` and
 * `channel` are ignored by plain A2A clients that only understand the base
 * fields, so the envelope is backward-compatible with external A2A agents.
 *
 * SIGNED-RPC (Phase 13 A2A++, gap 13.33): an envelope MAY carry a detached
 * HMAC signature so the receiver can authenticate the sender and reject replays.
 * The signature is computed over the canonical signing string
 *   `${taskId}.${traceId}.${timestamp}.${nonce}.${sender}.${canonicalPayload}`
 * using a shared secret scoped to `keyId`. Unsigned envelopes remain valid for
 * in-process / already-trust-boundary transports; cross-node bridges MUST
 * require a valid signature (see `verifyA2AEnvelope`).
 */
export interface A2AEnvelopeExt {
  /** matches A2ATask.id */
  taskId: string;
  /** for recursive delegation (phase-13 §13.9) — parent orchestration task */
  parentTaskId?: string;
  /** W3C-style trace id for audit correlation (gap 13.32) */
  traceId: string;
  /** blackboard keys this message touches */
  blackboardRefs: BlackboardRef[];
  /** per-role typed channel the message is dispatched on */
  channel: RoleChannel;
  /** opaque payload (typed at the channel schema level); optional for pure signals */
  payload?: unknown;
  /** sender agent id (A2A agent card name) */
  sender: string;
  /** ISO timestamp */
  timestamp: string;
  /* ---- signed-RPC fields (all optional; required only on trust-boundary hops) ---- */
  /** HMAC-SHA256 signature hex (no `sha256=` prefix) over the canonical signing string */
  signature?: string;
  /** id of the shared secret used to sign (enables rotation) */
  keyId?: string;
  /** single-use nonce for replay protection; base64url, >= 16 bytes of entropy */
  nonce?: string;
  /** ISO timestamp after which the envelope MUST be rejected (short TTL, e.g. 30s) */
  expiresAt?: string;
}

export const A2AEnvelopeExtSchema = z
  .object({
    taskId: z.string().min(1),
    parentTaskId: z.string().optional(),
    traceId: z.string().min(1),
    blackboardRefs: z.array(BlackboardRefSchema),
    channel: RoleChannelSchema,
    payload: z.unknown().optional(),
    sender: z.string().min(1),
    timestamp: z.string().min(1),
    signature: z
      .string()
      .regex(/^[0-9a-f]{64}$/, 'signature must be 64 hex chars')
      .optional(),
    keyId: z.string().min(1).optional(),
    nonce: z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,}$/, 'nonce must be >= 16 base64url chars')
      .optional(),
    expiresAt: z.string().min(1).optional(),
  })
  .strict();

/* ------------------------------------------------------------------ *
 * DagEvent — real-time orchestration DAG viz event (Prism, §13.10)
 * ------------------------------------------------------------------ */
export type DagNodeStatus = 'pending' | 'running' | 'done' | 'failed' | 'gated' | 'handoff';

export const DagNodeStatusSchema = z.enum([
  'pending',
  'running',
  'done',
  'failed',
  'gated',
  'handoff',
]);

export interface DagEvent {
  workflowId: string;
  nodeId: string;
  status: DagNodeStatus;
  /** ISO timestamp */
  ts: string;
  agentId?: string;
  durationMs?: number;
  /** optional traceId for audit correlation */
  traceId?: string;
}

export const DagEventSchema = z
  .object({
    workflowId: z.string().min(1),
    nodeId: z.string().min(1),
    status: DagNodeStatusSchema,
    ts: z.string().min(1),
    agentId: z.string().optional(),
    durationMs: z.number().nonnegative().optional(),
    traceId: z.string().optional(),
  })
  .strict();

/** Validate helper — throws on invalid, returns typed value on success. */
export function parseA2AEnvelopeExt(input: unknown): A2AEnvelopeExt {
  return A2AEnvelopeExtSchema.parse(input);
}

export function parseAgentCapability(input: unknown): AgentCapability {
  return AgentCapabilitySchema.parse(input);
}

export function parseDagEvent(input: unknown): DagEvent {
  return DagEventSchema.parse(input);
}

/* ============================================================================
 * Signed-RPC (Phase 13 A2A++, gap 13.33)
 * Detached-HMAC authentication + replay protection for cross-node A2A hops.
 * In-process / already-trust-boundary transports may skip signing; the trust
 * boundary (libp2p / HTTP bridges) MUST call verifyA2AEnvelope before acting.
 * ==========================================================================*/

/** Default envelope TTL for signed envelopes (30s) — short to bound replay. */
export const DEFAULT_ENVELOPE_TTL_MS = 30_000;

/** Reason a signed envelope was rejected. */
export type VerifyReject =
  | 'missing_signature'
  | 'missing_keyid'
  | 'missing_nonce'
  | 'missing_expiresat'
  | 'bad_signature'
  | 'expired'
  | 'replay'
  | 'unknown_key';

export interface VerifyResult {
  ok: boolean;
  reject?: VerifyReject;
  /** the authenticated sender (only set when ok) */
  sender?: string;
}

/**
 * Bounded replay cache. Stores seen (keyId,nonce) pairs; evicts on a sweep so
 * memory stays O(recent-window). Defaults to a 30s TTL — a nonce is accepted
 * only once within the cache window.
 */
class ReplayCache {
  private seen = new Map<string, number>();
  private lastSweep = Date.now();
  constructor(private readonly ttlMs = DEFAULT_ENVELOPE_TTL_MS) {}

  /** Returns true if `nonce` for `keyId` is NEW (and records it). */
  consume(keyId: string, nonce: string, now = Date.now()): boolean {
    this.sweep(now);
    const k = `${keyId}:${nonce}`;
    if (this.seen.has(k)) return false;
    this.seen.set(k, now + this.ttlMs);
    return true;
  }

  private sweep(now: number) {
    if (now - this.lastSweep < this.ttlMs / 2) return;
    this.lastSweep = now;
    for (const [k, exp] of this.seen) {
      if (exp <= now) this.seen.delete(k);
    }
  }
}

const replayCache = new ReplayCache();

/** Canonical signing string — stable, delimited, unambiguous. */
function canonicalSigningString(env: A2AEnvelopeExt): string {
  const payload = JSON.stringify(env.payload ?? null);
  return [env.taskId, env.traceId, env.timestamp, env.nonce ?? '', env.sender, payload].join('.');
}

/**
 * Sign an envelope. Mutates `env` to attach `signature`, `keyId`, `nonce`,
 * `expiresAt` and returns the signed object. `secret` is the shared secret for
 * the given `keyId` (caller manages the key table; see `auth` for derivation).
 */
export function signA2AEnvelope(
  env: A2AEnvelopeExt,
  secret: string,
  keyId: string,
  opts: { ttlMs?: number; now?: Date; nonce?: string } = {}
): A2AEnvelopeExt {
  const now = opts.now ?? new Date();
  const nonce = opts.nonce ?? randomNonce();
  const signed: A2AEnvelopeExt = {
    ...env,
    keyId,
    nonce,
    timestamp: now.toISOString(),
    expiresAt: new Date(now.getTime() + (opts.ttlMs ?? DEFAULT_ENVELOPE_TTL_MS)).toISOString(),
  };
  signed.signature = computeSignature(canonicalSigningString(signed), secret);
  return signed;
}

/**
 * Verify a signed envelope against a key table. Returns ok=false with a precise
 * `reject` reason on any failure; never throws. Callers MUST treat ok=false as
 * "drop + audit", not "retry".
 */
export function verifyA2AEnvelope(
  env: A2AEnvelopeExt,
  resolveSecret: (keyId: string) => string | undefined,
  opts: { now?: Date } = {}
): VerifyResult {
  if (!env.signature) return { ok: false, reject: 'missing_signature' };
  if (!env.keyId) return { ok: false, reject: 'missing_keyid' };
  if (!env.nonce) return { ok: false, reject: 'missing_nonce' };
  if (!env.expiresAt) return { ok: false, reject: 'missing_expiresat' };

  const now = opts.now ?? new Date();
  if (new Date(env.expiresAt).getTime() <= now.getTime()) {
    return { ok: false, reject: 'expired' };
  }

  const secret = resolveSecret(env.keyId);
  if (!secret) return { ok: false, reject: 'unknown_key' };

  const expected = computeSignature(canonicalSigningString(env), secret);
  const got = Buffer.from(env.signature, 'hex');
  const want = Buffer.from(expected, 'hex');
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return { ok: false, reject: 'bad_signature' };
  }

  // Replay check happens AFTER signature — only consume a good signature.
  if (!replayCache.consume(env.keyId, env.nonce, now.getTime())) {
    return { ok: false, reject: 'replay' };
  }

  return { ok: true, sender: env.sender };
}

/** Generate a 24-char base64url nonce from 18 random bytes. */
export function randomNonce(): string {
  return randomBytes(18).toString('base64url');
}
