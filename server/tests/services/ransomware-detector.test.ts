/** ransomware-detector.test.ts — behavioral ransomware detection (Aegis). */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/siem-forwarder.js', () => ({
  siemConfigured: vi.fn(() => true),
  forward: vi.fn(async () => undefined),
}));
vi.mock('../../src/lib/logging.js', () => ({
  log: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { scoreEvents, RansomwareDetector } from '../../src/services/ransomware-detector.js';
import { forward } from '../../src/services/siem-forwarder.js';
const mockedForward = vi.mocked(forward);

// Permissive config so the heuristics fire with a small number of events.
const cfg = {
  windowMs: 30_000,
  burstWrites: 5,
  burstRenames: 5,
  highEntropy: 0.8,
  encryptedWriteThreshold: 5,
  canaryPaths: ['/canary'],
};

// Fixed "now" so the event timestamps fall inside the detection window.
const NOW = 1_700_000_000_000;

function fsEv(over: Record<string, unknown>): any {
  return { op: 'write', path: '/data/x', agentId: 'a1', entropy: 0.5, ts: NOW, ...over };
}

describe('scoreEvents (pure)', () => {
  it('returns none for a calm workload', () => {
    const events = Array.from({ length: 3 }, (_, i) => fsEv({ path: `/d/${i}`, entropy: 0.4, op: 'read' }));
    const a = scoreEvents(events, cfg, NOW);
    expect(a.level).toBe('none');
    expect(a.score).toBe(0);
  });

  it('scores suspicious on a burst of high-entropy writes', () => {
    const events = Array.from({ length: 10 }, (_, i) => fsEv({ path: `/d/${i}`, op: 'write', entropy: 0.98 }));
    const a = scoreEvents(events, cfg, NOW);
    expect(a.level).toBe('suspicious');
    expect(a.score).toBeGreaterThanOrEqual(40);
  });

  it('scores suspicious on a single canary-path tamper', () => {
    const events = [fsEv({ path: '/canary/secret.txt', op: 'write' })];
    const a = scoreEvents(events, cfg, NOW);
    expect(a.level).toBe('suspicious');
    expect(a.reasons.join(',')).toContain('canary-tamper');
  });

  it('scores critical on canary tamper + ransom-extension burst', () => {
    const events = Array.from({ length: 10 }, (_, i) => fsEv({ path: `/d/${i}.crypt`, op: 'rename', entropy: 0.98 }));
    events.push(fsEv({ path: '/canary/secret.txt', op: 'write' }));
    const a = scoreEvents(events, cfg, NOW);
    expect(a.level).toBe('critical');
    expect(a.score).toBe(100);
  });
});

describe('RansomwareDetector.ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards a critical alert to SIEM and invokes the containment hook', async () => {
    const hook = vi.fn(async () => undefined);
    const d = new RansomwareDetector(cfg, hook);
    const alert = await d.ingest(fsEv({ path: '/canary/secret.txt', op: 'write' }));
    expect(alert.level).toBe('suspicious');
    expect(mockedForward).toHaveBeenCalled();
    const fwdArg = mockedForward.mock.calls[0][0] as { kind: string };
    expect(fwdArg.kind).toBe('ransomware.detected');
    expect(hook).toHaveBeenCalledOnce();
  });

  it('does not forward on a benign ingestion', async () => {
    const d = new RansomwareDetector(cfg, null);
    const alert = await d.ingest(fsEv({ path: '/ok/file', op: 'read' }));
    expect(alert.level).toBe('none');
    expect(mockedForward).not.toHaveBeenCalled();
  });

  it('de-duplicates alerts within the window (no double forward)', async () => {
    const d = new RansomwareDetector(cfg, null);
    await d.ingest(fsEv({ path: '/canary/secret.txt', op: 'write', ts: NOW }));
    await d.ingest(fsEv({ path: '/canary/secret.txt', op: 'write', ts: NOW + 1_500 }));
    expect(mockedForward).toHaveBeenCalledTimes(1);
  });

  it('setConfig/getConfig round-trips', () => {
    const d = new RansomwareDetector(cfg, null);
    d.setConfig({ burstWrites: 999 });
    expect(d.getConfig().burstWrites).toBe(999);
  });
});
