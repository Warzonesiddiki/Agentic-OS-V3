/**
 * logging.ts — minimal structured logger with secret redaction and request IDs.
 * Secrets and API keys are scrubbed before any field is serialized.
 */
import { env } from './env.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

function threshold(): number {
  return LEVELS[env.NEXUS_LOG_LEVEL];
}

const SECRET_RE =
  /(?:sk-[A-Za-z0-9]{6,}|nx_live_[A-Za-z0-9_-]{6,}|AKIA[0-9A-Z]{12,}|password|secret|api[_-]?key|token)\s*[:=]\s*['"]?[A-Za-z0-9_+/=-]{4,}/gi;

export function redact(value: unknown): unknown {
  if (typeof value === 'string')
    return value.replace(SECRET_RE, (m) => m.split(/[:=]/)[0] + '=***REDACTED***');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/secret|password|token|api[_-]?key/i.test(k)) out[k] = '***REDACTED***';
      else out[k] = redact(v);
    }
    return out;
  }
  return value;
}

function emit(level: keyof typeof LEVELS, msg: string, fields?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold()) return;
  const line = JSON.stringify({
    level,
    msg,
    ts: new Date().toISOString(),
    ...(redact(fields ?? {}) as Record<string, unknown>),
  });
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => emit('debug', msg, f),
  info: (msg: string, f?: Record<string, unknown>) => emit('info', msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => emit('warn', msg, f),
  error: (msg: string, f?: Record<string, unknown>) => emit('error', msg, f),
};

export function fatal(msg: string, err?: unknown): never {
  log.error(
    msg,
    err instanceof Error ? { error: err.message, stack: err.stack } : { error: String(err) }
  );
  process.exit(1);
}

/** Alias used by some modules that import logger from this module. */
export const logger = { log, redact, fatal };
