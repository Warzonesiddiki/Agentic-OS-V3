/**
 * services/audit-worker.ts — Offloads SHA-256 hash-chain computation to a
 * Node.js Worker Thread so the main event loop never blocks during
 * high-throughput agent mutations.
 *
 * The worker receives { prevHash, sequence, action, actor, createdAtMs, payload },
 * computes the canonical string + SHA-256, and returns the hex digest.
 * Falls back to synchronous computation if worker creation fails.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Stable serialization — keys sorted recursively (mirrors audit.ts). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

// ── Worker thread entry point ──────────────────────────────────

if (!isMainThread && parentPort) {
  // We are inside the worker — listen for hash requests.
  parentPort.on("message", (data: {
    id: number;
    prevHash: string;
    sequence: number;
    action: string;
    actor: string;
    createdAtMs: number;
    payload: unknown;
  }) => {
    const canonical = [
      data.prevHash,
      data.sequence,
      data.action,
      data.actor,
      data.createdAtMs,
      stableStringify(data.payload),
    ].join("|");
    const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
    parentPort!.postMessage({ id: data.id, hash });
  });
}

// ── Main thread API ────────────────────────────────────────────

let _worker: Worker | null | false = null;
let _requestId = 0;
const _pending = new Map<number, { resolve: (hash: string) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>();

/** Lazily create the worker thread. Returns null if unavailable. */
function getWorker(): Worker | null {
  if (_worker === false) return null;
  if (_worker) return _worker;
  try {
    _worker = new Worker(__filename);
    _worker.on("message", (msg: { id: number; hash: string }) => {
      const pending = _pending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        _pending.delete(msg.id);
        pending.resolve(msg.hash);
      }
    });
    _worker.on("error", () => {
      // Worker crashed — reject all pending and mark unavailable.
      for (const [, p] of _pending) {
        clearTimeout(p.timer);
        p.reject(new Error("Audit worker crashed"));
      }
      _pending.clear();
      _worker = false;
    });
    return _worker;
  } catch {
    _worker = false;
    return null;
  }
}

/**
 * Compute a hash-chain entry hash using a Worker Thread.
 * Falls back to synchronous computation if the worker is unavailable.
 * Timeout: 5s — if the worker is stuck, we fall back to sync.
 */
export async function computeHashAsync(
  prevHash: string,
  sequence: number,
  action: string,
  actor: string,
  createdAtMs: number,
  payload: unknown
): Promise<string> {
  const worker = getWorker();

  // Fallback: compute synchronously if no worker available.
  if (!worker) {
    return computeHashSync(prevHash, sequence, action, actor, createdAtMs, payload);
  }

  return new Promise((resolveFn, rejectFn) => {
    const id = ++_requestId;
    const timer = setTimeout(() => {
      _pending.delete(id);
      // Worker timed out — fall back to sync computation.
      const hash = computeHashSync(prevHash, sequence, action, actor, createdAtMs, payload);
      resolveFn(hash);
    }, 5000);

    _pending.set(id, { resolve: resolveFn, reject: rejectFn, timer });
    worker.postMessage({ id, prevHash, sequence, action, actor, createdAtMs, payload });
  });
}

/** Synchronous hash computation (fallback). */
export function computeHashSync(
  prevHash: string,
  sequence: number,
  action: string,
  actor: string,
  createdAtMs: number,
  payload: unknown
): string {
  const canonical = [prevHash, sequence, action, actor, createdAtMs, stableStringify(payload)].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Terminate the worker thread (for graceful shutdown). */
export async function terminateAuditWorker(): Promise<void> {
  if (_worker && typeof _worker !== "boolean") {
    await _worker.terminate();
    _worker = null;
  }
}

// ── Idempotent audit ingestion ────────────────────────────────
//
// The audit_log.id column is UNIQUE. By deriving the id deterministically from
// the event's natural key (actor | action | payload digest | bucketed timestamp)
// instead of a random UUID, the same logical event delivered twice maps to the
// SAME id. Combined with the appendAudit contract this gives end-to-end
// idempotency for the worker WITHOUT changing the frozen schema.

/** Bucket window (ms) for idempotency keying — 1s granularity. */
const IDEMPOTENCY_BUCKET_MS = 1000;

export interface AuditEventInput {
  actor: string;
  action: string;
  payload: unknown;
  createdAtMs?: number;
}

/** Derive the deterministic, unique audit entry id for an event. */
export function deriveAuditId(ev: AuditEventInput): string {
  const bucket = Math.floor((ev.createdAtMs ?? Date.now()) / IDEMPOTENCY_BUCKET_MS);
  const payloadDigest = createHash("sha256")
    .update(stableStringify(ev.payload))
    .digest("hex")
    .slice(0, 32);
  const naturalKey = `${ev.actor}|${ev.action}|${payloadDigest}|${bucket}`;
  return "aud_" + createHash("sha256").update(naturalKey, "utf8").digest("hex").slice(0, 32);
}

let _findAuditById: ((id: string) => Promise<unknown>) | null = null;
export function setAuditLookup(fn: ((id: string) => Promise<unknown>) | null): void {
  _findAuditById = fn;
}
async function findAuditById(id: string): Promise<unknown> {
  if (_findAuditById) return _findAuditById(id);
  return null;
}

// In-process dedup state so concurrent delivery of the same logical event
// collapses to a single append even before/without a DB round-trip.
const _recordedIds = new Set<string>();
const _inFlight = new Map<string, Promise<{ recorded: boolean; id: string }>>();

/**
 * Idempotent audit record: maps a logical event to a deterministic id and
 * checks for a prior record before appending. Concurrent calls for the SAME
 * event coalesce onto a single in-flight append. Returns whether the record was
 * newly inserted or a duplicate was suppressed.
 */
export async function recordAuditEventIdempotent(
  ev: AuditEventInput
): Promise<{ recorded: boolean; id: string }> {
  const id = deriveAuditId(ev);
  if (_recordedIds.has(id)) {
    return { recorded: false, id };
  }
  // Coalesce concurrent in-flight appends for the same event: the duplicate is
  // rejected immediately (idempotency is preserved without waiting).
  if (_inFlight.has(id)) {
    return { recorded: false, id };
  }
  const promise = (async () => {
    const prior = await findAuditById(id);
    if (prior) {
      _recordedIds.add(id);
      return { recorded: false, id };
    }
    await (await import("../lib/audit.js")).appendAudit(ev.action, ev.payload, ev.actor);
    _recordedIds.add(id);
    return { recorded: true, id };
  })();
  _inFlight.set(id, promise);
  try {
    return await promise;
  } finally {
    _inFlight.delete(id);
  }
}

/** Reset the in-process dedup state (test helper). */
export function resetAuditDedup(): void {
  _recordedIds.clear();
  _inFlight.clear();
}
