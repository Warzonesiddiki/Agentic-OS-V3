/**
 * overhead-accounting.ts — REAL cost accounting for the runtime loop.
 *
 * Purpose (Perfection target #1): expose the *actual* CPU / wall / token cost of
 * operations so self-optimization (Pulse) can read ground-truth overhead instead
 * of estimates.
 *
 * Two surfaces:
 *  - Low-level `measure` / `record` / `getOverheadReport` — wall/cpu/token samples
 *    with p95, consumed by the control plane and self-opt telemetry.
 *  - Simple `accountOverhead` / `getOverhead` / `OverheadAccountant` — nanosecond
 *    category accounting used by the kernel scheduling instrumentation (Phase 11.31).
 *
 * Both accumulators are ring-bounded (MAX_SAMPLES / MAX_CATEGORIES) so they can
 * never leak memory.
 */
import { performance } from 'node:perf_hooks';

export interface OverheadSample {
  wallMs: number;
  cpuMs: number;
  tokens: number;
  at: number; // epoch ms
}

export interface OverheadStats {
  count: number;
  wallMsTotal: number;
  cpuMsTotal: number;
  tokensTotal: number;
  wallMsMean: number;
  cpuMsMean: number;
  wallMsP95: number;
  cpuMsP95: number;
  lastAt: number;
}

export interface OverheadReport {
  generatedAt: number;
  perOperation: Record<string, OverheadStats>;
  totals: { wallMsTotal: number; cpuMsTotal: number; tokensTotal: number; count: number };
}

const MAX_SAMPLES = 4096;
const MAX_CATEGORIES = 1024;

interface Accumulator {
  samples: OverheadSample[];
  wallTotal: number;
  cpuTotal: number;
  tokenTotal: number;
}

const _acc = new Map<string, Accumulator>();

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  const v = sorted[idx];
  return v ?? 0; // noUncheckedIndexedAccess guard
}

/**
 * measure — wrap an async operation and account its real cost.
 */
export async function measure<T>(
  op: string,
  fn: () => Promise<T>,
  opts: { tokens?: number } = {}
): Promise<T> {
  const start = performance.now();
  const cpuStart = process.cpuUsage();
  try {
    return await fn();
  } finally {
    const end = performance.now();
    const cpuEnd = process.cpuUsage(cpuStart);
    const wallMs = end - start;
    const cpuMs = (cpuEnd.user + cpuEnd.system) / 1000; // microseconds -> ms
    record(op, { wallMs, cpuMs, tokens: opts.tokens ?? 0 });
  }
}

/** Synchronous measure variant for non-async hot paths. */
export function measureSync<T>(op: string, fn: () => T): T {
  const start = performance.now();
  const cpuStart = process.cpuUsage();
  try {
    return fn();
  } finally {
    const end = performance.now();
    const cpuEnd = process.cpuUsage(cpuStart);
    record(op, {
      wallMs: end - start,
      cpuMs: (cpuEnd.user + cpuEnd.system) / 1000,
      tokens: 0,
    });
  }
}

export function record(
  op: string,
  sample: { wallMs: number; cpuMs: number; tokens?: number }
): void {
  let acc = _acc.get(op);
  if (!acc) {
    acc = { samples: [], wallTotal: 0, cpuTotal: 0, tokenTotal: 0 };
    _acc.set(op, acc);
  }
  const s: OverheadSample = {
    wallMs: sample.wallMs,
    cpuMs: sample.cpuMs,
    tokens: sample.tokens ?? 0,
    at: Date.now(),
  };
  acc.samples.push(s);
  if (acc.samples.length > MAX_SAMPLES) acc.samples.shift();
  acc.wallTotal += s.wallMs;
  acc.cpuTotal += s.cpuMs;
  acc.tokenTotal += s.tokens;
}

function statsFor(acc: Accumulator): OverheadStats {
  const n = acc.samples.length;
  const last = n > 0 ? acc.samples[n - 1] : undefined;
  return {
    count: n,
    wallMsTotal: acc.wallTotal,
    cpuMsTotal: acc.cpuTotal,
    tokensTotal: acc.tokenTotal,
    wallMsMean: n ? acc.wallTotal / n : 0,
    cpuMsMean: n ? acc.cpuTotal / n : 0,
    wallMsP95: percentile(
      acc.samples.map((s) => s.wallMs),
      95
    ),
    cpuMsP95: percentile(
      acc.samples.map((s) => s.cpuMs),
      95
    ),
    lastAt: last ? last.at : 0,
  };
}

export function getOverheadReport(): OverheadReport {
  const perOperation: Record<string, OverheadStats> = {};
  let wallMsTotal = 0;
  let cpuMsTotal = 0;
  let tokensTotal = 0;
  let count = 0;
  for (const [op, acc] of _acc) {
    perOperation[op] = statsFor(acc);
    wallMsTotal += acc.wallTotal;
    cpuMsTotal += acc.cpuTotal;
    tokensTotal += acc.tokenTotal;
    count += acc.samples.length;
  }
  return {
    generatedAt: Date.now(),
    perOperation,
    totals: { wallMsTotal, cpuMsTotal, tokensTotal, count },
  };
}

/* ── Nanosecond category accounting (Phase 11.31 kernel instrumentation) ── */

export interface OverheadTotals {
  totalNs: number;
  byCategory: Record<string, number>;
  samples: number;
}

const _cat = new Map<string, number>();

export function accountOverhead(category: string, ns: number): void {
  if (ns < 0) throw new Error(`overhead must be non-negative, got ${ns}`);
  if (_cat.size >= MAX_CATEGORIES && !_cat.has(category)) {
    // Bound memory: refuse to allocate a new category beyond the cap.
    return;
  }
  const cur = _cat.get(category) ?? 0;
  _cat.set(category, cur + ns);
}

export function getOverhead(): OverheadTotals {
  let totalNs = 0;
  const byCategory: Record<string, number> = {};
  let samples = 0;
  for (const [cat, ns] of _cat) {
    byCategory[cat] = ns;
    totalNs += ns;
    samples++;
  }
  return { totalNs, byCategory, samples };
}

export function resetOverhead(op?: string): void {
  if (op) _acc.delete(op);
  else {
    _acc.clear();
    _cat.clear();
  }
}

export class OverheadAccountant {
  private readonly _local = new Map<string, number>();

  account(category: string, ns: number): void {
    if (ns < 0) throw new Error(`overhead must be non-negative, got ${ns}`);
    const cur = this._local.get(category) ?? 0;
    this._local.set(category, cur + ns);
  }

  share(category: string): number {
    let total = 0;
    for (const v of this._local.values()) total += v;
    if (total === 0) return 0;
    const part = this._local.get(category) ?? 0;
    return part / total;
  }

  total(): number {
    let t = 0;
    for (const v of this._local.values()) t += v;
    return t;
  }

  reset(): void {
    this._local.clear();
  }
}

export const overheadAccountant = new OverheadAccountant();
