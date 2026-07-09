import type { Gauge } from 'prom-client';

export type OwnerAgent =
  | 'forge'
  | 'atlas'
  | 'mnemosyne'
  | 'pulse'
  | 'metron'
  | 'bastion'
  | 'sentinel'
  | 'cerebrum'
  | 'aegis';

export type TunerId =
  | '18.1'
  | '18.2'
  | '18.3'
  | '18.4'
  | '18.5'
  | '18.7'
  | '18.8'
  | '18.9'
  | '18.12'
  | '18.13'
  | '18.14'
  | '18.15'
  | '18.16'
  | '18.17'
  | '18.18'
  | '18.19'
  | '18.20';

export type TunerLifecycleState = 'idle' | 'proposing' | 'applying' | 'evaluating' | 'rolledback';

export interface MetricValue {
  value: number;
  ts: number;
  unit?: string;
}

export interface SchedulerSnapshot {
  pid: { kp: number; ki: number; kd: number };
  queueDepth: number;
  queueWaitMs: number;
  queueRejectRate: number;
  boostMs: number;
  policy: string;
}

export interface RecallSnapshot {
  ndcg10: number;
  missRate: number;
  weights: { rrf: number; importance: number; recency: number; feedback: number };
  rrfK: number;
  hitRate: number;
}

export interface PromptSnapshot {
  impressions: number;
  acceptRate: number;
  judgeScore: number;
}

export interface ProviderSnapshot {
  p99Ms: number;
  errorRate: number;
  failoverCount: number;
  usdPer1k: number;
}

export interface AgentSnapshot {
  restartCount: number;
  oomCount: number;
  healMs: number;
}

export interface CacheSnapshot {
  warmHitRate: number;
  missRate: number;
}

export interface GuardrailSnapshot {
  violationRate: number;
  falsePositive: number;
}

export interface BillingSnapshot {
  tokenCostUsd: number;
}

export interface AuditSnapshot {
  trailCount: number;
  errorRate: number;
}

export interface TelemetrySnapshot {
  scheduler: SchedulerSnapshot;
  recall: RecallSnapshot;
  prompt: PromptSnapshot;
  provider: ProviderSnapshot;
  agent: AgentSnapshot;
  cache: CacheSnapshot;
  guardrail: GuardrailSnapshot;
  billing: BillingSnapshot;
  audit: AuditSnapshot;
}

export type TunerValue = number | string | boolean;

export interface TunerDeltaInput {
  targetInterface: string;
  ownerAgent: OwnerAgent;
  before: Record<string, TunerValue>;
  after: Record<string, TunerValue>;
}

export interface TunerAdapter {
  ownerAgent: OwnerAgent;
  targetInterface: string;
  hasLiveSetter(): boolean;
  readState(_snapshot: TelemetrySnapshot): Promise<Record<string, TunerValue>>;
  apply(delta: Record<string, TunerValue>): Promise<Record<string, TunerValue>>;
}

export interface SignificanceResult {
  pValue: number;
  metricDelta: number;
  sampleSize: number;
  passed: boolean;
}

export interface ExplainResult {
  reason: string;
  expectedEffect: string;
  cohortMetrics?: Record<string, number>;
}

export interface SelfOptTuner {
  readonly id: TunerId;
  readonly name: string;
  readonly ownerAgent: OwnerAgent;
  readonly adapter: TunerAdapter;
  propose(snapshot: TelemetrySnapshot): Promise<TunerDeltaInput | null>;
  explain(delta: TunerDeltaInput): ExplainResult;
  evaluate?(
    before: Record<string, TunerValue>,
    after: Record<string, TunerValue>
  ): SignificanceResult;
}

export const POLICY_NAMES = ['mlfq', 'edf', 'fairshare'] as const;

export type PolicyName = (typeof POLICY_NAMES)[number];

export function policyNameFromIndex(idx: number): PolicyName {
  if (idx < 0 || idx >= POLICY_NAMES.length) return 'mlfq';
  const name = POLICY_NAMES[idx];
  return name ?? 'mlfq';
}

let registry: Gauge<string> | null = null;
export function attachMetricsRegistry(g: Gauge<string>): void {
  registry = g;
}
export function getMetricsRegistry(): Gauge<string> | null {
  return registry;
}
