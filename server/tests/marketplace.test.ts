import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  sha256Hex,
  signArtifactEd25519,
  verifyArtifactEd25519,
  webhookHmac,
  receiptHash,
} from '../src/lib/crypto-sign.js';
import { tarjanSCC, topoSort, type DepNode } from '../src/lib/graph.js';

describe('crypto-sign', () => {
  it('sha256Hex is deterministic', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex(Buffer.from('hello')));
    expect(sha256Hex('hello')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('webhookHmac matches a recomputed HMAC', () => {
    const secret = 's3cr3t';
    const payload = '{"event":"x"}';
    const sig = webhookHmac(secret, payload);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    // recompute via node directly to cross-check
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    expect(sig).toBe(expected);
  });

  it('receiptHash is deterministic and chains with prev', () => {
    const base = {
      pluginId: 'p1',
      versionId: 'v1',
      tenantId: 't',
      actorId: 'a',
      action: 'install' as const,
      timestamp: '2026',
    };
    const r1 = receiptHash(base);
    const r2 = receiptHash({ ...base, prevReceiptHash: r1 });
    expect(r1).not.toBe(r2);
    expect(receiptHash(base)).toBe(r1);
  });

  it('ed25519 sign/verify round-trips with node:crypto keys', async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    const digest = sha256Hex('artifact-bytes');
    const sig = signArtifactEd25519(privPem, digest);
    expect(verifyArtifactEd25519(pubPem, digest, sig)).toBe(true);
    expect(verifyArtifactEd25519(pubPem, sha256Hex('tampered'), sig)).toBe(false);
  });
});

describe('graph (Tarjan + topo)', () => {
  it('detects a cycle as a multi-node SCC', () => {
    const nodes: DepNode[] = [
      { slug: 'a', deps: [{ slug: 'b', range: '*' }] },
      { slug: 'b', deps: [{ slug: 'a', range: '*' }] },
    ];
    const sccs = tarjanSCC(nodes);
    const cycle = sccs.find((s) => s.length > 1);
    expect(cycle).toBeDefined();
  });

  it('detects a self-loop', () => {
    const nodes: DepNode[] = [{ slug: 'a', deps: [{ slug: 'a', range: '*' }] }];
    const sccs = tarjanSCC(nodes);
    expect(sccs.some((s) => s.length === 1 && s[0] === 'a')).toBe(true);
  });

  it('topo-sorts a DAG with correct dependency order', () => {
    const nodes: DepNode[] = [
      { slug: 'app', deps: [{ slug: 'lib', range: '*' }] },
      { slug: 'lib', deps: [{ slug: 'core', range: '*' }] },
      { slug: 'core', deps: [] },
    ];
    const order = topoSort(nodes);
    expect(order.indexOf('core')).toBeLessThan(order.indexOf('lib'));
    expect(order.indexOf('lib')).toBeLessThan(order.indexOf('app'));
  });

  it('topoSort throws on a cyclic graph', () => {
    const nodes: DepNode[] = [
      { slug: 'a', deps: [{ slug: 'b', range: '*' }] },
      { slug: 'b', deps: [{ slug: 'a', range: '*' }] },
    ];
    expect(() => topoSort(nodes)).toThrow();
  });
});
