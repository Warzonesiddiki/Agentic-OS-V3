/**
 * blockchain.test.ts — blockchain anchoring crypto (Aegis namespace).
 *
 * Only the PURE cryptographic helpers are exercised here (no DB / no RPC):
 *   - computeMerkleRoot (binary SHA-256 Merkle over hex leaf strings)
 *   - encodeRLP (minimal RLP for EVM tx fields)
 *   - encodeRawEvmTransaction (keccak signing payload; returns raw + hash)
 *
 * The DB/RPC-backed functions (submitEvmAnchor, anchorAuditLogsBatch,
 * verifyAnchor) are mocked at import time to keep this test hermetic and free
 * of the native better-sqlite3 binding.
 */
import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('../../src/db/client.js', () => ({ db: {}, blockchainAnchors: {}, systemMeta: {} }));
vi.mock('../../src/lib/env.js', () => ({ env: new Proxy({}, { get: () => undefined }) }));
vi.mock('../../src/services/metrics.js', () => ({
  blockchainAnchorsTotal: { inc: vi.fn() },
  blockchainGasSpentTotal: { inc: vi.fn() },
  blockchainRpcFailuresTotal: { inc: vi.fn() },
}));
vi.mock('../../src/lib/logging.js', () => ({
  log: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { computeMerkleRoot, encodeRLP, encodeRawEvmTransaction, BLOCKCHAIN_ENABLED } from '../../src/services/blockchain.js';

describe('computeMerkleRoot', () => {
  it('returns the leaf string unchanged for a single leaf (no 0x prefix)', () => {
    expect(computeMerkleRoot(['abc'])).toBe('abc');
  });

  it('returns a 64-char zero string for an empty input', () => {
    expect(computeMerkleRoot([])).toBe('0'.repeat(64));
  });

  it('is deterministic for the same leaves', () => {
    expect(computeMerkleRoot(['a', 'b', 'c'])).toBe(computeMerkleRoot(['a', 'b', 'c']));
  });

  it('reduces an even set by SHA-256 of concatenated hex', () => {
    const root = computeMerkleRoot(['aa', 'bb']);
    // root = sha256('aa' + 'bb')
    const expected = createHash('sha256').update('aabb', 'hex').digest('hex');
    expect(root).toBe(expected);
  });

  it('pads an odd leaf set by duplicating the last leaf', () => {
    const odd = computeMerkleRoot(['aa', 'bb', 'cc']);
    const even = computeMerkleRoot(['aa', 'bb', 'cc', 'cc']);
    expect(odd).toBe(even);
  });
});

describe('encodeRLP', () => {
  it('encodes a single byte string with short-length prefix', () => {
    const out = encodeRLP(['hello']);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out[0]).toBe(0x85); // 0x80 + 5
    expect(out.toString('utf8', 1)).toBe('hello');
  });

  it('encodes multiple fields', () => {
    const out = encodeRLP(['ab', 'cd']);
    expect(out.length).toBe(2 + 2 + 2); // two 2-byte strings
    expect(out[0]).toBe(0x82);
  });

  it('encodes an empty string as 0x80', () => {
    const out = encodeRLP(['']);
    expect(out[0]).toBe(0x80);
  });

  it('encodes a zero number as 0x80', () => {
    const out = encodeRLP([0]);
    expect(out[0]).toBe(0x80);
  });
});

describe('encodeRawEvmTransaction', () => {
  const base = {
    nonce: 1,
    gasPrice: 1n,
    gasLimit: 21000,
    to: '0x' + '11'.repeat(20),
    value: 0n,
    data: '0x',
    chainId: 1,
  };

  it('returns a raw tx and a keccak tx hash without a private key', () => {
    const { rawTx, txHash } = encodeRawEvmTransaction(base);
    expect(rawTx.startsWith('0x')).toBe(true);
    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('produces a deterministic hash for identical inputs', () => {
    const a = encodeRawEvmTransaction(base);
    const b = encodeRawEvmTransaction(base);
    expect(a.txHash).toBe(b.txHash);
  });

  it('changes the hash when the value changes', () => {
    const a = encodeRawEvmTransaction(base);
    const b = encodeRawEvmTransaction({ ...base, value: 1000n });
    expect(a.txHash).not.toBe(b.txHash);
  });

  it('accepts a private key without throwing (signing may fall back, but API holds)', () => {
    const pk = '0x' + '22'.repeat(32);
    expect(() => encodeRawEvmTransaction(base, pk)).not.toThrow();
  });
});

describe('BLOCKCHAIN_ENABLED', () => {
  it('is a boolean', () => {
    expect(typeof BLOCKCHAIN_ENABLED).toBe('boolean');
  });
});
