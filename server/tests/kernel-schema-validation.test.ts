/**
 * kernel-schema-validation.test.ts — Tests for kernel config schema validation.
 * Phase 11, Task 11.30: Kernel configuration schema & validation.
 */
import { describe, it, expect } from 'vitest';
import { validateKernelConfig, kernelConfigSchema } from '../src/config/kernel-schema.js';

describe('kernelConfigSchema', () => {
  const validConfig = {
    highWatermark: 100,
    lowWatermark: 20,
    quantumMs: 500,
    tickIntervalMs: 100,
    mlfqLevels: 5,
    boostIntervalMs: 5000,
    maxConcurrencyJobs: 10,
  };

  describe('valid configs', () => {
    it('accepts a fully valid configuration', () => {
      const result = kernelConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('accepts minimum valid values', () => {
      const result = kernelConfigSchema.safeParse({
        highWatermark: 2,
        lowWatermark: 1,
        quantumMs: 100,
        tickIntervalMs: 100,
        mlfqLevels: 1,
        boostIntervalMs: 1,
        maxConcurrencyJobs: 0,
      });
      expect(result.success).toBe(true);
    });

    it('accepts quantumMs as exact multiple of tickIntervalMs', () => {
      const result = kernelConfigSchema.safeParse({
        ...validConfig,
        quantumMs: 300,
        tickIntervalMs: 100,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid configs', () => {
    it('rejects highWatermark <= lowWatermark', () => {
      const result = kernelConfigSchema.safeParse({
        ...validConfig,
        highWatermark: 10,
        lowWatermark: 20,
      });
      expect(result.success).toBe(false);
    });

    it('rejects quantumMs not divisible by tickIntervalMs', () => {
      const result = kernelConfigSchema.safeParse({
        ...validConfig,
        quantumMs: 7,
        tickIntervalMs: 3,
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative highWatermark', () => {
      const result = kernelConfigSchema.safeParse({
        ...validConfig,
        highWatermark: -1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero quantumMs', () => {
      const result = kernelConfigSchema.safeParse({
        ...validConfig,
        quantumMs: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects mlfqLevels > 8', () => {
      const result = kernelConfigSchema.safeParse({
        ...validConfig,
        mlfqLevels: 9,
      });
      expect(result.success).toBe(false);
    });

    it('rejects mlfqLevels < 1', () => {
      const result = kernelConfigSchema.safeParse({
        ...validConfig,
        mlfqLevels: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing fields', () => {
      const result = kernelConfigSchema.safeParse({
        highWatermark: 100,
        // missing other fields
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer values', () => {
      const result = kernelConfigSchema.safeParse({
        ...validConfig,
        quantumMs: 100.5,
      });
      expect(result.success).toBe(false);
    });

    it('rejects string values', () => {
      const result = kernelConfigSchema.safeParse({
        ...validConfig,
        highWatermark: '100',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('validateKernelConfig', () => {
  it('returns parsed config for valid input', () => {
    const input = {
      highWatermark: 100,
      lowWatermark: 20,
      quantumMs: 500,
      tickIntervalMs: 100,
      mlfqLevels: 5,
      boostIntervalMs: 5000,
      maxConcurrencyJobs: 10,
    };
    const result = validateKernelConfig(input);
    expect(result.highWatermark).toBe(100);
    expect(result.mlfqLevels).toBe(5);
  });

  it('throws ZodError for invalid input', () => {
    expect(() => validateKernelConfig({ invalid: true })).toThrow();
  });

  it('throws for missing required fields', () => {
    expect(() => validateKernelConfig({})).toThrow();
  });
});
