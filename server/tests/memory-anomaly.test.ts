/**
 * Tests for server/src/services/memory-anomaly.ts
 *
 * Per-agent rolling-window anomaly detection. Pure module — no DB required.
 */
import { describe, it, expect } from 'vitest';
import { detectMemoryAnomalies, type AnomalyMemory } from '../src/services/memory-anomaly.js';

const DAY_MS = 86_400_000;

function mem(overrides: Partial<AnomalyMemory>): AnomalyMemory {
  return {
    id: 'm1',
    agentId: 'agent-1',
    importance: 0.9,
    lastAccessedAt: new Date(Date.now() - 10 * DAY_MS),
    createdAt: new Date(Date.now() - 1 * DAY_MS),
    ...overrides,
  };
}

describe('detectMemoryAnomalies', () => {
  it('flags a high-importance memory not accessed within the stale threshold', () => {
    const now = new Date();
    const memories = [
      mem({
        id: 'stale',
        importance: 0.9,
        lastAccessedAt: new Date(now.getTime() - 5 * DAY_MS), // 120h > 48h stale
        createdAt: new Date(now.getTime() - 1 * DAY_MS),
      }),
    ];
    const anomalies = detectMemoryAnomalies(memories, { now });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].memoryId).toBe('stale');
    expect(anomalies[0].reason).toMatch(/not accessed within stale threshold/);
  });

  it('ignores low-importance memories even if stale', () => {
    const now = new Date();
    const memories = [
      mem({
        id: 'lowimp',
        importance: 0.3,
        lastAccessedAt: new Date(now.getTime() - 10 * DAY_MS),
        createdAt: new Date(now.getTime() - 1 * DAY_MS),
      }),
    ];
    expect(detectMemoryAnomalies(memories, { now })).toHaveLength(0);
  });

  it('ignores high-importance memories accessed recently', () => {
    const now = new Date();
    const memories = [
      mem({
        id: 'fresh',
        importance: 0.95,
        lastAccessedAt: new Date(now.getTime() - 1 * 3600_000), // 1h ago
        createdAt: new Date(now.getTime() - 1 * DAY_MS),
      }),
    ];
    expect(detectMemoryAnomalies(memories, { now })).toHaveLength(0);
  });

  it('flags memories never accessed (lastAccessedAt null)', () => {
    const now = new Date();
    const memories = [
      mem({
        id: 'never',
        importance: 0.85,
        lastAccessedAt: null,
        createdAt: new Date(now.getTime() - 1 * DAY_MS),
      }),
    ];
    const anomalies = detectMemoryAnomalies(memories, { now });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].reason).toMatch(/never accessed/);
    expect(anomalies[0].hoursSinceLastAccess).toBe(Infinity);
  });

  it('respects the highImportanceThreshold option', () => {
    const now = new Date();
    const memories = [
      mem({
        id: 'mid',
        importance: 0.6,
        lastAccessedAt: new Date(now.getTime() - 10 * DAY_MS),
        createdAt: new Date(now.getTime() - 1 * DAY_MS),
      }),
    ];
    // default threshold 0.7 -> not flagged
    expect(detectMemoryAnomalies(memories, { now })).toHaveLength(0);
    // lowered threshold -> flagged
    const anomalies = detectMemoryAnomalies(memories, { now, highImportanceThreshold: 0.5 });
    expect(anomalies).toHaveLength(1);
  });

  it('respects the staleHours option', () => {
    const now = new Date();
    const memories = [
      mem({
        id: 'midstale',
        importance: 0.9,
        lastAccessedAt: new Date(now.getTime() - 24 * 3600_000), // 24h ago
        createdAt: new Date(now.getTime() - 1 * DAY_MS),
      }),
    ];
    expect(detectMemoryAnomalies(memories, { now, staleHours: 12 })).toHaveLength(1);
    expect(detectMemoryAnomalies(memories, { now, staleHours: 48 })).toHaveLength(0);
  });

  it('ignores memories created outside the rolling window', () => {
    const now = new Date();
    const memories = [
      mem({
        id: 'old',
        importance: 0.95,
        lastAccessedAt: new Date(now.getTime() - 30 * DAY_MS),
        createdAt: new Date(now.getTime() - 30 * DAY_MS), // outside 7d window
      }),
    ];
    expect(detectMemoryAnomalies(memories, { now })).toHaveLength(0);
  });

  it('respects the windowDays option', () => {
    const now = new Date();
    const memories = [
      mem({
        id: 'old2',
        importance: 0.95,
        lastAccessedAt: null,
        createdAt: new Date(now.getTime() - 20 * DAY_MS),
      }),
    ];
    expect(detectMemoryAnomalies(memories, { now, windowDays: 7 })).toHaveLength(0);
    expect(detectMemoryAnomalies(memories, { now, windowDays: 30 })).toHaveLength(1);
  });

  it('sorts anomalies by importance desc then hours desc', () => {
    const now = new Date();
    const memories = [
      mem({ id: 'a', importance: 0.8, lastAccessedAt: null, createdAt: new Date(now.getTime() - 1 * DAY_MS) }),
      mem({ id: 'b', importance: 0.95, lastAccessedAt: null, createdAt: new Date(now.getTime() - 1 * DAY_MS) }),
      mem({ id: 'c', importance: 0.8, lastAccessedAt: new Date(now.getTime() - 5 * DAY_MS), createdAt: new Date(now.getTime() - 1 * DAY_MS) }),
    ];
    const anomalies = detectMemoryAnomalies(memories, { now });
    expect(anomalies.map((a) => a.memoryId)).toEqual(['b', 'a', 'c']);
  });

  it('returns empty for empty input', () => {
    expect(detectMemoryAnomalies([], { now: new Date() })).toEqual([]);
  });
});
