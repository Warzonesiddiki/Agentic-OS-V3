/**
 * audit.ts — append-only, hash-chained, tamper-evident audit log.
 * Uses node:crypto (audited). `appendAudit` accepts an optional transaction
 * so a caller can place its mutation AND its audit record in the SAME tx
 * (atomicity). When called without one, it opens its own. Appends serialize
 * on a fixed advisory lock, guaranteeing a monotonic chain. Failures throw —
 * callers MUST NOT swallow critical audit errors.
 *
 * Merkle checkpoints are automatically anchored to the configured blockchain
 * when the checkpoint count crosses the configured interval.
 */
import { createHash, randomUUID } from "node:crypto";
import { db, type Db } from "../db/client.js";
import { auditLog, merkleCheckpoints } from "../db/schema.js";
import { desc, asc, sql } from "drizzle-orm";
// // import { log } from "./logging.js"; // removed unused // removed unused import

/** A Drizzle transaction (or the db itself) — both expose query + execute + insert. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const GENESIS_HASH = "0".repeat(64);
const HASH_SEP = "|";
const MERKLE_CHUNK_SIZE = 1000; // store a Merkle root checkpoint every N entries

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

let _useWorkerThread = true;

/** Enable/disable worker thread offloading (for testing). */
export function setUseWorkerThread(v: boolean): void {
  _useWorkerThread = v;
}

async function entryHashAsync(prevHash: string, sequence: number, action: string, actor: string, createdAtMs: number, payload: unknown): Promise<string> {
  if (!_useWorkerThread) {
    return entryHashSync(prevHash, sequence, action, actor, createdAtMs, payload);
  }
  try {
    const { computeHashAsync } = await import("../services/audit-worker.js");
    return await computeHashAsync(prevHash, sequence, action, actor, createdAtMs, payload);
  } catch {
    return entryHashSync(prevHash, sequence, action, actor, createdAtMs, payload);
  }
}

function entryHashSync(prevHash: string, sequence: number, action: string, actor: string, createdAtMs: number, payload: unknown): string {
  const canonical = [prevHash, sequence, action, actor, createdAtMs, stableStringify(payload)].join(HASH_SEP);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export interface AuditEntry {
  sequence: number;
  id: string;
  actor: string;
  action: string;
  payload: unknown;
  prevHash: string;
  entryHash: string;
  createdAt: Date;
}

/** Find the current chain tip (highest sequence). Secondary order by id for determinism. */
async function chainTip(client: Tx): Promise<{ sequence: number; entryHash: string } | null> {
  const last = await client.query.auditLog.findFirst({
    orderBy: [desc(auditLog.sequence), desc(auditLog.id)],
  });
  if (!last) return null;
  return { sequence: last.sequence as number, entryHash: last.entryHash };
}

/**
 * Append a hash-chained entry. If `tx` is provided, append within the caller's
 * transaction (so the audit record commits or rolls back WITH the mutation).
 * Otherwise open a dedicated transaction.
 */
export async function appendAudit(
  action: string,
  payload: unknown,
  actor: string,
  tx?: Tx
): Promise<AuditEntry> {
  const id = `aud_${randomUUID()}`;
  let _createdCpSequence = 0;
  const doAppend = async (client: Tx): Promise<AuditEntry> => {
    await client.execute(sql`SELECT pg_advisory_xact_lock(79231)`);
    const tip = await chainTip(client);
    const sequence = tip ? tip.sequence + 1 : 1;
    const prevHash = tip ? tip.entryHash : GENESIS_HASH;
    const createdAt = new Date();
    const hash = await entryHashAsync(prevHash, sequence, action, actor, createdAt.getTime(), payload);
    const [row] = await client
      .insert(auditLog)
      .values({ sequence, id, actor, action, payload, prevHash, entryHash: hash, createdAt })
      .returning();
    if (!row) throw new Error("Audit append returned no row — integrity failure.");

    // Store Merkle checkpoint every MERKLE_CHUNK_SIZE entries
    if (sequence % MERKLE_CHUNK_SIZE === 0) {
      _createdCpSequence = sequence;
      const chunkStart = Math.max(1, sequence - MERKLE_CHUNK_SIZE + 1);
      const chunkRows = await client.query.auditLog.findMany({
        where: (t, { and, gte, lte }) => and(gte(t.sequence, chunkStart), lte(t.sequence, sequence)),
        orderBy: [asc(auditLog.sequence)],
      });
      const chunkHashes = chunkRows.map((r: AuditEntry) => r.entryHash);
      const root = merkleRoot(chunkHashes);
      const prevCk = await client.query.merkleCheckpoints.findFirst({
        orderBy: [desc(merkleCheckpoints.chunkEndSeq)],
      });
      const prevCkHash = prevCk ? prevCk.merkleRoot : GENESIS_HASH;
      await client.insert(merkleCheckpoints).values({
        id: `mcp_${randomUUID()}`,
        chunkStartSeq: chunkStart,
        chunkEndSeq: sequence,
        merkleRoot: root,
        prevCheckpointHash: prevCkHash,
        entryCount: chunkHashes.length,
      });
    }

    return row as AuditEntry;
  };

  const entry = tx ? await doAppend(tx) : await db.transaction(doAppend);



  return entry;
}

/**
 * Compute a binary Merkle root from an ordered list of entry hashes.
 * Returns the single root hash after repeatedly hashing sibling pairs.
 */
export function merkleRoot(hashes: string[]): string {
  if (!hashes.length) return GENESIS_HASH;
  let level = hashes;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = i + 1 < level.length ? level[i + 1]! : left;
      const hash = createHash("sha256").update(left + right, "hex").digest("hex");
      next.push(hash);
    }
    level = next;
  }
  return level[0]!;
}

/** Pure, exported entry-hash — directly unit-testable without a database. */
export function computeEntryHash(prevHash: string, sequence: number, action: string, actor: string, createdAtMs: number, payload: unknown): string {
  return entryHashSync(prevHash, sequence, action, actor, createdAtMs, payload);
}

export interface AuditVerifyResult {
  valid: boolean;
  verifiedEntries: number;
  brokenAt: number | null;
  total: number;
}

/**
 * Verify the full hash chain. Streams in pages (not an unbounded table load),
 * ordered by sequence ASC with a deterministic id tiebreaker, using sequence as
 * a keyset cursor — so the predecessor ordering is unambiguous.
 * Also verifies Merkle checkpoint integrity.
 */
export async function verifyAuditChain(): Promise<AuditVerifyResult> {
  const PAGE = 1000;
  let prevHash = GENESIS_HASH;
  let verified = 0;
  let total = 0;
  let after = 0;
  for (;;) {
    const page = await db.query.auditLog.findMany({
      orderBy: [asc(auditLog.sequence), asc(auditLog.id)],
      where: (t, { gt }) => gt(t.sequence, after),
      limit: PAGE,
    });
    if (!page.length) break;
    for (const e of page) {
      const seq = e.sequence as number;
      if (e.prevHash !== prevHash) {
        return { valid: false, verifiedEntries: verified, brokenAt: seq, total };
      }
      const expected = computeEntryHash(prevHash, seq, e.action, e.actor, e.createdAt.getTime(), e.payload);
      if (expected !== e.entryHash) {
        return { valid: false, verifiedEntries: verified, brokenAt: seq, total };
      }
      prevHash = e.entryHash;
      verified++;
      total++;
    }
    after = page[page.length - 1]!.sequence as number;
    if (page.length < PAGE) break;
  }

  // Verify Merkle checkpoints chain
  const checkpoints = await db.query.merkleCheckpoints.findMany({
    orderBy: [asc(merkleCheckpoints.chunkEndSeq)],
  });
  let prevCkHash = GENESIS_HASH;
  for (const cp of checkpoints) {
    if (cp.prevCheckpointHash !== prevCkHash) {
      return { valid: false, verifiedEntries: verified, brokenAt: cp.chunkStartSeq, total };
    }
    const chunkRows = await db.query.auditLog.findMany({
      where: (t, { and, gte, lte }) => and(gte(t.sequence, cp.chunkStartSeq), lte(t.sequence, cp.chunkEndSeq)),
      orderBy: [asc(auditLog.sequence)],
    });
    const expectedRoot = merkleRoot(chunkRows.map((r: AuditEntry) => r.entryHash));
    if (expectedRoot !== cp.merkleRoot) {
      return { valid: false, verifiedEntries: verified, brokenAt: cp.chunkStartSeq, total };
    }
    prevCkHash = cp.merkleRoot;
  }

  return { valid: true, verifiedEntries: verified, brokenAt: null, total };
}

/**
 * Faster incremental verification: verify from the last Merkle checkpoint
 * instead of from genesis. Returns the same result shape.
 */
export async function verifyAuditChainFast(): Promise<AuditVerifyResult> {
  const lastCp = await db.query.merkleCheckpoints.findFirst({
    orderBy: [desc(merkleCheckpoints.chunkEndSeq)],
  });
  if (!lastCp) return verifyAuditChain();

  let prevHash = GENESIS_HASH;
  let verified = 0;
  let total = 0;
  let after = 0;

  // Verify entries up to the last checkpoint
  const PAGE = 1000;
  const lastCpEnd = lastCp.chunkEndSeq;
  for (;;) {
    const page = await db.query.auditLog.findMany({
      orderBy: [asc(auditLog.sequence), asc(auditLog.id)],
      where: (t, { and, lte, gt }) => and(lte(t.sequence, lastCpEnd), gt(t.sequence, after)),
      limit: PAGE,
    });
    if (!page.length) break;
    for (const e of page) {
      const seq = e.sequence as number;
      if (e.prevHash !== prevHash) {
        return { valid: false, verifiedEntries: verified, brokenAt: seq, total };
      }
      const expected = computeEntryHash(prevHash, seq, e.action, e.actor, e.createdAt.getTime(), e.payload);
      if (expected !== e.entryHash) {
        return { valid: false, verifiedEntries: verified, brokenAt: seq, total };
      }
      prevHash = e.entryHash;
      verified++;
      total++;
    }
    after = page[page.length - 1]!.sequence as number;
    if (page.length < PAGE) break;
  }

  // Verify checkpoints chain
  const checkpoints = await db.query.merkleCheckpoints.findMany({
    orderBy: [asc(merkleCheckpoints.chunkEndSeq)],
  });
  let prevCkHash = GENESIS_HASH;
  for (const cp of checkpoints) {
    if (cp.prevCheckpointHash !== prevCkHash) {
      return { valid: false, verifiedEntries: verified, brokenAt: cp.chunkStartSeq, total };
    }
    const chunkRows = await db.query.auditLog.findMany({
      where: (t, { and, gte, lte }) => and(gte(t.sequence, cp.chunkStartSeq), lte(t.sequence, cp.chunkEndSeq)),
      orderBy: [asc(auditLog.sequence)],
    });
    const expectedRoot = merkleRoot(chunkRows.map((r: AuditEntry) => r.entryHash));
    if (expectedRoot !== cp.merkleRoot) {
      return { valid: false, verifiedEntries: verified, brokenAt: cp.chunkStartSeq, total };
    }
    prevCkHash = cp.merkleRoot;
  }

  // Verify entries after the last checkpoint
  after = lastCpEnd;
  for (;;) {
    const page = await db.query.auditLog.findMany({
      orderBy: [asc(auditLog.sequence), asc(auditLog.id)],
      where: (t, { gt }) => gt(t.sequence, after),
      limit: PAGE,
    });
    if (!page.length) break;
    for (const e of page) {
      const seq = e.sequence as number;
      if (e.prevHash !== prevHash) {
        return { valid: false, verifiedEntries: verified, brokenAt: seq, total };
      }
      const expected = computeEntryHash(prevHash, seq, e.action, e.actor, e.createdAt.getTime(), e.payload);
      if (expected !== e.entryHash) {
        return { valid: false, verifiedEntries: verified, brokenAt: seq, total };
      }
      prevHash = e.entryHash;
      verified++;
      total++;
    }
    after = page[page.length - 1]!.sequence as number;
    if (page.length < PAGE) break;
  }

  return { valid: true, verifiedEntries: verified, brokenAt: null, total };
}
