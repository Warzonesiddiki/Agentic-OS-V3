import { Registry, Gauge } from 'prom-client';
import { policyNameFromIndex, type TelemetrySnapshot, type MetricValue } from './types.js';

const reg = new Registry();

function defaultSnapshot(): TelemetrySnapshot {
  return {
    scheduler: {
      pid: { kp: 1, ki: 0.1, kd: 0.01 },
      queueDepth: 10,
      queueWaitMs: 50,
      queueRejectRate: 0.005,
      boostMs: 5000,
      policy: 'mlfq',
    },
    recall: {
      ndcg10: 0.85,
      missRate: 0.05,
      weights: { rrf: 0.4, importance: 0.3, recency: 0.2, feedback: 0.1 },
      rrfK: 60,
      hitRate: 0.8,
    },
    prompt: { impressions: 100, acceptRate: 0.5, judgeScore: 0.7 },
    provider: { p99Ms: 500, errorRate: 0.01, failoverCount: 0, usdPer1k: 0.005 },
    agent: { restartCount: 0, oomCount: 0, healMs: 1000 },
    cache: { warmHitRate: 0.9, missRate: 0.05 },
    guardrail: { violationRate: 0.005, falsePositive: 0.01 },
    billing: { tokenCostUsd: 1.0 },
    audit: { trailCount: 100, errorRate: 0.0 },
  };
}

export class MetricStore {
  store = new Map<string, MetricValue>();
  lastSnapshot: TelemetrySnapshot = defaultSnapshot();

  set(name: string, value: number): void {
    this.store.set(name, { value, ts: Date.now() });
  }

  get(name: string): MetricValue | undefined {
    return this.store.get(name);
  }

  clear(): void {
    this.store.clear();
  }

  snapshot(): TelemetrySnapshot {
    const s = defaultSnapshot();
    const g = (k: string): number => this.store.get(k)?.value ?? 0;
    s.scheduler.queueDepth = g('scheduler_queue_depth') || s.scheduler.queueDepth;
    s.scheduler.queueWaitMs = g('scheduler_queue_wait_ms') || s.scheduler.queueWaitMs;
    s.scheduler.queueRejectRate = g('scheduler_queue_reject_rate') || s.scheduler.queueRejectRate;
    s.scheduler.boostMs = g('scheduler_boost_ms') || s.scheduler.boostMs;
    const polIdx = this.store.get('scheduler_policy')?.value;
    if (polIdx !== undefined) {
      s.scheduler.policy = policyNameFromIndex(polIdx);
    }
    s.recall.ndcg10 = g('recall_ndcg10') || s.recall.ndcg10;
    s.recall.missRate = g('recall_miss_rate') || s.recall.missRate;
    s.recall.rrfK = g('recall_rrf_k') || s.recall.rrfK;
    s.recall.hitRate = g('recall_hit_rate') || s.recall.hitRate;
    s.prompt.impressions = g('prompt_impressions') || s.prompt.impressions;
    s.prompt.acceptRate = g('prompt_accept_rate') || s.prompt.acceptRate;
    s.prompt.judgeScore = g('prompt_judge_score') || s.prompt.judgeScore;
    s.provider.p99Ms = g('provider_p99_ms') || s.provider.p99Ms;
    s.provider.errorRate = g('provider_error_rate') || s.provider.errorRate;
    s.provider.failoverCount = g('provider_failover_count') || s.provider.failoverCount;
    s.provider.usdPer1k = g('provider_usd_per_1k') || s.provider.usdPer1k;
    s.agent.restartCount = g('agent_restart_count') || s.agent.restartCount;
    s.agent.oomCount = g('agent_oom_count') || s.agent.oomCount;
    s.agent.healMs = g('agent_heal_ms') || s.agent.healMs;
    s.cache.warmHitRate = g('cache_warm_hit_rate') || s.cache.warmHitRate;
    s.cache.missRate = g('cache_miss_rate') || s.cache.missRate;
    s.guardrail.violationRate = g('guardrail_violation_rate') || s.guardrail.violationRate;
    s.guardrail.falsePositive = g('guardrail_false_positive') || s.guardrail.falsePositive;
    s.billing.tokenCostUsd = g('billing_token_cost_usd') || s.billing.tokenCostUsd;
    s.audit.trailCount = g('audit_trail_count') || s.audit.trailCount;
    s.audit.errorRate = g('audit_error_rate') || s.audit.errorRate;
    this.lastSnapshot = s;
    return s;
  }
}

export const metricStore = new MetricStore();
export const TelemetrySink = MetricStore;

const policyGauge = new Gauge({
  name: 'self_opt_scheduler_policy',
  help: 'Self-opt scheduler policy index (0=mlfq,1=edf,2=fairshare)',
  registers: [reg],
});
const queueDepthGauge = new Gauge({
  name: 'self_opt_scheduler_queue_depth',
  help: 'Self-opt observed scheduler queue depth',
  registers: [reg],
});
const ndcgGauge = new Gauge({
  name: 'self_opt_recall_ndcg10',
  help: 'Self-opt observed recall ndcg@10',
  registers: [reg],
});
const p99Gauge = new Gauge({
  name: 'self_opt_provider_p99_ms',
  help: 'Self-opt observed provider p99 latency (ms)',
  registers: [reg],
});

export function exportMetric(name: string, value: number): void {
  switch (name) {
    case 'scheduler_policy':
      policyGauge.set(value);
      break;
    case 'scheduler_queue_depth':
      queueDepthGauge.set(value);
      break;
    case 'recall_ndcg10':
      ndcgGauge.set(value);
      break;
    case 'provider_p99_ms':
      p99Gauge.set(value);
      break;
    default:
      break;
  }
  reg.metrics().catch(() => undefined);
}

export function readMetrics(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of metricStore.store.entries()) out[k] = v.value;
  return out;
}

export const telemetrySink = new MetricStore();
export type MetricSample = MetricValue;
