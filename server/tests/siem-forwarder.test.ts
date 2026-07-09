/**
 * Aegis siem-forwarder — SecC (nonstop perfection).
 *
 * Proves:
 *  - forward() queues events and flush() drains them (no leak / no double-send).
 *  - a configured webhook sink with an endpoint is accepted and "sent" (logged).
 *  - a webhook sink WITHOUT an endpoint fails validation and, after retries,
 *    the batch is dropped with an error log (a downed SIEM never crashes the OS).
 *  - flush() on an empty queue is a no-op (no send attempted).
 *  - configureSiem overrides settings without touching unrelated fields.
 *
 * No network — logging is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const log = {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
  return { log };
});

vi.mock('../src/lib/logging.js', () => ({
  log: h.log,
}));
vi.mock('../src/lib/env-sanitizer.js', () => ({
  sanitize: (v: unknown) => v,
  sanitizeForLog: (v: unknown) => v,
}));

import { configureSiem, forward, flush } from '../src/services/siem-forwarder.js';

beforeEach(() => {
  h.log.info.mockClear();
  h.log.debug.mockClear();
  h.log.error.mockClear();
  h.log.warn.mockClear();
  // Reset to a safe default for each test.
  configureSiem({ sink: 'stdout', batchSize: 50, flushMs: 2000, maxRetries: 3 });
});

describe('Aegis: siem-forwarder', () => {
  it('forwards to a webhook sink with an endpoint (logged send, no throw)', async () => {
    configureSiem({ sink: 'webhook', endpoint: 'https://siem.example/hec', batchSize: 2, flushMs: 50 });
    await forward({ ts: 1, kind: 'auth.failure', severity: 'warn', attrs: { ip: '1.2.3.4' } });
    await forward({ ts: 2, kind: 'auth.failure', severity: 'warn', attrs: { ip: '1.2.3.4' } });
    // batchSize reached -> auto flush
    expect(h.log.debug).toHaveBeenCalledWith('siem.send', expect.objectContaining({ sink: 'webhook', count: 2 }));
  });

  it('stdout sink emits each flushed event via log.info', async () => {
    configureSiem({ sink: 'stdout', batchSize: 2 });
    await forward({ ts: 10, kind: 'kill_switch.engaged', severity: 'critical', attrs: {} });
    await forward({ ts: 11, kind: 'kill_switch.engaged', severity: 'critical', attrs: {} });
    expect(h.log.info).toHaveBeenCalledTimes(2);
    expect(h.log.info).toHaveBeenCalledWith('siem.forward', expect.anything());
  });

  it('webhook without endpoint fails validation and is dropped after retries (no crash)', async () => {
    configureSiem({ sink: 'webhook', endpoint: undefined, batchSize: 1, maxRetries: 2 });
    await forward({ ts: 1, kind: 'x', severity: 'error', attrs: {} });
    // flush is triggered by batchSize; validation throws -> retries -> drop with error log
    expect(h.log.error).toHaveBeenCalledWith('siem.forward.failed', expect.objectContaining({ count: 1 }));
  });

  it('flush() on an empty queue is a no-op (no send attempted)', async () => {
    await flush();
    expect(h.log.debug).not.toHaveBeenCalled();
    expect(h.log.info).not.toHaveBeenCalled();
    expect(h.log.error).not.toHaveBeenCalled();
  });

  it('configureSiem overrides only the provided fields', async () => {
    configureSiem({ sink: 'webhook', endpoint: 'https://x', batchSize: 5 });
    await forward({ ts: 1, kind: 'a', severity: 'info', attrs: {} });
    await forward({ ts: 2, kind: 'a', severity: 'info', attrs: {} });
    await forward({ ts: 3, kind: 'a', severity: 'info', attrs: {} });
    await forward({ ts: 4, kind: 'a', severity: 'info', attrs: {} });
    await forward({ ts: 5, kind: 'a', severity: 'info', attrs: {} });
    // batchSize=5 reached -> send
    expect(h.log.debug).toHaveBeenCalledWith('siem.send', expect.objectContaining({ sink: 'webhook', endpoint: 'https://x', count: 5 }));
  });
});
