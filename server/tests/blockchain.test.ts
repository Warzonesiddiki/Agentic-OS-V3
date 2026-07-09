/**
 * Unit & Integration tests for Blockchain Anchor & SHA-256 Merkle Verification (Phase 14).
 */
import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://p:pass@localhost:5432/nexus_test';
});

import {
  computeMerkleRoot,
  encodeRLP,
  encodeRawEvmTransaction,
} from '../src/services/blockchain.js';

describe('computeMerkleRoot', () => {
  it('returns 64 zeroes for empty input', () => {
    const root = computeMerkleRoot([]);
    expect(root).toBe('0'.repeat(64));
  });

  it('returns clean hash for single entry', () => {
    const hash = 'a'.repeat(64);
    const root = computeMerkleRoot([hash]);
    expect(root).toBe(hash);
  });

  it('computes binary SHA-256 Merkle root deterministically for even entries', () => {
    const h1 = '1'.repeat(64);
    const h2 = '2'.repeat(64);
    const root1 = computeMerkleRoot([h1, h2]);
    const root2 = computeMerkleRoot([h1, h2]);
    expect(root1).toMatch(/^[0-9a-f]{64}$/);
    expect(root1).toBe(root2);
  });

  it('handles odd number of entries by duplicating last leaf', () => {
    const h1 = '1'.repeat(64);
    const h2 = '2'.repeat(64);
    const h3 = '3'.repeat(64);
    const root = computeMerkleRoot([h1, h2, h3]);
    expect(root).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is tamper evident', () => {
    const h1 = '1'.repeat(64);
    const h2 = '2'.repeat(64);
    const rootA = computeMerkleRoot([h1, h2]);
    const rootB = computeMerkleRoot([h1, '3'.repeat(64)]);
    expect(rootA).not.toBe(rootB);
  });
});

describe('encodeRLP & EVM Transaction Encoding', () => {
  it('encodes RLP primitive types correctly', () => {
    expect(encodeRLP(null).toString('hex')).toBe('80');
    expect(encodeRLP(0).toString('hex')).toBe('80');
    expect(encodeRLP('0x').toString('hex')).toBe('80');
    expect(encodeRLP(Buffer.from([0x42])).toString('hex')).toBe('42');
  });

  it('encodes raw EVM transaction containing Merkle root in data field', () => {
    const merkleRoot = 'a'.repeat(64);
    const encoded = encodeRawEvmTransaction({
      to: '0x1234567890123456789012345678901234567890',
      nonce: 1,
      gasPrice: 20000000000n,
      gasLimit: 21000n,
      value: 0n,
      data: '0x' + merkleRoot,
      chainId: 1,
    });

    expect(encoded.rawTx).toMatch(/^0x/);
    expect(encoded.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
