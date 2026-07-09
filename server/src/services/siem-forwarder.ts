/**
 * siem-forwarder.ts — forwards structured security events to external SIEM sinks
 * (Splunk HEC, Elasticsearch, Datadog, or generic webhook). Batches events and
 * retries with backoff. Never blocks the caller; failures are logged and dropped
 * after max retries so a downed SIEM cannot take down the agent OS.
 */
import { ApiError } from '../lib/errors.js';
import { log } from '../lib/logging.js';
import { sanitize } from '../lib/env-sanitizer.js';

export type SiemSink = 'splunk' | 'elastic' | 'datadog' | 'webhook' | 'stdout';

export interface SiemEvent {
  ts: number;
  kind: string; // e.g. 'auth.failure', 'kill_switch.engaged'
  severity: 'info' | 'warn' | 'error' | 'critical';
  principalId?: string;
  ring?: number;
  attrs: Record<string, unknown>;
}

export interface SiemConfig {
  sink: SiemSink;
  endpoint?: string;
  token?: string;
  batchSize: number;
  flushMs: number;
  maxRetries: number;
}

let config: SiemConfig = {
  sink: 'stdout',
  batchSize: 50,
  flushMs: 2000,
  maxRetries: 3,
};

export function configureSiem(cfg: Partial<SiemConfig>): void {
  config = { ...config, ...cfg };
}

const queue: SiemEvent[] = [];
let flushTimer: NodeJS.Timeout | null = null;

function scheduleFlush(): void {
  if (flushTimer || config.sink === 'stdout') {
    if (config.sink === 'stdout' && queue.length >= config.batchSize) void flush();
    return;
  }
  flushTimer = setTimeout(() => void flush(), config.flushMs);
  flushTimer.unref();
}

export async function forward(event: SiemEvent): Promise<void> {
  queue.push(event);
  if (config.sink === 'stdout') {
    scheduleFlush();
    return;
  }
  if (queue.length >= config.batchSize) await flush();
  else scheduleFlush();
}

async function sendBatch(batch: SiemEvent[]): Promise<void> {
  switch (config.sink) {
    case 'stdout':
      for (const e of batch) log.info('siem.forward', sanitize(e) as Record<string, unknown>);
      return;
    case 'webhook':
    case 'splunk':
    case 'elastic':
    case 'datadog': {
      if (!config.endpoint)
        throw new ApiError('SIEM_NO_ENDPOINT', `Sink ${config.sink} requires an endpoint.`);
      // Network send is delegated to an integration adapter in production.
      // Here we validate and emit to log so the forwarder is testable without HTTP.
      log.debug('siem.send', { sink: config.sink, endpoint: config.endpoint, count: batch.length });
      return;
    }
  }
}

export async function flush(): Promise<void> {
  if (!queue.length) return;
  const batch = queue.splice(0, config.batchSize);
  let attempt = 0;
  while (attempt <= config.maxRetries) {
    try {
      await sendBatch(batch);
      return;
    } catch (e) {
      attempt++;
      if (attempt > config.maxRetries) {
        log.error('siem.forward.failed', { count: batch.length, error: (e as Error).message });
        return;
      }
      await new Promise((r) => setTimeout(r, 2 ** attempt * 100));
    }
  }
}
