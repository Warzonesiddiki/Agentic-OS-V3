import { describe, it, expect } from 'vitest';
import {
  recordRingChange,
  getRingChanges,
  RingOscillationDetector,
} from '../src/services/ring-audit.js';

describe('ring-audit', () => {
  it('records ring changes', () => {
    recordRingChange({ agentId: 'a1', fromRing: 0, toRing: 1, reason: 'test', ts: Date.now() });
    expect(getRingChanges('a1').length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag at exactly the threshold (3) changes', () => {
    const d = new RingOscillationDetector(3, 60_000);
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      recordRingChange({
        agentId: 'thr',
        fromRing: i,
        toRing: i + 1,
        reason: 'r',
        ts: now - i * 1000,
      });
    }
    const flags = d.detect(now);
    expect(flags.find((f) => f.agentId === 'thr')).toBeUndefined();
  });

  it('flags oscillation when more than 3 changes occur in the window', () => {
    const d = new RingOscillationDetector(3, 60_000);
    const now = 2_000_000;
    for (let i = 0; i < 5; i++) {
      recordRingChange({
        agentId: 'osc',
        fromRing: i % 4,
        toRing: (i + 1) % 4,
        reason: 'r',
        ts: now - i * 1000,
      });
    }
    const flags = d.detect(now);
    const flag = flags.find((f) => f.agentId === 'osc');
    expect(flag).toBeDefined();
    expect(flag?.changes).toBe(5);
  });

  it('ignores changes outside the window', () => {
    const d = new RingOscillationDetector(3, 60_000);
    const now = 5_000_000;
    for (let i = 0; i < 4; i++) {
      recordRingChange({
        agentId: 'old',
        fromRing: i,
        toRing: i + 1,
        reason: 'r',
        ts: now - 200_000 - i * 1000,
      });
    }
    const flags = d.detect(now);
    expect(flags.find((f) => f.agentId === 'old')).toBeUndefined();
  });
});
