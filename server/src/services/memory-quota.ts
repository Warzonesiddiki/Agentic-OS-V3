/**
 * memory-quota.ts — per-agent memory quotas (Phase 12).
 *
 * Enforces token + count budgets per agent. `checkQuota` is non-throwing;
 * `enforceQuota` throws ApiError('RATE_LIMITED', ...) when a write would
 * exceed the configured budget. Quota rows are upserted via onConflictDoUpdate.
 */
import { db, withTransaction } from '../db/client.js';
import { agentMemoryQuotas } from '../db/client.js';
import { ApiError } from '../lib/errors.js';
import { eq } from 'drizzle-orm';

export interface AgentMemoryQuota {
  agentId: string;
  maxCount: number;
  maxTokens: number;
  usedCount: number;
  usedTokens: number;
  updatedAt: string;
}

export interface QuotaCheckResult {
  ok: boolean;
  agentId: string;
  usedTokens: number;
  maxTokens: number;
  usedCount: number;
  maxCount: number;
  tokenRatio: number;
  countRatio: number;
  warning: boolean;
}

export async function getQuota(agentId: string): Promise<AgentMemoryQuota | null> {
  const rows = await db
    .select()
    .from(agentMemoryQuotas)
    .where(eq(agentMemoryQuotas.agentId, agentId))
    .limit(1);
  if (rows.length === 0) return null;
  return rows[0] as AgentMemoryQuota;
}

export async function setQuota(
  agentId: string,
  opts: { maxCount?: number; maxTokens?: number }
): Promise<AgentMemoryQuota> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(agentMemoryQuotas)
    .values({
      agentId,
      maxCount: opts.maxCount ?? 1000,
      maxTokens: opts.maxTokens ?? 1000000,
      usedCount: 0,
      usedTokens: 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: agentMemoryQuotas.agentId,
      set: {
        maxCount: opts.maxCount ?? 1000,
        maxTokens: opts.maxTokens ?? 1000000,
        updatedAt: now,
      },
    })
    .returning();
  return row as AgentMemoryQuota;
}

export async function ensureQuota(agentId: string): Promise<AgentMemoryQuota> {
  const existing = await getQuota(agentId);
  if (existing) return existing;
  const [row] = await db
    .insert(agentMemoryQuotas)
    .values({
      agentId,
      maxCount: 1000,
      maxTokens: 1000000,
      usedCount: 0,
      usedTokens: 0,
      updatedAt: new Date().toISOString(),
    })
    .returning();
  return row as AgentMemoryQuota;
}

export async function checkQuota(
  agentId: string,
  opts?: { additionalTokens?: number; additionalCount?: number }
): Promise<QuotaCheckResult> {
  const q = await ensureQuota(agentId);
  const additionalTokens = opts?.additionalTokens ?? 0;
  const additionalCount = opts?.additionalCount ?? 1;

  const projectedTokens = q.usedTokens + additionalTokens;
  const projectedCount = q.usedCount + additionalCount;

  const tokenRatio =
    q.maxTokens > 0
      ? projectedTokens / q.maxTokens
      : projectedTokens > 0
        ? Number.POSITIVE_INFINITY
        : 0;
  const countRatio =
    q.maxCount > 0
      ? projectedCount / q.maxCount
      : projectedCount > 0
        ? Number.POSITIVE_INFINITY
        : 0;

  const warning = tokenRatio >= 0.8 || countRatio >= 0.8;
  const ok = projectedTokens <= q.maxTokens && projectedCount <= q.maxCount;

  return {
    ok,
    agentId,
    usedTokens: q.usedTokens,
    maxTokens: q.maxTokens,
    usedCount: q.usedCount,
    maxCount: q.maxCount,
    tokenRatio,
    countRatio,
    warning,
  };
}

export async function enforceQuota(
  agentId: string,
  opts?: { additionalTokens?: number; additionalCount?: number }
): Promise<QuotaCheckResult> {
  const r = await checkQuota(agentId, opts);
  if (!r.ok) {
    throw new ApiError(
      'RATE_LIMITED',
      `QUOTA_EXCEEDED: agent ${agentId} would exceed memory quota (projected tokens ${r.usedTokens}+${opts?.additionalTokens ?? 0} > ${r.maxTokens}).`
    );
  }
  return r;
}

export async function recordMemoryWrite(
  agentId: string,
  tokenDelta: number,
  countDelta?: number
): Promise<void> {
  const q = await ensureQuota(agentId);
  const newUsedTokens = Math.max(0, q.usedTokens + tokenDelta);
  const newUsedCount = Math.max(0, q.usedCount + (countDelta ?? 1));
  await withTransaction(async (tx) => {
    await tx
      .update(agentMemoryQuotas)
      .set({
        usedTokens: newUsedTokens,
        usedCount: newUsedCount,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agentMemoryQuotas.agentId, agentId));
  });
}
