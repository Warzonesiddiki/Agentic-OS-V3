import { describe, it, expect } from 'vitest';
import {
  kernelConfigSchema,
  validateKernelConfig,
  type KernelConfig,
} from '../../src/config/kernel-schema.js';

const validConfig: KernelConfig = {
  highWatermark: 100,
  lowWatermark: 20,
  quantumMs: 200,
  tickIntervalMs: 50,
  mlfqLevels: 5,
  boostIntervalMs: 1000,
  maxConcurrencyJobs: 8,
};

describe('kernelConfigSchema', () => {
  it('accepts a valid config', () => {
    expect(() => validateKernelConfig(validConfig)).not.toThrow();
    expect(kernelConfigSchema.parse(validConfig)).toEqual(validConfig);
  });

  it('fails when highWatermark <= lowWatermark', () => {
    const bad = { ...validConfig, highWatermark: 10, lowWatermark: 20 };
    expect(() => validateKernelConfig(bad)).toThrow(
      /highWatermark must be greater than lowWatermark/
    );

    const equal = { ...validConfig, highWatermark: 20, lowWatermark: 20 };
    expect(() => validateKernelConfig(equal)).toThrow(
      /highWatermark must be greater than lowWatermark/
    );
  });

  it('fails when quantumMs is not divisible by tickIntervalMs', () => {
    const bad = { ...validConfig, quantumMs: 205, tickIntervalMs: 50 };
    expect(() => validateKernelConfig(bad)).toThrow(
      /quantumMs must be an integer multiple of tickIntervalMs/
    );
  });
});
