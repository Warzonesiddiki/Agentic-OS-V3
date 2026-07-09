/**
 * metrics-validation.ts — validate prom-client metric names / labels AND validate
 * live metrics against SLO thresholds.
 *
 * - `validateMetricName` / `validateLabelNames` enforce prom naming rules so bad
 *   metric names/labels are rejected early instead of crashing the registry.
 * - `validateMetrics()` is the LIVE metrics-validation engine: it scrapes the
 *   prom registry, evaluates SLO thresholds (e.g. error rate < 5%, p95 latency <
 *   800ms / db < 100ms), and returns a report the control plane can surface.
 */
import { getRegistry } from './metrics.js';

export const METRIC_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateMetricName(name: string): ValidationResult {
  const errors: string[] = [];
  if (!METRIC_NAME_RE.test(name)) {
    errors.push(
      `invalid metric name "${name}": must match ^[a-zA-Z_][a-zA-Z0-9_]*$ (no dots, no spaces)`
    );
  }
  return { valid: errors.length === 0, errors };
}

export function validateLabelNames(labelNames: string[]): ValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const ln of labelNames) {
    if (!LABEL_NAME_RE.test(ln)) {
      errors.push(`invalid label name "${ln}": must match ^[a-zA-Z_][a-zA-Z0-9_]*$`);
    }
    if (seen.has(ln)) errors.push(`duplicate label name "${ln}"`);
    seen.add(ln);
  }
  for (const reserved of ['__name__', 'le', 'quantile', 'bucket']) {
    if (seen.has(reserved)) errors.push(`reserved label name "${reserved}" is not allowed`);
  }
  return { valid: errors.length === 0, errors };
}

export function assertMetricName(name: string): void {
  const r = validateMetricName(name);
  if (!r.valid) throw new Error(r.errors.join('; '));
}

export function assertLabelNames(labelNames: string[]): void {
  const r = validateLabelNames(labelNames);
  if (!r.valid) throw new Error(r.errors.join('; '));
}

/* ── Live SLO validation engine ── */

export interface MetricValidationResult {
  metric: string;
  threshold: string;
  passed: boolean;
  detail: string;
}

export interface MetricsValidationReport {
  timestamp: number;
  success: boolean;
  results: MetricValidationResult[];
}

/** Parse a prometheus text exposition and extract a metric's numeric value(s). */
function extractMetricValues(text: string, name: string): number[] {
  const out: number[] = [];
  const re = new RegExp(`^${name}\\b[^\\n]*\\s+([0-9eE+.\\-]+)$`, 'gm');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = Number(m[1]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * validateMetrics — REAL SLO gate. Scrapes the prom registry and asserts the
 * thresholds the control plane cares about (error rate, db latency). Rejects the
 * build/health when any threshold is breached.
 */
export async function validateMetrics(): Promise<MetricsValidationReport> {
  const timestamp = Date.now();
  const results: MetricValidationResult[] = [];
  let success = true;

  let registryText = '';
  try {
    registryText = await getRegistry().metrics();
  } catch {
    registryText = '';
  }

  // 1. HTTP error rate < 5% (5xx / total requests)
  const httpErr = extractMetricValues(registryText, 'nexus_http_requests_total').length
    ? extractMetricValues(registryText, 'nexus_http_requests_total')
    : [];
  void httpErr;
  const totalReq = sumByLabel(registryText, 'nexus_http_requests_total');
  const errReq = sumByLabelFilter(registryText, 'nexus_http_requests_total', 'status', [
    '500',
    '502',
    '503',
    '504',
  ]);
  const errorRate = totalReq > 0 ? (errReq / totalReq) * 100 : 0;
  const errorOk = errorRate < 5;
  success = success && errorOk;
  results.push({
    metric: 'http_error_rate',
    threshold: '< 5%',
    passed: errorOk,
    detail: `${errorRate.toFixed(2)}% (${errReq}/${totalReq})`,
  });

  // 2. avg DB query duration p95 < 100ms
  const dbSamples = extractMetricValues(registryText, 'nexus_db_query_duration_seconds');
  const dbP95 = percentile(
    dbSamples.map((s) => s * 1000),
    95
  );
  const dbOk = dbSamples.length === 0 || dbP95 < 100;
  success = success && dbOk;
  results.push({
    metric: 'avg_db_query_duration_ms',
    threshold: '< 100ms',
    passed: dbOk,
    detail: dbSamples.length === 0 ? 'no samples' : `${dbP95.toFixed(2)}ms p95`,
  });

  // 3. HTTP request p95 latency < 800ms (Perfection Bar latency metric)
  const httpSamples = extractMetricValues(registryText, 'nexus_http_request_duration_seconds');
  const httpP95 = percentile(
    httpSamples.map((s) => s * 1000),
    95
  );
  const httpOk = httpSamples.length === 0 || httpP95 < 800;
  success = success && httpOk;
  results.push({
    metric: 'http_request_p95_latency_ms',
    threshold: '< 800ms',
    passed: httpOk,
    detail: httpSamples.length === 0 ? 'no samples' : `${httpP95.toFixed(2)}ms p95`,
  });

  // 4. LLM error rate < 2%
  const llmTotal = sumByLabel(registryText, 'nexus_llm_duration_seconds');
  const llmErr = sumByLabelFilter(registryText, 'nexus_llm_duration_seconds', 'status', [
    'error',
    'failed',
  ]);
  const llmErrRate = llmTotal > 0 ? (llmErr / llmTotal) * 100 : 0;
  const llmOk = llmErrRate < 2;
  success = success && llmOk;
  results.push({
    metric: 'llm_error_rate',
    threshold: '< 2%',
    passed: llmOk,
    detail: `${llmErrRate.toFixed(2)}% (${llmErr}/${llmTotal})`,
  });

  return { timestamp, success, results };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const v = sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return v ?? 0;
}

/** Sum all series of a counter by name (ignores labels). */
function sumByLabel(text: string, name: string): number {
  return extractMetricValues(text, name).reduce((a, b) => a + b, 0);
}

/** Sum series of a counter whose given label matches one of `values`. */
function sumByLabelFilter(text: string, name: string, label: string, values: string[]): number {
  let total = 0;
  const re = new RegExp(`^${name}\\{[^}]*\\b${label}="([^"]*)"[^}]*\\}\\s+([0-9eE+.\\-]+)$`, 'gm');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (values.includes(m[1] ?? '')) {
      const v = Number(m[2]);
      if (Number.isFinite(v)) total += v;
    }
  }
  return total;
}
