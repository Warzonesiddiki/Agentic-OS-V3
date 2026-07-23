/**
 * federated-node-discovery.test.ts — Tests for federated node discovery.
 * Phase 2, Task P2-04.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PeerRegistry,
  mergeWithRRF,
  type PeerNode,
  type PeerQueryResult,
  type FederatedMemoryHit,
} from '../src/services/federated-node-discovery.js';

function makePeer(overrides: Partial<PeerNode> = {}): PeerNode {
  return {
    id: `peer-${Math.random().toString(36).slice(2, 8)}`,
    endpoint: 'https://example.com',
    publicKey: 'pubkey-123',
    capabilities: ['memory.query'],
    status: 'healthy',
    lastHeartbeat: Date.now(),
    consecutiveMissed: 0,
    latencyMs: 50,
    registeredAt: Date.now(),
    metadata: {},
    ...overrides,
  };
}

function makeHit(overrides: Partial<FederatedMemoryHit> = {}): FederatedMemoryHit {
  return {
    id: `mem-${Math.random().toString(36).slice(2, 8)}`,
    originPeerId: 'peer-1',
    contentSha256: `sha256-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test memory',
    content: 'Test content',
    tags: ['test'],
    importance: 0.8,
    similarity: 0.9,
    bm25Score: 1.0,
    rrfScore: 0,
    ...overrides,
  };
}

describe('PeerRegistry', () => {
  let registry: PeerRegistry;

  beforeEach(() => {
    registry = new PeerRegistry({ nodeId: 'test-node' });
  });

  describe('registerPeer', () => {
    it('registers a new peer', () => {
      const peer = makePeer({ id: 'peer-1' });
      registry.registerPeer(peer);
      expect(registry.peerCount).toBe(1);
    });

    it('updates existing peer without resetting registeredAt', () => {
      const peer = makePeer({ id: 'peer-1' });
      registry.registerPeer(peer);
      const firstRegisteredAt = registry.getAllPeers()[0]!.registeredAt;

      // Small delay to ensure timestamp would differ
      const updated = makePeer({ id: 'peer-1', endpoint: 'https://updated.com' });
      registry.registerPeer(updated);

      expect(registry.peerCount).toBe(1);
      expect(registry.getAllPeers()[0]!.registeredAt).toBe(firstRegisteredAt);
      expect(registry.getAllPeers()[0]!.endpoint).toBe('https://updated.com');
    });
  });

  describe('removePeer', () => {
    it('removes a registered peer', () => {
      registry.registerPeer(makePeer({ id: 'peer-1' }));
      expect(registry.removePeer('peer-1')).toBe(true);
      expect(registry.peerCount).toBe(0);
    });

    it('returns false for unknown peer', () => {
      expect(registry.removePeer('nonexistent')).toBe(false);
    });
  });

  describe('getHealthyPeers', () => {
    it('returns only healthy peers', () => {
      registry.registerPeer(makePeer({ id: 'p1', status: 'healthy' }));
      registry.registerPeer(makePeer({ id: 'p2', status: 'degraded' }));
      registry.registerPeer(makePeer({ id: 'p3', status: 'offline' }));

      // Force the statuses (registerPeer resets to healthy)
      const allPeers = registry.getAllPeers();
      for (const p of allPeers) {
        if (p.id === 'p2') p.status = 'degraded';
        if (p.id === 'p3') p.status = 'offline';
      }

      const healthy = registry.getHealthyPeers();
      expect(healthy).toHaveLength(1);
      expect(healthy[0]!.id).toBe('p1');
    });

    it('sorts by latency ascending', () => {
      registry.registerPeer(makePeer({ id: 'p1', latencyMs: 200 }));
      registry.registerPeer(makePeer({ id: 'p2', latencyMs: 50 }));
      registry.registerPeer(makePeer({ id: 'p3', latencyMs: 100 }));

      const healthy = registry.getHealthyPeers();
      expect(healthy[0]!.latencyMs).toBe(50);
      expect(healthy[1]!.latencyMs).toBe(100);
      expect(healthy[2]!.latencyMs).toBe(200);
    });

    it('respects maxFanOutPeers', () => {
      const config = { maxFanOutPeers: 2 };
      const reg = new PeerRegistry({ ...config, nodeId: 'test' });
      for (let i = 0; i < 5; i++) {
        reg.registerPeer(makePeer({ id: `p${i}` }));
      }
      expect(reg.getHealthyPeers()).toHaveLength(2);
    });
  });

  describe('recordHeartbeat', () => {
    it('resets consecutive missed on heartbeat', () => {
      const peer = makePeer({ id: 'p1' });
      registry.registerPeer(peer);
      // Simulate missed heartbeats
      const allPeers = registry.getAllPeers();
      allPeers[0]!.consecutiveMissed = 2;
      allPeers[0]!.lastHeartbeat = Date.now() - 100000;

      registry.recordHeartbeat('p1', 50);
      expect(allPeers[0]!.consecutiveMissed).toBe(0);
    });

    it('marks peer degraded if latency > 1000ms', () => {
      registry.registerPeer(makePeer({ id: 'p1' }));
      registry.recordHeartbeat('p1', 1500);
      const peer = registry.getAllPeers().find((p) => p.id === 'p1')!;
      expect(peer.status).toBe('degraded');
    });
  });

  describe('checkHeartbeats', () => {
    it('marks peer offline after maxConsecutiveMissed', () => {
      const registry2 = new PeerRegistry({
        nodeId: 'test',
        heartbeatTimeoutMs: 1,
        maxConsecutiveMissed: 2,
      });
      registry2.registerPeer(makePeer({ id: 'p1' }));
      // Set lastHeartbeat to past
      registry2.getAllPeers()[0]!.lastHeartbeat = Date.now() - 1000;

      registry2.checkHeartbeats(); // miss 1
      registry2.checkHeartbeats(); // miss 2 → offline

      const peer = registry2.getAllPeers().find((p) => p.id === 'p1')!;
      expect(peer.status).toBe('offline');
    });
  });

  describe('getPeersByCapability', () => {
    it('filters peers by capability', () => {
      registry.registerPeer(makePeer({ id: 'p1', capabilities: ['memory.query', 'skill.invoke'] }));
      registry.registerPeer(makePeer({ id: 'p2', capabilities: ['memory.query'] }));
      registry.registerPeer(makePeer({ id: 'p3', capabilities: ['skill.invoke'] }));

      const memoryPeers = registry.getPeersByCapability('memory.query');
      expect(memoryPeers).toHaveLength(2);

      const skillPeers = registry.getPeersByCapability('skill.invoke');
      expect(skillPeers).toHaveLength(2);
    });
  });
});

describe('mergeWithRRF', () => {
  it('merges results from multiple peers using RRF', () => {
    const sharedHit = makeHit({ contentSha256: 'shared-hash', title: 'Shared' });

    const results: PeerQueryResult[] = [
      {
        peerId: 'peer-1',
        memories: [sharedHit, makeHit()],
        latencyMs: 50,
      },
      {
        peerId: 'peer-2',
        memories: [sharedHit, makeHit()],
        latencyMs: 80,
      },
    ];

    const merged = mergeWithRRF(results);
    // The shared hit should have the highest RRF score
    expect(merged.length).toBeGreaterThan(0);
    expect(merged[0]!.contentSha256).toBe('shared-hash');
    expect(merged[0]!.rrfScore).toBeGreaterThan(0);
  });

  it('returns empty for no results', () => {
    const merged = mergeWithRRF([]);
    expect(merged).toHaveLength(0);
  });

  it('handles empty peer results', () => {
    const results: PeerQueryResult[] = [
      { peerId: 'peer-1', memories: [], latencyMs: 50 },
      { peerId: 'peer-2', memories: [], latencyMs: 80 },
    ];
    const merged = mergeWithRRF(results);
    expect(merged).toHaveLength(0);
  });

  it('deduplicates by contentSha256', () => {
    const sameContent = makeHit({ contentSha256: 'same-hash' });
    const results: PeerQueryResult[] = [
      { peerId: 'peer-1', memories: [sameContent], latencyMs: 50 },
      { peerId: 'peer-2', memories: [sameContent], latencyMs: 80 },
    ];
    const merged = mergeWithRRF(results);
    expect(merged).toHaveLength(1);
    // RRF score should be sum of both contributions
    const K = 60;
    const expectedScore = 1 / (K + 1) + 1 / (K + 1);
    expect(merged[0]!.rrfScore).toBeCloseTo(expectedScore, 5);
  });

  it('sorts by RRF score descending', () => {
    const hit1 = makeHit({ contentSha256: 'hash-1' });
    const hit2 = makeHit({ contentSha256: 'hash-2' });
    const hit3 = makeHit({ contentSha256: 'hash-3' });

    const results: PeerQueryResult[] = [
      {
        peerId: 'peer-1',
        memories: [hit1, hit2], // hit1 is rank 0, hit2 is rank 1
        latencyMs: 50,
      },
      {
        peerId: 'peer-2',
        memories: [hit3, hit1], // hit3 is rank 0, hit1 is rank 1
        latencyMs: 80,
      },
    ];

    const merged = mergeWithRRF(results);
    // hit1 appears in both (ranks 0+1), should have highest RRF
    expect(merged[0]!.contentSha256).toBe('hash-1');
    // hit2 and hit3 each appear once at different ranks
    expect(merged.length).toBe(3);
  });
});
