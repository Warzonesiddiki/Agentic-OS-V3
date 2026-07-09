import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { P2P, setP2PBackend } from '../src/services/p2p-swarm.js';

// Mock global fetch so publish() uses a fake transport instead of real HTTP.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  P2P.reset();
  setP2PBackend('memory');
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);
});
afterEach(() => vi.unstubAllGlobals());

describe('p2p-swarm — peer discovery & gossip', () => {
  it('discovers peers from bootstrap hosts and marks them active', () => {
    P2P.peerDiscovery(['127.0.0.1:7100', '127.0.0.1:7101']);
    const peers = P2P.getPeers();
    expect(peers.length).toBe(2);
    for (const p of peers) {
      expect(p.status).toBe('active');
      expect(p.host).toMatch(/127\.0\.0\.1/);
      expect(typeof p.port).toBe('number');
    }
  });

  it('updates lastSeen / reactivates a known peer on re-discovery', () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    const first = P2P.getPeers()[0];
    const before = first.lastSeen;
    // simulate it going stale then being rediscovered
    first.status = 'unreachable';
    P2P.peerDiscovery(['127.0.0.1:7100']);
    const after = P2P.getPeers()[0];
    expect(after.status).toBe('active');
    expect(after.lastSeen).toBeGreaterThanOrEqual(before);
  });

  it('marks stale peers unreachable on discovery sweep', () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    const p = P2P.getPeers()[0];
    // force lastSeen into the past beyond STALE_MS
    p.lastSeen = Date.now() - 200_000;
    p.status = 'active';
    P2P.peerDiscovery([]); // empty bootstrap still runs the stale sweep
    expect(P2P.getPeers()[0].status).toBe('unreachable');
  });

  it('emits peer found / lost events', () => {
    const found: string[] = [];
    const lost: string[] = [];
    P2P.events.on('p2p:peer_found', (p: { id: string }) => found.push(p.id));
    P2P.events.on('p2p:peer_lost', (id: string) => lost.push(id));
    P2P.peerDiscovery(['127.0.0.1:7100']);
    expect(found.length).toBe(1);
    // make it stale then sweep
    P2P.getPeers()[0].lastSeen = Date.now() - 200_000;
    P2P.peerDiscovery([]);
    expect(lost.length).toBe(1);
  });

  it('publish fans out to every active peer via the transport', async () => {
    P2P.peerDiscovery(['127.0.0.1:7100', '127.0.0.1:7101']);
    await P2P.publish('topic-x', 'payload-y');
    // 2 peers => 2 HTTP POSTs
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.every((u) => u.includes('/api/v1/p2p/message'))).toBe(true);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies.every((b) => b.topic === 'topic-x' && b.data === 'payload-y')).toBe(true);
  });

  it('skips unreachable peers during publish', async () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    P2P.getPeers()[0].status = 'unreachable';
    await P2P.publish('t', 'd');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not crash when a peer transport throws', async () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(P2P.publish('t', 'd')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('broadcastAuditRoot delegates to publish with audit_checkpoint topic', async () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    await P2P.broadcastAuditRoot('ROOT', 'CP');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.topic).toBe('audit_checkpoint');
    expect(JSON.parse(body.data)).toEqual({ root: 'ROOT', checkpointId: 'CP' });
  });

  it('receiveMessageHandler parses and emits a message event', () => {
    const msgs: unknown[] = [];
    P2P.events.on('p2p:message', (m: unknown) => msgs.push(m));
    const res = P2P.receiveMessageHandler({ from: 'peer-a', topic: 't', data: 'd', timestamp: 123 });
    expect(res.ok).toBe(true);
    expect(msgs.length).toBe(1);
    expect((msgs[0] as { from: string }).from).toBe('peer-a');
  });

  it('receiveMessageHandler ignores malformed envelopes', () => {
    const msgs: unknown[] = [];
    P2P.events.on('p2p:message', (m: unknown) => msgs.push(m));
    const res = P2P.receiveMessageHandler({ foo: 'bar' });
    expect(res.ok).toBe(true);
    expect(msgs.length).toBe(0);
  });

  it('getPeerListHandler returns current peers', () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    const { peers } = P2P.getPeerListHandler();
    expect(peers.length).toBe(1);
  });

  it('reset clears all peers and identity', () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    P2P.reset();
    expect(P2P.getPeers().length).toBe(0);
  });
});
