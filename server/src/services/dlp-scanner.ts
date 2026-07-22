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

// The /g flag is load-bearing: scan() iterates matches with RegExp.exec(),
// which only advances lastIndex between calls for global patterns. Without
// /g the first match is returned forever, the findings array grows without
// bound, and every flagged payload exhausts the process heap.
const PATTERNS: Record<DlpCategory, RegExp> = {
  pii_ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  pii_email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  pii_phone: /\b(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}\b/g,
  financial_card: /\b(?:\d[ -]?){13,19}\b/g,
  credential: /(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi,
  internal_tag: /\[INTERNAL[^\]]*\]|\[CONFIDENTIAL[^\]]*\]/gi,
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
  const spans: Array<{ start: number; end: number; category: DlpCategory }> = [];
  for (const [category, re] of Object.entries(PATTERNS) as [DlpCategory, RegExp][]) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      findings.push({ category, index: m.index, snippet: m[0].slice(0, 24) });
      spans.push({ start: m.index, end: m.index + m[0].length, category });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  // Single-pass redaction over the original text. Replacing inside an already
  // mutated copy (String.replace per match) targets the first remaining
  // occurrence, which corrupts duplicate secrets and shadowed substrings.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  let redacted = '';
  for (const span of spans) {
    if (span.start < cursor) continue; // overlapped by an earlier finding
    redacted += `${text.slice(cursor, span.start)}[DLP:${span.category}]`;
    cursor = span.end;
  }
  redacted += text.slice(cursor);
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
