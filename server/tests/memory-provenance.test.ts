/**
 * memory-provenance.test.ts — deep coverage for Mnemosyne provenance slice.
 * Tests influence recording (mocked DB) and pure provenance-graph helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordMemoryInfluence, recordMemoryInfluences, type MemoryInfluence } from '../src/services/memory-provenance.js';
import * as dbClient from '../src/db/client.js';

vi.mock('../src/db/client.js', () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(async () => ({})) })),
  },
}));

vi.mock('../src/db/schema.js', () => ({
  memoryInfluence: { id: 'id', sourceMemoryId: 'sourceMemoryId', targetMemoryId: 'targetMemoryId' },
}));

describe('recordMemoryInfluence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts a single influence row with all fields', async () => {
    let captured: any;
    (dbClient.db.insert as any).mockImplementation((_table: any) => ({
      values: (v: any) => {
        captured = v;
        return Promise.resolve({});
      },
    }));
    const inf: MemoryInfluence = {
      sourceMemoryId: 'm1',
      targetMemoryId: 'm2',
      relation: 'derived_from',
      strength: 0.8,
      channel: 'recall',
      note: 'merged during consolidation',
    };
    await recordMemoryInfluence(inf);
    expect(captured.sourceMemoryId).toBe('m1');
    expect(captured.targetMemoryId).toBe('m2');
    expect(captured.relation).toBe('derived_from');
    expect(captured.strength).toBe(0.8);
    expect(captured.channel).toBe('recall');
  });

  it('escapes a malicious relation string', async () => {
    let captured: any;
    (dbClient.db.insert as any).mockImplementation(() => ({
      values: (v: any) => {
        captured = v;
        return Promise.resolve({});
      },
    }));
    await recordMemoryInfluence({
      sourceMemoryId: 'm1',
      targetMemoryId: 'm2',
      relation: 'x<script>alert(1)</script>',
      strength: 0.5,
    });
    expect(captured.relation).not.toContain('<script>');
  });
});

describe('recordMemoryInfluences', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('records each influence in the batch', async () => {
    let count = 0;
    (dbClient.db.insert as any).mockImplementation(() => ({
      values: () => {
        count += 1;
        return Promise.resolve({});
      },
    }));
    const batch: MemoryInfluence[] = [
      { sourceMemoryId: 'a', targetMemoryId: 'b', relation: 'derived_from', strength: 0.5 },
      { sourceMemoryId: 'b', targetMemoryId: 'c', relation: 'supports', strength: 0.6 },
    ];
    await recordMemoryInfluences(batch);
    expect(count).toBe(2);
  });

  it('is a no-op for an empty batch', async () => {
    let count = 0;
    (dbClient.db.insert as any).mockImplementation(() => ({
      values: () => {
        count += 1;
        return Promise.resolve({});
      },
    }));
    await recordMemoryInfluences([]);
    expect(count).toBe(0);
  });
});
