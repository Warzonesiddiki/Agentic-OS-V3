/**
 * memory-provenance.test.ts — deep coverage for Mnemosyne provenance slice.
 * Tests influence recording (mocked DB) with the real InfluenceInput shape.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  recordMemoryInfluence,
  recordMemoryInfluences,
  type InfluenceInput,
  type StoredInfluence,
} from '../src/services/memory-provenance.js';
import * as dbClient from '../src/db/client.js';

// eslint-disable-next-line no-var
var provCaptured: any = { values: undefined, calls: 0 };

vi.mock('../src/db/client.js', () => ({
  db: {
    insert: vi.fn(() => ({
      values: (v: any) => {
        provCaptured.values = v;
        provCaptured.calls += 1;
        return Promise.resolve({});
      },
    })),
  },
}));

vi.mock('../src/db/schema.js', () => ({
  memoryInfluence: { id: 'id', memoryId: 'memoryId', contextKey: 'contextKey' },
}));

describe('recordMemoryInfluence', () => {
  it('inserts a single influence row with all fields', async () => {
    provCaptured.values = undefined;
    provCaptured.calls = 0;
    const input: InfluenceInput = {
      memoryId: 'm1',
      contextKey: 'recall:alpha',
      reason: 'recall',
      tokens: 42,
      position: 3,
    };
    const out: StoredInfluence = await recordMemoryInfluence(input);
    expect(provCaptured.calls).toBe(1);
    expect(provCaptured.values.memoryId).toBe('m1');
    expect(provCaptured.values.contextKey).toBe('recall:alpha');
    expect(provCaptured.values.reason).toBe('recall');
    expect(provCaptured.values.tokens).toBe(42);
    expect(provCaptured.values.position).toBe(3);
    expect(provCaptured.values.id).toMatch(/^inf_/);
    // returns a stored record with generated id + createdAt
    expect(out.id).toMatch(/^inf_/);
    expect(out.createdAt).toBeTruthy();
  });

  it('escapes a malicious contextKey string', async () => {
    provCaptured.values = undefined;
    provCaptured.calls = 0;
    await recordMemoryInfluence({
      memoryId: 'm1',
      contextKey: 'x<script>alert(1)</script>',
      reason: 'provenance',
      tokens: 1,
      position: 0,
    });
    expect(provCaptured.values.contextKey).not.toContain('<script>');
  });
});

describe('recordMemoryInfluences', () => {
  it('records each influence in the batch', async () => {
    provCaptured.calls = 0;
    const batch: InfluenceInput[] = [
      { memoryId: 'a', contextKey: 'k1', reason: 'recall', tokens: 1, position: 0 },
      { memoryId: 'b', contextKey: 'k2', reason: 'priming', tokens: 2, position: 1 },
    ];
    const out = await recordMemoryInfluences(batch);
    expect(provCaptured.calls).toBe(2);
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toMatch(/^inf_/);
  });

  it('is a no-op for an empty batch', async () => {
    provCaptured.calls = 0;
    const out = await recordMemoryInfluences([]);
    expect(provCaptured.calls).toBe(0);
    expect(out).toHaveLength(0);
  });
});
