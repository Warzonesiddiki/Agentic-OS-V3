/** evidence-collector.test.ts — forensic evidence bundling (Aegis namespace). */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/services/session-recorder.js', () => ({
  replay: vi.fn(() => [{ ts: 1, action: 'x' }]),
}));
vi.mock('../../src/services/incident-response.js', () => ({
  getIncident: vi.fn(),
}));

import { collect } from '../../src/services/evidence-collector.js';
import { replay } from '../../src/services/session-recorder.js';
import { getIncident } from '../../src/services/incident-response.js';
const mockedReplay = vi.mocked(replay);
const mockedGetIncident = vi.mocked(getIncident);

describe('collect', () => {
  it('throws EVIDENCE_NO_INCIDENT when the incident is missing', async () => {
    mockedGetIncident.mockReturnValue(undefined);
    await expect(collect('nope')).rejects.toThrow(/EVIDENCE_NO_INCIDENT/);
  });

  it('builds a bundle from the incident + a replayed session chain', async () => {
    mockedGetIncident.mockReturnValue({ id: 'inc-1', affectedPrincipal: 'p1' } as never);
    mockedReplay.mockReturnValue([{ ts: 1, action: 'a' }, { ts: 2, action: 'b' }]);
    const bundle = await collect('inc-1');
    expect(bundle.incidentId).toBe('inc-1');
    expect(bundle.items.some((i) => i.name === 'session-chain.json')).toBe(true);
    expect(bundle.manifestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('includes extra evidence items and hashes them', async () => {
    mockedGetIncident.mockReturnValue({ id: 'inc-2' } as never);
    mockedReplay.mockReturnValue([]);
    const bundle = await collect('inc-2', [{ name: 'note.txt', content: Buffer.from('secret') }]);
    const item = bundle.items.find((i) => i.name === 'note.txt')!;
    expect(item.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(item.bytes).toBe(6);
  });

  it('computes a stable manifestHash', async () => {
    mockedGetIncident.mockReturnValue({ id: 'inc-3' } as never);
    mockedReplay.mockReturnValue([]);
    const a = await collect('inc-3', [{ name: 'x', content: Buffer.from('y') }]);
    const b = await collect('inc-3', [{ name: 'x', content: Buffer.from('y') }]);
    expect(a.manifestHash).toBe(b.manifestHash);
  });
});
