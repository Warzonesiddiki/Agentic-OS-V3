/**
 * dlp-scanner.ts — Data Loss Prevention scanner.
 *
 * Scans text payloads for sensitive data patterns (PII, financial, credentials,
 * internal classification tags). Returns a risk verdict and redacted copy. Findings
 * are forwarded to the SIEM forwarder and counted for anomaly detection on exfil rate.
 */
import { forward } from './siem-forwarder.js';
import { sanitize } from '../lib/env-sanitizer.js';

export type DlpCategory =
  'pii_ssn' | 'pii_email' | 'pii_phone' | 'financial_card' | 'credential' | 'internal_tag';

const PATTERNS: Record<DlpCategory, RegExp> = {
  pii_ssn: /\b\d{3}-\d{2}-\d{4}\b/,
  pii_email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  pii_phone: /\b(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}\b/,
  financial_card: /\b(?:\d[ -]?){13,19}\b/,
  credential: /(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/i,
  internal_tag: /\[INTERNAL[^\]]*\]|\[CONFIDENTIAL[^\]]*\]/i,
};

export interface DlpFinding {
  category: DlpCategory;
  index: number;
  snippet: string;
}

export interface DlpResult {
  flagged: boolean;
  findings: DlpFinding[];
  score: number; // 0..1 exposure score
  redacted: string;
}

export function scan(text: string): DlpResult {
  const findings: DlpFinding[] = [];
  let redacted = text;
  for (const [category, re] of Object.entries(PATTERNS) as [DlpCategory, RegExp][]) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      findings.push({ category, index: m.index, snippet: m[0].slice(0, 24) });
      redacted = redacted.replace(m[0], `[DLP:${category}]`);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  const score = Math.min(1, findings.length / 5);
  if (findings.length) {
    void forward({
      ts: Date.now(),
      kind: 'dlp.flagged',
      severity: score > 0.6 ? 'warn' : 'info',
      attrs: { count: findings.length, categories: findings.map((f) => f.category) },
    });
  }
  return { flagged: findings.length > 0, findings, score, redacted };
}

export function redact(value: unknown): unknown {
  return sanitize(value);
}
