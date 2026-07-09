import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// p2p-swarm only imports getEnv (from ../lib/env) + EventEmitter + log. We mock getEnv and
// fetch so the node can run without real networking. The P2P state is in-memory.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('../lib/env.js', () => ({
  getEnv: () => ({
    NEXUS_BLOCKCHAIN_RPC_URL: 'http://boot.test/v1/p2p', // enables P2P + bootstrap URL
    NODE_ENV: 'test',
    PORT: '9999',
  }),
}));

const p2p = await import('../src/services/p2p-swarm.js');
const P2P: any = (p2p as any).default ?? p2p;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ peers: [] }) } as any);
});
afterEach(() => {
  try {
    P2P.stopP2PNode();
  } catch {
    /* noop */
  }
  vi.unstubAllGlobals();
});

describe('p2p-swarm — peer discovery add/remove (mock transport)', () => {
  it('startP2PNode discovers and ADDS peers from the bootstrap endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ peers: [{ id: 'peer-1', host: '10.0.0.1', port: 7100, status: 'active' }] }),
    } as any);

    await P2P.startP2PNode();
    const peers = P2P.getPeers();
    expect(peers.length).toBe(1);
    expect(peers[0].id).toBe('peer-1');
    expect(peers[0].status).toBe('active');
    // the discovery fetch hit the bootstrap /peers endpoint
    expect(fetchMock).toHaveBeenCalledWith('http://boot.test/v1/p2p/peers');
  });

  it('stopP2PNode REMOVES all peers (peer lifecycle teardown)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ peers: [{ id: 'peer-1', host: '10.0.0.1', port: 7100, status: 'active' }] }),
    } as any);
    await P2P.startP2PNode();
    expect(P2P.getPeers().length).toBe(1);
    P2P.stopP2PNode();
    expect(P2P.getPeers().length).toBe(0);
  });

  it('ignores self in discovery results (does not add the local node)', async () => {
    // local id is nexus-test-9999; bootstrap returns the same id → must be filtered out
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ peers: [{ id: 'nexus-test-9999', host: '127.0.0.1', port: 9999, status: 'active' }] }),
    } as any);
    await P2P.startP2PNode();
    expect(P2P.getPeers().length).toBe(0);
  });

  it('getPeerListHandler returns the discovered peers', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ peers: [{ id: 'peer-9', host: '10.0.0.9', port: 7100, status: 'active' }] }),
    } as any);
    await P2P.startP2PNode();
    const { peers } = P2P.getPeerListHandler();
    expect(peers.length).toBe(1);
    expect(peers[0].id).toBe('peer-9');
  });
});

describe('p2p-swarm — publish / audit broadcast (mock transport)', () => {
  beforeEach(async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ peers: [{ id: 'peer-1', host: '10.0.0.1', port: 7100, status: 'active' }] }),
    } as any);
    await P2P.startP2PNode();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as any);
  });

  it('publish fans out to the active peer over the transport', async () => {
    await P2P.publish('topic-x', 'payload-y');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/v1/p2p/message');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.topic).toBe('topic-x');
    expect(body.data).toBe('payload-y');
  });

  it('broadcastAuditRoot delegates to publish as audit_checkpoint', async () => {
    await P2P.broadcastAuditRoot('ROOT', 'CP');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.topic).toBe('audit_checkpoint');
    expect(JSON.parse(body.data)).toEqual({ root: 'ROOT', checkpointId: 'CP' });
  });

  it('does not crash when a peer transport rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(P2P.publish('t', 'd')).resolves.toBeUndefined();
  });
});

describe('p2p-swarm — receiveMessageHandler', () => {
  it('parses and emits a message event', () => {
    const msgs: any[] = [];
    P2P.events.on('p2p:message', (m: any) => msgs.push(m));
    const res = P2P.receiveMessageHandler({ from: 'peer-a', topic: 't', data: 'd', timestamp: 123 });
    expect(res.ok).toBe(true);
    expect(msgs.length).toBe(1);
    expect(msgs[0].from).toBe('peer-a');
  });

  it('ignores malformed envelopes', () => {
    const msgs: any[] = [];
    P2P.events.on('p2p:message', (m: any) => msgs.push(m));
    const res = P2P.receiveMessageHandler({ foo: 'bar' });
    expect(res.ok).toBe(true);
    expect(msgs.length).toBe(0);
  });
});
