/**
 * services/audit-engine.ts — Advanced Provenance & Governance Engine.
 *
 * Extends the hash-chained audit_log with:
 * 1. LLM Trajectory Logging — full reasoning traces per audit entry
 * 2. Cryptographic Tool Receipts — pre/post-mutation hashes for VFS/shell
 * 3. Auto-Engaging Kill Switch — triggers on chain tamper or ACL violation
 * 4. Secret Redaction — masks PII/keys before hashing (SOC2/GDPR)
 */
import { createHash } from "node:crypto";
import { db } from "../db/client.js";
import { trajectoryLogs, toolReceipts, systemMeta } from "../db/schema.js";
import { appendAudit } from "../lib/audit.js";
import { verifyAuditChain } from "../lib/audit.js";
import { randomUUID } from "node:crypto";

// ── Secret Redaction ──────────────────────────────────────────

const SECRET_PATTERNS = [
  /(?:sk-[A-Za-z0-9]{20,})/g,
  /(?:nx_live_[A-Za-z0-9_-]{6,})/g,
  /(?:AKIA[0-9A-Z]{16})/g,
  /(?:gh[pousr]_[A-Za-z0-9]{36,})/g,
  /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g,
  /(?:(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"]?[A-Za-z0-9_+/=-]{8,}['"]?)/gi,
];

/** Redact all secrets/PII from a payload before hashing and storing. */
export function redactSecrets(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "***REDACTED***");
  }
  return result;
}

/** Recursively redact secrets in an object (deep clone + scrub). */
export function redactPayload(payload: unknown): unknown {
  if (typeof payload === "string") return redactSecrets(payload);
  if (Array.isArray(payload)) return payload.map(redactPayload);
  if (payload && typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      if (/secret|password|token|api[_-]?key/i.test(k)) {
        out[k] = "***REDACTED***";
      } else {
        out[k] = redactPayload(v);
      }
    }
    return out;
  }
  return payload;
}

// ── Trajectory Logging ────────────────────────────────────────

export interface TrajectoryInput {
  agentId: string;
  model: string;
  promptSent: string;
  responseReceived?: string;
  tokenUsage?: { prompt: number; completion: number; total: number };
  latencyMs?: number;
}

/**
 * Log a full LLM reasoning trajectory linked to a new audit entry.
 * The prompt/response are redacted for compliance before storage.
 */
export async function logTrajectory(input: TrajectoryInput, actor: string): Promise<{ auditSequence: number; trajectoryId: string }> {
  const entry = await appendAudit("agent.trajectory", {
    agentId: input.agentId,
    model: input.model,
    tokenUsage: input.tokenUsage,
    latencyMs: input.latencyMs,
  }, actor);

  const trajectoryId = `trj_${randomUUID()}`;
  await db.insert(trajectoryLogs).values({
    id: trajectoryId,
    auditSequence: entry.sequence,
    agentId: input.agentId,
    model: input.model,
    promptSent: redactSecrets(input.promptSent).slice(0, 10000),
    responseReceived: redactSecrets(input.responseReceived ?? "").slice(0, 10000),
    tokenUsage: input.tokenUsage ?? {},
    latencyMs: input.latencyMs ?? 0,
  });

  return { auditSequence: entry.sequence, trajectoryId };
}

// ── Cryptographic Tool Receipts ───────────────────────────────

export interface ToolReceiptInput {
  agentId: string;
  tool: string;
  target?: string;
  preState?: string;
  postState?: string;
  exitCode?: number;
  authorized: boolean;
}

/** Hash a state blob for pre/post-mutation receipts. */
export function hashState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

/**
 * Generate a cryptographic tool receipt for a VFS or shell mutation.
 * Records the pre-mutation hash and post-mutation hash, linked to the audit chain.
 */
export async function logToolReceipt(input: ToolReceiptInput, actor: string): Promise<{ receiptId: string; auditSequence: number }> {
  const entry = await appendAudit("agent.tool_executed", {
    agentId: input.agentId,
    tool: input.tool,
    target: input.target,
    preHash: input.preState ? hashState(input.preState) : null,
    postHash: input.postState ? hashState(input.postState) : null,
    exitCode: input.exitCode,
    authorized: input.authorized,
  }, actor);

  const receiptId = `rcp_${randomUUID()}`;
  await db.insert(toolReceipts).values({
    id: receiptId,
    auditSequence: entry.sequence,
    agentId: input.agentId,
    tool: input.tool,
    target: input.target ?? null,
    preHash: input.preState ? hashState(input.preState) : null,
    postHash: input.postState ? hashState(input.postState) : null,
    exitCode: input.exitCode ?? null,
    authorized: input.authorized,
  });

  return { receiptId, auditSequence: entry.sequence };
}

// ── Auto-Engaging Kill Switch ─────────────────────────────────

/**
 * Verify the audit chain integrity. If tampering is detected, AUTOMATICALLY
 * engage the kill switch to freeze all scheduler queues. This is the OS
 * immune system — it never lets a corrupted state propagate.
 *
 * Returns true if the system is healthy (chain valid).
 */
export async function verifyAndAutoKill(): Promise<{ healthy: boolean; reason?: string }> {
  const result = await verifyAuditChain();

  if (result.valid) {
    return { healthy: true };
  }

  // CHAIN BROKEN — auto-engage kill switch immediately
  const reason = `Audit chain tampering detected at sequence #${result.brokenAt}. Auto-engaging kill switch.`;
  await db.insert(systemMeta)
    .values({ key: "killSwitch", value: "1", updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemMeta.key, set: { value: "1", updatedAt: new Date() } });
  await db.insert(systemMeta)
    .values({ key: "killSwitchReason", value: reason, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemMeta.key, set: { value: reason, updatedAt: new Date() } });

  // Log the auto-kill as an audit event itself (before the switch blocks it)
  await appendAudit("safety.auto_kill_engaged", { reason, brokenAt: result.brokenAt }, "system-auto");

  return { healthy: false, reason };
}
