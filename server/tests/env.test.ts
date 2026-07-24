/**
 * Environment config unit tests — validates env schema parsing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('env validation', () => {
  beforeEach(() => {
    // Reset module cache between tests
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.NEXUS_PROJECT_ROOT;
  });

  it('parses default values correctly', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.NODE_ENV = 'development';
    const env = await import('../src/lib/env.js');
    const e = env.getEnv();
    expect(e.PORT).toBe(9900);
    expect(e.NODE_ENV).toBe('development');
    expect(e.NEXUS_RATE_LIMIT_PER_MINUTE).toBe(120);
    expect(e.NEXUS_BUS_BACKEND).toBe('memory');
    expect(e.NEXUS_PROJECT_ROOT).toBe('/tmp/projects');
  });

  it('accepts only an absolute trusted project-root configuration', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.NODE_ENV = 'development';
    process.env.NEXUS_PROJECT_ROOT = '/var/lib/nexus/projects';
    const configured = await import('../src/lib/env.js');
    expect(configured.getEnv().NEXUS_PROJECT_ROOT).toBe('/var/lib/nexus/projects');

    vi.resetModules();
    process.env.NEXUS_PROJECT_ROOT = 'relative-projects';
    const invalid = await import('../src/lib/env.js');
    expect(() => invalid.getEnv()).toThrow(/NEXUS_PROJECT_ROOT: must be an absolute path/);
  });

  it('defaults DATABASE_URL to empty string when missing', async () => {
    // Mock dotenv to prevent it from reloading DATABASE_URL from .env
    vi.doMock('dotenv', () => ({ config: vi.fn() }));
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'development';
    const envModule = await import('../src/lib/env.js');
    const e = envModule.getEnv();
    expect(e.DATABASE_URL).toBe('');
  });

  it('parses NEXUS_OTEL_ENDPOINT when set', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.NODE_ENV = 'development';
    process.env.NEXUS_OTEL_ENDPOINT = 'http://otel-collector:4318/v1/traces';
    const env = await import('../src/lib/env.js');
    const e = env.getEnv();
    expect(e.NEXUS_OTEL_ENDPOINT).toBe('http://otel-collector:4318/v1/traces');
  });
});
