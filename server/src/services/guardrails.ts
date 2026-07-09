/**
 * guardrails.ts — typed guardrail threshold registry (Phase 14 guardrail work,
 * Phase 18.18 adapter seam for Pulse's self-optimization).
 *
 * Guardrails are the safety boundaries that bound agent behavior (e.g. max tokens,
 * max tool calls, blocked scopes, DLP strictness). Pulse's auto-tuner proposes new
 * threshold values via `setGuardrailThreshold(id, partial)`; this module persists and
 * validates them, and exposes `assertWithinGuardrail` so call sites can check before
 * acting. This is the single source of truth for configurable guardrail values.
 */
import { ApiError } from '../lib/errors.js';
import { log } from '../lib/logging.js';
import { appendAudit, Tx } from '../lib/audit.js';
import { db } from '../db/client.js';
import { forward } from './siem-forwarder.js';
import { quarantineAgent } from './reliability/quarantine.js';

export type GuardrailMetric =
  'tokens' | 'tool_calls' | 'cost_usd' | 'latency_ms' | 'error_rate' | 'concurrency' | 'dlp_score';

export interface GuardrailThreshold {
  id: string;
  metric: GuardrailMetric;
  // Inclusive bound; a value at or below `max` (or at/above `min`) is allowed.
  max?: number;
  min?: number;
  // Soft warn threshold before the hard block (optional).
  warnAt?: number;
  enabled: boolean;
}

const registry = new Map<string, GuardrailThreshold>();

export function registerGuardrail(t: GuardrailThreshold): void {
  registry.set(t.id, t);
}

export function getGuardrailThreshold(id: string): GuardrailThreshold | undefined {
  return registry.get(id);
}

export function listGuardrails(): GuardrailThreshold[] {
  return [...registry.values()];
}

/** Pulse's 18.18 seam: update an existing guardrail's thresholds. */
export function setGuardrailThreshold(
  id: string,
  partial: Partial<Omit<GuardrailThreshold, 'id'>>,
  actor = 'pulse-auto-tuner'
): GuardrailThreshold {
  const existing = registry.get(id);
  if (!existing) throw new ApiError('GUARDRAIL_UNKNOWN', `No guardrail ${id}`);
  const next: GuardrailThreshold = { ...existing, ...partial, id };
  if (next.min != null && next.max != null && next.min > next.max) {
    throw new ApiError(
      'GUARDRAIL_INVALID_RANGE',
      `Guardrail ${id}: min ${next.min} > max ${next.max}`
    );
  }
  registry.set(id, next);
  void appendAudit(
    'guardrail.threshold.set',
    { id, partial, value: next },
    actor,
    db as unknown as Tx
  );
  // Feedback event Pulse's auto-tuner consumes to close its control loop (ML-001).
  void forward({
    ts: Date.now(),
    kind: 'guardrail.threshold.updated',
    severity: 'info',
    attrs: { id, metric: next.metric, partial, actor },
  }).catch(() => undefined);
  log.info('guardrail.threshold.updated', { id, metric: next.metric });
  return next;
}

export interface GuardrailCheck {
  allowed: boolean;
  level: 'ok' | 'warn' | 'block';
  value: number;
  threshold: GuardrailThreshold;
}

export function assertWithinGuardrail(id: string, value: number, actor?: string): GuardrailCheck {
  const t = registry.get(id);
  if (!t || !t.enabled)
    return { allowed: true, level: 'ok', value, threshold: t as GuardrailThreshold };
  if (t.max != null && value > t.max) {
    void appendAudit(
      'guardrail.blocked',
      { id, value, max: t.max },
      actor ?? 'system',
      db as unknown as Tx
    );
    return { allowed: false, level: 'block', value, threshold: t };
  }
  if (t.warnAt != null && value >= t.warnAt) {
    return { allowed: true, level: 'warn', value, threshold: t };
  }
  return { allowed: true, level: 'ok', value, threshold: t };
}

/**
 * Self-healing guardrail enforcement (ML-002). When an agent breaches a hard
 * guardrail, this emits a SIEM event and, for repeated/severe breaches, calls
 * the kernel's process-isolation seam (Forge's `quarantineAgent`). The seam is
 * consumed interface-only via the Sentinel-owned `reliability/quarantine.js`
 * wrapper — no cross-namespace edits.
 */
export interface GuardrailViolation {
  agentId: string;
  guardrailId: string;
  value: number;
  /** Number of prior breaches in the window (for escalation). */
  priorBreaches?: number;
}

const violationWindow = new Map<string, number>(); // agentId:guardrailId -> count

export async function reportGuardrailViolation(
  v: GuardrailViolation
): Promise<{ quarantined: boolean; severity: 'info' | 'warn' | 'error' | 'critical' }> {
  const key = `${v.agentId}:${v.guardrailId}`;
  const count = (violationWindow.get(key) ?? 0) + 1;
  violationWindow.set(key, count);
  const breachCount = (v.priorBreaches ?? 0) + count;

  const severity: 'info' | 'warn' | 'error' | 'critical' =
    breachCount >= 5 ? 'critical' : breachCount >= 2 ? 'error' : 'warn';
  await forward({
    ts: Date.now(),
    kind: 'guardrail.violation',
    severity,
    attrs: { agentId: v.agentId, guardrailId: v.guardrailId, value: v.value, breachCount },
  }).catch(() => undefined);
  await appendAudit(
    'guardrail.violation',
    { agentId: v.agentId, guardrailId: v.guardrailId, value: v.value, breachCount },
    'guardrail-self-heal',
    db as unknown as Tx
  ).catch(() => undefined);

  let quarantined = false;
  if (breachCount >= 5) {
    try {
      const decision = await quarantineAgent(
        v.agentId,
        `guardrail breach: ${v.guardrailId} x${breachCount}`,
        30 * 60 * 1000,
        'guardrail-self-heal'
      );
      quarantined = decision.request.status === 'active';
      violationWindow.delete(key);
    } catch (e) {
      log.error('guardrail self-heal quarantine failed', { agentId: v.agentId, error: String(e) });
    }
  }
  return { quarantined, severity };
}

/** Decay the breach counter for an agent/guardrail (called on successful recovery). */
export function clearGuardrailViolation(agentId: string, guardrailId: string): void {
  violationWindow.delete(`${agentId}:${guardrailId}`);
}

/**
 * Content-scanning guardrails (real implementations, no stub).
 *
 * These complement the numeric threshold registry above: `assertWithinGuardrail`
 * bounds metrics; `applyInputGuardrails`/`applyOutputGuardrails` bound *content*
 * (injection attempts, PII leakage). The smoke test in `tests/smoke-new-services.test.ts`
 * exercises exactly these, so they must be real and exported.
 */

export interface InputGuardrailResult {
  allowed: boolean;
  blocked: boolean;
  reason?: string;
}

// Patterns that, if present in untrusted input, must be blocked before reaching a tool/LLM.
const INPUT_BLOCK_PATTERNS: RegExp[] = [
  /\bunion\b.*\bselect\b/i, // SQL injection
  /;\s*drop\s+table/i, // destructive SQL
  /<script\b/i, // reflected XSS
  /\bexec\s*\(/i, // code exec probe
  /\$\{.*\}/, // template/command injection
];

let guardrailReport: { inputBlocked: number; outputRedacted: number } = {
  inputBlocked: 0,
  outputRedacted: 0,
};

/** Reset the cumulative guardrail report counters (used by tests between cases). */
export function resetGuardrailReport(): void {
  guardrailReport = { inputBlocked: 0, outputRedacted: 0 };
}

export function getGuardrailReport(): { inputBlocked: number; outputRedacted: number } {
  return { ...guardrailReport };
}

/** Scan untrusted input; block if it matches a known injection/abuse pattern. */
export function applyInputGuardrails(text: string): InputGuardrailResult {
  for (const re of INPUT_BLOCK_PATTERNS) {
    if (re.test(text)) {
      guardrailReport.inputBlocked++;
      return { allowed: false, blocked: true, reason: `matched pattern ${re.source}` };
    }
  }
  return { allowed: true, blocked: false };
}

// PII patterns redacted from outbound content (emails, phones, SSNs, card-like numbers).
const PII_PATTERNS: RegExp[] = [
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, // email
  /\b(?:\+?\d{1,2}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}\b/g, // phone
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  /\b(?:\d[ -]*?){13,16}\b/g, // card-like
];

/** Redact PII in outbound content; counts redactions for the report. */
export function applyOutputGuardrails(text: string): string {
  let redacted = text;
  for (const re of PII_PATTERNS) {
    redacted = redacted.replace(re, () => {
      guardrailReport.outputRedacted++;
      return `[REDACTED:${re.source.slice(0, 8)}]`;
    });
  }
  return redacted;
}

/** Seed the default guardrail set used across the OS. */
export function seedDefaults(): void {
  registerGuardrail({
    id: 'agent.tokens.per_run',
    metric: 'tokens',
    max: 200_000,
    warnAt: 160_000,
    enabled: true,
  });
  registerGuardrail({
    id: 'agent.tool_calls.per_run',
    metric: 'tool_calls',
    max: 200,
    warnAt: 160,
    enabled: true,
  });
  registerGuardrail({
    id: 'agent.cost.per_run',
    metric: 'cost_usd',
    max: 2.0,
    warnAt: 1.5,
    enabled: true,
  });
  registerGuardrail({
    id: 'agent.concurrency',
    metric: 'concurrency',
    max: 50,
    warnAt: 40,
    enabled: true,
  });
  registerGuardrail({
    id: 'agent.dlp_score',
    metric: 'dlp_score',
    max: 0.6,
    warnAt: 0.4,
    enabled: true,
  });
}
