import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// p2p-swarm imports db (real better-sqlite3) at module load — that won't run in this
// shell, but on the aionr runner it loads fine. The module also imports getEnv/forward
// which we stub. We mock fetch to simulate the transport without real HTTP.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('../lib/env.js', () => ({
  getEnv: (k: string, d?: string) => (k === 'NEXUS_BLOCKCHAIN_RPC_URL' ? d ?? '' : d ?? ''),
}));
vi.mock('../services/security/index.js', () => ({ forward: vi.fn(async () => ({})) }));

const p2p = await import('../src/services/p2p-swarm.js');
const P2P: any = (p2p as any).default ?? p2p;

beforeEach(() => {
  if (typeof P2P.reset === 'function') P2P.reset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('re-discovery reactivates a stale/unreachable peer', () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    const first = P2P.getPeers()[0];
    const before = first.lastSeen;
    first.status = 'unreachable';
    P2P.peerDiscovery(['127.0.0.1:7100']);
    const after = P2P.getPeers()[0];
    expect(after.status).toBe('active');
    expect(after.lastSeen).toBeGreaterThanOrEqual(before);
  });

  it('marks stale peers unreachable during the discovery sweep', () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    P2P.getPeers()[0].lastSeen = Date.now() - 200_000;
    P2P.peerDiscovery([]); // empty bootstrap still runs the stale sweep
    expect(P2P.getPeers()[0].status).toBe('unreachable');
  });

  it('emits peer_found and peer_lost events', () => {
    const found: string[] = [];
    const lost: string[] = [];
    P2P.events.on('p2p:peer_found', (p: any) => found.push(p.id));
    P2P.events.on('p2p:peer_lost', (id: string) => lost.push(id));
    P2P.peerDiscovery(['127.0.0.1:7100']);
    expect(found.length).toBe(1);
    P2P.getPeers()[0].lastSeen = Date.now() - 200_000;
    P2P.peerDiscovery([]);
    expect(lost.length).toBe(1);
  });

  it('publish fans out to every active peer over the mock transport', async () => {
    P2P.peerDiscovery(['127.0.0.1:7100', '127.0.0.1:7101']);
    await P2P.publish('topic-x', 'payload-y');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c: any) => c[0] as string);
    expect(urls.every((u: string) => u.includes('/api/v1/p2p/message'))).toBe(true);
    const bodies = fetchMock.mock.calls.map((c: any) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies.every((b: any) => b.topic === 'topic-x' && b.data === 'payload-y')).toBe(true);
  });

  it('skips unreachable peers when publishing', async () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    P2P.getPeers()[0].status = 'unreachable';
    await P2P.publish('t', 'd');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not crash when a peer transport rejects', async () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(P2P.publish('t', 'd')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('broadcastAuditRoot delegates to publish with the audit_checkpoint topic', async () => {
    P2P.peerDiscovery(['127.0.0.1:7100']);
    await P2P.broadcastAuditRoot('ROOT', 'CP');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.topic).toBe('audit_checkpoint');
    expect(JSON.parse(body.data)).toEqual({ root: 'ROOT', checkpointId: 'CP' });
  });

  it('receiveMessageHandler parses and emits a message event', () => {
    const msgs: any[] = [];
    P2P.events.on('p2p:message', (m: any) => msgs.push(m));
    const res = P2P.receiveMessageHandler({ from: 'peer-a', topic: 't', data: 'd', timestamp: 123 });
    expect(res.ok).toBe(true);
    expect(msgs.length).toBe(1);
    expect(msgs[0].from).toBe('peer-a');
  });

  it('receiveMessageHandler ignores malformed envelopes', () => {
    const msgs: any[] = [];
    P2P.events.on('p2p:message', (m: any) => msgs.push(m));
    const res = P2P.receiveMessageHandler({ foo: 'bar' });
    expect(res.ok).toBe(true);
    expect(msgs.length).toBe(0);
  });

  it('getPeerListHandler returns the current peers', () => {
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
