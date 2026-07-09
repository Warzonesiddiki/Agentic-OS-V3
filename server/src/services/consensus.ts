/**
 * consensus.ts — Phase 13.8 output voting / consensus (PURE, no kernel deps).
 *
 * Collects per-agent votes on a step outcome and tallies them into a
 * ConsensusResult. Supports majority, unanimous, weighted (by reputation),
 * and llm-judge (delegated, async). Ties escalate to the manager (signal via
 * `tie: true` so the orchestrator can re-delegate or route to HITL).
 */
import { z } from 'zod';
import { log } from '../lib/logging.js';

export const ConsensusStrategySchema = z.enum(['majority', 'unanimous', 'weighted', 'llm-judge']);
export type ConsensusStrategy = z.infer<typeof ConsensusStrategySchema>;

export interface Vote {
  agentId: string;
  value: unknown;
  /** reputation in [0,1]; used by 'weighted'. */
  weight?: number;
}

export interface ConsensusResult {
  winner: unknown;
  confidence: number;
  dissenters: string[];
  tie: boolean;
}

function keyOf(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function tally(votes: Vote[]): { value: unknown; count: number; weight: number }[] {
  const map = new Map<string, { value: unknown; count: number; weight: number }>();
  for (const v of votes) {
    const k = keyOf(v.value);
    const e = map.get(k) ?? { value: v.value, count: 0, weight: 0 };
    e.count += 1;
    e.weight += v.weight ?? 1;
    map.set(k, e);
  }
  return [...map.values()];
}

/** Synchronous strategies. `weighted` uses vote.weight; defaults to 1. */
export function tallyConsensus(
  strategy: Exclude<ConsensusStrategy, 'llm-judge'>,
  votes: Vote[]
): ConsensusResult {
  if (votes.length === 0) {
    return { winner: undefined, confidence: 0, dissenters: [], tie: false };
  }
  const entries = tally(votes);
  entries.sort((a, b) => (strategy === 'weighted' ? b.weight - a.weight : b.count - a.count));
  const top = entries[0] ?? { value: undefined, weight: 1, count: 1 };
  const runnerUp = entries[1];

  if (strategy === 'unanimous') {
    const dissenters = votes
      .filter((v) => keyOf(v.value) !== keyOf(top.value))
      .map((v) => v.agentId);
    return {
      winner: dissenters.length === 0 ? top.value : undefined,
      confidence: dissenters.length === 0 ? 1 : 0,
      dissenters,
      tie: false,
    };
  }

  const total = strategy === 'weighted' ? entries.reduce((s, e) => s + e.weight, 0) : votes.length;
  const tie =
    runnerUp !== undefined &&
    (strategy === 'weighted' ? runnerUp.weight === top.weight : runnerUp.count === top.count);
  const confidence = total === 0 ? 0 : top.weight / total;
  const dissenters = votes.filter((v) => keyOf(v.value) !== keyOf(top.value)).map((v) => v.agentId);
  log.debug('consensus.tally', { strategy, winner: keyOf(top.value).slice(0, 32), confidence });
  return { winner: top.value, confidence, dissenters, tie };
}

/** Async llm-judge variant — delegates the decision to the supplied judge fn. */
export type JudgeFn = (votes: Vote[]) => Promise<{ winner: unknown; confidence: number }>;
export async function judgeConsensus(votes: Vote[], judge: JudgeFn): Promise<ConsensusResult> {
  if (votes.length === 0) return { winner: undefined, confidence: 0, dissenters: [], tie: false };
  const { winner, confidence } = await judge(votes);
  const dissenters = votes.filter((v) => keyOf(v.value) !== keyOf(winner)).map((v) => v.agentId);
  return { winner, confidence, dissenters, tie: false };
}

/**
 * Byzantine Fault Tolerant tally (Phase 13.8+). Hardening over `weighted`:
 *
 *  1. WEIGHT CAP — no single voter can dominate. Each vote's effective weight
 *     is clamped to `maxWeight` (default 1), so a colluding super-reputation
 *     agent cannot swing the result past honest peers.
 *  2. THRESHOLD ACCEPTANCE — a value only wins if its clamped weight share
 *     strictly exceeds `threshold` (default 2/3), the classic BFT safety bound.
 *     Below threshold the result is a `tie` (escalate to HITL / re-delegate).
 *  3. CONFIDENCE is the clamped-weight share, never inflated by uncapped weight.
 *
 * Pure, deterministic, no kernel deps. Existing `weighted`/`majority`/`unanimous`
 * behavior is unchanged (backwards compatible for pinned tests).
 */
export interface BftOptions {
  /** Max effective weight per voter (default 1). */
  maxWeight?: number;
  /** Required winning share in (0,1] (default 2/3). */
  threshold?: number;
}

export function tallyBFT(votes: Vote[], opts: BftOptions = {}): ConsensusResult {
  if (votes.length === 0) {
    return { winner: undefined, confidence: 0, dissenters: [], tie: false };
  }
  const maxWeight = opts.maxWeight && opts.maxWeight > 0 ? opts.maxWeight : 1;
  const threshold =
    opts.threshold && opts.threshold > 0 && opts.threshold <= 1 ? opts.threshold : 2 / 3;

  const map = new Map<string, { value: unknown; count: number; weight: number }>();
  for (const v of votes) {
    const k = keyOf(v.value);
    const e = map.get(k) ?? { value: v.value, count: 0, weight: 0 };
    e.count += 1;
    // Clamp each voter's effective weight to defend against reputation inflation.
    e.weight += Math.min(v.weight ?? 1, maxWeight);
    map.set(k, e);
  }
  const entries = [...map.values()].sort((a, b) => b.weight - a.weight);
  if (entries.length === 0) {
    return { winner: undefined, confidence: 0, dissenters: [], tie: false };
  }
  const top = entries[0]!;
  const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
  const share = totalWeight === 0 ? 0 : top.weight / totalWeight;

  const accepted = share > threshold;
  const dissenters = votes.filter((v) => keyOf(v.value) !== keyOf(top.value)).map((v) => v.agentId);
  log.debug('consensus.bft', { winner: keyOf(top.value).slice(0, 32), share, accepted, threshold });
  return {
    winner: accepted ? top.value : undefined,
    confidence: share,
    dissenters,
    // Below-threshold is treated as an unsafe split → escalate (tie semantics).
    tie: !accepted,
  };
}
