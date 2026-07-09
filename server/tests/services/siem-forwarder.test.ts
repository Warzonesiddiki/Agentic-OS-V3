/**
 * siem-forwarder.test.ts — unit tests for the SIEM forwarder (Aegis namespace).
 *
 * The forwarder batches events in an in-memory queue and (a) logs them for the
 * `stdout` sink, or (b) validates + emits a debug log for network sinks
 * (splunk/elastic/datadog/webhook). No real HTTP is performed, so we mock
 * `log`/`sanitize` to capture behavior and verify queue/batch/flush logic.
 *
 * NOTE: `flush()` swallows send failures (logs `siem.forward.failed` and
 * returns) so a downed SIEM cannot crash the OS. To exercise the failure path
 * deterministically we use `batchSize: 1` so `forward()` itself triggers the
 * synchronous flush (which then retries and logs the failure). `configureSiem`
 * merges config, so every test explicitly sets `endpoint` to avoid leakage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/logging.js', () => ({
  log: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../src/lib/env-sanitizer.js', () => ({
  sanitize: vi.fn((v: unknown) => v),
}));

import { configureSiem, forward, flush } from '../../src/services/siem-forwarder.js';
import { log } from '../../src/lib/logging.js';
import { sanitize } from '../../src/lib/env-sanitizer.js';

const mockedLog = vi.mocked(log);
const mockedSanitize = vi.mocked(sanitize);

function ev(over: Record<string, unknown> = {}): any {
  return {
    ts: 1_700_000_000_000,
    kind: 'audit.test',
    severity: 'info' as const,
    principalId: 'p1',
    ring: 0,
    attrs: { a: 1 },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default to stdout sink so no endpoint is required (explicitly clear endpoint).
  configureSiem({ sink: 'stdout', batchSize: 3, flushMs: 10, maxRetries: 2, endpoint: undefined });
});

describe('configureSiem', () => {
  it('updates configuration without throwing', () => {
    expect(() => configureSiem({ sink: 'webhook', endpoint: 'https://x', batchSize: 5 })).not.toThrow();
  });
});

describe('forward + stdout sink', () => {
  it('logs each forwarded event via log.info for the stdout sink', async () => {
    await forward(ev({ severity: 'warn', kind: 'auth.failure' }));
    await forward(ev({ kind: 'kill_switch.engaged', severity: 'critical' }));
    await forward(ev());
    const calls = mockedLog.info.mock.calls;
    expect(calls.some((c) => c[0] === 'siem.forward')).toBe(true);
    const forwardCall = calls.find((c) => c[0] === 'siem.forward')!;
    expect((forwardCall[1] as any).kind).toBeDefined();
    expect((forwardCall[1] as any).severity).toBeDefined();
  });

  it('sanitizes the event before logging', async () => {
    await forward(ev());
    await forward(ev());
    await forward(ev());
    expect(mockedSanitize).toHaveBeenCalled();
  });
});

describe('flush (stdout)', () => {
  it('is a no-op on an empty queue', async () => {
    await flush();
    expect(mockedLog.info).not.toHaveBeenCalled();
  });

  it('drops the queue after a flush (events already logged per-event)', async () => {
    configureSiem({ sink: 'stdout', batchSize: 1000, flushMs: 10, maxRetries: 2, endpoint: undefined });
    await forward(ev());
    await forward(ev());
    await flush();
    expect(mockedLog.info).toHaveBeenCalled();
  });
});

describe('network sinks (splunk/elastic/datadog/webhook)', () => {
  it('flushes successfully when an endpoint is present (debug log, no HTTP)', async () => {
    configureSiem({ sink: 'datadog', endpoint: 'https://dd.test', batchSize: 1, flushMs: 10, maxRetries: 2 });
    await forward(ev({ kind: 'x', severity: 'error' }));
    expect(mockedLog.debug).toHaveBeenCalled();
    const debugCall = mockedLog.debug.mock.calls.find((c) => c[0] === 'siem.send');
    expect(debugCall).toBeTruthy();
    expect((debugCall![1] as any).sink).toBe('datadog');
  });

  it('records a failed-forward error when no endpoint configured (flush swallows it)', async () => {
    configureSiem({ sink: 'splunk', batchSize: 1, flushMs: 10, maxRetries: 2, endpoint: undefined });
    await forward(ev()); // batchSize=1 -> forward() triggers the flush inline
    expect(mockedLog.error).toHaveBeenCalledWith('siem.forward.failed', expect.any(Object));
  });

  it('records a failed-forward error for elastic sink without endpoint', async () => {
    configureSiem({ sink: 'elastic', batchSize: 1, flushMs: 10, maxRetries: 2, endpoint: undefined });
    await forward(ev());
    expect(mockedLog.error).toHaveBeenCalledWith('siem.forward.failed', expect.any(Object));
  });

  it('includes the SIEM_NO_ENDPOINT reason in the logged failure', async () => {
    configureSiem({ sink: 'webhook', batchSize: 1, flushMs: 10, maxRetries: 2, endpoint: undefined });
    await forward(ev());
    const err = mockedLog.error.mock.calls.find((c) => c[0] === 'siem.forward.failed');
    expect(err).toBeTruthy();
    expect((err![1] as any).error).toContain('SIEM_NO_ENDPOINT');
  });

  it('resolves cleanly when a valid endpoint is present (no error log)', async () => {
    configureSiem({ sink: 'datadog', endpoint: 'https://dd.test', batchSize: 1000, flushMs: 10, maxRetries: 2 });
    await forward(ev());
    await expect(flush()).resolves.toBeUndefined();
    expect(mockedLog.error).not.toHaveBeenCalled();
  });
});
