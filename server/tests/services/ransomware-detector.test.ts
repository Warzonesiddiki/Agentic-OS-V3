/** Unit tests for server/src/services/ransomware-detector.ts (Aegis namespace). */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/siem-forwarder.js', () => ({
  forward: vi.fn(async () => undefined),
  siemConfigured: vi.fn(() => true),
  configureSiem: vi.fn(),
  flushSiem: vi.fn(async () => undefined),
}));
vi.mock('../../src/lib/logging.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { scoreEvents, RansomwareDetector } from '../../src/services/ransomware-detector.js';
import type { FsEvent } from '../../src/services/ransomware-detector.js';

const NOW = 1_700_000_000_000;

function ev(p: Partial<FsEvent> & { op: FsEvent['op']; path: string }): FsEvent {
  return { ts: NOW, agentId: 'a1', entropy: 0.5, ...p };
}

// Permissive config so each signal can be exercised in isolation.
const permissiveCfg = {
  windowMs: 30_000,
  burstWrites: 5,
  burstRenames: 5,
  highEntropy: 0.8,
  encryptedWriteThreshold: 5,
  canaryPaths: ['/canary'] as string[],
};

describe('scoreEvents', () => {
  it('returns none with score 0 for calm reads', () => {
    const events = [ev({ op: 'read' as FsEvent['op'], path: '/data/x' })];
    const a = scoreEvents(events, permissiveCfg, NOW);
    expect(a.level).toBe('none');
    expect(a.score).toBe(0);
  });

  it('flags write-burst but stays below suspicious (35 < 40)', () => {
    const events: FsEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(ev({ op: 'write', path: `/d/${i}` }));
    const a = scoreEvents(events, { ...permissiveCfg, canaryPaths: [] }, NOW);
    expect(a.level).toBe('none');
    expect(a.score).toBe(35);
    expect(a.reasons.some((r) => r.startsWith('write-burst'))).toBe(true);
  });

  it('a canary write is suspicious via canary-tamper (+50)', () => {
    const events = [ev({ op: 'write', path: '/canary' })];
    const a = scoreEvents(events, permissiveCfg, NOW);
    expect(a.level).toBe('suspicious');
    expect(a.score).toBe(50);
    expect(a.reasons.some((r) => r.startsWith('canary-tamper'))).toBe(true);
  });

  it('flags high-entropy write burst as suspicious (35 write + 35 entropy = 70)', () => {
    const events: FsEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(ev({ op: 'write', path: `/d/${i}`, entropy: 0.98 }));
    const a = scoreEvents(events, { ...permissiveCfg, canaryPaths: [] }, NOW);
    expect(a.level).toBe('suspicious');
    expect(a.score).toBe(70);
    expect(a.reasons.some((r) => r.startsWith('high-entropy-writes'))).toBe(true);
  });

  it('flags rename-burst (non-ransom) below suspicious (25 < 40)', () => {
    const events: FsEvent[] = [];
    for (let i = 0; i < 5; i++) events.push(ev({ op: 'rename', path: `/d/${i}.moved` }));
    const a = scoreEvents(events, { ...permissiveCfg, canaryPaths: [] }, NOW);
    expect(a.level).toBe('none');
    expect(a.score).toBe(25);
    expect(a.reasons.some((r) => r.startsWith('rename-burst'))).toBe(true);
  });

  it('flags ransom-extension renames as suspicious (25 burst + 40 flat)', () => {
    const events: FsEvent[] = [];
    // 5 renames to a ransom extension → rename-burst(+25) + flat ransom-extension(+40) = 65.
    for (let i = 0; i < 5; i++) events.push(ev({ op: 'rename', path: `/d/${i}.crypt` }));
    const a = scoreEvents(events, { ...permissiveCfg, canaryPaths: [] }, NOW);
    expect(a.level).toBe('suspicious');
    expect(a.score).toBe(65);
    expect(a.reasons.some((r) => r.startsWith('ransom-extension'))).toBe(true);
    expect(a.reasons.some((r) => r.startsWith('rename-burst'))).toBe(true);
  });

  it('reaches critical when burst + ransom-ext + canary combine (25 + 40 + 50 = 115 → 100)', () => {
    const events: FsEvent[] = [];
    for (let i = 0; i < 6; i++) events.push(ev({ op: 'rename', path: `/d/${i}.crypt` }));
    events.push(ev({ op: 'write', path: '/canary' }));
    const a = scoreEvents(events, permissiveCfg, NOW);
    expect(a.level).toBe('critical');
    expect(a.score).toBe(100);
  });

  it('reaches critical when write-burst + canary tamper combine (+85)', () => {
    const events: FsEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(ev({ op: 'write', path: `/d/${i}` }));
    events.push(ev({ op: 'write', path: '/canary' }));
    const a = scoreEvents(events, permissiveCfg, NOW);
    expect(a.level).toBe('critical');
    expect(a.score).toBe(85);
  });

  it('caps score at 100', () => {
    const events: FsEvent[] = [];
    for (let i = 0; i < 12; i++) events.push(ev({ op: 'write', path: `/d/${i}` }));
    for (let i = 0; i < 6; i++) events.push(ev({ op: 'rename', path: `/d/${i}.crypt` }));
    events.push(ev({ op: 'write', path: '/canary' }));
    const a = scoreEvents(events, permissiveCfg, NOW);
    expect(a.score).toBe(100);
    expect(a.level).toBe('critical');
  });

  it('ignores events outside the window', () => {
    const stale = ev({ op: 'write', path: '/d/old', ts: NOW - 60_000 });
    const fresh = ev({ op: 'write', path: '/canary' });
    const a = scoreEvents([stale, fresh], { ...permissiveCfg, burstWrites: 5 }, NOW);
    // Only the canary fresh event counts → 50, not a write-burst.
    expect(a.score).toBe(50);
  });
});

describe('RansomwareDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('setConfig/getConfig round-trips a patch', () => {
    const d = new RansomwareDetector(permissiveCfg);
    d.setConfig({ burstWrites: 99 });
    expect(d.getConfig().burstWrites).toBe(99);
  });

  it('ingest forwards a SIEM event on critical and invokes the containment hook', async () => {
    const { forward } = await import('../../src/services/siem-forwarder.js');
    const hook = vi.fn(async () => undefined);
    const d = new RansomwareDetector(permissiveCfg, hook);
    const events: FsEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(ev({ op: 'write', path: `/d/${i}` }));
    events.push(ev({ op: 'write', path: '/canary' }));
    let last: any;
    for (const e of events) last = await d.ingest(e);
    expect(last.level).toBe('critical');
    expect(forward).toHaveBeenCalled();
    expect(hook).toHaveBeenCalled();
  });

  it('setContainmentHook replaces the hook', async () => {
    const hook = vi.fn(async () => undefined);
    const d = new RansomwareDetector(permissiveCfg);
    d.setContainmentHook(hook);
    for (let i = 0; i < 10; i++) await d.ingest(ev({ op: 'write', path: `/d/${i}` }));
    await d.ingest(ev({ op: 'write', path: '/canary' }));
    expect(hook).toHaveBeenCalled();
  });
});
