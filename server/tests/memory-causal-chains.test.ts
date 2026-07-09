import { describe, it, expect } from 'vitest';
import {
  coerceRelation,
  signCausalChain,
  verifyCausalChainIntegrity,
  type CausalEdgeRecord,
  type CausalRelation,
} from '../src/services/memory-causal-chains.js';

const edge = (
  id: string,
  from: string,
  to: string,
  relation: CausalRelation,
  createdAt = new Date(0)
): CausalEdgeRecord => ({ id, fromMemoryId: from, toMemoryId: to, relation, createdAt });

describe('memory-causal-chains / coerceRelation', () => {
  it('maps natural-language relation hints', () => {
    expect(coerceRelation('ENABLES')).toBe('enables');
    expect(coerceRelation('contradictory')).toBe('contradicts');
    expect(coerceRelation('correlated with')).toBe('correlates');
    expect(coerceRelation('happens before')).toBe('precedes');
    expect(coerceRelation('then it proceeds')).toBe('precedes');
  });

  it('defaults unknown relations to "causes"', () => {
    expect(coerceRelation('something weird')).toBe('causes');
    expect(coerceRelation('  CAUSES  ')).toBe('causes');
  });
});

describe('memory-causal-chains / sign + verify integrity', () => {
  it('signs a single edge and verifies it intact', () => {
    const signed = signCausalChain([edge('e1', 'a', 'b', 'causes')]);
    expect(signed).toHaveLength(1);
    expect(signed[0]!.hash).toBeTypeOf('string');
    expect(signed[0]!.hash!.length).toBeGreaterThan(0);
    const r = verifyCausalChainIntegrity(signed);
    expect(r.total).toBe(1);
    expect(r.broken).toBe(0);
    expect(r.intact).toBe(true);
    expect(r.chain).toEqual(['e1']);
    expect(r.tailHash).toBe(signed[0]!.hash);
  });

  it('preserves chain order regardless of input order', () => {
    const signed = signCausalChain([
      edge('e2', 'b', 'c', 'precedes'),
      edge('e1', 'a', 'b', 'causes'),
    ]);
    const r = verifyCausalChainIntegrity(signed);
    expect(r.total).toBe(2);
    expect(r.chain).toEqual(['e1', 'e2']);
    expect(r.intact).toBe(true);
  });

  it('detects tampering with a signed edge', () => {
    const signed = signCausalChain([
      edge('e1', 'a', 'b', 'causes'),
      edge('e2', 'b', 'c', 'precedes'),
    ]);
    // Tamper: change a relation after signing → stored hash no longer matches.
    const tampered = signed.map((e, i) =>
      i === 1 ? { ...e, relation: 'contradicts' as CausalRelation } : e
    );
    const r = verifyCausalChainIntegrity(tampered);
    expect(r.broken).toBe(1);
    expect(r.intact).toBe(false);
  });

  it('handles edges without hashes (structural contiguity only)', () => {
    const r = verifyCausalChainIntegrity([edge('e9', 'a', 'b', 'causes')]);
    expect(r.total).toBe(1);
    expect(r.broken).toBe(0);
    expect(r.intact).toBe(true);
  });

  it('returns an empty intact report for no edges', () => {
    const r = verifyCausalChainIntegrity([]);
    expect(r.total).toBe(0);
    expect(r.broken).toBe(0);
    expect(r.intact).toBe(true);
    expect(r.chain).toEqual([]);
  });
});
