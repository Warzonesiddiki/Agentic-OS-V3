import { describe, it, expect } from 'vitest';
import { kernelConfigSchema, validateKernelConfig } from '../src/config/kernel-schema.js';

describe('kernel-schema', () => {
  const valid = {
    highWatermark: 100,
    lowWatermark: 20,
    quantumMs: 100,
    tickIntervalMs: 50,
    mlfqLevels: 5,
    boostIntervalMs: 1000,
    maxConcurrencyJobs: 8,
  };

  it('accepts a valid config', () => {
    expect(() => validateKernelConfig(valid)).not.toThrow();
    const parsed = kernelConfigSchema.parse(valid);
    expect(parsed.highWatermark).toBe(100);
  });

  it('rejects quantumMs that is not a multiple of tickIntervalMs', () => {
    const bad = { ...valid, quantumMs: 75, tickIntervalMs: 50 };
    expect(() => validateKernelConfig(bad)).toThrow();
  });

  it('rejects highWatermark less than or equal to lowWatermark', () => {
    const bad = { ...valid, highWatermark: 10, lowWatermark: 20 };
    expect(() => validateKernelConfig(bad)).toThrow();
  });
});
