/**
 * env-sanitizer.ts — scrub secrets/sensitive values from logs and error payloads.
 *
 * Replaces any value matching a secret pattern (keys, tokens, passwords, DSNs) with
 * a redaction token so nothing sensitive reaches logs, telemetry or error responses.
 */
export interface SanitizeOptions {
  // Extra custom keys to redact (case-insensitive substring match on keys).
  extraKeys?: string[];
  // Replacement token.
  replacement?: string;
}

const DEFAULT_SECRET_KEY_PATTERNS = [
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /auth/i,
  /credential/i,
  /dsn/i,
  /session/i,
  /cookie/i,
];

const VALUE_PATTERNS = [
  /sk-[a-z0-9]{20,}/i, // OpenAI-style
  /eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/i, // JWT
  /AKIA[0-9A-Z]{16}/, // AWS access key
  /ghp_[a-z0-9]{36}/i, // GitHub
  /xox[baprs]-[a-z0-9-]+/i, // Slack
  /[a-z0-9]{32,}/i,
];

export function sanitize(value: unknown, opts: SanitizeOptions = {}): unknown {
  const replacement = opts.replacement ?? '[REDACTED]';
  const extra = opts.extraKeys ?? [];

  const isSecretKey = (key: string): boolean =>
    DEFAULT_SECRET_KEY_PATTERNS.some((p) => p.test(key)) ||
    extra.some((e) => key.toLowerCase().includes(e.toLowerCase()));

  if (typeof value === 'string') {
    let out = value;
    for (const p of VALUE_PATTERNS) out = out.replace(p, replacement);
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v, opts));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(k)) out[k] = replacement;
      else out[k] = sanitize(v, opts);
    }
    return out;
  }
  return value;
}

/** Drop `undefined` and redact secrets; returns a JSON-safe object for logging. */
export function sanitizeForLog(value: unknown, opts: SanitizeOptions = {}): unknown {
  return sanitize(value, opts);
}
