/**
 * slow-query-advisor.ts — Phase 15.6 slow-query advisor.
 *
 * Records observed query latencies (normalized by parameter-stripping), maintains a rolling
 * histogram per normalized query shape, flags slow queries against a threshold, and emits
 * lightweight optimization hints (e.g. likely missing index, full-scan keywords, N+1 footprint).
 */
import { log } from '../../lib/logging.js';

export interface QueryObservation {
  sql: string;
  ms: number;
  rows?: number;
}

export interface QueryAdvice {
  normalizedSql: string;
  p95Ms: number;
  avgMs: number;
  calls: number;
  slow: boolean;
  hints: string[];
}

interface Bucket {
  normalizedSql: string;
  samples: number[];
  totalMs: number;
  calls: number;
  maxRows?: number;
}

/** Strip literals/parameters so `WHERE id = 5` and `WHERE id = 9` collapse to one shape. */
export function normalizeSql(sql: string): string {
  return sql
    .replace(/\$\d+/g, '?')
    .replace(/'[^']*'/g, '?')
    .replace(/\b\d+\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export class SlowQueryAdvisor {
  private buckets = new Map<string, Bucket>();
  private readonly thresholdMs: number;
  private readonly maxSamples: number;
  constructor(thresholdMs = 200, maxSamples = 200) {
    this.thresholdMs = thresholdMs;
    this.maxSamples = maxSamples;
  }

  record(obs: QueryObservation): QueryAdvice {
    const norm = normalizeSql(obs.sql);
    let b = this.buckets.get(norm);
    if (!b) {
      b = { normalizedSql: norm, samples: [], totalMs: 0, calls: 0 };
      this.buckets.set(norm, b);
    }
    b.samples.push(obs.ms);
    if (b.samples.length > this.maxSamples) b.samples.shift();
    b.totalMs += obs.ms;
    b.calls += 1;
    if (obs.rows !== undefined) b.maxRows = Math.max(b.maxRows ?? 0, obs.rows);

    const advice = this.adviseFor(b);
    if (advice.slow) {
      log.warn('slow-query-advisor: slow query observed', {
        norm,
        p95: advice.p95Ms,
        avg: advice.avgMs,
      });
    }
    return advice;
  }

  private adviseFor(b: Bucket): QueryAdvice {
    const sorted = [...b.samples].sort((a, c) => a - c);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
    const avg = b.totalMs / b.calls;
    const slow = p95 >= this.thresholdMs;
    const hints: string[] = [];
    if (slow) {
      hints.push(`p95 ${p95.toFixed(0)}ms exceeds ${this.thresholdMs}ms threshold`);
      if (/(^|\s)(select)\s+\*/i.test(b.normalizedSql))
        hints.push('avoid SELECT *; project only needed columns');
      if (
        /(^|\s)(where)\s+/i.test(b.normalizedSql) &&
        !/(^|\s)(index|using)\s/i.test(b.normalizedSql)
      )
        hints.push('filter present without explicit index hint — verify index on WHERE columns');
      if (/(^|\s)(like\s+'%)/i.test(b.normalizedSql))
        hints.push('leading-wildcard LIKE prevents index use');
      if ((b.maxRows ?? 0) > 5000)
        hints.push('high row count — consider pagination / covering index');
    }
    return {
      normalizedSql: b.normalizedSql,
      p95Ms: p95,
      avgMs: avg,
      calls: b.calls,
      slow,
      hints,
    };
  }

  /** Top slow queries by p95, descending. */
  advise(limit = 20): QueryAdvice[] {
    const out: QueryAdvice[] = [];
    for (const b of this.buckets.values()) out.push(this.adviseFor(b));
    return out
      .filter((a) => a.slow)
      .sort((a, c) => c.p95Ms - a.p95Ms)
      .slice(0, limit);
  }

  reset(): void {
    this.buckets.clear();
  }
}

export const slowQueryAdvisor = new SlowQueryAdvisor();
