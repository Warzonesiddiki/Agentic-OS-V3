/**
 * secrets-scanner — Sentinel-owned secret & credential discovery engine.
 *
 * Performs high-precision scanning of arbitrary text for embedded secrets
 * (API keys, tokens, private keys, connection strings, passwords) using a
 * layered detector:
 *   1. High-confidence regex/pattern matchers per provider.
 *   2. Shannon-entropy gate to suppress low-entropy false positives.
 *   3. Contextual suppressors (test fixtures, example/dummy markers,
 *      obviously fake values) to cut noise.
 *
 * Pure and dependency-free (no DB) so it is trivially unit-testable and can
 * run on untrusted input at admission time. Results are surfaced to the SIEM
 * forwarder when a finding breaches the configured severity threshold.
 */

import { timingSafeStrEq } from '../lib/security.js';
import { forward } from './siem-forwarder.js';
import { log } from '../lib/logging.js';

export type SecretSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecretMatch {
  ruleId: string;
  description: string;
  /** 1-based line number of the first character of the match. */
  line: number;
  /** Column (character index) of the start of the match on that line. */
  column: number;
  /** The matched secret, already masked for safe storage/logging. */
  masked: string;
  /** Length of the raw match (for budgeting/redaction). */
  length: number;
  severity: SecretSeverity;
  /** Shannon entropy of the captured secret (0..8). */
  entropy: number;
  /** Provider family, when determinable. */
  provider?: string;
}

export interface SecretScanOptions {
  /** Severity at or above which a SIEM forward is emitted. Default 'high'. */
  forwardAbove?: SecretSeverity;
  /** Disable the entropy gate (used by callers that only want pattern hits). */
  skipEntropy?: boolean;
  /** Additional keyword/value pairs that should always be treated as benign. */
  allowList?: string[];
  /** Maximum number of matches to return before short-circuiting. */
  maxMatches?: number;
}

interface Detector {
  id: string;
  description: string;
  severity: SecretSeverity;
  provider?: string;
  /** Capturing group 1 must be the secret itself. */
  pattern: RegExp;
  /** Minimum Shannon entropy for the captured group to be reported. */
  minEntropy?: number;
  /** Patterns that, if present in the matched line, suppress the finding. */
  suppressors?: RegExp[];
}

const SEVERITY_RANK: Record<SecretSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let e = 0;
  for (const c of freq.values()) {
    const p = c / s.length;
    e -= p * Math.log2(p);
  }
  return e;
}

function maskSecret(raw: string): string {
  if (raw.length <= 4) return '****';
  const head = raw.slice(0, 2);
  const tail = raw.slice(-2);
  return `${head}${'$'.repeat(Math.min(12, raw.length - 4))}${tail}`;
}

// Contextual markers that indicate a value is a dummy/test fixture. High-confidence
// provider tokens are intentionally not suppressed merely because nearby prose says
// “example”: leaked credentials are frequently labelled that way in comments.
const DEFAULT_SUPPRESSORS: RegExp[] = [
  /sample/i,
  /dummy/i,
  /placeholder/i,
  /xxxx+/i,
  /\b(put|your|insert|replace)[-\s_]?(your|the)[-\s_]?/i,
  /^(test|fake|mock)/i,
  /changeme/i,
  /your[-_]?key/i,
  /<[^>]+>/, // angle-bracketed templated value
];

const DETECTORS: Detector[] = [
  {
    id: 'aws-access-key',
    description: 'AWS Access Key ID',
    severity: 'critical',
    provider: 'aws',
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    minEntropy: 3.2,
  },
  {
    id: 'aws-secret',
    description: 'AWS Secret Access Key',
    severity: 'critical',
    provider: 'aws',
    pattern: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})/g,
    minEntropy: 4.0,
  },
  {
    id: 'github-pat',
    description: 'GitHub Personal Access Token',
    severity: 'critical',
    provider: 'github',
    pattern: /\b(gh[pousr]_[A-Za-z0-9]{36,255})\b/g,
    minEntropy: 3.5,
  },
  {
    id: 'github-oauth',
    description: 'GitHub OAuth Token',
    severity: 'high',
    provider: 'github',
    pattern: /\b(gho_[A-Za-z0-9]{36})\b/g,
  },
  {
    id: 'gitlab-pat',
    description: 'GitLab Personal Access Token',
    severity: 'critical',
    provider: 'gitlab',
    pattern: /\b(glpat-[A-Za-z0-9_-]{20,})\b/g,
    minEntropy: 3.0,
  },
  {
    id: 'slack-token',
    description: 'Slack Bot/User Token',
    severity: 'critical',
    provider: 'slack',
    pattern: /\b(xox[baprs]-[A-Za-z0-9-]{10,48})\b/g,
  },
  {
    id: 'stripe-secret',
    description: 'Stripe Secret Key',
    severity: 'critical',
    provider: 'stripe',
    pattern: /\b(sk_(live|test)_[A-Za-z0-9]{24,})\b/g,
  },
  {
    id: 'stripe-restricted',
    description: 'Stripe Restricted Key',
    severity: 'high',
    provider: 'stripe',
    pattern: /\b(rk_(live|test)_[A-Za-z0-9]{24,})\b/g,
  },
  {
    id: 'openai-key',
    description: 'OpenAI API Key',
    severity: 'critical',
    provider: 'openai',
    pattern: /\b(sk-[A-Za-z0-9]{20,})\b/g,
    minEntropy: 3.5,
  },
  {
    id: 'anthropic-key',
    description: 'Anthropic API Key',
    severity: 'critical',
    provider: 'anthropic',
    pattern: /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/g,
  },
  {
    id: 'google-api',
    description: 'Google API Key',
    severity: 'high',
    provider: 'google',
    pattern: /\b(AIza[0-9A-Za-z_-]{35})\b/g,
    minEntropy: 3.5,
  },
  {
    id: 'gitlab-runner-token',
    description: 'GitLab Runner Registration Token',
    severity: 'high',
    provider: 'gitlab',
    pattern: /\b(glrt-[A-Za-z0-9_-]{20,})\b/g,
    minEntropy: 3.0,
  },
  {
    id: 'discord-token',
    description: 'Discord Bot Token',
    severity: 'high',
    provider: 'discord',
    pattern: /\b([MN][A-Za-z0-9]{23,25}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,})\b/g,
    minEntropy: 3.0,
  },
  {
    id: 'azure-client-secret',
    description: 'Azure AD Client Secret (guid-like)',
    severity: 'high',
    provider: 'azure',
    pattern:
      /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b\s*=\s*['"]?[A-Za-z0-9~._-]{34,40}/gi,
    minEntropy: 3.0,
  },
  {
    id: 'gcp-service-account',
    description: 'GCP Service Account JSON Key',
    severity: 'critical',
    provider: 'gcp',
    pattern: /"type"\s*:\s*"service_account"/g,
  },
  {
    id: 'aws-session-token',
    description: 'AWS Session Token',
    severity: 'high',
    provider: 'aws',
    pattern: /\b(AQoEYXz[AKQA][A-Za-z0-9/+]{16,})\b/g,
    minEntropy: 3.5,
  },
  {
    id: 'pulumi-token',
    description: 'Pulumi Access Token',
    severity: 'high',
    provider: 'pulumi',
    pattern: /\b(pul-[A-Za-z0-9]{36,})\b/g,
    minEntropy: 3.0,
  },
  {
    id: 'datadog-token',
    description: 'Datadog API Key',
    severity: 'high',
    provider: 'datadog',
    pattern: /\b([0-9a-f]{32})\b(?=.*datadog|dd-api-key|DD_API_KEY)/gi,
    minEntropy: 3.5,
  },
  {
    id: 'grafana-token',
    description: 'Grafana Service Account Token',
    severity: 'high',
    provider: 'grafana',
    pattern: /\b(glsa_[A-Za-z0-9]{32}_[A-Fa-f0-9]{8})\b/g,
    minEntropy: 3.0,
  },
  {
    id: 'cloudflare-token',
    description: 'Cloudflare API Token',
    severity: 'critical',
    provider: 'cloudflare',
    pattern: /\b([A-Za-z0-9_-]{40})\b(?=.*cloudflare|cf-api-token|CF_API_TOKEN)/gi,
    minEntropy: 3.5,
  },
  {
    id: 'bearer-token-assign',
    description: 'Bearer Authorization Token Assignment',
    severity: 'medium',
    pattern: /Authorization\s*[:=]\s*['"]?Bearer\s+([A-Za-z0-9-_.]{16,512})['"]?/gi,
    minEntropy: 2.5,
  },
  {
    id: 'ssh-private-key',
    description: 'SSH Private Key Block',
    severity: 'critical',
    pattern: /-----BEGIN (?:OPENSSH |EC |RSA )?PRIVATE KEY-----/g,
  },
  {
    id: 'private-key',
    description: 'PEM Private Key Block',
    severity: 'critical',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: 'jwt',
    description: 'JSON Web Token',
    severity: 'high',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  },
  {
    id: 'generic-api-key-assign',
    description: 'Generic API Key Assignment',
    severity: 'medium',
    pattern:
      /(?:api[_-]?key|apikey|access[_-]?token|secret[_-]?key|client[_-]?secret)\s*[:=]\s*['"]?([A-Za-z0-9_-]{16,64})['"]?/gi,
    minEntropy: 3.0,
  },
  {
    id: 'db-connection-string',
    description: 'Database Connection String with embedded credentials',
    severity: 'high',
    pattern:
      /\b(mongodb(\+srv)?|postgres(?:ql)?|mysql|redis|amqp|sqlserver):\/\/([^:\s/@]+):([^@\s/]+)@/gi,
  },
  {
    id: 'password-assign',
    description: 'Hardcoded Password Assignment',
    severity: 'medium',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"\s]{8,64})['"]/gi,
    minEntropy: 2.5,
  },
  {
    id: 'slack-webhook',
    description: 'Slack Incoming Webhook URL',
    severity: 'high',
    provider: 'slack',
    pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/g,
  },
  {
    id: 'npm-token',
    description: 'npm Auth Token',
    severity: 'high',
    provider: 'npm',
    pattern: /\b(npm_[A-Za-z0-9]{36})\b/g,
  },
  {
    id: 'twilio-key',
    description: 'Twilio API Key / Secret',
    severity: 'high',
    provider: 'twilio',
    pattern: /\b(SK[0-9a-fA-F]{32})\b/g,
  },
  {
    id: 'sendgrid-key',
    description: 'SendGrid API Key',
    severity: 'high',
    provider: 'sendgrid',
    pattern: /\b(SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})\b/g,
  },
];

function lineColumnForIndex(text: string, idx: number): { line: number; column: number } {
  let line = 1;
  let col = 0;
  for (let i = 0; i < idx && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      col = 0;
    } else {
      col++;
    }
  }
  return { line, column: col };
}

function isSuppressed(lineText: string, extra: string[]): boolean {
  for (const s of DEFAULT_SUPPRESSORS) if (s.test(lineText)) return true;
  for (const e of extra) {
    if (
      e &&
      (timingSafeStrEq(lineText.toLowerCase(), e.toLowerCase()) ||
        lineText.toLowerCase().includes(e.toLowerCase()))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Scan a block of text for secrets.
 * Pure: never throws on input; returns an empty array for empty/invalid input.
 */
export function scanSecrets(text: string, opts: SecretScanOptions = {}): SecretMatch[] {
  if (!text || typeof text !== 'string') return [];
  const forwardAbove = opts.forwardAbove ?? 'high';
  const maxMatches = opts.maxMatches ?? 500;
  const allowList = opts.allowList ?? [];
  const matches: SecretMatch[] = [];

  for (const det of DETECTORS) {
    if (matches.length >= maxMatches) break;
    const re = new RegExp(
      det.pattern.source,
      det.pattern.flags.includes('g') ? det.pattern.flags : det.pattern.flags + 'g'
    );
    let m: RegExpExecArray | null;
    // Guard against zero-length matches causing infinite loops.
    while ((m = re.exec(text)) !== null) {
      if (m.index === re.lastIndex) re.lastIndex++;
      const captured = m[1] ?? m[0];
      const { line, column } = lineColumnForIndex(text, m.index);
      const lineText = text.split('\n')[line - 1] ?? '';
      if (isSuppressed(lineText, allowList)) continue;
      if (det.suppressors && det.suppressors.some((s) => s.test(lineText))) continue;

      const entropy = shannonEntropy(captured);
      if (!opts.skipEntropy && det.minEntropy !== undefined && entropy < det.minEntropy) continue;

      matches.push({
        ruleId: det.id,
        description: det.description,
        line,
        column,
        masked: maskSecret(captured),
        length: captured.length,
        severity: det.severity,
        entropy,
        provider: det.provider,
      });
      if (matches.length >= maxMatches) break;
    }
  }

  // Forward high/critical findings to the SIEM (fire-and-forget, never blocks).
  const threshold = SEVERITY_RANK[forwardAbove];
  const toForward = matches.filter((x) => SEVERITY_RANK[x.severity] >= threshold);
  if (toForward.length > 0) {
    void forward({
      ts: Date.now(),
      kind: 'secret.detected',
      severity: toForward.some((x) => x.severity === 'critical') ? 'critical' : 'error',
      attrs: {
        count: toForward.length,
        byRule: toForward.reduce<Record<string, number>>((acc, x) => {
          acc[x.ruleId] = (acc[x.ruleId] ?? 0) + 1;
          return acc;
        }, {}),
        sample: toForward
          .slice(0, 5)
          .map((x) => ({ ruleId: x.ruleId, masked: x.masked, line: x.line })),
      },
    }).catch((e) => log.warn('secrets-scanner siem forward failed', { error: String(e) }));
  }

  return matches;
}

/** Convenience: does the text contain any secret at or above the given severity? */
export function containsSecret(text: string, min: SecretSeverity = 'high'): boolean {
  const rank = SEVERITY_RANK[min];
  return scanSecrets(text, { skipEntropy: true, maxMatches: 1 }).some(
    (m) => SEVERITY_RANK[m.severity] >= rank
  );
}

/** Redact all detected secrets in-place, replacing with a masked placeholder. */
export function redactSecrets(text: string, opts: SecretScanOptions = {}): string {
  const matches = scanSecrets(text, { ...opts, maxMatches: 10000 });
  if (matches.length === 0) return text;
  // Re-scan with original detectors to get raw spans; cheaper: rebuild from matches is lossy,
  // so instead re-run detectors to collect replace spans.
  let out = text;
  for (const det of DETECTORS) {
    const re = new RegExp(
      det.pattern.source,
      det.pattern.flags.includes('g') ? det.pattern.flags : det.pattern.flags + 'g'
    );
    out = out.replace(re, (full, cap) => {
      const secret = cap ?? full;
      return full.replace(secret, maskSecret(secret));
    });
  }
  return out;
}

/* ---------------------------------------------------------------------- */
/* Contract API (consumed by phase14-security.test.ts).                    */
/* These aliases keep backward compatibility while reusing the full engine.*/
/* ---------------------------------------------------------------------- */

/** Scan text and return an array of detected secret matches (entropy gate off
 *  so pattern matches are never missed by low-entropy test fixtures). */
export function scanContent(text: string): SecretMatch[] {
  return scanSecrets(text, { skipEntropy: true });
}

/** True if the text contains any detectable secret. */
export function hasSecret(text: string): boolean {
  return scanContent(text).length > 0;
}
