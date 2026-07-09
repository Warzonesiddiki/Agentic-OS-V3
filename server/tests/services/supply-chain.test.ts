/** supply-chain.test.ts — dependency/plugin integrity verification (Aegis, pure). */
import { describe, it, expect, vi } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  verifyIntegrity,
  detectTyposquat,
  verifySignature,
  scanManifestForSecrets,
} from '../../src/services/supply-chain.js';

// Mock the secrets scanner so we control its output deterministically.
vi.mock('../../src/services/secrets-scanner.js', () => ({
  scanContent: vi.fn(() => []),
}));
import { scanContent } from '../../src/services/secrets-scanner.js';
const mockedScan = vi.mocked(scanContent);

describe('verifyIntegrity', () => {
  const content = Buffer.from('module.exports = 1;');
  const integrity = 'sha512-' + createHash('sha512').update(content).digest('base64');

  it('passes when content matches the declared integrity', () => {
    const res = verifyIntegrity({ name: 'pkg', version: '1.0.0', integrity }, content);
    expect(res.ok).toBe(true);
    expect(res.reason).toBe('ok');
  });

  it('fails when no integrity hash declared', () => {
    const res = verifyIntegrity({ name: 'pkg', version: '1.0.0' }, content);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('no integrity hash');
  });

  it('fails on integrity mismatch', () => {
    const res = verifyIntegrity({ name: 'pkg', version: '1.0.0', integrity: 'sha512-AAAA' }, content);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('mismatch');
  });
});

describe('detectTyposquat', () => {
  it('flags a near-identical name (Levenshtein <= 2) against a trusted registry', () => {
    expect(detectTyposquat('reactt', ['react', 'vue', 'angular'])).toBe(true);
    expect(detectTyposquat('angula', ['react', 'vue', 'angular'])).toBe(true);
  });
  it('does not flag an exact trusted name', () => {
    expect(detectTyposquat('react', ['react', 'vue'])).toBe(false);
  });
  it('does not flag an unrelated name', () => {
    expect(detectTyposquat('totally-legit-lib', ['react', 'vue'])).toBe(false);
  });
});

describe('verifySignature', () => {
  it('returns true for a valid signature over the artifact', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    const artifact = Buffer.from('plugin bundle v2');
    const signature = sign('sha256', artifact, privateKey);
    expect(verifySignature(artifact, signature, pubPem)).toBe(true);
  });

  it('throws on an invalid public key (malformed PEM)', () => {
    const artifact = Buffer.from('x');
    const sig = Buffer.alloc(32);
    expect(() => verifySignature(artifact, sig, 'not-a-pem')).toThrow(/Signature verification failed/);
  });
});

describe('scanManifestForSecrets', () => {
  it('returns true when secrets-scanner finds a secret', () => {
    mockedScan.mockReturnValueOnce([{ line: 1, type: 'key', value: 'sk-abc' } as never]);
    expect(scanManifestForSecrets('npm install')).toBe(true);
  });
  it('returns false when no secrets found', () => {
    mockedScan.mockReturnValueOnce([]);
    expect(scanManifestForSecrets('name: demo\nversion: 1.0.0')).toBe(false);
  });
});
