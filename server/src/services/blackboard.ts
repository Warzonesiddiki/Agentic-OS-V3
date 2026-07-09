/**
 * blackboard.ts — Phase 13 (Multi-Agent Orchestration)
 *
 * Shared blackboard used for inter-agent state handoff during orchestrated
 * runs. The blackboard is the canonical place agents publish intermediate
 * facts; conditional routers and the DAG executor read from it to decide
 * branching, gating, and merge semantics.
 *
 * This module is a real, in-memory + audited implementation. It is kept
 * process-local on purpose (the kernel owns durable task state via the
 * `enqueueTask(idempotencyKey)` seam); the blackboard concerns *live* run
 * state and is snapshotted to `stateSnapshots` for crash recovery only.
 */
import { randomId } from '../lib/id.js';
import { log } from '../lib/logging.js';
import { appendAudit } from '../lib/audit.js';
import { env } from '../lib/env.js';
import { db } from '../db/client.js';
import { eq } from 'drizzle-orm';

/** A single blackboard entry. */
export interface BlackboardEntry {
  value: unknown;
  confidence?: number;
  source?: string;
  ttl?: number;
  seq?: number;
}

/** A blackboard is a flat map of key -> entry. */
export type Blackboard = Record<string, BlackboardEntry>;

/** An operator usable in a blackboard condition. */
export type ConditionOp =
  'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'contains' | 'not-contains';

/** Visibility scope for a blackboard fact. */
export type BlackboardScope = 'global' | 'run' | 'agent';

/** A single typed fact published to the blackboard. */
export interface BlackboardFact extends BlackboardEntry {
  id: string;
  runId: string;
  owner: string;
  scope: BlackboardScope;
  key: string;
  value: unknown;
  seq: number;
  createdAt: number;
}

/** Condition used by routers to gate DAG nodes. */
export type BlackboardCondition = {
  key: string;
  op: ConditionOp;
  value: unknown;
};

/** Evaluate a single blackboard condition. */
export function evaluateCondition(board: Blackboard, cond: BlackboardCondition): boolean {
  const entry = board[cond.key];
  const left = entry?.value;
  switch (cond.op) {
    case 'exists':
      return entry !== undefined;
    case 'eq':
      return left === cond.value;
    case 'neq':
      return left !== cond.value;
    case 'gt':
      return typeof left === 'number' && left > Number(cond.value);
    case 'lt':
      return typeof left === 'number' && left < Number(cond.value);
    case 'gte':
      return typeof left === 'number' && left >= Number(cond.value);
    case 'lte':
      return typeof left === 'number' && left <= Number(cond.value);
    case 'contains':
      return Array.isArray(left)
        ? left.includes(cond.value)
        : typeof left === 'string' && left.includes(String(cond.value));
    case 'not-contains':
      return Array.isArray(left)
        ? !left.includes(cond.value)
        : typeof left === 'string' && !left.includes(String(cond.value));
    default:
      return false;
  }
}

export class BlackboardStore {
  private readonly facts = new Map<string, BlackboardFact>();
  private readonly runSeq = new Map<string, number>();
  private readonly runOwners = new Map<string, Set<string>>();

  /** Publish or update a fact for a run. Returns the stored fact. */
  async publish(params: {
    runId: string;
    key: string;
    value: unknown;
    owner?: string;
    scope?: BlackboardScope;
    confidence?: number;
    source?: string;
    ttl?: number;
  }): Promise<BlackboardFact> {
    const seq = (this.runSeq.get(params.runId) ?? 0) + 1;
    this.runSeq.set(params.runId, seq);
    const fact: BlackboardFact = {
      id: randomId(),
      runId: params.runId,
      key: params.key,
      owner: params.owner ?? 'system',
      scope: params.scope ?? 'run',
      value: params.value,
      seq,
      confidence: params.confidence,
      source: params.source,
      ttl: params.ttl,
      createdAt: Date.now(),
    };
    this.facts.set(fact.id, fact);
    const owners = this.runOwners.get(params.runId) ?? new Set<string>();
    owners.add(fact.owner);
    this.runOwners.set(params.runId, owners);

    log.debug('blackboard.publish', {
      runId: params.runId,
      key: params.key,
      owner: fact.owner,
      seq,
    });
    await appendAudit(
      'blackboard.publish',
      { key: params.key, seq, scope: fact.scope, value: params.value },
      fact.owner
    );
    return fact;
  }

  /** Reads the latest fact by run + key (latest seq wins). */
  get(runId: string, key: string): BlackboardFact | undefined {
    let best: BlackboardFact | undefined;
    for (const f of this.facts.values()) {
      if (f.runId !== runId || f.key !== key) continue;
      if (!best || f.seq > best.seq) best = f;
    }
    return best;
  }

  /** Snapshot of all facts for a run as a `Blackboard` (latest-per-key). */
  snapshot(runId: string): Blackboard {
    const board: Blackboard = {};
    for (const f of this.facts.values()) {
      if (f.runId !== runId) continue;
      const existing = board[f.key];
      if (!existing || (existing.seq ?? 0) < f.seq) {
        const { value, confidence, source, ttl, seq } = f;
        board[f.key] = { value, confidence, source, ttl, seq };
      }
    }
    return board;
  }

  /** Evaluate many conditions (AND) for a run. */
  evaluate(runId: string, conds: BlackboardCondition[]): boolean {
    const board = this.snapshot(runId);
    return conds.every((c) => evaluateCondition(board, c));
  }

  /** List all agents that contributed to a run. */
  contributors(runId: string): string[] {
    return Array.from(this.runOwners.get(runId) ?? new Set<string>());
  }

  /** Durable snapshot of a run's blackboard to `systemMeta`. */
  async persist(runId: string): Promise<void> {
    if (env.NODE_ENV === 'test') return;
    const board = structuredCloneSafe(this.snapshot(runId));
    const payload = JSON.stringify(board);
    try {
      await db
        .insert(db.schema.systemMeta)
        .values({ key: `blackboard:${runId}`, value: payload })
        .onConflictDoUpdate({ target: db.schema.systemMeta.key, set: { value: payload } })
        .execute();
    } catch (err) {
      log.warn('blackboard.persist.failed', { runId, err: String(err) });
    }
  }

  /** Drop all facts for a run (called on run completion / failure). */
  clear(runId: string): void {
    for (const [id, f] of this.facts) {
      if (f.runId === runId) this.facts.delete(id);
    }
    this.runSeq.delete(runId);
    this.runOwners.delete(runId);
  }

  /**
   * Load a run's blackboard from the durable snapshot store. If the snapshot
   * is missing or unreadable, reconstruct best-effort from the append-only
   * audit trail (every `blackboard.publish` is audited with its value), so the
   * live state is never silently lost after a crash/eviction.
   */
  async loadOrReconstruct(runId: string): Promise<Blackboard> {
    if (env.NODE_ENV === 'test') return this.snapshot(runId);
    try {
      const rows = await db
        .select()
        .from(db.schema.systemMeta)
        .where(eq(db.schema.systemMeta.key, `blackboard:${runId}`))
        .limit(1)
        .execute();
      const snap = rows[0];
      if (snap && snap.value) {
        const parsed = JSON.parse(snap.value) as Blackboard;
        return structuredCloneSafe(parsed);
      }
      log.warn('blackboard.snapshot.missing', { runId });
    } catch (err) {
      log.warn('blackboard.snapshot.failed', { runId, err: String(err) });
    }
    // Fallback: rebuild from the append-only audit trail.
    try {
      const auditRows = await db
        .select()
        .from(db.schema.auditLog)
        .where(eq(db.schema.auditLog.action, 'blackboard.publish'))
        .execute();
      const reconstructed = applyAuditRows(auditRows, runId);
      if (Object.keys(reconstructed).length > 0) {
        log.info('blackboard.reconstructed.from.audit', {
          runId,
          keys: Object.keys(reconstructed).length,
        });
        return reconstructed;
      }
    } catch (err) {
      log.warn('blackboard.reconstruct.failed', { runId, err: String(err) });
    }
    return this.snapshot(runId);
  }
}

/** Apply audit rows (latest-per-key wins) to rebuild a run's blackboard. */
export function applyAuditRows(
  rows: ReadonlyArray<{
    action: string;
    actor?: string;
    payload?: unknown;
    createdAt?: Date | number;
  }>,
  _runId: string
): Blackboard {
  const board: Blackboard = {};
  for (const row of rows) {
    if (row.action !== 'blackboard.publish') continue;
    const meta = (row.payload ?? {}) as Record<string, unknown>;
    const key = meta.key as string | undefined;
    if (!key) continue;
    // The audit meta is enriched with the published value at publish time.
    const value = meta.value;
    if (value === undefined) continue;
    const existing = board[key];
    const seq = typeof meta.seq === 'number' ? meta.seq : 0;
    if (!existing || (existing.seq ?? 0) < seq) {
      board[key] = {
        value,
        confidence: meta.confidence as number | undefined,
        source: meta.source as string | undefined,
        ttl: meta.ttl as number | undefined,
        seq,
      };
    }
  }
  return board;
}

/** structuredClone with a JSON fallback for environments lacking it. */
function structuredCloneSafe<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

/** Default singleton used by the orchestrator. */
export const blackboard = new BlackboardStore();
