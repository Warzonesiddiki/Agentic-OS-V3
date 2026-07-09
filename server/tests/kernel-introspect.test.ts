import { describe, it, expect } from 'vitest';
import {
  getIntrospectionSnapshot,
  getKernelIntrospection,
  type KernelIntrospection,
} from '../src/services/kernel-introspect-state.js';

describe('kernel introspection', () => {
  it('getIntrospectionSnapshot exposes agents, rings, tasks and a timestamp', () => {
    const snap = getIntrospectionSnapshot();
    expect(Array.isArray(snap.rings)).toBe(true);
    expect(Array.isArray(snap.agents)).toBe(true);
    expect(Array.isArray(snap.tasks)).toBe(true);
    expect(typeof snap.timestamp).toBe('number');
    // Every ring reported carries a numeric ring index.
    for (const r of snap.rings) {
      expect(typeof r.ring).toBe('number');
    }
  });

  it('getKernelIntrospection returns the full typed structure', () => {
    const intro: KernelIntrospection = getKernelIntrospection();
    expect(typeof intro.timestamp).toBe('number');
    expect(Array.isArray(intro.rings)).toBe(true);
    expect(Array.isArray(intro.resources)).toBe(true);
    expect(Array.isArray(intro.gangs)).toBe(true);
    expect(intro.health).toBeDefined();
    expect(typeof intro.health.mode).toBe('string');
    expect(typeof intro.health.emergency).toBe('boolean');
  });
});
